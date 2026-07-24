import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  buildStorageKey,
  clampPanelPosition,
  createReviewState,
  DRAFT_TTL_MS,
  assertArtifactLocationRule,
  assertPlanFingerprint,
  loadDraft,
  highlightEvidence,
  mountReviewPanel,
  prioritizeReviewResults,
  reduceReviewState,
  restoreDraft,
  sanitizeDraft,
  saveDraft,
  sanitizePanelItem,
  selectRoundCards,
} = require("../scripts/inject-review-panel.js");

const session = JSON.parse(
  readFileSync(new URL("./fixtures/review-session.json", import.meta.url), "utf8"),
);
const matchedFingerprints = {
  planFingerprint: session.planFingerprint,
  artifactRuleFingerprint: session.artifactRuleFingerprint,
};

test("review state preserves an explicitly resolved AGENTS artifact rule", () => {
  assert.deepEqual(createReviewState(session).artifactRuleResolution, {
    status: "resolved",
    source: "agents",
  });
});

test("unresolved artifact rule candidates can be reviewed but cannot confirm a Plan", () => {
  const unresolvedSession = {
    ...session,
    artifactRuleResolution: {
      status: "unresolved-candidate",
      source: "candidate",
    },
  };
  let state = createReviewState(unresolvedSession);
  assert.deepEqual(state.artifactRuleResolution, unresolvedSession.artifactRuleResolution);

  state = reduceReviewState(state, { type: "SUBMIT" });
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
    cards: [{ id: "resolved", conclusion: "已确认", reopened: false, evidenceChanged: false }],
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

test("sanitizer removes nested artifact locations but preserves evidence paths and telepath", () => {
  const sanitized = sanitizePanelItem({
    id: "nested",
    conclusion: "待修改",
    artifactPath: "/private/root",
    evidence: {
      path: "/evidence/keep.png",
      locator: "figma://keep",
      artifactUrl: "https://private.example/evidence",
    },
    nested: [{ artifactPath: "/private/nested", telepath: "keep-me" }],
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /private/);
  assert.equal(sanitized.evidence.path, "/evidence/keep.png");
  assert.equal(sanitized.evidence.locator, "figma://keep");
  assert.equal(sanitized.nested[0].telepath, "keep-me");
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
  assert.deepEqual(state.cards[0].evidence, {
    locator: "figma://file/login-node",
    path: "/evidence/login.png",
    selector: "#login-form",
  });

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
  assert.equal(state.lastSubmission.cards[0].evidence.path, "/evidence/login.png");
  assert.deepEqual(state.lastSubmission.artifactRuleResolution, state.artifactRuleResolution);
});

test("panel items exclude only top-level artifact locations", () => {
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
  assert.equal(state.cards[0].evidence.path, "/evidence/login.png");

  state = reduceReviewState(state, { type: "SUBMIT" });
  assert.equal(Object.hasOwn(state.lastSubmission.cards[0], "artifactPath"), false);
  assert.equal(Object.hasOwn(state.lastSubmission.cards[0], "artifactUrl"), false);
  assert.equal(state.lastSubmission.cards[0].evidence.path, "/evidence/login.png");

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
  assert.equal(state.results[0].evidence.path, "/evidence/result-1.png");
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

test("editing a card does not share nested evidence with the previous state", () => {
  const input = createReviewState(session);
  const edited = reduceReviewState(input, {
    type: "EDIT_CARD",
    patch: { userNote: "仅更新可编辑字段" },
  });

  assert.notEqual(edited.cards[0].evidence, input.cards[0].evidence);
  edited.cards[0].evidence.locator = "figma://file/edited-node";
  assert.equal(input.cards[0].evidence.locator, "figma://file/login-node");
});

test("invalid sessions and reducer inputs are safe", () => {
  for (const invalidSession of [null, {}, { cards: {} }]) {
    assert.throws(
      () => createReviewState(invalidSession),
      (error) => error instanceof TypeError && error.code === "invalid-review-session" && /review session/i.test(error.message),
    );
  }
  for (const sessionId of [undefined, "", "   "]) {
    assert.throws(
      () => createReviewState({ ...session, sessionId }),
      (error) => error instanceof TypeError && error.code === "invalid-review-session" && /review session/i.test(error.message),
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
      (error) => error instanceof TypeError && error.code === "invalid-review-session" && /review session/i.test(error.message),
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
  };

  const sanitized = sanitizeDraft(draft);
  assert.deepEqual(sanitized.panelPosition, { x: 12, y: 24 });
  assert.equal(sanitized.collapsed, true);
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
    { id: "confirmed", conclusion: "已确认" },
    { id: "changed", conclusion: "已确认", evidenceChanged: true },
    { id: "open", conclusion: "待修改" },
  ];
  const round = createReviewState({ ...session, cards, reviewRound: 2, viewScope: "round" });
  const all = createReviewState({ ...session, cards, reviewRound: 2, viewScope: "all" });

  assert.deepEqual(round.cards.map((card) => card.id), ["changed", "open"]);
  assert.equal(round.cards[0].previousConclusion, "已确认");
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
