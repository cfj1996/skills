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
    patch: { userNote: "提交前笔记", evidence: { source: "reviewer" } },
  });
  state = reduceReviewState(state, { type: "SUBMIT" });
  const snapshot = state.lastSubmission;

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.cards), true);
  assert.equal(Object.isFrozen(snapshot.cards[0].evidence), true);
  assert.throws(() => {
    snapshot.cards[0].userNote = "不应修改快照";
  }, TypeError);

  state = reduceReviewState(state, {
    type: "EDIT_CARD",
    patch: { userNote: "提交后草稿" },
  });
  assert.equal(snapshot.cards[0].userNote, "提交前笔记");
  assert.equal(state.cards[0].userNote, "提交后草稿");
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
  const reviewing = createReviewState(session);
  assert.equal(reduceReviewState(reviewing, { type: "CONFIRM_PLAN" }), reviewing);

  let result = reduceReviewState(reviewing, { type: "SUBMIT" });
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
  assert.doesNotMatch(JSON.stringify(state), /private\/artifacts/);

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
