import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { fixtureMockIo, withNoMockFixture } from './helpers/mock-safety-fixture.mjs';
import { repairRecordBody, repairRecordFixture, repairCommentFixture } from './helpers/bug-repair-record-fixture.mjs';

const api = data => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1, data }) }] });

function fixture({ entryType = 'bug', status = 'fixing', comments, onCommentRead } = {}) {
  const item = { id: '123450001', status, te: 'tester', reporter: 'creator', current_owner: 'developer', version: '' };
  const comment = repairCommentFixture(item.id, 12345);
  const calls = [];
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_workflows_status_map') return api({ fixing: '修复中', testing: '待测试' });
    if (name === 'get_workflows_all_transitions') return api({ fixing: ['testing'] });
    if (name === 'get_comments') {
      await onCommentRead?.(item);
      return comments ? comments(comment) : api([{ Comment: { ...comment } }]);
    }
    if (name === 'get_bug' || name === 'get_stories_or_tasks') {
      const kind = entryType === 'stories' ? 'Story' : entryType === 'tasks' ? 'Task' : 'Bug';
      return api([{ [kind]: { ...item } }]);
    }
    if (name === 'update_bug' || name === 'update_story_or_task') {
      Object.assign(item, args.options);
      return api(true);
    }
    throw new Error(`Unexpected simulated call: ${name}`);
  };
  const input = withNoMockFixture({ workspaceId: 12345, entryId: item.id, entryType, workMode: 'INITIAL',
    workitemTypeId: 'bugs', statusAction: entryType === 'bug' ? 'WAITING_TEST' : 'NONE',
    versionAction: entryType === 'bug' ? 'NONE' : 'WRITE',
    ...(entryType === 'bug' ? {} : { versionField: 'version', testVersion: 'test@1.0.0' }),
    purpose: '模拟修复记录登记门禁', prerequisites: { git: 'VERIFIED', deployment: 'SKIPPED_BY_INTENT',
      profile: 'NO_WIKI', wiki: 'SKIPPED_NO_WIKI', ...(entryType === 'bug' ? { repairRecord: repairRecordFixture() } : {}) } });
  return { item, comment, calls, call, input,
    preview: () => registerTestSubmission(call, input, fixtureMockIo),
    execute: plan => registerTestSubmission(call, { ...plan, execute: true, confirmed: true }, fixtureMockIo) };
}

const writes = f => f.calls.filter(row => /^(create|update)_/.test(row.name));

test('PLAN needs no future published comment and never reads or writes comments', async () => {
  const f = fixture(); delete f.input.prerequisites.repairRecord;
  const plan = await f.preview();
  assert.equal(plan.state, 'AWAITING_CONFIRMATION');
  assert.equal(plan.writes, 0);
  assert.equal(f.calls.some(row => row.name === 'get_comments'), false);
  assert.deepEqual(writes(f), []);
});

test('EXECUTE rejects absent, flag-only and incomplete record evidence before any TAPD call', async () => {
  for (const record of [undefined, null, true, { state: 'VERIFIED' },
    { ...repairRecordFixture(), commentId: 99 }, { ...repairRecordFixture(), commentId: '' },
    { ...repairRecordFixture(), author: ' ' }, { ...repairRecordFixture(), bodySha256: 'not-a-hash' }]) {
    const f = fixture(), plan = await f.preview();
    f.calls.length = 0;
    await assert.rejects(f.execute({ ...plan, prerequisites: { ...plan.prerequisites, repairRecord: record } }), /修复记录/);
    assert.deepEqual(f.calls, []);
  }
});

test('execution freshly reads the exact Bug record before one registration and returns its verified identity', async () => {
  const f = fixture(), plan = await f.preview(); f.calls.length = 0;
  const result = await f.execute(plan);
  assert.equal(result.state, 'REGISTERED');
  assert.equal(f.item.status, 'testing');
  assert.deepEqual(result.repairRecord, { state: 'VERIFIED', workspaceId: 12345, entryId: f.item.id,
    ...repairRecordFixture() });
  const recordRead = f.calls.findIndex(row => row.name === 'get_comments');
  const itemRead = f.calls.findIndex(row => row.name === 'get_bug');
  const update = f.calls.findIndex(row => row.name === 'update_bug');
  assert.ok(recordRead >= 0 && recordRead < itemRead && itemRead < update);
  assert.deepEqual(writes(f).map(row => row.name), ['update_bug']);
  assert.deepEqual(f.calls[recordRead].args, { workspace_id: 12345, options: {
    id: f.comment.id, entry_id: f.item.id, entry_type: 'bug', limit: 2, page: 1,
    fields: 'id,workspace_id,entry_id,entry_type,author,description' } });
});

test('wrong comment, workspace, Bug, type, author or body blocks before registration', async () => {
  for (const change of [
    { id: '999' }, { workspace_id: '999' }, { entry_id: '999' }, { entry_type: 'stories' },
    { author: 'another-author' }, { description: repairRecordBody + '<p>新增未经核实的结果</p>' },
    { description: undefined },
  ]) {
    const f = fixture({ comments: comment => api([{ Comment: { ...comment, ...change } }]) });
    const plan = await f.preview();
    await assert.rejects(f.execute(plan), error => {
      assert.equal(error.result.phase, 'CHECK_REPAIR_RECORD');
      assert.equal(error.result.state, 'BLOCKED');
      assert.equal(error.result.writes, 0);
      return true;
    });
    assert.deepEqual(writes(f), []);
  }
});

test('a Wiki comment cannot serve as a repair record even when its hash matches', async () => {
  const body = '<p>提测wiki：https://www.tapd.cn/12345/markdown_wikis/show/#123450002</p>';
  const f = fixture({ comments: comment => api([{ Comment: { ...comment, description: body } }]) });
  f.input.prerequisites.repairRecord = repairRecordFixture(body);
  const plan = await f.preview();
  await assert.rejects(f.execute(plan), /不是完整修复记录/);
  assert.deepEqual(writes(f), []);
});

test('missing, duplicate, failed or unreadable comment responses fail closed without retry', async () => {
  for (const comments of [
    () => api([]), comment => api([{ Comment: comment }, { Comment: comment }]),
    () => ({ isError: true }),
    () => ({ content: [{ type: 'text', text: '{"status":0,"data":[]}' }] }),
    () => { throw new Error('simulated comment timeout'); },
  ]) {
    const f = fixture({ comments }), plan = await f.preview();
    await assert.rejects(f.execute(plan), error => {
      assert.equal(error.result.phase, 'CHECK_REPAIR_RECORD');
      assert.equal(error.result.writes, 0);
      return true;
    });
    assert.equal(f.calls.filter(row => row.name === 'get_comments').length, 1);
    assert.deepEqual(writes(f), []);
  }
});

test('a published readback can be bound after an earlier record-free preview', async () => {
  const f = fixture(); delete f.input.prerequisites.repairRecord;
  const plan = await f.preview();
  const serverBody = repairRecordBody.replace('<strong>', '<strong class="tapd-normalized">');
  f.comment.description = serverBody;
  const result = await f.execute({ ...plan, prerequisites: { ...plan.prerequisites,
    repairRecord: repairRecordFixture(serverBody) } });
  assert.equal(result.state, 'REGISTERED');
  assert.equal(result.repairRecord.bodySha256, sha256(serverBody));
  assert.equal(f.calls.some(row => row.name === 'create_comments'), false);
});

test('CONTINUE already waiting still verifies its record and never repeats status or comment writes', async () => {
  const f = fixture({ status: 'testing' }); f.input.workMode = 'CONTINUE';
  const plan = await f.preview(), result = await f.execute(plan);
  assert.equal(result.state, 'SKIPPED_ALREADY_WAITING_TEST');
  assert.equal(result.repairRecord.state, 'VERIFIED');
  assert.equal(f.calls.filter(row => row.name === 'get_comments').length, 1);
  assert.deepEqual(writes(f), []);
});

test('assignment drift during the comment read is detected by the subsequent fresh Bug read', async () => {
  const f = fixture({ onCommentRead: item => { item.te = 'another-tester'; } });
  const plan = await f.preview();
  await assert.rejects(f.execute(plan), /处理人、测试人员或创建人已变化/);
  assert.deepEqual(writes(f), []);
});

test('Story and Task registration require no Bug record and make no comment call', async () => {
  for (const entryType of ['stories', 'tasks']) {
    const f = fixture({ entryType }), plan = await f.preview(), result = await f.execute(plan);
    assert.equal(result.state, 'REGISTERED');
    assert.equal(Object.hasOwn(result, 'repairRecord'), false);
    assert.equal(f.calls.some(row => row.name === 'get_comments'), false);
    assert.deepEqual(writes(f).map(row => row.name), ['update_story_or_task']);
  }
});

test('the workflow-session registration entry enforces the same record gate', async t => {
  for (const missing of [true, false]) {
    const f = fixture();
    const session = new WorkflowSession({ allowExecute: true, io: fixtureMockIo,
      pool: { call: (_server, name, args) => f.call(name, args), close() {} } });
    t.after(() => session.close());
    const plan = await session.dispatch({ id: 'preview', action: 'registration', phase: 'PLAN', input: f.input });
    const input = { ...plan, confirmed: true, prerequisites: { ...plan.prerequisites,
      ...(missing ? { repairRecord: undefined } : {}) } };
    if (missing) {
      await assert.rejects(session.dispatch({ id: 'execute', action: 'registration', phase: 'EXECUTE', input }), /修复记录/);
      assert.deepEqual(writes(f), []);
    } else {
      const result = await session.dispatch({ id: 'execute', action: 'registration', phase: 'EXECUTE', input });
      assert.equal(result.state, 'REGISTERED');
      assert.equal(f.calls.filter(row => row.name === 'get_comments').length, 1);
    }
  }
});
