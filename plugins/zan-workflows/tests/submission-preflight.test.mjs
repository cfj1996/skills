import assert from 'node:assert/strict';
import test from 'node:test';
import { apiData, registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { resolveJenkinsJob } from '../scripts/resolve-jenkins-job.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';

const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const id = '123450001';
const item = () => ({ id, status: 'in_progress', current_owner: 'tester', test_version: '' });
const actualList = value => ({ base_url: 'https://www.tapd.cn', data: [{ Bug: value }],
  count: { status: 1, data: { count: 1 }, info: 'success' } });

test('actual TAPD list wrappers, direct arrays and nested string envelopes are decoded', () => {
  const row = item();
  assert.deepEqual(apiData(response(actualList(row)), 'get_bug'), [{ Bug: row }]);
  assert.deepEqual(apiData(response([{ Bug: row }]), 'get_bug'), [{ Bug: row }]);
  assert.deepEqual(apiData({ structuredContent: { result: JSON.stringify(actualList(row)) } }, 'get_bug'), [{ Bug: row }]);
  assert.deepEqual(apiData(response({ status: 1, data: JSON.stringify({ status: 1, data: [{ Bug: row }] }) }), 'get_bug'), [{ Bug: row }]);
});

test('explicit TAPD failures and ambiguous MCP blocks never become successful records', () => {
  for (const bad of [
    { isError: true, content: [{ type: 'text', text: 'error' }] },
    response({ status: 0, data: [{ Bug: item() }] }),
    response({ data: JSON.stringify({ status: 0, data: [{ Bug: item() }] }) }),
    { content: [{ type: 'text', text: '{}' }, { type: 'text', text: '{}' }] },
  ]) assert.throws(() => apiData(bad, 'get_bug'));
});

test('successful update acknowledgments still require the subsequent item readback', () => {
  assert.equal(apiData(response({ status: 1, data: true }), 'update_bug'), true);
  assert.equal(apiData(response({ status: 1, data: null }), 'update_bug'), null);
  assert.equal(apiData(response({ status: 1, data: '' }), 'update_bug'), '');
  assert.throws(() => apiData(response('not JSON'), 'get_bug'));
});

function tapd({ malformedFirst = false } = {}) {
  const current = item(), calls = []; let first = malformedFirst;
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_bug') {
      if (first) { first = false; return response('invalid'); }
      return response(actualList({ ...current }));
    }
    if (name === 'get_workflows_status_map') return response({ status: 1, data: { in_progress: '修复中', resolved: '待测试' } });
    if (name === 'get_workflows_all_transitions') return response({ status: 1, data: [
      { StepPrevious: 'in_progress', StepNext: 'resolved', Appendfield: [{ FieldName: 'current_owner', Notnull: 'yes' }] },
    ] });
    if (name === 'update_bug') { Object.assign(current, args.options); return response({ status: 1, data: true }); }
    throw new Error(name);
  };
  return { call, calls, current };
}
const registration = () => ({ workspaceId: 12345, entryId: id, entryType: 'bug', workMode: 'INITIAL',
  statusAction: 'WAITING_TEST', versionAction: 'NONE', purpose: '验证提测预检',
  prerequisites: { git: 'VERIFIED', deployment: 'SKIPPED_BY_INTENT', profile: 'STANDARD', wiki: 'VERIFIED' } });

test('registration previews the actual Bug list shape without writes and executes only after confirmation', async () => {
  const fake = tapd();
  const plan = await registerTestSubmission(fake.call, registration());
  assert.equal(plan.state, 'AWAITING_CONFIRMATION'); assert.equal(plan.writes, 0);
  assert.equal(fake.calls.some(row => row.name.startsWith('update_')), false);
  const result = await registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true });
  assert.equal(result.state, 'REGISTERED'); assert.equal(fake.current.status, 'resolved');
  assert.equal(fake.calls.filter(row => row.name === 'update_bug').length, 1);
});

test('a failed read-only preview can be corrected without replaying any write', async () => {
  const fake = tapd({ malformedFirst: true });
  const session = new WorkflowSession({ allowExecute: true, pool: { call: (_server, ...args) => fake.call(...args), close() {} } });
  await assert.rejects(session.dispatch({ id: 'bad-preview', phase: 'PLAN', action: 'registration', input: registration() }));
  assert.equal(session.executionBlocked, false);
  const plan = await session.dispatch({ id: 'fixed-preview', phase: 'PLAN', action: 'registration', input: registration() });
  assert.equal(plan.state, 'AWAITING_CONFIRMATION');
  assert.equal(fake.calls.some(row => row.name.startsWith('update_')), false);
  session.close();
});

function jenkins(jobs = [{ name: 'front-demo-test', url: 'https://ci.example.test/jenkins/job/front-demo-test/' }]) {
  const calls = [];
  return { calls, call: async (name, args) => {
    calls.push({ name, args });
    if (name === 'jenkins_list_instances') return response([{ name: 'ops', url: 'https://ci.example.test/jenkins' }]);
    if (name === 'jenkins_search_jobs') return response(jobs);
    throw new Error('unexpected non-lookup tool: ' + name);
  } };
}

test('a missing indexed Job URL is resolved through exact read-only Jenkins metadata', async () => {
  const fake = jenkins();
  const result = await resolveJenkinsJob(fake.call, { jobName: 'front-demo-test' });
  assert.equal(result.jobUrl, 'https://ci.example.test/jenkins/job/front-demo-test/');
  assert.equal(result.writes, 0); assert.equal(result.readOnly, true);
  assert.deepEqual(fake.calls.map(row => row.name), ['jenkins_list_instances', 'jenkins_search_jobs']);
  assert.equal(fake.calls[1].args.recursive, false);
});

test('Job lookup rejects similar names, ambiguous results and URLs from another instance', async () => {
  const exact = { name: 'front-demo-test', url: 'https://ci.example.test/jenkins/job/front-demo-test/' };
  for (const rows of [
    [{ ...exact, name: 'front-demo-test-backup' }], [exact, exact],
    [{ ...exact, url: 'https://other.example.test/jenkins/job/front-demo-test/' }],
  ]) await assert.rejects(resolveJenkinsJob(jenkins(rows).call, { jobName: 'front-demo-test' }));
});

test('folder Job lookup is scoped to the known folder without recursive traversal', async () => {
  const fake = jenkins([{ name: 'demo', url: 'https://ci.example.test/jenkins/job/team/job/demo/' }]);
  const result = await resolveJenkinsJob(fake.call, { jobName: 'team/demo' });
  assert.equal(result.jobName, 'team/demo'); assert.equal(fake.calls[1].args.folder, 'team');
});

test('the session Job action is always read-only even when execution capability is enabled', async () => {
  const fake = jenkins(), session = new WorkflowSession({ allowExecute: true,
    pool: { call: (_server, ...args) => fake.call(...args), close() {} } });
  const result = await session.dispatch({ id: 'job-preview', action: 'job', phase: 'PLAN', input: { jobName: 'front-demo-test' } });
  assert.equal(result.state, 'RESOLVED');
  await assert.rejects(session.dispatch({ id: 'job-write', action: 'job', phase: 'EXECUTE',
    input: { jobName: 'front-demo-test', confirmed: true } }), /不允许/);
  assert.equal(fake.calls.length, 2); session.close();
});
