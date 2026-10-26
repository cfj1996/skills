import { fixtureMergeReviewedBranch as mergeReviewedBranch } from './helpers/mock-safety-fixture.mjs';
import { FixtureWorkflowSession as WorkflowSession } from './helpers/mock-safety-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRequiredTools, mergeReviewedBranch as originalMergeReviewedBranch } from '../scripts/merge-reviewed-branch.mjs';
import { WorkflowSession as originalWorkflowSession } from '../scripts/workflow-session.mjs';

const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40), advancedSha = 'c'.repeat(40);
const originUrl = 'git@git.example.test:team/demo.git';
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const input = () => ({ projectId: '1', repositoryPath: '/fixture/demo', originUrl,
  sourceBranch: 'feature/alice.delivery', targetBranch: 'master', sourceSha, targetSha,
  title: 'feat: delivery', purpose: '上线已评审变更', reviewPassed: true, pipelineRequired: true,
  execute: true, confirmed: true });

function fixture({ existing = true, canMerge, denied, override, targetBranch = 'master', defaultBranch = 'master' } = {}) {
  const calls = [];
  const state = { existing, merged: false, sourceDeleted: false, sourceSha, targetSha, defaultBranch,
    pipeline: 'success', contained: true, proofCalls: 0 };
  const mr = () => ({ iid: 7, web_url: 'https://git.example.test/team/demo/-/merge_requests/7',
    source_branch: input().sourceBranch, target_branch: targetBranch, sha: state.sourceSha,
    source_project_id: 1, target_project_id: 1, state: state.merged ? 'merged' : 'opened',
    detailed_merge_status: 'mergeable', head_pipeline: { status: state.pipeline },
    merge_commit_sha: state.merged ? advancedSha : null,
    ...(canMerge === undefined ? {} : { user: { can_merge: canMerge } }) });
  const call = async (name, args) => {
    calls.push({ name, args });
    const custom = await override?.(name, args);
    if (custom !== undefined) return custom;
    if (name === 'get_project') return reply({ id: 1, default_branch: state.defaultBranch, ssh_url_to_repo: originUrl });
    if (name === 'get_branch') {
      if (args.branch_name === input().sourceBranch && state.sourceDeleted) throw new Error('HTTP 404 source branch deleted');
      return reply({ commit: { id: args.branch_name === input().sourceBranch ? state.sourceSha : state.targetSha } });
    }
    if (name === 'list_merge_requests') return reply(state.existing ? [mr()] : []);
    if (name === 'get_merge_request') return reply(mr());
    if (name === 'create_merge_request') { state.existing = true; return reply(mr()); }
    if (name === 'get_merge_request_approval_state') return reply({ rules: [] });
    if (name === 'merge_merge_request') {
      if (denied) return denied();
      state.merged = true;
      return reply(mr());
    }
    throw new Error('Unexpected tool ' + name);
  };
  const io = { checkRepository: async () => {},
    inspectContainment: async () => ({ contained: false, targetSha: state.targetSha }),
    containsSource: async plan => {
    assert.equal(plan.sourceSha, sourceSha);
    state.proofCalls++;
    return { contained: state.contained, targetSha: advancedSha };
  } };
  return { call, calls, io, state, mr };
}
const mutations = fake => fake.calls.filter(row => /^(create|merge)_/.test(row.name));

test('default target changes after preview stop both MR creation and merge before any write', async () => {
  for (const targetBranch of ['master', 'main']) {
    for (const existing of [false, true]) {
      const fake = fixture({ existing, targetBranch, defaultBranch: targetBranch });
      const plan = await mergeReviewedBranch(fake.call, {
        ...input(), targetBranch, execute: false, confirmed: false,
      }, fake.io);
      fake.state.defaultBranch = targetBranch === 'master' ? 'main' : 'master';
      await assert.rejects(mergeReviewedBranch(fake.call, {
        ...plan, execute: true, confirmed: true,
      }, fake.io), /未验证为实际默认分支/);
      assert.deepEqual(mutations(fake), []);
    }
  }
});

test('default target is refreshed after waiting and approval checks before the merge write', async () => {
  for (const targetBranch of ['master', 'main']) {
    for (const existing of [false, true]) {
      const fake = fixture({ existing, targetBranch, defaultBranch: targetBranch, override(name) {
        if (name === 'get_merge_request_approval_state') {
          fake.state.defaultBranch = targetBranch === 'master' ? 'main' : 'master';
        }
      } });
      await assert.rejects(mergeReviewedBranch(fake.call, {
        ...input(), targetBranch, ...(existing ? { mrIid: '7' } : {}),
      }, fake.io), error => {
        assert.match(error.message, /未验证为实际默认分支/);
        assert.equal(error.result.phase, 'CHECK_MERGE');
        assert.equal(error.result.writes, existing ? 0 : 1);
        return true;
      });
      assert.deepEqual(mutations(fake).map(row => row.name), existing ? [] : ['create_merge_request']);
      assert.equal(fake.calls.filter(row => row.name === 'get_project').length, 2);
    }
  }
});

test('unchanged actual master and main targets still merge and verify containment', async () => {
  for (const targetBranch of ['master', 'main']) {
    const fake = fixture({ targetBranch, defaultBranch: targetBranch });
    const result = await mergeReviewedBranch(fake.call, { ...input(), targetBranch, mrIid: '7' }, fake.io);
    assert.equal(result.state, 'MERGED');
    assert.equal(result.defaultTargetVerified, true);
    assert.equal(result.defaultBranch, targetBranch);
    assert.equal(result.containment, true);
    assert.deepEqual(mutations(fake).map(row => row.name), ['merge_merge_request']);
  }
});

function assertContactAction(result, targetBranch = 'master') {
  assert.equal(result.userAction.type, 'CONTACT_MERGER');
  assert.equal(result.userAction.resumePrompt,
    ['master', 'main'].includes(targetBranch) ? '已合并，继续上线' : '已合并，继续交付');
  for (const fact of [result.mrUrl, result.sourceBranch, targetBranch, result.userAction.resumePrompt]) {
    assert.ok(result.userAction.message.includes(fact));
  }
  assert.match(result.userAction.message, /请联系有权限的同事/);
}

test('manual handoff creates one exact MR and retains a read-only continuation plan', async () => {
  const fake = fixture({ existing: false });
  const result = await mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL' }, fake.io);
  assert.equal(result.state, 'AWAITING_MERGE');
  assert.equal(result.reason, 'MANUAL_MERGE_REQUESTED');
  assertContactAction(result);
  assert.doesNotMatch(result.userAction.message, /当前账号没有合并权限/);
  assert.equal(result.writes, 1);
  assert.equal(result.mergeReadback, false);
  assert.equal(result.containment, false);
  assert.equal(result.resumePlan.mrIid, '7');
  assert.equal(result.resumePlan.mergeMode, 'VERIFY_ONLY');
  assert.equal(result.resumePlan.execute, false);
  assert.equal(result.resumePlan.confirmed, false);
  assert.deepEqual(mutations(fake).map(row => row.name), ['create_merge_request']);
  assert.equal(fake.calls.some(row => row.name === 'get_merge_request_approval_state'), false);
});

test('an explicit denied permission reuses the MR without attempting a merge', async () => {
  const fake = fixture({ canMerge: false });
  const result = await mergeReviewedBranch(fake.call, { ...input(), mrIid: '7' }, fake.io);
  assert.equal(result.state, 'AWAITING_MERGE');
  assert.equal(result.reason, 'MERGE_PERMISSION_DENIED');
  assertContactAction(result);
  assert.match(result.userAction.message, /当前账号没有合并权限/);
  assert.equal(result.writes, 0);
  assert.deepEqual(mutations(fake), []);
});

test('merge-only 403 responses become a manual handoff after exact MR readback', async () => {
  for (const denied of [
    () => ({ isError: true, content: [{ type: 'text', text: 'GitLab API error: 403 - Forbidden' }] }),
    () => { const error = new Error('access denied'); error.httpStatus = 403; throw error; },
  ]) {
    const fake = fixture({ denied });
    const result = await mergeReviewedBranch(fake.call, { ...input(), mrIid: '7' }, fake.io);
    assert.equal(result.state, 'AWAITING_MERGE');
    assert.equal(result.reason, 'MERGE_PERMISSION_DENIED');
    assertContactAction(result);
    assert.equal(result.writes, 0);
    assert.equal(fake.calls.filter(row => row.name === 'merge_merge_request').length, 1);
    assert.equal(fake.state.proofCalls, 0);
  }
});

test('other API errors and denied MR creation do not claim a permission handoff', async () => {
  for (const message of ['HTTP 401', 'HTTP 405', 'HTTP 500', 'timeout']) {
    const fake = fixture({ denied: () => { throw new Error(message); } });
    await assert.rejects(mergeReviewedBranch(fake.call, input(), fake.io), error => {
      assert.equal(error.result.state, 'BLOCKED');
      assert.equal(error.result.phase, 'MERGE_MR');
      return true;
    });
    assert.equal(fake.calls.filter(row => row.name === 'merge_merge_request').length, 1);
  }
  const fake = fixture({ existing: false, override: name => name === 'create_merge_request'
    ? { isError: true, content: [{ type: 'text', text: 'HTTP 403' }] } : undefined });
  await assert.rejects(mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL' }, fake.io));
  assert.equal(fake.calls.some(row => row.name === 'merge_merge_request'), false);
});

test('rechecking an open MR stays waiting, tolerates unrelated target advancement and performs no writes', async () => {
  const fake = fixture();
  const pending = await mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL', mrIid: '7' }, fake.io);
  fake.state.targetSha = advancedSha;
  const result = await mergeReviewedBranch(fake.call, pending.resumePlan, fake.io);
  assert.equal(result.state, 'AWAITING_MERGE');
  assert.equal(result.reason, 'MANUAL_MERGE_PENDING');
  assertContactAction(result);
  assert.match(result.userAction.message, /MR 仍未合并/);
  assert.doesNotMatch(result.userAction.message, /当前账号没有合并权限/);
  assert.deepEqual(mutations(fake), []);
});

test('denied MR reads or approval reads cannot be classified as merge permission handoffs', async () => {
  for (const tool of ['get_merge_request', 'get_merge_request_approval_state']) {
    const fake = fixture({ override: name => name === tool
      ? { isError: true, content: [{ type: 'text', text: 'HTTP 403' }] } : undefined });
    await assert.rejects(mergeReviewedBranch(fake.call, { ...input(), mrIid: '7' }, fake.io));
    assert.deepEqual(mutations(fake), []);
  }
});

test('manual merge continuation verifies source containment even after the source branch is deleted', async () => {
  const fake = fixture();
  const pending = await mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL', mrIid: '7' }, fake.io);
  fake.calls.length = 0;
  Object.assign(fake.state, { merged: true, sourceDeleted: true, targetSha: advancedSha });
  const result = await mergeReviewedBranch(fake.call, pending.resumePlan, fake.io);
  assert.equal(result.state, 'MERGED');
  assert.equal(result.mergeReadback, true);
  assert.equal(result.containment, true);
  assert.equal(result.observedTargetSha, advancedSha);
  assert.equal(result.defaultTargetVerified, true);
  assert.equal(result.userAction, undefined);
  assert.equal(result.writes, 0);
  assert.equal(fake.calls.some(row => row.name === 'get_branch' && row.args.branch_name === input().sourceBranch), false);
  assert.deepEqual(mutations(fake), []);
});

test('manual handoff retains conflict and failed CI blockers', async () => {
  for (const patch of [{ has_conflicts: true }, { head_pipeline: { status: 'failed' } }, { draft: true }]) {
    const fake = fixture();
    const call = (name, args) => name === 'get_merge_request' ? reply({ ...fake.mr(), ...patch }) : fake.call(name, args);
    await assert.rejects(mergeReviewedBranch(call, { ...input(), mergeMode: 'MANUAL', mrIid: '7' }, fake.io));
    assert.deepEqual(mutations(fake), []);
  }
});

test('continuation rejects changed MR source, identity or target instead of repeating merge work', async () => {
  for (const patch of [{ sha: advancedSha }, { iid: 8 }, { target_branch: 'develop' }, { state: 'closed' }]) {
    const fake = fixture();
    const pending = await mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL', mrIid: '7' }, fake.io);
    const call = (name, args) => name === 'get_merge_request' ? reply({ ...fake.mr(), ...patch }) : fake.call(name, args);
    await assert.rejects(mergeReviewedBranch(call, pending.resumePlan, fake.io));
    assert.deepEqual(mutations(fake), []);
  }
});

test('merged state alone cannot bypass containment or required CI verification', async () => {
  for (const patch of [{ contained: false }, { pipeline: 'failed' }, { pipeline: 'running' }]) {
    const fake = fixture();
    const pending = await mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'MANUAL', mrIid: '7' }, fake.io);
    Object.assign(fake.state, { merged: true, ...patch });
    await assert.rejects(mergeReviewedBranch(fake.call, pending.resumePlan, fake.io));
    assert.deepEqual(mutations(fake), []);
  }
});

test('a permission error racing with a successful human merge accepts only verified actual completion', async () => {
  const fake = fixture({ denied: () => {
    fake.state.merged = true;
    return { isError: true, content: [{ type: 'text', text: 'HTTP 403' }] };
  } });
  const result = await mergeReviewedBranch(fake.call, input(), fake.io);
  assert.equal(result.state, 'MERGED');
  assert.equal(result.containment, true);
  assert.equal(result.writes, 0);
  assert.equal(fake.calls.filter(row => row.name === 'merge_merge_request').length, 1);
});

test('verification-only mode is read-only, exact and requires no mutation tools', async () => {
  assert.ok(!mergeRequiredTools({ ...input(), mergeMode: 'MANUAL', mrIid: '7' }).includes('merge_merge_request'));
  const plan = { ...input(), execute: false, mergeMode: 'VERIFY_ONLY', mrIid: '7' };
  assert.ok(mergeRequiredTools(plan).every(name => !/^(create|merge)_/.test(name)));
  for (const change of [{ execute: true }, { mrIid: null }, { sourceSha: null }, { mergeMode: 'invalid' }]) {
    const fake = fixture();
    await assert.rejects(mergeReviewedBranch(fake.call, { ...plan, ...change }, fake.io));
    assert.equal(fake.calls.length, 0);
  }
});

test('workflow session pauses downstream writes until its exact pending MR is verified', async () => {
  const fake = fixture();
  const session = new WorkflowSession({ allowExecute: true, io: fake.io,
    pool: { call: (_server, ...args) => fake.call(...args), close() {} } });
  const pending = await session.dispatch({ id: 'handoff', action: 'merge', phase: 'EXECUTE',
    input: { ...input(), mergeMode: 'MANUAL', mrIid: '7' } });
  await assert.rejects(session.dispatch({ id: 'publish', action: 'release', phase: 'EXECUTE', input: { confirmed: true } }), /待人工合并/);
  const waiting = await session.dispatch({ id: 'still-open', action: 'merge', phase: 'PLAN', input: pending.resumePlan });
  assert.equal(waiting.state, 'AWAITING_MERGE');
  assertContactAction(waiting);
  assert.equal(session.pendingMerges.size, 1);
  for (const change of [{ sourceSha: advancedSha }, { pipelineRequired: false }, { reviewPassed: false }]) {
    await assert.rejects(session.dispatch({ id: 'changed-' + Object.keys(change)[0], action: 'merge', phase: 'PLAN',
      input: { ...pending.resumePlan, ...change } }), /校验要求已变化/);
    assert.equal(session.pendingMerges.get('1:7').sourceSha, sourceSha);
    assert.equal(session.pendingMerges.get('1:7').pipelineRequired, true);
  }
  fake.state.merged = true;
  const verified = await session.dispatch({ id: 'readback', action: 'merge', phase: 'PLAN', input: pending.resumePlan });
  assert.equal(verified.state, 'MERGED');
  assert.equal(session.pendingMerges.size, 0);
  assert.equal(session.executionBlocked, false);
  const repeated = await session.dispatch({ id: 'continue', action: 'merge', phase: 'EXECUTE', input: { ...input(), mrIid: '7' } });
  assert.equal(repeated.state, 'MERGED');
  assert.deepEqual(mutations(fake), []);
  session.close();
});

test('manual reminders use the actual target and distinguish go-live from dev delivery', async () => {
  for (const targetBranch of ['main', 'develop', 'dev']) {
    const fake = fixture();
    const call = (name, args) => {
      if (name === 'get_project') return Promise.resolve(reply({ id: 1,
        default_branch: targetBranch === 'main' ? 'main' : 'master', ssh_url_to_repo: originUrl }));
      if (name === 'get_merge_request') return Promise.resolve(reply({ ...fake.mr(), target_branch: targetBranch }));
      return fake.call(name, args);
    };
    const result = await mergeReviewedBranch(call,
      { ...input(), targetBranch, mergeMode: 'MANUAL', mrIid: '7' }, fake.io);
    assertContactAction(result, targetBranch);
    assert.equal(result.resumePlan.targetBranch, targetBranch);
    assert.deepEqual(mutations(fake), []);
  }
});
