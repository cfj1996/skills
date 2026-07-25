import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  buildStorageKey,
  clampPanelWidth,
  clampPanelPosition,
  countReviewConclusions,
  createPlanConfirmationGate,
  createReviewState,
  DRAFT_TTL_MS,
  PANEL_WIDTH_LIMITS,
  assertArtifactLocationRule,
  assertPlanFingerprint,
  loadDraft,
  highlightEvidence,
  mountReviewPanel,
  panelMarkup,
  prioritizeReviewResults,
  reduceReviewState,
  resizePanelGeometry,
  resolveDockSide,
  restoreDraft,
  sanitizeDraft,
  saveDraft,
  selectRoundCards,
} = require("../scripts/inject-review-panel.js");

const session = JSON.parse(
  readFileSync(new URL("./fixtures/review-session.json", import.meta.url), "utf8"),
);
const matchedFingerprints = {
  planFingerprint: session.planFingerprint,
  artifactRuleFingerprint: session.artifactRuleFingerprint,
};

const approvedCard = (overrides = {}) => ({
  id: "REV-CANONICAL",
  dimension: "页面定义",
  links: {
    features: ["F-001"],
    apis: [],
    uiStates: ["UI-001"],
    dependencies: [],
    tasks: ["T-001"],
    evidence: ["E-001"],
  },
  sourceEvidence: [{
    id: "E-001",
    kind: "prototype",
    label: "登录表单",
    selector: "#login-form",
    path: "/evidence/login.png",
  }],
  reviewGoal: "确认页面职责",
  design: "提供身份验证入口",
  regionAndComponents: "主内容区中的登录表单",
  interactionStates: ["初始", "提交中", "失败", "成功"],
  relatedApis: [],
  mockScenarios: [],
  acceptanceCriteria: ["输入有效凭据后触发提交"],
  implementationPlan: {
    status: "ready",
    summary: "使用项目现有表单能力完成身份验证",
    structure: ["复用项目表单容器、字段和按钮组件"],
    linkage: ["点击提交 → 校验字段 → 请求登录 → 更新会话并跳转"],
    dataFlow: ["表单值 → 登录接口 → 会话状态"],
    acceptanceFocus: ["校验、提交、错误和成功跳转均可验证"],
    evidenceIds: ["E-001"],
    blockers: [],
  },
  conclusion: "未评审",
  userNote: "",
  reviewResult: null,
  reopened: false,
  evidenceChanged: false,
  telepath: "ordinary-business-field",
  ...overrides,
});

const approvedSession = (overrides = {}) => ({
  schemaVersion: 1,
  sessionId: "session-canonical",
  deliveryUnitKey: "sample/login",
  deliveryUnitKind: "page",
  deliveryUnitName: "登录功能",
  artifactRuleFingerprint: "sha256:rule-canonical",
  artifactRuleResolution: { status: "resolved", source: "agents" },
  reviewRound: 1,
  planFingerprint: "sha256:plan-canonical",
  submissionVersion: 0,
  mode: "input",
  currentCardIndex: 0,
  viewScope: "round",
  cards: [approvedCard()],
  ...overrides,
});

test("approved ReviewSession schema drives canonical state without path-bearing unknown fields", () => {
  const state = createReviewState(approvedSession({
    planPath: "/private/plan.md",
    draftPath: "/private/draft.json",
    absolutePath: "/private/root",
    nested: { secret: "/private/nested" },
    cards: [approvedCard({
      planPath: "/private/card-plan.md",
      draftPath: "/private/card-draft.json",
      absolutePath: "/private/card-root",
      nested: { planPath: "/private/renamed" },
      arrayPayload: [{ draftPath: "/private/in-array" }],
    })],
  }));

  assert.deepEqual(Object.keys(state.cards[0]).sort(), [
    "acceptanceCriteria", "conclusion", "design", "dimension", "evidenceChanged",
    "id", "implementationPlan", "interactionStates", "links", "mockScenarios", "regionAndComponents",
    "relatedApis", "reopened", "reviewGoal", "reviewResult", "sourceEvidence",
    "telepath", "userNote",
  ]);
  assert.equal(state.cards[0].sourceEvidence[0].path, "/evidence/login.png");
  assert.equal(state.cards[0].telepath, "ordinary-business-field");
  assert.doesNotMatch(JSON.stringify(state), /private/);
  const submitted = reduceReviewState(state, { type: "SUBMIT" });
  assert.doesNotMatch(JSON.stringify(submitted.lastSubmission), /private/);
  assert.equal(state.deliveryUnitName, "登录功能");
});

test("approved ReviewSession rejects invalid top-level contracts and duplicate cards", () => {
  for (const [patch, code] of [
    [{ schemaVersion: 2 }, "invalid-review-schema-version"],
    [{ deliveryUnitKey: "/absolute/login" }, "invalid-delivery-unit-key"],
    [{ deliveryUnitName: "" }, "invalid-delivery-unit-name"],
    [{ deliveryUnitKind: "project" }, "invalid-delivery-unit-kind"],
    [{ planFingerprint: "" }, "invalid-review-fingerprint"],
    [{ artifactRuleFingerprint: "" }, "invalid-review-fingerprint"],
    [{ reviewRound: 0 }, "invalid-review-round"],
    [{ cards: [approvedCard(), approvedCard()] }, "duplicate-review-card-id"],
    [{ cards: [approvedCard({ conclusion: "冲突" })] }, "invalid-review-card"],
    [{ cards: [approvedCard({ implementationPlan: null })] }, "invalid-implementation-plan"],
    [{
      cards: [approvedCard({
        implementationPlan: {
          ...approvedCard().implementationPlan,
          structure: [],
        },
      })],
    }, "incomplete-implementation-plan"],
    [{
      cards: [approvedCard({
        implementationPlan: {
          status: "blocked",
          summary: "项目组件体系尚未确认",
          structure: [],
          linkage: [],
          dataFlow: [],
          acceptanceFocus: [],
          evidenceIds: [],
          blockers: ["缺少适用项目组件规范"],
        },
        conclusion: "待修改",
      })],
    }, "implementation-blocker-requires-blocked-conclusion"],
    [{
      cards: [approvedCard({
        implementationPlan: {
          ...approvedCard().implementationPlan,
          evidenceIds: ["E-404"],
        },
      })],
    }, "invalid-implementation-evidence"],
  ]) {
    assert.throws(
      () => createReviewState(approvedSession(patch)),
      (error) => error?.code === code,
    );
  }
});

test("Plan confirmation gate requires one trusted, current, single-use request", () => {
  assert.equal(typeof createPlanConfirmationGate, "function");
  const resultState = {
    ...createReviewState(approvedSession()),
    mode: "result",
    submissionVersion: 1,
    results: [{ id: "RESULT-1", conclusion: "已确认" }],
    currentResultIndex: 0,
  };
  const fingerprints = {
    planFingerprint: resultState.planFingerprint,
    artifactRuleFingerprint: resultState.artifactRuleFingerprint,
  };
  const gate = createPlanConfirmationGate();

  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");
  assert.equal(gate.request(resultState, { isTrusted: false })?.code, "untrusted-confirmation-request");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");
  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  assert.equal(gate.consume({ ...resultState, sessionId: "other" }, fingerprints)?.code, "stale-confirmation-request");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  assert.equal(gate.consume({ ...resultState, submissionVersion: 2 }, fingerprints)?.code, "stale-confirmation-request");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  assert.equal(gate.consume(resultState, { ...fingerprints, planFingerprint: "sha256:changed" })?.code, "plan-conflict");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  assert.equal(gate.consume(resultState, { ...fingerprints, artifactRuleFingerprint: "sha256:changed" })?.code, "artifact-rule-conflict");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  assert.equal(gate.consume(resultState, fingerprints), null);
  const confirmed = reduceReviewState(resultState, { type: "CONFIRM_PLAN", ...fingerprints });
  assert.equal(confirmed.mode, "confirmed");
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  gate.invalidate();
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  assert.equal(gate.request(resultState, { isTrusted: true }), null);
  gate.destroy();
  assert.equal(gate.consume(resultState, fingerprints)?.code, "confirmation-request-required");

  const remountedGate = createPlanConfirmationGate();
  assert.equal(remountedGate.consume(resultState, fingerprints)?.code, "confirmation-request-required");
});

test("review state preserves an explicitly resolved AGENTS artifact rule", () => {
  assert.deepEqual(createReviewState(session).artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
});

test("artifact rule resolution is canonical across state, persisted drafts, and submissions", () => {
  const taintedResolution = {
    status: "resolved",
    source: "agents",
    absolutePath: "/secret/AGENTS.md",
    artifactPath: "/private/rule",
  };
  let state = createReviewState({
    ...session,
    artifactRuleResolution: taintedResolution,
  });

  assert.deepEqual(state.artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
  assert.doesNotMatch(JSON.stringify(state), /secret|private/);

  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const storageKey = buildStorageKey("sample/tainted-resolution");
  saveDraft(storageKey, {
    deliveryUnitKey: "sample/tainted-resolution",
    sessionId: state.sessionId,
    reviewRound: state.reviewRound,
    planFingerprint: state.planFingerprint,
    artifactRuleFingerprint: state.artifactRuleFingerprint,
    artifactRuleResolution: taintedResolution,
    savedAt: Date.now(),
    cards: [],
  }, storage);
  const persistedDraft = JSON.parse(values.get(storageKey));
  assert.deepEqual(persistedDraft.artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
  assert.doesNotMatch(JSON.stringify(persistedDraft), /secret|private/);

  state = reduceReviewState(state, { type: "SUBMIT" });
  assert.deepEqual(state.lastSubmission.artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
  assert.doesNotMatch(JSON.stringify(state.lastSubmission), /secret|private/);
});

test("temporary candidate confirmation is canonical across state, persisted drafts, and submissions", () => {
  const taintedResolution = {
    status: "temporarily-confirmed-candidate",
    source: "candidate",
    confirmedRuleFingerprint: session.artifactRuleFingerprint,
    absolutePath: "/secret/AGENTS.md",
    artifactPath: "/private/rule",
    unknown: "drop-me",
  };
  const canonicalResolution = {
    status: "temporarily-confirmed-candidate",
    source: "candidate",
    confirmedRuleFingerprint: session.artifactRuleFingerprint,
  };
  let state = createReviewState({
    ...session,
    artifactRuleResolution: taintedResolution,
  });
  assert.deepEqual(state.artifactRuleResolution, canonicalResolution);
  assert.doesNotMatch(JSON.stringify(state), /secret|private|drop-me/);

  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const storageKey = buildStorageKey("sample/temporary-resolution");
  saveDraft(storageKey, {
    deliveryUnitKey: "sample/temporary-resolution",
    sessionId: state.sessionId,
    reviewRound: state.reviewRound,
    planFingerprint: state.planFingerprint,
    artifactRuleFingerprint: state.artifactRuleFingerprint,
    artifactRuleResolution: taintedResolution,
    savedAt: Date.now(),
    cards: [],
  }, storage);
  const persistedDraft = JSON.parse(values.get(storageKey));
  assert.deepEqual(persistedDraft.artifactRuleResolution, canonicalResolution);
  assert.doesNotMatch(JSON.stringify(persistedDraft), /secret|private|drop-me/);

  state = reduceReviewState(state, { type: "SUBMIT" });
  assert.deepEqual(state.lastSubmission.artifactRuleResolution, canonicalResolution);
  assert.doesNotMatch(JSON.stringify(state.lastSubmission), /secret|private|drop-me/);
});

test("unresolved artifact rule candidates fail before review state creation or mount", () => {
  const unresolvedSession = {
    ...session,
    artifactRuleResolution: {
      status: "unresolved-candidate",
      source: "candidate",
    },
    cards: [null],
  };
  for (const start of [
    () => createReviewState(unresolvedSession),
    () => mountReviewPanel(unresolvedSession),
  ]) {
    assert.throws(
      start,
      (error) => error?.code === "artifact-rule-confirmation-required",
    );
  }
});

test("a matching temporary candidate confirmation permits read-only review but never Plan confirmation", () => {
  const temporaryResolution = {
    status: "temporarily-confirmed-candidate",
    source: "candidate",
    confirmedRuleFingerprint: session.artifactRuleFingerprint,
  };
  let state = createReviewState({
    ...session,
    artifactRuleResolution: temporaryResolution,
  });
  assert.deepEqual(state.artifactRuleResolution, temporaryResolution);

  state = reduceReviewState(state, { type: "SUBMIT" });
  assert.deepEqual(state.lastSubmission.artifactRuleResolution, temporaryResolution);
  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [{ id: "result", conclusion: "阻塞" }],
  });
  assert.equal(state.mode, "result");

  state = reduceReviewState(state, { type: "REQUEST_PLAN_CONFIRMATION" });
  assert.equal(state.mode, "result");
  assert.deepEqual(state.lastError, {
    code: "artifact-rule-unresolved",
    message: "产物位置规则尚未由适用的 AGENTS.md 确认并固化，无法确认更新 Plan。",
  });

  state = reduceReviewState(state, { type: "CONFIRM_PLAN", ...matchedFingerprints });
  assert.equal(state.mode, "result");
  assert.deepEqual(state.lastError, {
    code: "artifact-rule-unresolved",
    message: "产物位置规则尚未由适用的 AGENTS.md 确认并固化，无法确认更新 Plan。",
  });
});

test("temporary candidate confirmation rejects a missing or mismatched fingerprint", () => {
  for (const [artifactRuleResolution, expectedCode] of [
    [{
      status: "temporarily-confirmed-candidate",
      source: "candidate",
    }, "invalid-artifact-rule-resolution"],
    [{
      status: "temporarily-confirmed-candidate",
      source: "candidate",
      confirmedRuleFingerprint: "sha256:different-rule",
    }, "artifact-rule-confirmation-required"],
  ]) {
    assert.throws(
      () => createReviewState({ ...session, artifactRuleResolution }),
      (error) => error?.code === expectedCode,
    );
  }
});

test("forged unresolved review states cannot submit or apply results", () => {
  const inputState = {
    ...createReviewState(session),
    artifactRuleResolution: {
      status: "unresolved-candidate",
      source: "candidate",
    },
  };
  assert.equal(reduceReviewState(inputState, { type: "SUBMIT" }), inputState);

  const reviewingState = {
    ...inputState,
    mode: "reviewing",
    submissionVersion: 1,
  };
  assert.equal(
    reduceReviewState(reviewingState, {
      type: "APPLY_RESULT",
      sessionId: session.sessionId,
      submissionVersion: 1,
      ...matchedFingerprints,
      results: [{ id: "result", conclusion: "阻塞" }],
    }),
    reviewingState,
  );
});

test("artifact rule resolution rejects invalid status and source combinations", () => {
  for (const artifactRuleResolution of [
    undefined,
    { status: "resolved", source: "candidate" },
    { status: "unresolved-candidate", source: "agents" },
  ]) {
    assert.throws(
      () => createReviewState({ ...session, artifactRuleResolution }),
      (error) => error?.code === "invalid-artifact-rule-resolution",
    );
  }
});

test("later rounds include only unresolved, reopened, or changed cards", () => {
  assert.deepEqual(selectRoundCards(session.cards, 2).map((card) => card.id), [
    "REV-002",
    "REV-003",
    "REV-004",
  ]);
  assert.equal(selectRoundCards(session.cards, 1).length, 4);
});

test("round selection safely ignores malformed cards", () => {
  const validCard = { id: "REV-valid", conclusion: "待修改" };
  assert.deepEqual(
    selectRoundCards([null, 1, {}, { id: "REV-no-conclusion" }, validCard], 1),
    [validCard],
  );
});

test("navigation keeps a single current card and saves edits", () => {
  let state = createReviewState(session);
  state = reduceReviewState(state, {
    type: "EDIT_CARD",
    patch: { userNote: "需补证据" },
  });
  state = reduceReviewState(state, { type: "NEXT" });

  assert.equal(state.cards[0].userNote, "需补证据");
  assert.equal(state.currentCardIndex, 1);
  assert.equal(state.cards[state.currentCardIndex].id, "REV-003");
});

test("list selection and previous-next navigation share one current card index", () => {
  let state = createReviewState(session);
  state = reduceReviewState(state, { type: "SELECT_CARD", index: 2 });
  assert.equal(state.currentCardIndex, 2);
  assert.equal(state.cards[state.currentCardIndex].id, "REV-004");

  state = reduceReviewState(state, { type: "PREVIOUS" });
  assert.equal(state.currentCardIndex, 1);

  const unchanged = reduceReviewState(state, { type: "SELECT_CARD", index: 99 });
  assert.equal(unchanged, state);
});

test("panel markup renders MUI-style list detail navigation, badges, and an exclusive button group", () => {
  const state = createReviewState(session);
  const markup = panelMarkup(state, false, null, { dockSide: "right" });

  assert.match(markup, /登录模块 功能评审/);
  assert.equal((markup.match(/data-review-list-item/g) ?? []).length, state.cards.length);
  assert.match(markup, /data-review-list-item[^>]*aria-current="true"/);
  assert.match(markup, /data-review-status-summary/);
  for (const conclusion of ["未评审", "已确认", "待修改", "阻塞", "不适用"]) {
    assert.match(markup, new RegExp(`data-status="${conclusion}"`));
  }
  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /data-action="select-conclusion"/);
  assert.doesNotMatch(markup, /<select/);
  assert.match(markup, /data-review-detail/);
  assert.match(markup, /data-review-implementation-summary/);
  for (const section of ["structure", "linkage", "data", "acceptance"]) {
    assert.match(markup, new RegExp(`data-review-implementation-section="${section}"`));
  }
  assert.equal((markup.match(/data-review-implementation-section=/g) ?? []).length, 4);
  assert.match(markup, /data-review-implementation-evidence/);
  assert.match(markup, /怎么实现/);
  assert.match(markup, /怎么联动/);
  assert.match(markup, /数据怎么走/);
  assert.match(markup, /怎么验收/);
  assert.match(markup, /data-action="previous"/);
  assert.match(markup, /data-action="next"/);
  assert.match(markup, /data-review-resize-edge="left"/);
  assert.doesNotMatch(markup, /data-review-resize-edge="right"/);
});

test("review conclusion statistics always include every fixed status", () => {
  assert.deepEqual(countReviewConclusions(session.cards), {
    "未评审": 0,
    "已确认": 2,
    "待修改": 1,
    "阻塞": 0,
    "不适用": 1,
  });
});

test("panel width and docked resize geometry use fixed limits and viewport safety", () => {
  assert.deepEqual(PANEL_WIDTH_LIMITS, { default: 960, min: 720, max: 1280, viewportGap: 16 });
  assert.equal(clampPanelWidth(300, 1600), 720);
  assert.equal(clampPanelWidth(1400, 1600), 1280);
  assert.equal(clampPanelWidth(960, 800), 784);

  assert.deepEqual(
    resizePanelGeometry({
      edge: "right",
      dockSide: "left",
      panelWidth: 960,
      panelX: 0,
      startPointerX: 960,
      pointerX: 1200,
      viewportWidth: 1600,
    }),
    { dockSide: "left", panelWidth: 1200, panelX: 0 },
  );
  assert.deepEqual(
    resizePanelGeometry({
      edge: "left",
      dockSide: "right",
      panelWidth: 960,
      panelX: 640,
      startPointerX: 640,
      pointerX: 400,
      viewportWidth: 1600,
    }),
    { dockSide: "right", panelWidth: 1200, panelX: 400 },
  );
  assert.deepEqual(
    resizePanelGeometry({
      edge: "left",
      dockSide: "floating",
      panelWidth: 960,
      panelX: 300,
      startPointerX: 300,
      pointerX: 500,
      viewportWidth: 1600,
    }),
    { dockSide: "floating", panelWidth: 760, panelX: 500 },
  );
  assert.equal(resolveDockSide(0, 960, 1600), "left");
  assert.equal(resolveDockSide(640, 960, 1600), "right");
  assert.equal(resolveDockSide(300, 960, 1600), "floating");
});

test("submission versions increase and stale results are rejected", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  assert.equal(state.mode, "reviewing");
  assert.equal(state.submissionVersion, 1);

  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 0,
    results: [],
  });
  assert.equal(state.mode, "reviewing");
  assert.match(state.lastError.message, /过期/i);
});

test("submit stores a deeply frozen copy that later edits cannot change", () => {
  let state = reduceReviewState(createReviewState(session), {
    type: "EDIT_CARD",
    patch: { userNote: "提交前笔记" },
  });
  state = reduceReviewState(state, { type: "SUBMIT" });
  const snapshot = state.lastSubmission;

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.cards), true);
  assert.equal(Object.isFrozen(snapshot.cards[0].evidence), true);
  assert.throws(() => {
    snapshot.cards[0].userNote = "不应修改快照";
  }, TypeError);

  const afterSubmitEdit = reduceReviewState(state, {
    type: "EDIT_CARD",
    patch: { userNote: "提交后草稿" },
  });
  assert.equal(afterSubmitEdit, state);
  assert.equal(snapshot.cards[0].userNote, "提交前笔记");
  assert.equal(state.cards[0].userNote, "提交前笔记");
});

test("apply result requires both matching session and submission version", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });

  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "other-session",
    submissionVersion: 1,
    results: [],
  });
  assert.equal(state.mode, "reviewing");
  assert.match(state.lastError.message, /过期/i);

  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [{ id: "matched-result", conclusion: "已确认" }],
  });
  assert.equal(state.mode, "result");
});

test("result cards sort blocking, pending modification, conflict, then other", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [
      { id: "other", conclusion: "已确认" },
      { id: "conflict", conclusion: "冲突" },
      { id: "pending", conclusion: "待修改" },
      { id: "blocking", conclusion: "阻塞" },
    ],
  });

  assert.deepEqual(state.results.map((result) => result.id), [
    "blocking",
    "pending",
    "conflict",
    "other",
  ]);
});

test("confirm plan requires the final non-empty result", () => {
  const input = createReviewState(session);
  assert.equal(reduceReviewState(input, { type: "CONFIRM_PLAN" }), input);

  let result = reduceReviewState(input, { type: "SUBMIT" });
  result = reduceReviewState(result, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [
      { id: "first", conclusion: "阻塞" },
      { id: "last", conclusion: "待修改" },
    ],
  });
  assert.equal(reduceReviewState(result, { type: "CONFIRM_PLAN" }), result);
  result = reduceReviewState(result, { type: "NEXT" });
  assert.equal(result.currentResultIndex, 1);
  result = reduceReviewState(result, { type: "CONFIRM_PLAN", ...matchedFingerprints });
  assert.equal(result.mode, "confirmed");
});

test("active-card submission and empty results stay out of confirmable result mode", () => {
  const emptyRound = createReviewState({
    ...session,
    cards: [approvedCard({ id: "resolved", conclusion: "已确认" })],
  });
  const blockedSubmit = reduceReviewState(emptyRound, { type: "SUBMIT" });
  assert.equal(blockedSubmit.mode, "input");
  assert.match(blockedSubmit.lastError.message, /可提交/i);

  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  const emptyResults = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [],
  });
  assert.equal(emptyResults.mode, "reviewing");
  assert.match(emptyResults.lastError.message, /空评审结果/i);
});

test("draft restore requires matching fresh metadata and clamps only valid editable fields", () => {
  const state = createReviewState(session);
  const savedAt = 1_000;
  const validDraft = {
    sessionId: state.sessionId,
    reviewRound: state.reviewRound,
    planFingerprint: state.planFingerprint,
    artifactRuleFingerprint: state.artifactRuleFingerprint,
    artifactRuleResolution: state.artifactRuleResolution,
    savedAt,
    currentCardIndex: 999,
    cards: [{ id: "REV-002", conclusion: "阻塞", userNote: "可恢复" }],
  };
  const restored = restoreDraft(state, validDraft, savedAt + DRAFT_TTL_MS);
  assert.equal(restored.currentCardIndex, state.cards.length - 1);
  assert.equal(restored.cards[0].conclusion, "阻塞");

  const temporaryResolution = {
    status: "temporarily-confirmed-candidate",
    source: "candidate",
    confirmedRuleFingerprint: state.artifactRuleFingerprint,
  };
  const temporaryDraft = {
    ...validDraft,
    artifactRuleResolution: temporaryResolution,
  };
  const resolvedStateFromTemporaryDraft = restoreDraft(state, temporaryDraft, savedAt + 1);
  assert.equal(resolvedStateFromTemporaryDraft.currentCardIndex, state.currentCardIndex);
  assert.equal(resolvedStateFromTemporaryDraft.cards[0].conclusion, state.cards[0].conclusion);
  assert.equal(resolvedStateFromTemporaryDraft.cards[0].userNote, state.cards[0].userNote);

  const temporaryState = createReviewState({
    ...session,
    artifactRuleResolution: temporaryResolution,
  });
  const matchingTemporaryDraft = restoreDraft(temporaryState, temporaryDraft, savedAt + 1);
  assert.equal(matchingTemporaryDraft.currentCardIndex, temporaryState.cards.length - 1);
  assert.equal(matchingTemporaryDraft.cards[0].conclusion, "阻塞");

  const temporaryStateFromResolvedDraft = restoreDraft(temporaryState, validDraft, savedAt + 1);
  assert.equal(temporaryStateFromResolvedDraft.currentCardIndex, temporaryState.currentCardIndex);
  assert.equal(temporaryStateFromResolvedDraft.cards[0].conclusion, temporaryState.cards[0].conclusion);
  assert.equal(temporaryStateFromResolvedDraft.cards[0].userNote, temporaryState.cards[0].userNote);

  const temporaryStateFromMismatchedConfirmation = restoreDraft(temporaryState, {
    ...temporaryDraft,
    artifactRuleResolution: {
      ...temporaryResolution,
      confirmedRuleFingerprint: "sha256:different-rule",
    },
  }, savedAt + 1);
  assert.equal(temporaryStateFromMismatchedConfirmation.currentCardIndex, temporaryState.currentCardIndex);
  assert.equal(temporaryStateFromMismatchedConfirmation.cards[0].conclusion, temporaryState.cards[0].conclusion);

  for (const [draft, now] of [
    [{ ...validDraft, sessionId: "other" }, savedAt + DRAFT_TTL_MS],
    [{ ...validDraft, reviewRound: state.reviewRound + 1 }, savedAt + DRAFT_TTL_MS],
    [{ ...validDraft, savedAt: savedAt - 1 }, savedAt + DRAFT_TTL_MS + 1],
    [{ ...validDraft, cards: [{ id: "REV-002", conclusion: "冲突", userNote: "tampered" }] }, savedAt + DRAFT_TTL_MS],
  ]) {
    const candidate = restoreDraft(state, draft, now);
    assert.equal(candidate.cards[0].conclusion, state.cards[0].conclusion);
    assert.equal(
      candidate.currentCardIndex,
      draft.cards[0].conclusion === "冲突" ? state.cards.length - 1 : state.currentCardIndex,
    );
  }
});

test("reducer preserves fingerprints and excludes actual artifact paths", () => {
  let state = createReviewState(session);
  assert.equal(state.planFingerprint, "sha256:fixture");
  assert.equal(state.artifactRuleFingerprint, "sha256:rule-fixture");
  assert.deepEqual(state.artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
  assert.equal(Object.hasOwn(state, "artifactPath"), false);
  assert.equal(Object.hasOwn(state, "artifactUrl"), false);
  assert.doesNotMatch(JSON.stringify(state), /private\/artifacts/);
  assert.doesNotMatch(JSON.stringify(state), /artifacts\.example/);
  assert.equal(state.cards[0].telepath, "reviewer-visible evidence marker");
  assert.deepEqual(state.cards[0].sourceEvidence, [{
    id: "E-002",
    kind: "prototype",
    label: "登录表单",
    path: "/evidence/login.png",
    selector: "#login-form",
  }]);

  for (const action of [
    { type: "EDIT_CARD", patch: { planFingerprint: "sha256:mutated" } },
    { type: "SUBMIT" },
    {
      type: "APPLY_RESULT",
      sessionId: "session-1",
      submissionVersion: 1,
      planFingerprint: "sha256:mutated",
      artifactRuleFingerprint: "sha256:mutated",
      results: [],
    },
    { type: "CONFIRM_PLAN" },
  ]) {
    state = reduceReviewState(state, action);
  }

  assert.equal(state.planFingerprint, "sha256:fixture");
  assert.equal(state.artifactRuleFingerprint, "sha256:rule-fixture");
  assert.equal(Object.hasOwn(state.lastSubmission, "artifactPath"), false);
  assert.equal(Object.hasOwn(state.lastSubmission, "artifactUrl"), false);
  assert.equal(state.lastSubmission.cards[0].sourceEvidence[0].path, "/evidence/login.png");
  assert.deepEqual(state.lastSubmission.artifactRuleResolution, state.artifactRuleResolution);
});

test("canonical cards and results exclude unknown artifact-location fields", () => {
  const sessionWithArtifactItems = {
    ...session,
    cards: session.cards.map((card, index) =>
      index === 1
        ? {
            ...card,
            artifactPath: "/private/cards/REV-002.html",
            artifactUrl: "https://artifacts.example.test/cards/REV-002.html",
          }
        : card,
    ),
  };
  let state = createReviewState(sessionWithArtifactItems);

  assert.equal(Object.hasOwn(state.cards[0], "artifactPath"), false);
  assert.equal(Object.hasOwn(state.cards[0], "artifactUrl"), false);
  assert.equal(state.cards[0].telepath, "reviewer-visible evidence marker");
  assert.equal(state.cards[0].sourceEvidence[0].path, "/evidence/login.png");

  state = reduceReviewState(state, { type: "SUBMIT" });
  assert.equal(Object.hasOwn(state.lastSubmission.cards[0], "artifactPath"), false);
  assert.equal(Object.hasOwn(state.lastSubmission.cards[0], "artifactUrl"), false);
  assert.equal(state.lastSubmission.cards[0].sourceEvidence[0].path, "/evidence/login.png");

  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [
      {
        id: "result-1",
        conclusion: "待修改",
        artifactPath: "/private/results/result-1.html",
        artifactUrl: "https://artifacts.example.test/results/result-1.html",
        telepath: "result-business-field",
        evidence: { path: "/evidence/result-1.png" },
      },
    ],
  });

  assert.equal(Object.hasOwn(state.results[0], "artifactPath"), false);
  assert.equal(Object.hasOwn(state.results[0], "artifactUrl"), false);
  assert.equal(state.results[0].telepath, "result-business-field");
  assert.equal(state.results[0].sourceEvidence[0].path, "/evidence/result-1.png");
});

test("state transitions are one-way and reject actions outside their mode", () => {
  const input = createReviewState(session);
  assert.equal(input.mode, "input");
  assert.equal(reduceReviewState(input, { type: "APPLY_RESULT" }), input);
  assert.equal(reduceReviewState(input, { type: "CONFIRM_PLAN" }), input);

  const reviewing = reduceReviewState(input, { type: "SUBMIT" });
  assert.equal(reviewing.mode, "reviewing");
  assert.equal(reduceReviewState(reviewing, { type: "EDIT_CARD", patch: { userNote: "x" } }), reviewing);
  assert.equal(reduceReviewState(reviewing, { type: "NEXT" }), reviewing);
  assert.equal(reduceReviewState(reviewing, { type: "PREVIOUS" }), reviewing);
  assert.equal(reduceReviewState(reviewing, { type: "SUBMIT" }), reviewing);
  assert.equal(reduceReviewState(reviewing, { type: "CONFIRM_PLAN" }), reviewing);

  const result = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [{ id: "matched-result", conclusion: "已确认" }],
  });
  assert.equal(result.mode, "result");
  const confirmed = reduceReviewState(result, { type: "CONFIRM_PLAN", ...matchedFingerprints });
  assert.equal(confirmed.mode, "confirmed");
  assert.equal(reduceReviewState(confirmed, { type: "SUBMIT" }), confirmed);
  assert.equal(reduceReviewState(confirmed, { type: "APPLY_RESULT", results: [] }), confirmed);
  assert.equal(reduceReviewState(confirmed, { type: "CONFIRM_PLAN" }), confirmed);
});

test("input edits only the user-controlled conclusion and note", () => {
  const state = reduceReviewState(createReviewState(session), {
    type: "EDIT_CARD",
    patch: {
      conclusion: "阻塞",
      userNote: "用户重新判断",
      id: "REV-ATTACK",
      reopened: true,
      evidenceChanged: true,
      planFingerprint: "sha256:mutated",
      artifactRuleFingerprint: "sha256:mutated",
      injected: "must not appear",
    },
  });

  assert.equal(state.cards[0].conclusion, "阻塞");
  assert.equal(state.cards[0].userNote, "用户重新判断");
  assert.equal(state.cards[0].id, "REV-002");
  assert.equal(state.cards[0].reopened, false);
  assert.equal(state.cards[0].evidenceChanged, false);
  assert.equal(Object.hasOwn(state.cards[0], "injected"), false);
  assert.equal(state.planFingerprint, "sha256:fixture");
  assert.equal(state.artifactRuleFingerprint, "sha256:rule-fixture");

  const input = createReviewState(session);
  assert.equal(
    reduceReviewState(input, {
      type: "EDIT_CARD",
      patch: { conclusion: {}, userNote: 1 },
    }),
    input,
  );
});

test("input reducer rejects conclusions outside the fixed reviewer set", () => {
  const input = createReviewState(session);
  for (const conclusion of ["冲突", "任意状态", "", "  "]) {
    assert.equal(
      reduceReviewState(input, { type: "EDIT_CARD", patch: { conclusion } }),
      input,
    );
  }
});

test("an implementation-blocked card cannot be changed to a non-blocked conclusion", () => {
  const blockedCard = approvedCard({
    conclusion: "阻塞",
    implementationPlan: {
      status: "blocked",
      summary: "项目组件体系尚未确认",
      structure: [],
      linkage: [],
      dataFlow: [],
      acceptanceFocus: [],
      evidenceIds: [],
      blockers: ["缺少适用项目组件规范"],
    },
  });
  const state = createReviewState(approvedSession({ cards: [blockedCard] }));
  const edited = reduceReviewState(state, {
    type: "EDIT_CARD",
    patch: { conclusion: "已确认" },
  });

  assert.equal(edited, state);
  assert.equal(edited.cards[0].conclusion, "阻塞");
});

test("editing a card does not share nested source evidence with the previous state", () => {
  const input = createReviewState(session);
  const edited = reduceReviewState(input, {
    type: "EDIT_CARD",
    patch: { userNote: "仅更新可编辑字段" },
  });

  assert.notEqual(edited.cards[0].sourceEvidence, input.cards[0].sourceEvidence);
  edited.cards[0].sourceEvidence[0].label = "已修改";
  assert.equal(input.cards[0].sourceEvidence[0].label, "登录表单");
});

test("invalid sessions and reducer inputs are safe", () => {
  for (const invalidSession of [null, {}, { cards: {} }]) {
    assert.throws(
      () => createReviewState(invalidSession),
      (error) => error instanceof TypeError && error.code === "invalid-review-session" && /ReviewSession/i.test(error.message),
    );
  }
  for (const sessionId of [undefined, "", "   "]) {
    assert.throws(
      () => createReviewState({ ...session, sessionId }),
      (error) => error instanceof TypeError && error.code === "invalid-review-session" && /ReviewSession/i.test(error.message),
    );
  }
  for (const cards of [
    [null],
    [1],
    [{}],
    [{ id: "REV-without-conclusion" }],
    [{ conclusion: "待修改" }],
  ]) {
    assert.throws(
      () => createReviewState({ ...session, cards }),
      (error) => error instanceof TypeError && error.code === "invalid-review-card" && /review card/i.test(error.message),
    );
  }

  assert.throws(
    () => mountReviewPanel(session),
    (error) => error instanceof Error && error.code === "browser-document-unavailable" && /browser document/i.test(error.message),
  );

  const state = createReviewState(session);
  for (const action of [null, 1, "invalid", {}, { type: "UNKNOWN" }]) {
    assert.equal(reduceReviewState(state, action), state);
  }
  assert.equal(reduceReviewState(null, { type: "SUBMIT" }), null);
  assert.equal(reduceReviewState("invalid", { type: "SUBMIT" }), "invalid");
});

test("reviewing results require a non-empty matching session id", () => {
  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  for (const sessionId of [undefined, "", "   "]) {
    const stale = reduceReviewState(reviewing, {
      type: "APPLY_RESULT",
      sessionId,
      submissionVersion: 1,
      results: [],
    });
    assert.equal(stale.mode, "reviewing");
    assert.match(stale.lastError.message, /过期/i);
  }
});

test("apply result reports invalid results only for the active submission", () => {
  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  for (const results of [
    null,
    {},
    [null],
    [1],
    [{}],
    [{ id: "result-without-conclusion" }],
    [{ conclusion: "待修改" }],
  ]) {
    const invalid = reduceReviewState(reviewing, {
      type: "APPLY_RESULT",
      sessionId: "session-1",
      submissionVersion: 1,
      ...matchedFingerprints,
      results,
    });
    assert.equal(invalid.mode, "reviewing");
    assert.match(invalid.lastError.message, /结果格式无效/i);
  }
});

test("storage keys isolate project delivery units and position stays visible", () => {
  assert.equal(
    buildStorageKey("project-a/login"),
    "page-delivery-review:v1:project-a/login",
  );
  assert.deepEqual(
    clampPanelPosition(
      { x: 999, y: -10 },
      { width: 320, height: 500 },
      { width: 800, height: 600 },
    ),
    { x: 480, y: 0 },
  );
});

test("clamp safely handles missing, negative, and non-finite geometry", () => {
  assert.deepEqual(clampPanelPosition(), { x: 0, y: 0 });
  assert.deepEqual(
    clampPanelPosition(
      { x: 999, y: -Infinity },
      { width: Infinity, height: -20 },
      { width: 300, height: 200 },
    ),
    { x: 300, y: 0 },
  );
  assert.deepEqual(
    clampPanelPosition(
      { x: NaN, y: Infinity },
      { width: NaN, height: Infinity },
      { width: -1, height: NaN },
    ),
    { x: 0, y: 0 },
  );
});

test("plan fingerprint changes preserve only safe draft UI preferences", () => {
  const state = createReviewState(session);
  const draft = {
    deliveryUnitKey: state.deliveryUnitKey,
    sessionId: "session-new",
    reviewRound: state.reviewRound,
    planFingerprint: "sha256:changed-plan",
    artifactRuleFingerprint: state.artifactRuleFingerprint,
    savedAt: 1_000,
    cards: [{ id: "REV-002", conclusion: "阻塞", userNote: "旧结论" }],
    currentCardIndex: 2,
    collapsed: true,
    panelPosition: { x: 12, y: 24 },
    panelWidth: 960,
    dockSide: "right",
  };

  const sanitized = sanitizeDraft(draft);
  assert.deepEqual(sanitized.panelPosition, { x: 12, y: 24 });
  assert.equal(sanitized.collapsed, true);
  assert.equal(sanitized.panelWidth, 960);
  assert.equal(sanitized.dockSide, "right");
  assert.equal(restoreDraft(state, sanitized, 1_001).cards[0].conclusion, "待修改");
  assert.equal(restoreDraft(state, sanitized, 1_001).cards[0].userNote, state.cards[0].userNote);
});

test("draft helpers fall back to memory when localStorage is unavailable", () => {
  const storageKey = buildStorageKey("sample/memory-only");
  const unavailableStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
  };
  const saved = saveDraft(storageKey, {
    deliveryUnitKey: "sample/memory-only",
    sessionId: "memory-session",
    reviewRound: 1,
    planFingerprint: "sha256:memory",
    artifactRuleFingerprint: "sha256:rule",
    savedAt: Date.now(),
    cards: [{ id: "REV-memory", conclusion: "待修改", userNote: "内存草稿" }],
  }, unavailableStorage);

  assert.equal(saved.cards[0].userNote, "内存草稿");
  assert.deepEqual(loadDraft(storageKey, unavailableStorage), saved);
});

test("expired drafts are removed from storage and memory before they can be restored", () => {
  const storageKey = buildStorageKey("sample/expired-draft");
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  saveDraft(storageKey, {
    deliveryUnitKey: "sample/expired-draft",
    sessionId: "expired-session",
    reviewRound: 1,
    planFingerprint: "sha256:expired",
    artifactRuleFingerprint: "sha256:rule",
    savedAt: Date.now() - DRAFT_TTL_MS - 1,
    cards: [],
  }, storage);

  assert.equal(loadDraft(storageKey, storage), null);
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(loadDraft(storageKey, { getItem() { throw new Error("unavailable"); } }), null);
});

test("results and confirmation require explicit current fingerprint pairs", () => {
  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  const missingPlan = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    results: [{ id: "result", conclusion: "已确认" }],
  });
  assert.equal(missingPlan.mode, "reviewing");
  assert.equal(missingPlan.lastError.code, "missing-plan-fingerprint");

  const missingRule = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    planFingerprint: session.planFingerprint,
    results: [{ id: "result", conclusion: "已确认" }],
  });
  assert.equal(missingRule.mode, "reviewing");
  assert.equal(missingRule.lastError.code, "missing-artifact-rule-fingerprint");

  const result = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    ...matchedFingerprints,
    results: [{ id: "result", conclusion: "已确认" }],
  });
  const missingConfirmation = reduceReviewState(result, { type: "CONFIRM_PLAN" });
  assert.equal(missingConfirmation.mode, "result");
  assert.equal(missingConfirmation.lastError.code, "missing-plan-fingerprint");
  assert.equal(reduceReviewState(result, { type: "CONFIRM_PLAN", ...matchedFingerprints }).mode, "confirmed");
});

test("unreachable frame evidence is reported without an uncaught exception", () => {
  const frame = {
    get contentDocument() { throw new Error("cross-origin"); },
  };
  const error = highlightEvidence(
    { querySelector() { return frame; } },
    { frameSelector: "iframe", selector: "#target" },
    () => { throw new Error("must not add listener"); },
    () => {},
  );
  assert.deepEqual(error, {
    code: "evidence-unavailable",
    message: "无法定位证据，请检查选择器或跨域 frame 访问权限。",
  });
});

test("view scopes retain confirmed cards and mark changed evidence with its previous conclusion", () => {
  const cards = [
    approvedCard({ id: "confirmed", conclusion: "已确认" }),
    approvedCard({ id: "changed", conclusion: "已确认", evidenceChanged: true }),
    approvedCard({ id: "open", conclusion: "待修改" }),
  ];
  const round = createReviewState({ ...session, cards, reviewRound: 2, viewScope: "round" });
  const all = createReviewState({ ...session, cards, reviewRound: 2, viewScope: "all" });

  assert.deepEqual(round.cards.map((card) => card.id), ["changed", "open"]);
  assert.equal(round.cards[0].reviewResult.previousConclusion, "已确认");
  assert.deepEqual(all.cards.map((card) => card.id), ["confirmed", "changed", "open"]);
  assert.equal(all.cards[0].conclusion, "已确认");
});

test("fingerprint guards block conflicting results before they can be confirmed", () => {
  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  const conflict = reduceReviewState(reviewing, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    planFingerprint: "sha256:changed",
    artifactRuleFingerprint: session.artifactRuleFingerprint,
    results: [{ id: "result", conclusion: "已确认" }],
  });

  assert.equal(conflict.mode, "reviewing");
  assert.deepEqual(conflict.lastError, {
    code: "plan-conflict",
    message: "Plan 已变化，请重新解析后再确认更新。",
  });
  assert.deepEqual(assertPlanFingerprint("a", "b"), conflict.lastError);
  assert.equal(assertPlanFingerprint("a", "a"), null);
});

test("artifact rule guard returns a stable AGENTS reparse error", () => {
  assert.deepEqual(
    assertArtifactLocationRule(
      { status: "resolved", source: "agents", ruleFingerprint: "sha256:old" },
      "sha256:new",
    ),
    {
      code: "artifact-rule-conflict",
      message: "产物位置规则已变化，请重新解析适用的 AGENTS.md 后再提交。",
    },
  );
  assert.equal(
    assertArtifactLocationRule(
      { status: "resolved", source: "agents", ruleFingerprint: "sha256:same" },
      "sha256:same",
    ),
    null,
  );
});

test("confirmation gate blocks changed artifact rules even after a matching result", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: session.sessionId,
    submissionVersion: 1,
    planFingerprint: session.planFingerprint,
    artifactRuleFingerprint: session.artifactRuleFingerprint,
    results: [{ id: "result", conclusion: "已确认" }],
  });
  const blocked = reduceReviewState(state, {
    type: "CONFIRM_PLAN",
    planFingerprint: session.planFingerprint,
    artifactRuleFingerprint: "sha256:changed-rule",
  });

  assert.equal(blocked.mode, "result");
  assert.equal(blocked.lastError.code, "artifact-rule-conflict");
  assert.match(blocked.lastError.message, /AGENTS\.md/);
});

test("result prioritization is deterministic for equal-priority results", () => {
  assert.deepEqual(
    prioritizeReviewResults([
      { id: "z-pending", conclusion: "待修改" },
      { id: "a-pending", conclusion: "待修改" },
      { id: "other", conclusion: "已确认" },
    ]).map((result) => result.id),
    ["a-pending", "z-pending", "other"],
  );
});
