import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  buildStorageKey,
  clampPanelPosition,
  createReviewState,
  reduceReviewState,
  selectRoundCards,
} = require("../scripts/inject-review-panel.js");

const session = JSON.parse(
  readFileSync(new URL("./fixtures/review-session.json", import.meta.url), "utf8"),
);

test("later rounds include only unresolved, reopened, or changed cards", () => {
  assert.deepEqual(selectRoundCards(session.cards, 2).map((card) => card.id), [
    "REV-002",
    "REV-003",
    "REV-004",
  ]);
  assert.equal(selectRoundCards(session.cards, 1).length, 4);
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
  assert.match(state.lastError, /stale/i);
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
  assert.match(state.lastError, /stale/i);

  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    results: [],
  });
  assert.equal(state.mode, "result");
});

test("result cards sort blocking, pending modification, conflict, then other", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
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

test("confirm plan is accepted only from result mode", () => {
  const input = createReviewState(session);
  assert.equal(reduceReviewState(input, { type: "CONFIRM_PLAN" }), input);

  let result = reduceReviewState(input, { type: "SUBMIT" });
  result = reduceReviewState(result, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 1,
    results: [],
  });
  result = reduceReviewState(result, { type: "CONFIRM_PLAN" });
  assert.equal(result.mode, "confirmed");
});

test("reducer preserves fingerprints and excludes actual artifact paths", () => {
  let state = createReviewState(session);
  assert.equal(state.planFingerprint, "sha256:fixture");
  assert.equal(state.artifactRuleFingerprint, "sha256:rule-fixture");
  assert.equal(Object.hasOwn(state, "artifactPath"), false);
  assert.equal(Object.hasOwn(state, "artifactUrl"), false);
  assert.doesNotMatch(JSON.stringify(state), /private\/artifacts/);
  assert.doesNotMatch(JSON.stringify(state), /artifacts\.example/);
  assert.equal(state.cards[0].telepath, "reviewer-visible evidence marker");
  assert.deepEqual(state.cards[0].evidence, {
    locator: "figma://file/login-node",
    path: "/evidence/login.png",
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
    results: [],
  });
  assert.equal(result.mode, "result");
  const confirmed = reduceReviewState(result, { type: "CONFIRM_PLAN" });
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
});

test("invalid sessions and reducer inputs are safe", () => {
  assert.throws(() => createReviewState(null), /review session/i);
  assert.throws(() => createReviewState({}), /review session/i);
  assert.throws(() => createReviewState({ cards: {} }), /review session/i);

  const state = createReviewState(session);
  for (const action of [null, 1, "invalid", {}, { type: "UNKNOWN" }]) {
    assert.equal(reduceReviewState(state, action), state);
  }
  assert.equal(reduceReviewState(null, { type: "SUBMIT" }), null);
  assert.equal(reduceReviewState("invalid", { type: "SUBMIT" }), "invalid");
});

test("apply result reports invalid results only for the active submission", () => {
  const reviewing = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  for (const results of [null, {}]) {
    const invalid = reduceReviewState(reviewing, {
      type: "APPLY_RESULT",
      sessionId: "session-1",
      submissionVersion: 1,
      results,
    });
    assert.equal(invalid.mode, "reviewing");
    assert.match(invalid.lastError, /invalid.*results/i);
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
