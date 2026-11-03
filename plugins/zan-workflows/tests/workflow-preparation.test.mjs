import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { runVerificationBatch } from '../scripts/run-local-check.mjs';

const reply = (kind, rows) => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1,
  data: rows.map(value => ({ [kind]: value })) }) }] });
function service(t) {
  const calls = [];
  const pool = { close: async () => ({ cleanupComplete: true }), call: async (server, name, args) => {
    assert.equal(server, 'tapd-mcp'); const o = args.options; calls.push([name, o]);
    if (name === 'get_bug') return reply('Bug', [{ id: o.id, title: '销量数字间距', description: '同一列容易误读',
      status: o.id === '20' ? 'testing' : 'fixing', current_owner: o.id === '20' ? 'tester' : 'developer;', workitem_type_id: 'bugs' }]);
    if (name === 'get_workflows_status_map') return { status: 1, data: { fixing: '修复中', testing: '待测试' } };
    if (name === 'get_stories_or_tasks') return o.entity_type === 'stories'
      ? reply('Story', [{ id: o.id, name: '字段扩展', description: '读写现有配置' }])
      : reply('Task', [{ id: o.id, story_id: '10', name: '展示设置' }]);
    if (name === 'get_comments') return reply('Comment', [{ id: '41', description: '宽度与线上一致', created: 'today' }]);
    throw new Error('unexpected ' + name);
  } };
  const session = new WorkflowSession({ pool });
  t.after(() => session.close());
  return { calls, run: (items, repositories = []) => session.dispatch({ id: 'read', phase: 'PLAN', action: 'collect',
    input: { workspaceId: 123, items, repositories } }), session };
}

test('selected Tasks share one parent read and duplicate Bug rows share only the requested comments', async t => {
  const f = service(t);
  const result = await f.run([{ entryType: 'tasks', entryId: '12' }, { entryType: 'tasks', entryId: '13' },
    { entryType: 'bug', entryId: '20' }, { entryType: 'bug', entryId: '20', comments: true }]);
  assert.equal(result.state, 'COLLECTED'); assert.equal(result.writes, 0);
  assert.deepEqual(result.items.map(row => row.entryId), ['12', '13', '20']);
  assert.deepEqual(result.parents.map(row => row.entryId), ['10']);
  assert.equal(result.items[2].comments.length, 1);
  assert.equal(f.calls.filter(([, o]) => o.entity_type === 'stories').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'get_bug').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'get_comments').length, 1);
  await assert.rejects(f.session.dispatch({ id: 'invalid', action: 'collect', phase: 'EXECUTE', input: { confirmed: true } }), /不允许/);
  assert.equal((await f.session.close()).stageTimings.collection.requests, 2);
});

test('same-worktree project rows share a single verified origin lookup; stale local tracking cannot approve an existing branch', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'work-collection-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'bare.git'), log = join(root, 'calls'), ssh = join(root, 'local-ssh');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote); git('init', '-b', 'main');
  git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
  git('config', 'core.hooksPath', '.git/hooks'); git('commit', '--allow-empty', '-m', 'base');
  const originUrl = 'ssh://fixture@local.test/company/repo.git';
  await writeFile(ssh, '#!/bin/sh\necho read >> "' + log + '"\ncase "$*" in *git-receive-pack*) exec git-receive-pack "' + remote +
    '";; *git-upload-pack*) exec git-upload-pack "' + remote + '";; *) exit 1;; esac\n', { mode: 0o755 });
  git('config', 'core.sshCommand', ssh); git('config', 'ssh.variant', 'ssh'); git('remote', 'add', 'origin', originUrl);
  git('push', 'origin', 'HEAD:refs/heads/feature/existing'); git('update-ref', '-d', 'refs/remotes/origin/feature/existing');
  await writeFile(log, '');
  const row = { repositoryPath: root, originUrl, fixedBranch: 'feature/existing' };
  const result = await service(t).run([{ entryType: 'bug', entryId: '20' }], [row, row, { ...row, fixedBranch: 'feature/new' }]);
  assert.equal(result.repositories.length, 1);
  assert.deepEqual(result.repositories[0].branches.map(b => b.relation), ['NEEDS_REF_REFRESH', 'ABSENT']);
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
  assert.equal(git('branch', '--show-current'), 'main');
});

test('branch-only intake projects identity without loading descriptions, comments, tasks or delivery setup', async t => {
  const f = service(t);
  const result = await f.session.dispatch({ id: 'branch-only', phase: 'PLAN', action: 'collect',
    input: { workspaceId: 123, items: [{ entryType: 'stories', entryId: '10' }], deliveryMode: 'BRANCH_ONLY' } });
  assert.deepEqual(Object.keys(result.items[0].fields).sort(), ['id', 'name']);
  assert.deepEqual(f.calls.map(([name]) => name), ['get_stories_or_tasks']);
});

test('a Bug group shares its live workflow map, preserves a waiting tester and distinguishes missing owner evidence', async t => {
  const f = service(t), repairOwner = { workspaceId: 123, account: 'developer', source: 'selected developer', evidence: 'verified workspace member' };
  const result = await f.run([{ entryType: 'bug', entryId: '20', repair: { workMode: 'CONTINUE' } },
    { entryType: 'bug', entryId: '21', repair: { workMode: 'INITIAL', repairOwner } },
    { entryType: 'bug', entryId: '22', repair: { workMode: 'INITIAL' } }]);
  assert.deepEqual(result.items.map(row => row.statusProposal.action), ['SKIPPED_ALREADY_WAITING_TEST', 'NO_CHANGE', 'PENDING']);
  assert.equal(result.items[0].statusProposal.expectedOwner, 'tester');
  assert.equal(f.calls.filter(([name]) => name === 'get_workflows_status_map').length, 1);
  assert.equal(f.calls.some(([name]) => name === 'update_bug'), false);
});

test('two Task acceptances using an identical check execute once, a failure stops later commands', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'verification-batch-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const args = ['-e', 'require("fs").appendFileSync("calls","x")'];
  const check = { kind: 'test', command: process.execPath, args, cwd, id: 'page', covers: ['页面字段'] };
  const result = await runVerificationBatch({ checks: [check, { ...check, id: 'api', covers: ['接口映射'] },
    { ...check, id: 'fail', args: ['-e', 'process.exit(2)'] }, { ...check, id: 'later', args: ['-e', 'throw Error()'] }] });
  assert.equal(await readFile(join(cwd, 'calls'), 'utf8'), 'x');
  assert.deepEqual(result.receipts[0].ids, ['page', 'api']);
  assert.deepEqual(result.receipts[0].covers, ['页面字段', '接口映射']);
  assert.equal(result.receipts[0].status, 'PASSED'); assert.notEqual(result.status, 'PASSED');
  assert.equal(result.requestedChecks, 4); assert.equal(result.executedCommands, 2);
  assert.deepEqual(result.notRun, ['later']);
  await assert.rejects(runVerificationBatch({ checks: [check, { ...check, id: 'broad', fullScope: true }] }), /全量/);
  assert.equal(await readFile(join(cwd, 'calls'), 'utf8'), 'x');
});
