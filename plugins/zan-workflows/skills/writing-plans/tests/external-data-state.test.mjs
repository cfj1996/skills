import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validatePagePlanModel } = require('../scripts/validate-page-plan.js');
const { createReviewState, mergeReviewSession, reduceReviewState, restoreSubmittedReview, panelMarkup, saveDraft, restoreDraft } = require('../scripts/inject-review-panel.js');
const planFixture = require('./fixtures/page-plan-model.json');
const sessionFixture = require('./fixtures/module-review-session.json');
const fields = ['externalDependencies', 'mockModules', 'dependencyReview', 'executionScope'];
const plan = () => { const model = structuredClone(planFixture); model.evidence.push({ id: 'E-AUTH', kind: 'human-confirmation', locator: 'fixture-human-message' }); return model; };
const session = () => { const input = structuredClone(sessionFixture); input.cards[2].sourceEvidence.push({ id: 'E-AUTH', kind: 'human-confirmation', label: 'fixture human Mock scope approval' }); return input; };
const codes = model => validatePagePlanModel(model).errors.map(error => error.code);
function dependency(overrides = {}) {
  return { id: 'EXT-001', kind: 'api-contract', summary: '查询与保存契约', facts: [], sourceRefs: [], environment: 'test', status: 'missing', owner: '后端责任方待核实', completionCondition: '取得正式契约并核实机器事实', blockingStages: ['implementation', 'integration', 'acceptance'], featureRefs: ['F-001'], taskRefs: ['T-001'], acceptanceRefs: ['A-001'], evidenceRefs: ['E-001'], ...overrides };
}
function mock(overrides = {}) {
  return { id: 'MOCK-001', marker: 'MOCK_ONLY', status: 'active', featureRefs: ['F-001'], taskRefs: ['T-001'], paths: ['src/login/mock-provider.ts'], mode: 'function-data', scenarios: ['success', 'empty', 'failure'], activation: '开发入口显式开启', realRequestBoundary: '本模块不发送真实保存请求', exitCondition: '替换真实请求并验证', verificationLimits: ['仅证明页面交互，未证明真实链路'], authorizationEvidenceRefs: ['E-AUTH'], exitEvidenceRefs: [], ...overrides };
}
function mockPlan() {
  const model = plan(); model.deliveryUnit.status = '可实施'; model.executionScope.stage = 'ui-mock';
  model.externalDependencies = [dependency()]; model.mockModules = [mock()];
  model.features[0].apiNeed = 'unknown'; model.features[0].apiRefs = []; model.apis = []; model.tasks[0].apiRefs = [];
  return model;
}

test('legacy Plan and Session remain readable but missing dependency review never grants implementation readiness', () => {
  const model = plan(); model.schemaVersion = 3;
  fields.forEach(field => delete model[field]);
  assert.equal(validatePagePlanModel(model).valid, true);
  model.deliveryUnit.status = '可实施';
  assert.ok(codes(model).includes('external-data-unreviewed'));
  const input = session(); input.schemaVersion = 2; fields.forEach(field => delete input[field]);
  const state = createReviewState(input);
  assert.equal(state.dependencyReview.status, 'unreviewed');
  assert.deepEqual(state.externalDependencies, []);
});

test('approved UI Mock can run while contract integration remains blocked without changing business confirmation', () => {
  const model = mockPlan();
  assert.deepEqual(validatePagePlanModel(model), { valid: true, errors: [] });
  assert.equal(model.features[0].reviewConclusion, '已确认');
  model.executionScope.stage = 'integration';
  assert.ok(codes(model).includes('external-dependency-blocked'));
  assert.ok(codes(model).includes('feature-api-need-unresolved'));
  assert.equal(model.features[0].reviewConclusion, '已确认');
});

test('choosing ui-mock alone or deleting approval evidence cannot bypass real API readiness', () => {
  const model = mockPlan(); model.mockModules = [];
  assert.ok(codes(model).includes('ui-mock-authorization-required'));
  model.mockModules = [mock({ authorizationEvidenceRefs: [] })];
  assert.ok(codes(model).includes('external-data-invalid'));
  model.mockModules = [mock({ authorizationEvidenceRefs: ['E-does-not-exist'] })];
  assert.ok(codes(model).includes('external-data-invalid'));
  model.mockModules = [mock({ authorizationEvidenceRefs: ['E-001'] })];
  assert.ok(codes(model).includes('external-data-invalid'), 'prototype evidence is not human Mock approval');
});

test('unknown machine facts permit function data but never a pretend HTTP contract', () => {
  const model = mockPlan(); model.mockModules[0].mode = 'http-contract';
  assert.ok(codes(model).includes('mock-contract-unconfirmed'));
});

test('an unavailable credential can block integration while contract-based coding proceeds', () => {
  const model = plan(); model.deliveryUnit.status = '可实施';
  model.externalDependencies = [dependency({ kind: 'credential-config', summary: '测试服务访问配置', blockingStages: ['integration', 'acceptance'] })];
  assert.equal(validatePagePlanModel(model).valid, true);
  model.executionScope.stage = 'integration';
  assert.ok(codes(model).includes('external-dependency-blocked'));
  model.externalDependencies[0] = dependency({ kind: 'credential-config', summary: '测试服务访问配置', status: 'ready', facts: ['已验证测试服务访问能力'], sourceRefs: ['配置保管位置引用'], blockingStages: ['integration', 'acceptance'] });
  assert.equal(validatePagePlanModel(model).valid, true);
});

test('shared dependencies only block selected features and steps while future facts remain recorded', () => {
  const model = plan(); model.deliveryUnit.status = '可实施';
  const child = structuredClone(model.features[0]); child.id = 'F-002'; child.module.parentId = 'F-001'; child.module.scenarios[0].id = 'S-child'; child.apiNeed = 'none'; child.apiRefs = []; child.taskRefs = [];
  child.reviewConclusion = '未评审'; child.implementationPlan.status = 'blocked'; child.implementationPlan.blockers = ['未来步骤未就绪'];
  model.features.push(child);
  model.externalDependencies = [dependency({ featureRefs: ['F-002'], taskRefs: [], acceptanceRefs: [] })];
  assert.equal(validatePagePlanModel(model).valid, true);
  assert.equal(model.externalDependencies.length, 1);
  model.executionScope.featureRefs.push('F-002');
  assert.ok(codes(model).includes('external-dependency-blocked'));
  assert.ok(codes(model).includes('feature-review-not-confirmed'));
});

test('not-applicable and retired records require evidence; credentials are references and cannot include secret-value fields', () => {
  const model = plan(); model.externalDependencies = [dependency({ status: 'not-applicable', sourceRefs: [], evidenceRefs: [] })];
  assert.ok(codes(model).includes('external-data-invalid'));
  model.externalDependencies = [dependency({ apiKey: 'must-never-be-stored' })];
  assert.ok(codes(model).includes('external-data-invalid'));
  model.externalDependencies = []; model.mockModules = [mock({ status: 'retired', exitEvidenceRefs: [] })];
  assert.ok(codes(model).includes('external-data-invalid'));
  model.mockModules[0].exitEvidenceRefs = ['E-001'];
  assert.equal(validatePagePlanModel(model).valid, true);
});

test('active Mock is forbidden for production even when its activation text says disabled', () => {
  const model = plan(); model.deliveryUnit.status = '可实施'; model.executionScope.stage = 'production';
  model.mockModules = [mock({ activation: '开关已关闭' })];
  assert.ok(codes(model).includes('production-mock-forbidden'));
});

test('missing required API contracts cannot be marked implementation-ready by omitting dependency rows', () => {
  const model = plan(); model.deliveryUnit.status = '可实施'; model.apis[0].status = '正式契约缺失';
  assert.ok(codes(model).includes('api-contract-blocked'));
});

test('Mock paths remain inside their owning repository on POSIX and Windows', () => {
  for (const path of ['/tmp/mock.ts', '../mock.ts', 'C:\\tmp\\mock.ts', '\\\\host\\mock.ts']) {
    const model = mockPlan(); model.mockModules[0].paths = [path];
    assert.ok(codes(model).includes('external-data-invalid'), path);
  }
});

test('external dependency changes preserve the business conclusion and reopen only affected implementation review', () => {
  const input = session(); input.cards.forEach(card => { card.conclusion = '已确认'; });
  const before = createReviewState(input);
  const next = session(); next.sessionId = 'technical-refresh';
  next.externalDependencies[0].status = 'ready'; next.externalDependencies[0].facts = ['已核实错误码']; next.externalDependencies[0].sourceRefs = ['正式接口'];
  next.cards[2].module.revision += 1;
  const state = mergeReviewSession(before, next);
  assert.equal(state.allCards[2].conclusion, '已确认');
  assert.equal(state.allCards[2].evidenceChanged, true);
  assert.equal(state.allCards[0].evidenceChanged, false);
  assert.equal(state.saveState, 'unsaved');
});

test('dependencies and Mock survive canonical submit, draft and restore, and stale external data cannot restore old approval', () => {
  const input = session();
  input.mockModules = [mock({ featureRefs: ['M-003'], taskRefs: [], authorizationEvidenceRefs: ['E-AUTH'] })];
  const state = createReviewState(input);
  const submitted = reduceReviewState(state, { type: 'SUBMIT' });
  assert.equal(Object.isFrozen(submitted.lastSubmission.mockModules[0]), true);
  assert.deepEqual(submitted.lastSubmission.externalDependencies, state.externalDependencies);
  const restored = restoreSubmittedReview(state, submitted.lastSubmission);
  assert.equal(restored.mode, 'reviewing');
  const snapshot = structuredClone(submitted.lastSubmission); snapshot.mockModules[0].activation = 'other';
  assert.throws(() => restoreSubmittedReview(state, snapshot), error => error.code === 'invalid-submission-restore');
  const draft = saveDraft('external-draft', { ...state, savedAt: 1000, cards: state.cards }, { setItem() {} });
  assert.deepEqual(draft.externalDependencies, state.externalDependencies);
  draft.currentCardIndex = 1;
  assert.equal(restoreDraft(state, draft, 1001).currentCardIndex, 1);
  draft.externalDependencies[0].completionCondition = 'changed';
  assert.equal(restoreDraft(state, draft, 1001).currentCardIndex, 0);
  const markup = panelMarkup({ ...state, currentCardIndex: 2 });
  assert.match(markup, /外部数据与依赖/);
  assert.match(markup, /MOCK_ONLY/);
  assert.match(markup, /禁止上线/);
  assert.match(markup, /需求待确认/);
});

test('agent-owned business clarification changes reopen the requirement after technical gaps have moved out', () => {
  const input = session(); input.cards[0].conclusion = '已确认';
  const next = session(); next.sessionId = 'business-change'; next.cards[0].module.revision += 1;
  next.cards[0].module.questions.push({ id: 'Q-new-business', question: '登录失败后是否清空账号？', impact: '改变页面反馈', owner: 'agent', recommendation: '核实产品约定' });
  const updated = mergeReviewSession(createReviewState(input), next);
  assert.equal(updated.allCards[0].conclusion, '未评审');
  assert.equal(updated.allCards[0].evidenceChanged, true);
});

test('continuing one selected feature at a new stage preserves unrelated module revisions and confirmation', () => {
  const input = session(); input.cards.forEach(card => { card.conclusion = '已确认'; });
  input.executionScope.featureRefs = ['M-003'];
  const before = createReviewState(input);
  const next = structuredClone(input); next.sessionId = 'one-feature-integration'; next.executionScope.stage = 'integration';
  next.cards[2].module.revision += 1;
  const state = mergeReviewSession(before, next);
  assert.equal(state.allCards[2].conclusion, '已确认');
  assert.equal(state.allCards[2].module.revision, 2);
  assert.equal(state.allCards[2].evidenceChanged, true);
  for (const index of [0, 1]) {
    assert.equal(state.allCards[index].conclusion, '已确认');
    assert.equal(state.allCards[index].module.revision, 1);
    assert.equal(state.allCards[index].reopened, false);
    assert.equal(state.allCards[index].evidenceChanged, false);
  }
});

test('changing selected steps only reopens cards that own those steps', () => {
  const input = session(); input.cards.forEach(card => { card.conclusion = '已确认'; });
  input.cards[0].links = { features: [], apis: [], uiStates: [], dependencies: [], tasks: ['T-other'], evidence: [] };
  input.cards[2].links = { features: [], apis: [], uiStates: [], dependencies: [], tasks: ['T-before', 'T-after'], evidence: [] };
  input.executionScope.featureRefs = ['M-001', 'M-003']; input.executionScope.taskRefs = ['T-before'];
  const before = createReviewState(input);
  const next = structuredClone(input); next.sessionId = 'step-continuation'; next.executionScope.taskRefs = ['T-after'];
  next.cards[2].module.revision += 1;
  const state = mergeReviewSession(before, next);
  assert.equal(state.allCards[2].evidenceChanged, true);
  assert.equal(state.allCards[0].evidenceChanged, false);
  assert.equal(state.allCards[0].module.revision, 1);
  assert.equal(state.allCards[0].conclusion, '已确认');
});

test('dependency audit evidence refresh reopens only the card that owns the new evidence', () => {
  const input = session(); input.cards.forEach(card => { card.conclusion = '已确认'; });
  input.executionScope.featureRefs = ['M-003'];
  const before = createReviewState(input);
  const next = structuredClone(input); next.sessionId = 'one-evidence-refresh';
  next.dependencyReview.evidenceRefs.push('E-003'); next.cards[2].module.revision += 1;
  const state = mergeReviewSession(before, next);
  assert.equal(state.allCards[2].evidenceChanged, true);
  assert.equal(state.allCards[2].conclusion, '已确认');
  for (const index of [0, 1]) {
    assert.equal(state.allCards[index].module.revision, 1);
    assert.equal(state.allCards[index].evidenceChanged, false);
  }
});
