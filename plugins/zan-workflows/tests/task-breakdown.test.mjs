import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { estimateHours, fingerprintProposal, fingerprintEstimate, fingerprintTaskWork, validateTaskBreakdown, validateConfirmation, validateTaskReadbacks, validatePlanTaskBindings } = require('../skills/breaking-down-requirement/scripts/validate-task-breakdown.js');
const { validatePagePlanModel } = require('../skills/writing-plans/scripts/validate-page-plan.js');

// Simulated independent receipts are test fixtures, never production evidence.
function reviewed(input) {
  input.estimatorId = 'fixture-estimator';
  input.estimateReview = {
    status: 'PASSED', reviewerId: 'fixture-independent-reviewer', source: 'simulated review invocation',
    estimateFingerprint: fingerprintEstimate(input),
    taskKeys: input.tasks.filter(task => task.estimate?.mode === 'CALCULATED').map(task => task.key),
    checks: Object.fromEntries(['scope', 'reuse', 'increment', 'shared', 'verification', 'risk']
      .map(key => [key, { status: 'PASS', evidence: [`simulated ${key} check of the complete task set`] }])),
  };
  return input;
}
function retain(task) {
  const hours = task.estimate.hours;
  task.estimate = { mode: 'RETAINED', hours, retainedFrom: {
    taskId: task.id, beforeFingerprint: task.beforeFingerprint, hours,
    workFingerprint: fingerprintTaskWork(task), evidence: 'simulated exact old Task/scope/hours readback',
  } };
}
function proposal() {
  return reviewed({
    schemaVersion: 1,
    requirement: { workspaceId: '123', id: '111230010000001', type: 'story' },
    scopeFingerprint: 'scope-and-master-sha',
    fieldBinding: { storyField: 'story_id', ownerField: 'owner', estimateField: 'effort', unit: 'hours', precision: 2, evidence: 'simulated field metadata' },
    tasks: [{
      key: 'DT-001', action: 'CREATE', project: 'sample', deliveryUnitKey: 'login', featureRefs: ['F-001'],
      name: '登录反馈', scope: '完善登录失败反馈', exclusions: ['重置密码'],
      owner: { account: 'alice', evidence: 'simulated workspace member lookup' },
      estimate: { mode: 'CALCULATED', coverage: 'FULL_TASK', normalHours: 7.5,
        parts: [{ label: '开发', type: 'implementation', work: '复用表单，增加错误回显和重试状态', featureRefs: ['F-001'], hours: 5 },
          { label: '联调与自测', type: 'verification', work: '验证失败、重试和成功跳转', featureRefs: ['F-001'], hours: 2.5 }],
        factor: 0.8, hours: 6, basis: '复用已有表单，增加失败反馈并验证边界',
        analysis: { scopeEvidence: ['需求 F-001 仅包含登录失败反馈'],
          baselineEvidence: ['simulated source revision: login.vue and query wrapper'],
          reuse: [{ capability: '现有登录表单', mode: 'ADAPT', evidence: ['login.vue 现有输入和校验'], delta: '只新增失败反馈和重试状态' }],
          verification: ['失败时正确展示错误并允许重试'], confidence: 'HIGH', risks: [] },
      },
      dependsOn: [], acceptance: ['失败时展示错误，允许重试'],
      payload: { name: '登录反馈', description: 'zan-task:111230010000001:DT-001\n已批准的范围和估算说明', story_id: '111230010000001', owner: 'alice', effort: 6 },
    }],
  });
}
function records(input) {
  return input.tasks.map((task, i) => ({ key: task.key, id: task.id || `11123002000000${i + 1}`, readback: {
    id: task.id || `11123002000000${i + 1}`,
    workspaceId: input.requirement.workspaceId, storyId: input.requirement.id,
    ownerAccount: task.owner.account, estimateHours: task.estimate.hours, payload: structuredClone(task.payload),
  } }));
}
function binding(input = proposal()) {
  reviewed(input);
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

test('normal workload is discounted once and half-up rounded to whole hours', () => {
  for (const [normal, expected] of [[5, 4], [7.5, 6], [3, 2], [0.15, 0], [1.25625, null], [1.8749, 1], [1.875, 2], [1.8751, 2], [1.2345, 1]]) {
    if (expected === null) assert.throws(() => estimateHours(normal));
    else assert.equal(estimateHours(normal), expected);
  }
  assert.deepEqual(validateTaskBreakdown(proposal()), { valid: true, errors: [] });
});

test('field decimal precision never permits fractional final hours in proposals, payloads or Plan bindings', () => {
  for (const precision of [0, 1, 2, 3, 4]) {
    const input = proposal();
    input.fieldBinding.precision = precision;
    input.tasks[0].estimate.normalHours = 3;
    input.tasks[0].estimate.parts = [{ ...input.tasks[0].estimate.parts[0], hours: 3 }];
    input.tasks[0].estimate.hours = input.tasks[0].payload.effort = 2;
    reviewed(input);
    assert.equal(validateTaskReadbacks(input, records(input)).valid, true);

    input.tasks[0].estimate.hours = input.tasks[0].payload.effort = 2.4;
    assert.match(messages(validateTaskBreakdown(input)), /positive integer/);
    assert.equal(validateTaskReadbacks(input, records(input)).valid, false);
    const value = model();
    value.taskBreakdown = binding(input);
    assert.equal(validatePagePlanModel(value).valid, false);

    input.tasks[0].estimate.hours = 2;
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
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
    const input = proposal(); change(input); reviewed(input); assert.equal(validateTaskBreakdown(input).valid, false);
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
    const input = proposal(); change(input); reviewed(input); assert.equal(validateTaskBreakdown(input).valid, false);
  }
});

test('existing Tasks require exact ID and snapshot; creation cannot masquerade as reuse', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'UPDATE';
  assert.equal(validateTaskBreakdown(input).valid, false);
  task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
  reviewed(input);
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
  reviewed(input);
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

test('Plan validator consumes the same proposal/readbacks and supports direct non-TAPD Plans', () => {
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

test('an execution brief cannot bypass formal TAPD Plan readiness', () => {
  const value = model();
  value.implementationBrief = { behaviors: ['失败时反馈并允许重试'], steps: ['修复并验证'] };
  value.deliveryUnit.status = '可实施';
  delete value.taskBreakdown;
  assert.match(messages(validatePagePlanModel(value)), /TASKS_READY/);
});

test('an execution brief cannot hide stale ownership or missing step bindings in an existing formal Plan', () => {
  for (const invalidate of [
    value => { value.taskBreakdown.records[0].readback.ownerAccount = 'different-owner'; },
    value => { delete value.tasks[0].tapdTaskKey; },
    value => { value.taskBreakdown.records = []; },
  ]) {
    const value = model();
    value.implementationBrief = { steps: ['继续既有实施'] };
    invalidate(value);
    assert.equal(validatePagePlanModel(value).valid, false);
  }
});

test('an existing exact Task can be reused without rewriting its historical description', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'REUSE'; task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
  retain(task);
  task.payload.description = 'Existing scope and estimate';
  assert.equal(validateTaskBreakdown(input).valid, false);
  task.linkEvidence = 'exact Task ID and parent Story readback, verified scope and estimate';
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
});

test('evidenced REUSE preserves an empty historical description and still requires exact readback', () => {
  for (const description of ['', '   ', null]) {
    const input = proposal(), task = input.tasks[0];
    task.action = 'REUSE'; task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
    retain(task);
    task.linkEvidence = 'exact Task ID and parent Story, verified scope and estimate';
    task.payload.description = description;
    assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
    const changed = records(input); changed[0].readback.payload.description = 'new description';
    assert.equal(validateTaskReadbacks(input, changed).valid, false);
    delete task.linkEvidence;
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
  for (const description of [undefined, {}, 123]) {
    const input = proposal(), task = input.tasks[0];
    task.action = 'REUSE'; task.id = 'existing-task'; task.beforeFingerprint = 'snapshot';
    retain(task);
    task.linkEvidence = 'verified existing Task'; task.payload.description = description;
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
  for (const action of ['CREATE', 'UPDATE']) {
    const input = proposal(), task = input.tasks[0];
    task.action = action; task.payload.description = ''; task.linkEvidence = 'not REUSE';
    if (action === 'UPDATE') { task.id = 'existing-task'; task.beforeFingerprint = 'snapshot'; }
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
});

test('stable Task markers compare the entire Story and key token across supported description formatting', () => {
  const input = proposal(), task = input.tasks[0];
  const marker = `zan-task:${input.requirement.id}:${task.key}`;
  for (const description of [marker, `scope\n${marker}\nacceptance`, `<p>${marker}</p>`, `\`${marker}\``,
    `**${marker}**`, `*${marker}*`, `_${marker}_`, `__${marker}__`, `~~${marker}~~`,
    `***${marker}***`, `**_~~${marker}~~_**`, `<p>__*${marker}*__</p>`]) {
    task.payload.description = description;
    reviewed(input);
    assert.equal(validateTaskReadbacks(input, records(input)).valid, true, description);
  }
  for (const description of [`${marker}0`, `${marker}-other`, `${marker}:child`, `prefix-${marker}`,
    `${marker}_suffix`, `${marker}*suffix`, `**${marker}_suffix**`, `_${marker}0_`,
    `**${marker}**_suffix`, `*${marker}**`, `~~${marker}~`,
    `zan-task:${input.requirement.id}0:${task.key}`, marker.replace('DT-001', 'DT-00')]) {
    task.payload.description = description;
    reviewed(input);
    assert.equal(validateTaskBreakdown(input).valid, false, description);
    assert.equal(validateTaskReadbacks(input, records(input)).valid, false, description);
  }
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

test('calculated effort needs actual scope, baseline, reuse, incremental work and verification evidence', () => {
  for (const change of [
    e => { e.analysis.scopeEvidence = []; },
    e => { e.analysis.baselineEvidence = [' ']; },
    e => { e.analysis.reuse = []; },
    e => { e.analysis.reuse[0].evidence = []; },
    e => { e.analysis.reuse[0].delta = ''; },
    e => { e.analysis.reuse[0].mode = 'ASSUMED'; },
    e => { e.parts[0].work = ''; },
    e => { e.parts[0].featureRefs = ['F-FOREIGN']; },
    e => { e.analysis.verification = []; },
  ]) {
    const input = proposal(); change(input.tasks[0].estimate); reviewed(input);
    assert.equal(validateTaskBreakdown(input, { requireEstimateReview: false }).valid, false);
    assert.equal(validateTaskBreakdown(input).valid, false, 'even a simulated pass cannot replace required evidence');
  }
});

test('waiting time is not a cost category, while evidenced diagnosis work is allowed', () => {
  const input = proposal();
  input.tasks[0].estimate.parts[0].type = 'waiting'; reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /waiting time/);
  input.tasks[0].estimate.parts[0].type = 'investigation';
  input.tasks[0].estimate.parts[0].work = '复现并定位回显状态丢失的触发路径'; reviewed(input);
  assert.equal(validateTaskBreakdown(input).valid, true);
});

test('unknown, failed, self-reviewed or incomplete independent reviews cannot authorize task writes', () => {
  for (const change of [
    p => { delete p.estimateReview; },
    p => { p.estimateReview.status = 'REVISE'; },
    p => { p.estimateReview.status = 'NEEDS_EVIDENCE'; },
    p => { p.estimateReview.reviewerId = p.estimatorId; },
    p => { p.estimateReview.source = ''; },
    p => { p.estimateReview.taskKeys = []; },
    p => { p.estimateReview.taskKeys = ['DT-001', 'DT-001']; },
    p => { p.estimateReview.taskKeys = ['DT-OTHER']; },
    p => { p.estimateReview.checks.reuse.status = 'UNKNOWN'; },
    p => { p.estimateReview.checks.shared.status = 'FAIL'; },
    p => { p.estimateReview.checks.increment.evidence = []; },
  ]) {
    const input = proposal(); change(input);
    assert.equal(validateTaskBreakdown(input).valid, false);
    const human = { source: 'human confirmed current hours', proposalFingerprint: fingerprintProposal(input) };
    assert.equal(validateConfirmation(input, human).valid, false);
    assert.equal(validateTaskReadbacks(input, records(input)).valid, false);
  }
});

test('scope, reuse and baseline changes invalidate review even when displayed hours stay the same', () => {
  for (const change of [
    p => { p.tasks[0].scope += '；增加另一个角色的可见范围'; },
    p => { p.tasks[0].estimate.analysis.baselineEvidence = ['new revision']; },
    p => { p.tasks[0].estimate.analysis.reuse[0].mode = 'NEW'; },
    p => { p.tasks[0].estimate.parts[0].work += '；改变公共默认值'; },
    p => { p.tasks[0].estimate.analysis.risks.push({ description: '非关键展示差异', handling: '沿用既有行为', blocking: false }); },
  ]) {
    const input = proposal(); change(input);
    assert.equal(input.tasks[0].estimate.hours, 6);
    assert.equal(validateTaskBreakdown(input, { requireEstimateReview: false }).valid, true);
    assert.match(messages(validateTaskBreakdown(input)), /current unchanged estimate/);
    reviewed(input);
    assert.equal(validateTaskBreakdown(input).valid, true);
  }
});

test('one independent receipt must cover all calculated Tasks and preserves final confirmation binding', () => {
  const input = proposal(), second = structuredClone(input.tasks[0]);
  second.key = 'DT-002'; second.project = 'other'; second.owner.account = second.payload.owner = 'bob';
  second.payload.description = 'zan-task:111230010000001:DT-002'; input.tasks.push(second);
  reviewed(input);
  assert.equal(validateTaskBreakdown(input).valid, true);
  const human = { source: '确认', proposalFingerprint: fingerprintProposal(input) };
  input.estimateReview.checks.risk.evidence = ['revised independent review notes'];
  assert.equal(validateTaskBreakdown(input).valid, true);
  assert.equal(validateConfirmation(input, human).valid, false);
  input.estimateReview.taskKeys.pop();
  assert.match(messages(validateTaskBreakdown(input)), /every calculated Task/);
});

test('shared implementation is charged once and consumers reference its prerequisite', () => {
  const input = proposal(), first = input.tasks[0], second = structuredClone(first);
  first.estimate.parts[0].sharedKey = 'login-error-feedback';
  second.key = 'DT-002'; second.project = 'other';
  second.payload.description = 'zan-task:111230010000001:DT-002';
  second.dependsOn = ['DT-001'];
  second.estimate.parts[0].sharedKey = 'login-error-feedback';
  input.tasks.push(second); reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /charged more than once/);
  second.estimate.parts = [{ ...second.estimate.parts[1], hours: 2, work: '验证另一个入口的消费适配' }];
  second.estimate.normalHours = 2; second.estimate.hours = second.payload.effort = 2;
  second.estimate.sharedRefs = ['login-error-feedback']; reviewed(input);
  assert.equal(validateTaskBreakdown(input).valid, true);
  for (const refs of [['missing-work'], ['login-error-feedback', 'login-error-feedback']]) {
    second.estimate.sharedRefs = refs; reviewed(input);
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
  second.estimate.sharedRefs = ['login-error-feedback']; second.dependsOn = []; reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /owning prerequisite/);
});

test('existing Tasks retain exact hours without reconstructing normal effort or requiring a new review', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'REUSE'; task.id = 'existing-task'; task.beforeFingerprint = 'exact-old-snapshot';
  task.estimate.hours = task.payload.effort = 11; retain(task);
  delete input.estimateReview; delete input.estimatorId;
  assert.equal(task.estimate.normalHours, undefined);
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  task.estimate.hours = task.payload.effort = 9;
  assert.match(messages(validateTaskBreakdown(input)), /retained hours/);
});

test('a retained pending prerequisite can own shared work without reconstructing its historical estimate', () => {
  const input = proposal(), first = input.tasks[0], second = structuredClone(first);
  first.action = 'REUSE'; first.id = 'existing-shared-task'; first.beforeFingerprint = 'old-task-readback'; retain(first);
  first.estimate.sharedWork = [{ key: 'login-shared-core', work: '既有 Task 范围中的公共错误反馈能力，尚待实施',
    featureRefs: ['F-001'], evidence: ['旧 Task 与 Plan 明确了公共交付，原工时已包含该工作'] }];
  second.key = 'DT-002'; second.payload.description = 'zan-task:111230010000001:DT-002';
  second.dependsOn = ['DT-001']; second.estimate.sharedRefs = ['login-shared-core'];
  input.tasks.push(second); reviewed(input);
  assert.deepEqual(input.estimateReview.taskKeys, ['DT-002']);
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  assert.equal(first.estimate.normalHours, undefined);
  for (const invalidate of [
    work => { work.hours = 2; },
    work => { work.evidence = []; },
    work => { work.featureRefs = ['F-FOREIGN']; },
  ]) {
    const changed = structuredClone(input); invalidate(changed.tasks[0].estimate.sharedWork[0]); reviewed(changed);
    assert.match(messages(validateTaskBreakdown(changed)), /retained shared work/);
  }
  second.estimate.parts[0].sharedKey = 'login-shared-core'; reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /charged more than once/);
});

test('metadata-only updates retain hours but scope, acceptance and snapshot drift require fresh assessment', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'UPDATE'; task.id = 'existing-task'; task.beforeFingerprint = 'snapshot'; retain(task);
  delete input.estimateReview;
  task.owner.account = task.payload.owner = 'bob';
  task.name = task.payload.name = '登录反馈维护';
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  for (const change of [
    t => { t.scope += '；新增密码重置'; },
    t => { t.acceptance.push('允许其他租户登录'); },
    t => { t.beforeFingerprint = 'changed-readback'; },
    t => { t.estimate.retainedFrom.evidence = ''; },
  ]) {
    const value = structuredClone(input); change(value.tasks[0]);
    assert.match(messages(validateTaskBreakdown(value)), /retained hours/);
  }
  task.action = 'CREATE';
  assert.match(messages(validateTaskBreakdown(input)), /new Tasks cannot retain/);
});

test('continuation adds new work to the retained full-Task budget instead of replacing or discounting it', () => {
  const input = proposal(), task = input.tasks[0];
  task.action = 'UPDATE'; task.id = 'existing-task'; task.beforeFingerprint = 'readback-of-eight-hour-task';
  const oldWorkFingerprint = fingerprintTaskWork(task);
  task.scope += '；增加超时反馈';
  task.estimate = { ...task.estimate, coverage: 'INCREMENTAL', normalHours: 2.5,
    parts: [{ ...task.estimate.parts[0], hours: 2.5, work: '在保留原失败反馈基础上增加超时处理并验证' }],
    retainedBase: { taskId: task.id, beforeFingerprint: task.beforeFingerprint, hours: 8,
      workFingerprint: oldWorkFingerprint, evidence: '准确 Task 读回为 8 小时，原交付范围全部保留' },
    hours: 10,
  };
  task.payload.effort = 10; reviewed(input);
  assert.equal(validateTaskReadbacks(input, records(input)).valid, true);
  for (const hours of [2, 8]) {
    task.estimate.hours = task.payload.effort = hours; reviewed(input);
    assert.match(messages(validateTaskBreakdown(input)), /final estimate calculation/);
  }
  task.estimate.hours = task.payload.effort = 10;
  for (const change of [
    t => { t.id = 'other-task'; },
    t => { t.beforeFingerprint = 'new-readback'; },
    t => { t.estimate.retainedBase.hours = 0; },
    t => { t.estimate.retainedBase.workFingerprint = ''; },
    t => { t.estimate.retainedBase.evidence = ''; },
    t => { t.action = 'CREATE'; delete t.id; delete t.beforeFingerprint; },
  ]) {
    const value = structuredClone(input); change(value.tasks[0]); reviewed(value);
    assert.match(messages(validateTaskBreakdown(value)), /incremental updates require/);
  }
  task.estimate.coverage = 'FULL_TASK'; reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /cannot add another historical budget/);
});

test('material evidence gaps block readiness but bounded non-blocking assumptions remain explicit', () => {
  const input = proposal(), analysis = input.tasks[0].estimate.analysis;
  analysis.confidence = 'MEDIUM';
  analysis.risks = [{ description: '罕见展示文案可能调整', handling: '沿用已确认交互，变化再核对', blocking: false }]; reviewed(input);
  assert.equal(validateTaskBreakdown(input).valid, true);
  analysis.risks[0] = { description: '当前责任范围和复用能力未明确', handling: '先读取范围及基准源码', blocking: true }; reviewed(input);
  assert.match(messages(validateTaskBreakdown(input)), /material estimate risk/);
  for (const value of [null, [null], [{}], [{ blocking: 'false' }]]) {
    analysis.risks = value; reviewed(input);
    assert.equal(validateTaskBreakdown(input).valid, false);
  }
});

test('a readback-backed Plan cannot bypass missing or stale effort review', () => {
  const value = model();
  delete value.taskBreakdown.proposal.estimateReview;
  value.taskBreakdown.proposalFingerprint = fingerprintProposal(value.taskBreakdown.proposal);
  assert.equal(validatePlanTaskBindings(value).valid, false);
  assert.equal(validatePagePlanModel(value).valid, false);
});

test('pre-review CLI returns only a review binding and cannot act as a final proposal receipt', () => {
  const script = new URL('../skills/breaking-down-requirement/scripts/validate-task-breakdown.js', import.meta.url);
  const input = proposal(); delete input.estimateReview;
  const preview = spawnSync(process.execPath, [script.pathname, '--prepare-estimate-review'], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(preview.status, 0);
  const data = JSON.parse(preview.stdout);
  assert.equal(data.valid, true); assert.equal(data.reviewRequired, true);
  assert.equal(data.estimateFingerprint, fingerprintEstimate(input));
  assert.equal(data.proposalFingerprint, null);
  const noEstimator = structuredClone(input); delete noEstimator.estimatorId;
  const missing = spawnSync(process.execPath, [script.pathname, '--prepare-estimate-review'], { input: JSON.stringify(noEstimator), encoding: 'utf8' });
  assert.equal(missing.status, 1); assert.equal(JSON.parse(missing.stdout).estimateFingerprint, null);
  const final = spawnSync(process.execPath, [script.pathname], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(final.status, 1); assert.equal(JSON.parse(final.stdout).proposalFingerprint, null);
  const invalid = spawnSync(process.execPath, [script.pathname, '--skip-review'], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(invalid.status, 1);
});
