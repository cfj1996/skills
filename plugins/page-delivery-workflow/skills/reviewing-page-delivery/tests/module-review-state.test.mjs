import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createReviewState, reduceReviewState, mergeReviewSession, panelMarkup } = require('../scripts/inject-review-panel.js');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/module-review-session.json', import.meta.url), 'utf8'));
const session = () => structuredClone(fixture);
const submit = state => reduceReviewState(state, { type: 'SUBMIT' });
const result = state => reduceReviewState(state, { type: 'APPLY_RESULT', ...state.lastSubmission,
  results: state.cards.map(card => ({ id: card.id, cardIds: [card.id], conclusion: '已确认', summary: card.module.purpose, planChangeSummary: card.module.change.summary })) });
const select = (state, index) => reduceReviewState(state, { type: 'SELECT_CARD', index });
const edit = (state, patch) => reduceReviewState(state, { type: 'EDIT_CARD', patch });

test('module contract sanitizes unknown fields and validates the tree before mounting', () => {
  const input = session();
  input.cards[0].module.privatePath = '/not-allowed';
  const state = createReviewState(input);
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.cards.length, 3);
  assert.equal(Object.hasOwn(state.cards[0].module, 'privatePath'), false);
  for (const parent of ['M-003', 'missing']) {
    const bad = session(); bad.cards[0].module.parentId = parent;
    assert.throws(() => createReviewState(bad), error => error.code === 'invalid-module-tree');
  }
  const badExample = session(); badExample.cards[1].module.scenarios[0].id = 'S-001';
  assert.throws(() => createReviewState(badExample), error => error.code === 'duplicate-module-item-id');
});

test('requirements remain confirmable when technical implementation is incomplete', () => {
  const state = edit(select(createReviewState(session()), 2), { conclusion: '已确认', userNote: '功能需要，接口稍后查证' });
  assert.equal(state.cards[2].conclusion, '已确认');
  assert.equal(state.cards[2].implementationPlan.status, 'blocked');
  const html = panelMarkup(state, false, null);
  assert.match(html, /实现方案待补充/);
  assert.match(html, /data-module-technical/);
  assert.doesNotMatch(html, /<details data-module-technical[^>]*\bopen\b/);
  assert.doesNotMatch(html, /data-value="已确认"[^>]*disabled/);
});

test('conversation additions retain current opinions and reading position without trusting incoming answers', () => {
  let state = edit(select(createReviewState(session()), 1), { conclusion: '已确认', userNote: '保留这个意见' });
  const next = session(); next.sessionId = 'addition';
  const card = structuredClone(next.cards[1]); card.id = 'M-004'; card.module.name = '额外验证'; card.module.scenarios[0].id = 'S-004'; card.conclusion = '已确认';
  next.cards.push(card);
  const updated = mergeReviewSession(state, next);
  assert.equal(updated.cards[1].userNote, '保留这个意见');
  assert.equal(updated.cards[1].conclusion, '已确认');
  assert.equal(updated.cards[3].conclusion, '未评审');
  assert.equal(updated.currentCardIndex, 1);
  assert.equal(updated.cards.length, 4);
  assert.equal(updated.mode, 'input');
});

test('only changed modules reopen and content changes require a newer revision', () => {
  let state = createReviewState(session());
  state = edit(state, { conclusion: '已确认' });
  state = edit(select(state, 1), { conclusion: '已确认', userNote: '已核对规则' });
  const next = session(); next.sessionId = 'changed'; next.cards[1].module.rules.push('新补充的行为规则');
  assert.throws(() => mergeReviewSession(state, next), error => error.code === 'module-revision-required');
  next.cards[1].module.revision += 1;
  const updated = mergeReviewSession(state, next);
  assert.equal(updated.cards[0].conclusion, '已确认');
  assert.equal(updated.cards[1].conclusion, '未评审');
  assert.equal(updated.cards[1].userNote, '已核对规则');
  assert.equal(updated.cards[1].reviewResult.previousConclusion, '已确认');
  assert.equal(updated.cards[1].evidenceChanged, true);
});

test('submitted rounds are immutable; subsequent changes reject stale results and preserve all module records', () => {
  const first = submit(createReviewState(session()));
  const snapshot = first.lastSubmission;
  const next = session(); next.sessionId = 'next-round';
  assert.throws(() => mergeReviewSession(first, next), error => error.code === 'invalid-session-update');
  next.reviewRound = 2;
  const updated = mergeReviewSession(first, next);
  assert.equal(updated.previousSubmissions[0], snapshot);
  assert.equal(Object.isFrozen(snapshot), true);
  const second = submit(updated);
  const stale = reduceReviewState(second, { type: 'APPLY_RESULT', ...snapshot, results: [] });
  assert.equal(stale.lastError.code, 'stale-result');
  const omitted = session(); omitted.sessionId = 'omit'; omitted.cards.pop();
  assert.throws(() => mergeReviewSession(createReviewState(session()), omitted), error => error.code === 'missing-module-update');
});

test('confirmed module excluded from active round still survives a later conversation update', () => {
  const initial = session(); initial.reviewRound = 2; initial.viewScope = 'round'; initial.cards[0].conclusion = '已确认';
  let state = createReviewState(initial);
  assert.equal(state.cards.length, 2);
  assert.equal(state.allCards.length, 3);
  state = edit(state, { userNote: '最新意见' });
  const next = structuredClone(initial); next.sessionId = 'preserve-full-tree';
  const updated = mergeReviewSession(state, next);
  assert.equal(updated.allCards.length, 3);
  assert.equal(updated.allCards[0].conclusion, '已确认');
  assert.equal(updated.cards[0].userNote, '最新意见');
});

test('confirmation is distinct from a verified save receipt and stale receipts are rejected', () => {
  const input = createReviewState(session());
  const receipt = { type: 'MARK_PLAN_SAVED', savedPlanFingerprint: 'sha256:saved' };
  assert.equal(reduceReviewState(input, receipt), input);
  let state = result(submit(input));
  while (state.currentResultIndex < state.results.length - 1) state = reduceReviewState(state, { type: 'NEXT' });
  state = reduceReviewState(state, { type: 'CONFIRM_PLAN', planFingerprint: state.planFingerprint, artifactRuleFingerprint: state.artifactRuleFingerprint });
  assert.equal(state.saveState, 'pending');
  assert.match(panelMarkup(state, false, null), /内容已确认，等待保存/);
  const validReceipt = { ...receipt, sessionId: state.sessionId, submissionId: state.lastSubmission.submissionId, planFingerprint: state.planFingerprint, artifactRuleFingerprint: state.artifactRuleFingerprint };
  const rejected = reduceReviewState(state, { ...validReceipt, submissionId: 'old' });
  assert.equal(rejected.saveState, 'pending');
  assert.equal(rejected.lastError.code, 'invalid-save-receipt');
  const saved = reduceReviewState(state, validReceipt);
  assert.equal(saved.saveState, 'saved');
  assert.match(panelMarkup(saved, false, null), /文档已保存/);
  const next = session(); next.sessionId = 'after-save'; next.reviewRound = 2; next.planFingerprint = 'sha256:saved';
  assert.equal(mergeReviewSession(saved, next).saveState, 'unsaved');
});

test('agent unresolved results remain in the next review even when user previously confirmed', () => {
  const initial = session(); initial.cards.forEach(card => { card.conclusion = '已确认'; });
  const submitted = submit(createReviewState(initial));
  const reviewed = reduceReviewState(submitted, { type: 'APPLY_RESULT', ...submitted.lastSubmission,
    results: submitted.cards.map(card => ({ id: card.id, cardIds: [card.id], conclusion: card.id === 'M-003' ? '待修改' : '已确认', summary: '核对完成', planChangeSummary: '处理未决的接口证据' })) });
  const next = structuredClone(initial); next.sessionId = 'follow-up'; next.reviewRound = 2; next.viewScope = 'round';
  const updated = mergeReviewSession(reviewed, next);
  assert.deepEqual(updated.cards.map(card => card.id), ['M-003']);
});


test('technical evidence updates do not invalidate an unchanged confirmed requirement', () => {
  const initial = session(); initial.cards[2].conclusion = '已确认';
  const state = createReviewState(initial);
  const next = session(); next.sessionId = 'technical-update';
  next.cards[2].module.revision = 2;
  next.cards[2].module.questions = [];
  next.cards[2].implementationPlan = { ...structuredClone(next.cards[0].implementationPlan), evidenceIds: ['E-003'] };
  const updated = mergeReviewSession(state, next);
  assert.equal(updated.cards[2].conclusion, '已确认');
  assert.equal(updated.cards[2].implementationPlan.status, 'ready');
  assert.equal(updated.cards[2].reopened, true);
});


test('a resolved changed module no longer reappears in every subsequent round', () => {
  const initial = session(); initial.cards.forEach(card => { card.conclusion = '已确认'; });
  let state = createReviewState(initial);
  const changed = session(); changed.sessionId = 'changed-input'; changed.cards[1].module.rules.push('新的行为'); changed.cards[1].module.revision = 2;
  state = mergeReviewSession(state, changed);
  state = edit(select(state, 1), { conclusion: '已确认' });
  state = result(submit(state));
  assert.equal(state.cards[1].reopened, false);
  assert.equal(state.cards[1].evidenceChanged, false);
  const next = structuredClone(changed); next.sessionId = 'resolved-followup'; next.reviewRound = 2; next.viewScope = 'round';
  assert.equal(mergeReviewSession(state, next).cards.length, 0);
});


test('round change labels do not require a new content revision or reopen a requirement', () => {
  const initial = session(); initial.cards[0].conclusion = '已确认';
  const next = session(); next.sessionId = 'metadata-only'; next.cards[0].module.change = { kind: 'unchanged', summary: '本轮没有业务变更' };
  const updated = mergeReviewSession(createReviewState(initial), next);
  assert.equal(updated.cards[0].conclusion, '已确认');
  assert.equal(updated.cards[0].reopened, false);
  assert.equal(updated.cards[0].module.revision, 1);
});

test('module navigation follows parents and shows ancestry in a filtered round', () => {
  const initial = session();
  initial.cards[2].module.parentId = 'M-002';
  initial.cards = [initial.cards[2], initial.cards[0], initial.cards[1]];
  const state = createReviewState(initial);
  assert.deepEqual(state.cards.map(card => card.id), ['M-001', 'M-002', 'M-003']);
  const html = panelMarkup(state, false, null);
  assert.match(html, /--review-depth:2/);
  initial.cards[1].conclusion = '已确认'; initial.cards[2].conclusion = '已确认';
  initial.reviewRound = 2; initial.viewScope = 'round';
  const filtered = createReviewState(initial);
  assert.deepEqual(filtered.cards.map(card => card.id), ['M-003']);
  assert.match(panelMarkup(filtered, false, null), /属于凭据输入/);
});
