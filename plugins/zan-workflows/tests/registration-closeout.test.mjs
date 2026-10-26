import { fixtureRegisterTestSubmission as registerTestSubmission } from './helpers/mock-safety-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerTestSubmission as originalRegisterTestSubmission } from '../scripts/register-test-submission.mjs';
import { checkLocalCloseout, parseWorktrees } from '../scripts/check-local-closeout.mjs';

const id = '1150372234001000001';
const response = data => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1, data }) }] });
const input = () => ({ workspaceId: 50372234, entryId: id, entryType: 'bug', workMode: 'INITIAL',
  statusAction: 'WAITING_TEST', versionAction: 'WRITE', activeStatus: 'fixing', waitingStatus: 'testing',
  workitemTypeId: 'bugs', workflowVerified: true, versionField: 'test_version', testVersion: 'demo@1.0.0-canary.1',
  purpose: '登记已经核实的提测结果', prerequisites: { git: 'VERIFIED', deployment: 'DEPLOYED', profile: 'STANDARD', wiki: 'VERIFIED' } });

function tapdFake({ status = 'fixing', version = '', onCall } = {}) {
  const calls = [], item = { id, status, te: 'tester', reporter: 'creator', current_owner: 'developer',
    test_version: version, version, custom_field_10: version };
  const call = async (name, args) => {
    calls.push({ name, args });
    const override = await onCall?.(name, args, item);
    if (override !== undefined) return override;
    if (name === 'get_workflows_status_map') return response({ fixing: '修复中', testing: '待测试' });
    if (name === 'get_workflows_all_transitions') return response({ fixing: ['testing'] });
    if (name === 'get_entity_custom_fields') return response({ custom_field_10: { name: '测试版本', type: 'text' } });
    const kind = args.options.entity_type === 'tasks' ? 'Task' : args.options.entity_type === 'stories' ? 'Story' : 'Bug';
    if (name === 'get_bug' || name === 'get_stories_or_tasks') return response([{ [kind]:
      Object.fromEntries(args.options.fields.split(',').filter(name => Object.hasOwn(item, name)).map(name => [name, item[name]])) }]);
    if (name === 'update_bug' || name === 'update_story_or_task') {
      Object.assign(item, args.options); return { content: [{ type: 'text', text: JSON.stringify({ data: JSON.stringify({ status: 1, data: { [kind]: item } }) }) }] };
    }
    throw new Error(name);
  };
  return { call, item, calls };
}

async function register(fake, changes = {}) {
  const plan = await registerTestSubmission(fake.call, { ...input(), ...changes });
  return registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true });
}

const submittedBuild = () => ({ state: 'BUILD_SUBMITTED', completionMode: 'TRIGGER_ACCEPTED', writes: 1,
  queueId: 8, queueUrl: 'https://ci.example.test/queue/item/8/', jobName: 'demo-test',
  jobUrl: 'https://ci.example.test/job/demo-test/', sourceRepository: 'https://git.example.test/team/demo.git',
  expectedSha: 'a'.repeat(40), submittedParams: { branch: 'develop' }, sourceVerified: false, buildNumber: null });

test('an accepted build receipt permits waiting-test registration before Jenkins completes', async () => {
  const fake = tapdFake();
  const result = await register(fake, { prerequisites: { ...input().prerequisites,
    deployment: 'BUILD_SUBMITTED', deploymentReceipt: submittedBuild() } });
  assert.equal(result.state, 'REGISTERED');
  assert.equal(fake.item.status, 'testing');
  assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
});

test('missing, unknown or incomplete submission receipts block TAPD writes', async () => {
  for (const receipt of [undefined, { ...submittedBuild(), state: 'UNKNOWN' },
    { ...submittedBuild(), queueUrl: null }, { ...submittedBuild(), submittedParams: {} }]) {
    const fake = tapdFake();
    await assert.rejects(register(fake, { prerequisites: { ...input().prerequisites,
      deployment: 'BUILD_SUBMITTED', deploymentReceipt: receipt } }), /确切队列和参数回执/);
    assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
  }
});

test('registration updates status, owner and version in one exact write and reads them back', async () => {
  const fake = tapdFake();
  const result = await register(fake);
  assert.equal(result.state, 'REGISTERED');
  assert.equal(result.statusState, 'WRITTEN');
  assert.equal(result.versionState, 'WRITTEN');
  assert.equal(result.ownerState, 'WRITTEN');
  assert.equal(result.actualOwner, 'tester');
  const writes = fake.calls.filter(call => call.name === 'update_bug');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].args.options, { id, status: 'testing', current_owner: 'tester', test_version: input().testVersion });
  for (const read of fake.calls.filter(call => call.name === 'get_bug')) {
    assert.ok(['te', 'reporter', 'current_owner'].every(name => read.args.options.fields.split(',').includes(name)));
  }
  const repeated = await register(fake);
  assert.equal(repeated.state, 'ALREADY_REGISTERED');
  assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
});

test('missing or blank tester falls back to the creator even without a version write', async () => {
  for (const te of [undefined, null, '', '  ', ' ; ; ']) {
    const fake = tapdFake(); fake.item.te = te;
    const plan = await registerTestSubmission(fake.call, { ...input(), versionAction: 'NONE' });
    assert.equal(plan.assigneeSource, 'reporter');
    assert.equal(plan.payload.current_owner, 'creator');
    assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
    const result = await registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true });
    assert.equal(result.ownerState, 'WRITTEN');
    assert.equal(result.actualOwner, 'creator');
    assert.equal(result.versionState, 'UNCHANGED');
  }
});

test('no tester or creator blocks before writing instead of retaining the developer', async () => {
  const fake = tapdFake(); fake.item.te = ''; fake.item.reporter = null;
  await assert.rejects(registerTestSubmission(fake.call, input()), /测试人员和创建人均为空/);
  assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
});

test('changes to assignment facts after preview require fresh confirmation', async () => {
  for (const name of ['te', 'reporter', 'current_owner']) {
    const fake = tapdFake();
    const plan = await registerTestSubmission(fake.call, input());
    assert.equal(plan.assigneeSource, 'te');
    fake.item[name] = 'other-person';
    await assert.rejects(registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true }), /重新确认/);
    assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
  }
});

test('an owner readback mismatch reports partial effects and never retries', async () => {
  const fake = tapdFake({ onCall(name, args, item) {
    if (name === 'update_bug') {
      item.status = args.options.status; item.test_version = args.options.test_version;
      return response({ Bug: item });
    }
  } });
  await assert.rejects(register(fake), error => {
    assert.equal(error.result.statusState, 'WRITTEN');
    assert.equal(error.result.versionState, 'WRITTEN');
    assert.equal(error.result.ownerState, 'UNVERIFIED');
    assert.equal(error.result.actualOwner, 'developer');
    assert.equal(error.result.state, 'BLOCKED');
    return true;
  });
  assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
});

test('owner readback tolerates TAPD semicolon separators while retaining every tester', async () => {
  const fake = tapdFake({ onCall(name, args, item) {
    if (name === 'update_bug') {
      Object.assign(item, args.options, { current_owner: 'second;tester;' });
      return response({ Bug: item });
    }
  } });
  fake.item.te = 'tester;second';
  const result = await register(fake);
  assert.equal(result.ownerState, 'WRITTEN');
  assert.equal(fake.calls.find(call => call.name === 'update_bug').args.options.current_owner, 'tester;second');
});

test('missing owner or an incomplete tester list in readback cannot pass registration', async () => {
  for (const actualOwner of [undefined, 'tester;']) {
    const fake = tapdFake({ onCall(name, args, item) {
      if (name === 'update_bug') {
        Object.assign(item, args.options, { current_owner: actualOwner });
        return response({ Bug: item });
      }
    } });
    fake.item.te = 'tester;second';
    await assert.rejects(register(fake), error => {
      assert.equal(error.result.ownerState, 'UNVERIFIED');
      return true;
    });
    assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
  }
});

test('continue from fixing still assigns the tester as part of the status transition', async () => {
  const fake = tapdFake();
  const result = await register(fake, { workMode: 'CONTINUE' });
  assert.equal(result.state, 'REGISTERED');
  assert.equal(result.ownerState, 'WRITTEN');
  assert.equal(fake.item.current_owner, 'tester');
});

test('continue while waiting skips status and version even when a new version was proposed', async () => {
  const fake = tapdFake({ status: 'testing', version: 'previous-version' });
  const result = await register(fake, { workMode: 'CONTINUE' });
  assert.equal(result.state, 'SKIPPED_ALREADY_WAITING_TEST');
  assert.equal(fake.item.test_version, 'previous-version');
  assert.equal(fake.item.current_owner, 'developer');
  assert.equal(result.ownerState, 'UNCHANGED');
  assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
});

test('a custom field is resolved before use and its configuration is bound', async () => {
  const fake = tapdFake();
  const result = await register(fake, { versionField: 'custom_field_10', versionFieldVerified: true });
  assert.equal(result.versionState, 'WRITTEN');
  const fieldsRead = fake.calls.findIndex(call => call.name === 'get_entity_custom_fields');
  const itemRead = fake.calls.findIndex(call => call.name === 'get_bug');
  assert.ok(fieldsRead < itemRead);
  assert.equal(fake.item.custom_field_10, input().testVersion);
});

test('Story/Task version registration does not write a Bug waiting-test status', async () => {
  for (const entryType of ['stories', 'tasks']) {
    const fake = tapdFake({ status: 'open' });
    const result = await register(fake, { entryType, statusAction: 'NONE', versionField: 'version' });
    assert.equal(result.versionState, 'WRITTEN');
    const write = fake.calls.find(call => call.name === 'update_story_or_task');
    assert.equal(Object.hasOwn(write.args.options, 'status'), false);
    assert.equal(Object.hasOwn(write.args.options, 'current_owner'), false);
    assert.equal(write.args.options.entity_type, entryType);
    assert.equal(fake.item.status, 'open');
  }
  const fake = tapdFake();
  await assert.rejects(registerTestSubmission(fake.call, { ...input(), entryType: 'tasks' }), /只有.*Bug/);
  assert.equal(fake.calls.length, 0);
});

test('failed prerequisites and changed state/version block before update', async () => {
  const fake = tapdFake();
  const plan = await registerTestSubmission(fake.call, input());
  await assert.rejects(registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true,
    prerequisites: { ...plan.prerequisites, deployment: 'FAILED' } }), /成功证据/);
  fake.item.test_version = 'other-editor-version';
  await assert.rejects(registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true }), /不能覆盖/);
  assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
});

test('workflow changes block a previously approved registration', async () => {
  const fake = tapdFake();
  const plan = await registerTestSubmission(fake.call, input());
  await assert.rejects(registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true,
    metadataHashes: { ...plan.metadataHashes, statusMap: 'changed' } }), /配置已变化/);
  assert.equal(fake.calls.some(call => call.name.startsWith('update_')), false);
});

test('partial readback reports the actual status and never rolls back or retries', async () => {
  const fake = tapdFake({ onCall(name, args, item) {
    if (name === 'update_bug') { item.status = args.options.status; return response({ Bug: item }); }
  } });
  await assert.rejects(register(fake), error => {
    assert.equal(error.result.statusState, 'WRITTEN');
    assert.equal(error.result.versionState, 'UNVERIFIED');
    assert.equal(error.result.actualStatus, 'testing');
    return true;
  });
  assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
});

test('unknown registration outcome is not repeated', async () => {
  const fake = tapdFake({ onCall(name) { if (name === 'update_bug') throw new Error('timeout'); } });
  await assert.rejects(register(fake), error => {
    assert.equal(error.result.phase, 'UPDATE');
    assert.equal(error.result.statusState, 'UNKNOWN');
    assert.equal(error.result.ownerState, 'UNKNOWN');
    return true;
  });
  assert.equal(fake.calls.filter(call => call.name === 'update_bug').length, 1);
});

const branch = 'feature/alice.delivery';
const root = '/fixture/repo';
const tree = '/fixture/repo/.worktrees/delivery';
const tip = 'a'.repeat(40), target = 'b'.repeat(40);
const closeInput = () => ({ repositoryPath: root, originUrl: 'git@git.example.test:team/demo.git', currentTaskPath: root,
  delivery: { state: 'MERGED', mergeReadback: true, containment: true, defaultTargetVerified: true,
    repositoryPath: root, originUrl: 'git@git.example.test:team/demo.git', sourceBranch: branch, targetBranch: 'master' },
  occupancyEvidence: [{ branch, path: tree, task: 'IDLE', process: 'IDLE', needed: false,
    checkedAt: 1000, scopeComplete: true, source: 'current-task-and-process-check' }],
});

function gitFake({ dirty = '', ignored = '', locked = false, ancestry = 0, onGit } = {}) {
  const calls = [];
  const git = async (cwd, args) => {
    calls.push({ cwd, args });
    const override = await onGit?.(cwd, args);
    if (override) return override;
    let stdout = '';
    if (args[0] === 'rev-parse') stdout = root + '\n';
    else if (args[0] === 'remote') stdout = closeInput().originUrl + '\n';
    else if (args[0] === 'branch') stdout = 'master\n';
    else if (args[0] === 'worktree') stdout = `worktree ${root}\0HEAD ${target}\0branch refs/heads/master\0\0worktree ${tree}\0HEAD ${tip}\0branch refs/heads/${branch}\0${locked ? 'locked\0' : ''}\0`;
    else if (args[0] === 'for-each-ref') stdout = `refs/heads/${branch}\t${tip}\nrefs/remotes/origin/master\t${target}\n`;
    else if (args[0] === 'merge-base') return { code: ancestry, stdout: '' };
    else if (args[0] === 'status') stdout = dirty;
    else if (args[0] === 'ls-files') stdout = ignored;
    else if (args[0] !== 'fetch') throw new Error(args[0]);
    return { code: 0, stdout };
  };
  return { calls, io: { git, now: () => 2000, cwd: '/fixture/controller' } };
}

test('read-only closeout batches refs and produces candidates without deleting anything', async () => {
  const fake = gitFake();
  const result = await checkLocalCloseout(closeInput(), fake.io);
  assert.equal(result.state, 'CHECKED');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.cleanupState, 'AWAITING_CONFIRMATION');
  assert.equal(result.readOnly, true);
  assert.equal(fake.calls.filter(call => call.args[0] === 'fetch').length, 1);
  assert.equal(fake.calls.filter(call => call.args[0] === 'worktree').length, 1);
  assert.equal(fake.calls.some(call => ['remove', '-d', '-D', 'prune', 'switch'].some(word => call.args.includes(word))), false);
});

test('current locations, locked trees and dirty/untracked work are retained', async () => {
  for (const [changes, options] of [[{ currentTaskPath: tree }, {}], [{}, { locked: true }], [{}, { dirty: '?? notes.txt\0' }]]) {
    const fake = gitFake(options);
    const result = await checkLocalCloseout({ ...closeInput(), ...changes }, fake.io);
    assert.equal(result.resources[0].disposition, 'RETAIN');
    assert.equal(result.candidates.length, 0);
  }
});

test('unknown ignored data, stale occupancy and unclear ancestry never become candidates', async () => {
  for (const [changes, options] of [[{}, { ignored: '.env.local\0' }], [{ occupancyEvidence: [] }, {}],
    [{ occupancyEvidence: [{ ...closeInput().occupancyEvidence[0], checkedAt: -100000 }] }, {}], [{}, { ancestry: 1 }]]) {
    const fake = gitFake(options);
    const result = await checkLocalCloseout({ ...closeInput(), ...changes }, fake.io);
    assert.equal(result.state, 'PARTIAL');
    assert.equal(result.candidates.length, 0);
    assert.equal(result.cleanupState, 'BLOCKED');
  }
});

test('explicit disposable output is compactly inspected, without reading contents', async () => {
  const fake = gitFake({ ignored: 'node_modules/\0' });
  const result = await checkLocalCloseout({ ...closeInput(), disposableIgnoredPaths: ['node_modules/'] }, fake.io);
  assert.equal(result.candidates.length, 1);
  assert.ok(fake.calls.find(call => call.args[0] === 'ls-files').args.includes('--directory'));
});

test('missing association or unavailable Git never claims no cleanup candidates', async () => {
  const fake = gitFake();
  const result = await checkLocalCloseout({ ...closeInput(), relatedBranches: [{ branch: 'merge/example-to-dev', targetBranch: 'dev' }] }, fake.io);
  assert.equal(result.state, 'PARTIAL');
  assert.equal(result.cleanupState, 'BLOCKED');
  assert.equal(result.resources.find(row => row.branch.startsWith('merge/')).disposition, 'VERIFY');
  const unavailable = await checkLocalCloseout(closeInput(), { git: async () => ({ code: 128, stdout: '' }) });
  assert.equal(unavailable.state, 'UNAVAILABLE');
  assert.equal(unavailable.cleanupState, 'BLOCKED');
});

test('unverified default delivery and deletion switches never run a local check', async () => {
  const fake = gitFake();
  const result = await checkLocalCloseout({ ...closeInput(), delivery: { state: 'MERGED', targetBranch: 'dev' } }, fake.io);
  assert.equal(result.state, 'NOT_TRIGGERED');
  assert.equal(fake.calls.length, 0);
  await assert.rejects(checkLocalCloseout({ ...closeInput(), execute: true }, fake.io), /只读模式/);
});

test('associated test-merge branches are checked against their own dev target, independently of master', async () => {
  for (const targetBranch of ['dev', 'develop']) {
    const temporary = 'merge/delivery-to-' + targetBranch, tempTip = 'c'.repeat(40), devTip = 'd'.repeat(40);
    for (const contained of [true, false]) {
      const fake = gitFake({ onGit: (_cwd, args) => {
        if (args[0] === 'for-each-ref') return { code: 0, stdout:
          `refs/heads/${branch}\t${tip}\nrefs/remotes/origin/master\t${target}\n`
          + `refs/heads/${temporary}\t${tempTip}\nrefs/remotes/origin/${targetBranch}\t${devTip}\n` };
        if (args[0] === 'merge-base' && args[2] === tempTip) {
          assert.equal(args[3], devTip);
          return { code: contained ? 0 : 1, stdout: '' };
        }
      } });
      const input = closeInput();
      input.relatedBranches = [{ branch: temporary, targetBranch, association: {
        state: 'MERGED', mrIid: '12', repositoryPath: root, originUrl: input.originUrl,
        sourceBranch: temporary, targetBranch,
      } }];
      input.occupancyEvidence.push({ ...input.occupancyEvidence[0], branch: temporary, path: null });
      const result = await checkLocalCloseout(input, fake.io);
      const resource = result.resources.find(row => row.branch === temporary);
      assert.equal(resource.disposition, contained ? 'CANDIDATE' : 'VERIFY');
      assert.equal(resource.path, null); // A branch without a worktree is still inventoried.
      assert.equal(resource.targetBranch, targetBranch);
      assert.equal(fake.calls.some(row => row.args[0] === 'push'), false);
    }
  }
});

test('worktree paths with spaces remain intact in NUL-delimited porcelain', () => {
  const result = parseWorktrees(`worktree /fixture/path with spaces\0branch refs/heads/${branch}\0locked reason\0\0`);
  assert.equal(result[0].path, '/fixture/path with spaces');
  assert.equal(result[0].locked, true);
});

test('Story version registration remains valid with an actual workflow category', async () => {
  const fake = tapdFake({ status: 'open', onCall(_name, _args, item) { item.workitem_type_id = 'story-type'; } });
  const result = await register(fake, { entryType: 'stories', statusAction: 'NONE', versionField: 'version' });
  assert.equal(result.state, 'REGISTERED');
  assert.equal(fake.calls.some(row => row.name === 'update_bug'), false);
});

test('closeout automatically collects one scoped occupancy snapshot when none was provided', async () => {
  const fake = gitFake(), input = closeInput(); delete input.occupancyEvidence;
  let collections = 0;
  const result = await checkLocalCloseout(input, { ...fake.io,
    collectOccupancy: async resources => {
      collections++; assert.deepEqual(resources, [{ branch, path: tree }]);
      return closeInput().occupancyEvidence;
    } });
  assert.equal(collections, 1); assert.equal(result.occupancySource, 'AUTOMATIC');
  assert.equal(result.resources[0].disposition, 'CANDIDATE'); assert.equal(result.readOnly, true);
});
