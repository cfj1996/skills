import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectMockBaseline, inspectMockSource, checkMockSafety } from '../scripts/mock-safety.mjs';
import { createMockInspectionCache } from '../scripts/mock-revision.mjs';
import { executeSubmissionGit, prepareSubmissionGit } from '../scripts/submission-git.mjs';
import { registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';

const origin = 'ssh://fixture@local.test/team/factory.git';
const planPath = 'docs/stories/item-1081894/task-plan.md';
async function repo(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'submission-git-'))), work = join(root, 'work'), remote = join(root, 'remote.git');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(work);
  const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote); git('init', '-b', 'feature/test.field');
  git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
  git('config', 'core.hooksPath', '.git/hooks');
  const ssh = join(root, 'fixture-ssh');
  await writeFile(ssh, '#!/bin/sh\ncase "$*" in *git-receive-pack*) exec git-receive-pack "' + remote +
    '";; *git-upload-pack*) exec git-upload-pack "' + remote + '";; *) exit 1;; esac\n', { mode: 0o755 });
  git('config', 'core.sshCommand', ssh); git('config', 'ssh.variant', 'ssh'); git('remote', 'add', 'origin', origin);
  const write = async (path, bytes) => { await mkdir(dirname(join(work, path)), { recursive: true }); await writeFile(join(work, path), bytes); };
  await write('package.json', '{}'); await write('src/page.ts', 'export const value = 0;\n');
  await write(planPath, '| Field | Meaning |\n| --- | --- |\n');
  git('add', '.'); git('commit', '-m', 'base');
  const input = { repositoryPath: work, sourceRepository: origin, baseSha: git('rev-parse', 'HEAD'),
    inspectedPaths: ['.'], runtimePaths: ['src'], mockBindingPaths: ['package.json'],
    nonRuntimePlanPaths: [planPath], nonRuntimePlanEvidenceRefs: ['project review: generated Plan is not a build or runtime input'] };
  return { work, remote, git, write, input };
}

test('immutable snapshots and unchanged blobs are reused, with a separate audit hash for an explicitly reviewed Plan', async t => {
  const { input, git, write } = await repo(t), reads = [];
  const io = { mockInspectionCache: createMockInspectionCache(), onProgress: event => reads.push(event) };
  const first = await inspectMockSource({ ...input, revisionSha: input.baseSha }, io);
  const count = reads.length;
  assert.ok(count > 0);
  first.markedPaths.push('caller-mutated');
  assert.deepEqual((await inspectMockSource({ ...input, revisionSha: input.baseSha }, io)).markedPaths, []);
  assert.equal(reads.length, count);
  await write(planPath, '| Field  | Meaning |\n| ------ | ------- |\n');
  git('add', '.'); git('commit', '-m', 'format document');
  const formatted = await inspectMockSource({ ...input, revisionSha: git('rev-parse', 'HEAD') }, io);
  assert.equal(reads.slice(count).reduce((n, event) => n + event.count, 0), 1);
  assert.equal(formatted.contentFingerprint, first.contentFingerprint);
  assert.notEqual(formatted.auditContentFingerprint, first.auditContentFingerprint);
  assert.deepEqual(formatted.changedPaths, [planPath]);
  await assert.rejects(inspectMockSource({ ...input, runtimePaths: ['src', 'docs'] }, io), /边界之外/);
  await write('src/page.ts', 'export const value = 1;\n');
  const safety = { ...input, ...formatted, schemaVersion: 1, mockModules: [], evidenceRefs: ['current source review'] };
  await assert.rejects(checkMockSafety(safety, { operation: 'git-delivery', targetEnvironment: 'test', environmentKind: 'test' }, io), /已过期/);
});

test('project-owned legacy inventory is read at the reviewed commit; changed modules, configs and untracked inputs remain visible', async t => {
  const { input, git, write } = await repo(t);
  const inventoryPath = 'dev/mock-inventory.json', body = JSON.stringify({ modules: [
    { id: 'MOCK-legacy', marker: 'MOCK_ONLY', sourcePaths: ['src/legacy'], activation: 'explicit dev setting' }] });
  await write(inventoryPath, body); await write('src/legacy/data.ts', 'export const rows = [];\n');
  git('add', '.'); git('commit', '-m', 'reviewed baseline');
  const args = { ...input, baseSha: git('rev-parse', 'HEAD'), inventoryPath, inventorySha256: sha256(body), evidenceRefs: ['reviewed inventory'] };
  assert.equal((await inspectMockBaseline(args)).state, 'BASELINE_UNCHANGED');
  await write('src/new.ts', 'export const newField = true;\n');
  const added = await inspectMockBaseline(args);
  assert.deepEqual(added.changedPaths, ['src/new.ts']); assert.deepEqual(added.affectedModuleIds, []);
  assert.equal(added.historicalModules[0].id, 'MOCK-legacy'); assert.equal(added.state, 'REVIEW_DELTA');
  await write('package.json', '{"changed":true}'); const changed = await inspectMockBaseline(args);
  assert.equal(changed.configChanged, true); assert.deepEqual(changed.affectedModuleIds, ['MOCK-legacy']);
  await assert.rejects(inspectMockBaseline({ ...args, inventorySha256: '0'.repeat(64) }), /已审指纹/);
});

test('the local Git step commits only the reviewed files, accepts Plan table formatting and pushes the new exact SHA', async t => {
  const { input, write, work, git } = await repo(t);
  const page = 'export const value = 1;\n', plan = '| Field | Meaning |\n| --- | --- |\n| value | 1 |\n';
  await write('src/page.ts', page); await write(planPath, plan);
  const safety = { ...input, ...await inspectMockSource(input), schemaVersion: 1, mockModules: [], evidenceRefs: ['reviewed source'] };
  const merge = { repositoryPath: work, originUrl: origin, sourceSha: input.baseSha, sourceBranch: 'feature/test.field',
    targetBranch: 'develop', purpose: 'field submission', mockSafety: safety };
  const local = { commit: true, push: true, message: 'feat: field', reviewedFiles: Object.fromEntries(
    [['src/page.ts', page], [planPath, plan]].map(([path, bytes]) => [path, { mode: '100644', sha256: sha256(bytes) }])) };
  await writeFile(join(work, '.git/hooks/pre-commit'), '#!/bin/sh\nsed -i.bak "s/| Field |/| Field    |/" ' + planPath +
    '\nrm -f ' + planPath + '.bak\ngit add -- ' + planPath + '\n', { mode: 0o755 });
  const prepared = await prepareSubmissionGit(merge, local, {});
  assert.equal(prepared.remoteSha, null); assert.equal(git('rev-parse', 'HEAD'), input.baseSha);
  const receipt = {}, result = await executeSubmissionGit(merge, prepared, receipt, {});
  assert.equal(receipt.state, 'VERIFIED'); assert.equal(result, git('rev-parse', 'HEAD'));
  assert.equal(git('ls-remote', 'origin', 'refs/heads/feature/test.field').split('\t')[0], result);
  assert.equal(git('for-each-ref', '--format=%(upstream)', 'refs/heads/feature/test.field'), '');
});

test('non-applicable Story/Task registration opens no TAPD or Mock executor, including for old direct EXECUTE callers', async () => {
  for (const entryType of ['stories', 'tasks']) for (const execute of [true, false]) {
    const result = await registerTestSubmission(() => assert.fail('unexpected TAPD call'), { workspaceId: 1, entryId: '12', entryType,
      workMode: 'INITIAL', purpose: 'test', statusAction: 'NONE', versionAction: 'NONE', execute },
    { inspectMockSource: () => assert.fail('unexpected Mock inspection') });
    assert.equal(result.state, 'NOT_APPLICABLE'); assert.equal(result.writes, 0);
    assert.equal(result.execute, false); assert.equal(result.actualStatus, undefined);
  }
});

test('an uncommitted approved change can start the session entry and deliver via its real local bare remote', async t => {
  const { input, work, remote, git, write } = await repo(t);
  git('push', 'origin', 'HEAD:refs/heads/develop');
  const page = 'export const value = 2;\\n';
  await write('src/page.ts', page);
  const safety = { ...input, ...await inspectMockSource(input), schemaVersion: 1, mockModules: [], evidenceRefs: ['reviewed field'] };
  const remoteRef = name => execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/' + name], { encoding: 'utf8' }).trim();
  const branch = 'feature/test.field'; let mr;
  const pool = { close: async () => ({ cleanupComplete: true }), call: async (server, name, args) => {
    assert.equal(server, 'gitlab-mcp');
    if (name === 'get_project') return { id: 1, ssh_url_to_repo: origin, default_branch: 'main' };
    if (name === 'get_branch') return { commit: { id: remoteRef(args.branch_name) } };
    if (name === 'list_merge_requests') return [];
    if (name === 'create_merge_request') return mr = { iid: 1, source_project_id: 1, target_project_id: 1,
      source_branch: branch, target_branch: 'develop', state: 'opened', sha: remoteRef(branch), detailed_merge_status: 'mergeable',
      blocking_discussions_resolved: true, web_url: 'https://git.example.test/team/factory/-/merge_requests/1' };
    if (name === 'get_merge_request') return mr;
    if (name === 'get_merge_request_approval_state') return { rules: [] };
    if (name === 'merge_merge_request') {
      execFileSync('git', ['--git-dir', remote, 'update-ref', 'refs/heads/develop', mr.sha, input.baseSha]);
      return Object.assign(mr, { state: 'merged', merge_commit_sha: mr.sha });
    }
    throw new Error(name);
  } };
  const session = new WorkflowSession({ allowExecute: true, pool }); t.after(() => session.close());
  const plan = await session.dispatch({ id: 'prepare', phase: 'PLAN', action: 'submit', input: {
    merge: { projectId: '1', repositoryPath: work, originUrl: origin, sourceBranch: branch, sourceSha: input.baseSha,
      targetSha: input.baseSha, targetBranch: 'develop', purpose: 'field', title: 'field', reviewPassed: true, pipelineRequired: false, mockSafety: safety },
    localGit: { commit: true, push: true, message: 'feat: field', reviewedFiles: { 'src/page.ts': { mode: '100644', sha256: sha256(page) } } },
    wiki: null, release: null, registration: { workspaceId: 1, entryType: 'stories', entryId: '12', workMode: 'INITIAL',
      statusAction: 'NONE', versionAction: 'NONE' } } });
  const result = await session.dispatch({ id: 'deliver', phase: 'EXECUTE', action: 'submit',
    input: { planId: plan.planId, reviewedPlanHash: plan.planId, confirmed: true } });
  assert.equal(result.state, 'SUBMITTED');
  assert.notEqual(result.receipts.git.deliveredSha, input.baseSha);
  assert.equal(result.receipts.git.deliveredSha, remoteRef('develop'));
  assert.equal(result.receipts.localGit.sourceSha, remoteRef(branch));
  assert.equal(result.receipts.release.state, 'SKIPPED_BY_INTENT');
});
