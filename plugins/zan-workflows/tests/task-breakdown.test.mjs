import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { estimateHours, fingerprintProposal, validateTaskBreakdown, validateConfirmation, validateTaskReadbacks, validatePlanTaskBindings } = require('../skills/breaking-down-requirement/scripts/validate-task-breakdown.js');
const { validatePagePlanModel } = require('../skills/writing-plans/scripts/validate-page-plan.js');

function proposal() {
  return {
    schemaVersion: 1,
    requirement: { workspaceId: '123', id: '111230010000001', type: 'story' },
    scopeFingerprint: 'scope-and-master-sha',
    fieldBinding: { storyField: 'story_id', ownerField: 'owner', estimateField: 'effort', unit: 'hours', precision: 2, evidence: 'simulated field metadata' },
    tasks: [{
      key: 'DT-001', action: 'CREATE', project: 'sample', deliveryUnitKey: 'login', featureRefs: ['F-001'],
      name: '登录反馈', scope: '完善登录失败反馈', exclusions: ['重置密码'],
      owner: { account: 'alice', evidence: 'simulated workspace member lookup' },
      estimate: { normalHours: 7.5, parts: [{ label: '开发', hours: 5 }, { label: '联调与自测', hours: 2.5 }], factor: 0.8, hours: 6, basis: '复用已有表单，增加失败反馈并验证边界' },
      dependsOn: [], acceptance: ['失败时展示错误，允许重试'],
      payload: { name: '登录反馈', description: 'zan-task:111230010000001:DT-001\n已批准的范围和估算说明', story_id: '111230010000001', owner: 'alice', effort: 6 },
    }],
  };
}
function records(input) {
  return input.tasks.map((task, i) => ({ key: task.key, id: task.id || `11123002000000${i + 1}`, readback: {
    id: task.id || `11123002000000${i + 1}`,
    workspaceId: input.requirement.workspaceId, storyId: input.requirement.id,
    ownerAccount: task.owner.account, estimateHours: task.estimate.hours, payload: structuredClone(task.payload),
  } }));
}
function binding(input = proposal()) {
  return { proposal: input, proposalFingerprint: fingerprintProposal(input), records: records(input), project: 'sample', deliveryUnitKey: 'login' };
}
function model() {
  const value = JSON.parse(readFileSync(new URL('../skills/writing-plans/tests/fixtures/page-plan-model.json', import.meta.url), 'utf8'));
  value.deliveryUnit.key = 'login';
  value.taskBreakdown = binding();
  value.tapdRequirement = structuredClone(value.taskBreakdown.proposal.requirement);
  value.tasks[0].tapdTaskKey = 'DT-001';
  return value;
}
const messages = result => result.errors.map(error => error.message).join('\n');

test('normal workload is discounted once with decimal half-up rounding at evidenced precision', () => {
  for (const [normal, precision, expected] of [[5, 2, 4], [7.5, 2, 6], [0.15, 2, 0.12], [1.25625, 2, null], [0.1562, 2, 0.12], [0.1563, 2, 0.13], [1.875, 0, 2], [1.2345, 4, 0.9876]]) {
    if (expected === null) assert.throws(() => estimateHours(normal, precision));
    else assert.equal(estimateHours(normal, precision), expected);
  }
  assert.deepEqual(validateTaskBreakdown(proposal()), { valid: true, errors: [] });
});

test('missing developer, normal effort, basis, components or final effort prevents executable proposals', () => {
  for (const change of [
    p => delete p.tasks[0].owner.account,
    p => delete p.tasks[0].owner.evidence,
    p => delete p.tasks[0].estimate.normalHours,
    p => { p.tasks[0].estimate.parts = []; },
    p => { p.tasks[0].estimate.parts[0].hours = 4; },
    p => { p.tasks[0].estimate.basis = ''; },
    p => { p.tasks[0].estimate.hours = 0; },
    p => { p.tasks[0].estimate.hours = 4.8; p.tasks[0].payload.effort = 4.8; },
    p => { p.tasks[0].estimate.factor = 1; },
  ]) {
    const input = proposal(); change(input); assert.equal(validateTaskBreakdown(input).valid, false);
  }
});

test('zero after rounding, NaN, negative, string and infinite estimates cannot pass', () => {
  for (const hours of [NaN, Infinity, -1, 0, '5']) assert.throws(() => estimateHours(hours));
  const input = proposal();
  input.tasks[0].estimate = { normalHours: 0.001, parts: [{ label: '开发', hours: 0.001 }], factor: 0.8, hours: 0, basis: 'tiny work' };
  input.tasks[0].payload.effort = 0;
  assert.equal(validateTaskBreakdown(input).valid, false);
});

test('field unit, exact target, estimated field and stable marker are bound to the proposal', () => {
  for (const change of [
    p => { p.fieldBinding.unit = 'days'; },
    p => { p.fieldBinding.estimateField = 'actual_effort'; },
    p => { p.fieldBinding.precision = -1; },
    p => { p.tasks[0].payload.owner = 'bob'; },
    p => { p.tasks[0].payload.story_id = 'another-story'; },
    p => { p.tasks[0].payload.description = 'no stable marker'; },
    p => { p.tasks[0].payload.workspace_id = 'another-workspace'; },
    p => { p.tasks[0].payload.id = 'another-task'; },
  ]) {
    const input = proposal(); change(input); assert.equal(validateTaskBreakdown(input).valid, false);
  }
});

test('existing Tasks require exact ID and snapshot; creation cannot masquerade as reuse', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'UPDATE';
  assert.equal(validateTaskBreakdown(input).valid, false);
  task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
  assert.equal(validateTaskBreakdown(input).valid, true);
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  const wrong = records(input); wrong[0].id = 'different-task';
  assert.equal(validateTaskReadbacks(input, wrong).valid, false);
  task.action = 'CREATE';
  assert.equal(validateTaskBreakdown(input).valid, false);
});

test('dependencies reject unknown keys, duplicate keys and cycles including across projects', () => {
  const input = proposal();
  input.tasks[0].dependsOn = ['missing'];
  assert.match(messages(validateTaskBreakdown(input)), /missing dependency/);
  const second = structuredClone(input.tasks[0]);
  second.key = 'DT-002'; second.project = 'other'; second.dependsOn = ['DT-001'];
  second.payload.description = 'zan-task:111230010000001:DT-002';
  input.tasks.push(second); input.tasks[0].dependsOn = ['DT-002'];
  assert.match(messages(validateTaskBreakdown(input)), /cycle/);
  second.dependsOn = [];
  assert.equal(validateTaskBreakdown(input).valid, true);
  second.key = 'DT-001';
  assert.equal(validateTaskBreakdown(input).valid, false);
});

test('human receipt must bind every displayed and transmitted field, with stable object ordering', () => {
  const input = proposal();
  const receipt = { source: 'current human reply: 确认任务清单', proposalFingerprint: fingerprintProposal(input) };
  assert.equal(validateConfirmation(input, receipt).valid, true);
  assert.equal(validateConfirmation(input, { confirmed: true }).valid, false);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(fingerprintProposal(reordered), fingerprintProposal(input));
  for (const change of [
    p => { p.scopeFingerprint = 'new-master-or-scope'; },
    p => { p.tasks[0].owner.account = p.tasks[0].payload.owner = 'bob'; },
    p => { p.tasks[0].payload.description += '\nnew scope'; },
    p => { p.tasks[0].payload.custom_field_release = 'new required value'; },
    p => { p.fieldBinding.evidence = 'changed metadata'; },
    p => { p.tasks[0].estimate.basis += 'changed assumption'; },
  ]) {
    const changed = structuredClone(input); change(changed);
    assert.equal(validateConfirmation(changed, receipt).valid, false);
  }
});

test('partial, duplicated, mismatched or ambiguous readbacks cannot become TASKS_READY', () => {
  const input = proposal();
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  assert.equal(validateTaskReadbacks(input, []).valid, false);
  const duplicate = records(input); duplicate.push(structuredClone(duplicate[0]));
  assert.equal(validateTaskReadbacks(input, duplicate).valid, false);
  for (const change of [
    r => { r[0].readback.storyId = 'other-story'; },
    r => { r[0].readback.workspaceId = 'other-workspace'; },
    r => { r[0].readback.ownerAccount = 'bob'; },
    r => { r[0].readback.estimateHours = 4.8; },
    r => { r[0].readback.payload.description = 'different description'; },
  ]) { const value = records(input); change(value); assert.equal(validateTaskReadbacks(input, value).valid, false); }
});

test('Plan validator consumes the same proposal/readbacks and preserves legacy non-TAPD Plans', () => {
  const value = model();
  assert.deepEqual(validatePagePlanModel(value), { valid: true, errors: [] });
  delete value.taskBreakdown; delete value.tapdRequirement; delete value.tasks[0].tapdTaskKey;
  assert.deepEqual(validatePagePlanModel(value), { valid: true, errors: [] });
});

test('one TAPD Task can own multiple Plan steps without multiplying its estimate', () => {
  const value = model();
  value.tasks.push({ ...structuredClone(value.tasks[0]), id: 'T-002' });
  assert.equal(validatePlanTaskBindings(value).valid, true);
  assert.equal(value.taskBreakdown.proposal.tasks[0].estimate.hours, 6);
});

test('a module Plan can contain multiple TAPD Tasks with separate ownership and real IDs', () => {
  const value = model();
  const second = structuredClone(value.taskBreakdown.proposal.tasks[0]);
  second.key = 'DT-002'; second.owner.account = second.payload.owner = 'bob';
  second.payload.description = 'zan-task:111230010000001:DT-002';
  value.taskBreakdown.proposal.tasks.push(second);
  value.taskBreakdown = binding(value.taskBreakdown.proposal);
  value.tasks.push({ ...structuredClone(value.tasks[0]), id: 'T-002', tapdTaskKey: 'DT-002' });
  assert.equal(validatePlanTaskBindings(value).valid, true);
});

test('missing links, changed snapshots, foreign modules/projects and uncovered functions block Plan validation', () => {
  for (const change of [
    m => delete m.tasks[0].tapdTaskKey,
    m => { m.taskBreakdown.project = 'foreign'; },
    m => { m.taskBreakdown.deliveryUnitKey = 'foreign'; },
    m => { m.taskBreakdown.proposalFingerprint = 'stale'; },
    m => { m.tasks[0].featureRefs = ['F-OTHER']; },
    m => { m.tasks = []; },
    m => { m.taskBreakdown.records[0].readback.ownerAccount = 'bob'; },
    m => { m.taskBreakdown.records[0].readback.id = 'other-task'; },
    m => { m.tapdRequirement.id = 'other-story'; },
  ]) {
    const value = model(); change(value); assert.equal(validatePagePlanModel(value).valid, false);
  }
});

test('staged TAPD Plans can retain proposals, while implementation requires readbacks and task ownership', () => {
  const value = model();
  delete value.taskBreakdown;
  assert.equal(validatePagePlanModel(value).valid, true);
  value.deliveryUnit.status = '可实施';
  assert.match(messages(validatePagePlanModel(value)), /TASKS_READY/);
});

test('an existing exact Task can be reused without rewriting its historical description', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'REUSE'; task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
  task.payload.description = 'Existing scope and estimate';
  assert.equal(validateTaskBreakdown(input).valid, false);
  task.linkEvidence = 'exact Task ID and parent Story readback, verified scope and estimate';
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
});

test('malformed proposal or dependency shapes return validation errors rather than crashing', () => {
  for (const input of [null, [], {}, { tasks: [null] }, { ...proposal(), tasks: [{ ...proposal().tasks[0], dependsOn: {} }] }]) {
    assert.equal(validateTaskBreakdown(input).valid, false);
    assert.equal(validateConfirmation(input, {}).valid, false);
    assert.equal(validateTaskReadbacks(input, []).valid, false);
  }
  for (const features of [null, {}, [null]]) {
    const value = model(); value.features = features;
    assert.equal(validatePagePlanModel(value).valid, false);
  }
});

test('stdin validator validates without remote writes and fails closed on bad JSON', () => {
  const script = new URL('../skills/breaking-down-requirement/scripts/validate-task-breakdown.js', import.meta.url);
  const ok = spawnSync(process.execPath, [script.pathname], { input: JSON.stringify(proposal()), encoding: 'utf8' });
  assert.equal(ok.status, 0); assert.equal(JSON.parse(ok.stdout).proposalFingerprint, fingerprintProposal(proposal()));
  const invalid = spawnSync(process.execPath, [script.pathname], { input: '{', encoding: 'utf8' });
  assert.equal(invalid.status, 1);
});
