import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectTargetContainment, mergeRequiredTools, mergeReviewedBranch } from '../scripts/merge-reviewed-branch.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';

const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40), changedSha = 'c'.repeat(40);
const originUrl = 'https://git.example.test/team/demo.git';
const input = () => ({ projectId: '1', repositoryPath: '/fixture/demo', originUrl,
  sourceBranch: 'feature/alice.delivery', targetBranch: 'develop', sourceSha, targetSha,
  title: '已评审变更', purpose: '核实已有交付后继续提测', reviewPassed: true,
  pipelineRequired: true, execute: false });

function fixture({ equal = false, contained = true, proofError, proofTarget } = {}) {
  const calls = [];
  const tip = equal ? sourceSha : targetSha;
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_project') return { http_url_to_repo: originUrl, default_branch: 'main' };
    if (name === 'get_branch') return { commit: { id: args.branch_name === 'develop' ? tip : sourceSha } };
    if (name === 'list_merge_requests') return [];
    assert.fail('No MR or other write is permitted: ' + name);
  };
  const io = { checkRepository: async () => {}, inspectContainment: async () => {
    if (proofError) throw new Error('unavailable containment evidence');
    return { contained, targetSha: proofTarget || tip };
  } };
  return { call, calls, io, tip };
}

test('equal source/test-target tips finish read-only during preview and execution without an MR title', async () => {
  for (const execute of [false, true]) {
    const fake = fixture({ equal: true });
    const result = await mergeReviewedBranch(fake.call, { ...input(), targetSha: sourceSha,
      title: undefined, execute, confirmed: execute }, fake.io);
    assert.equal(result.state, 'VERIFIED');
    assert.equal(result.operation, 'VERIFY_CONTAINMENT_ONLY');
    assert.equal(result.containment, true);
    assert.equal(result.mergeReadback, false);
    assert.equal(result.mrIid, null);
    assert.equal(result.mrUrl, null);
    assert.equal(result.deliveredSha, sourceSha);
    assert.equal(result.writes, 0);
    assert.ok(fake.calls.every(row => ['get_branch', 'get_project', 'list_merge_requests'].includes(row.name)));
  }
});

test('an ancestor already delivered to the test target returns its actual target revision', async () => {
  const fake = fixture();
  const result = await mergeReviewedBranch(fake.call, input(), fake.io);
  assert.equal(result.state, 'VERIFIED');
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.deliveredSha, targetSha);
  assert.equal(result.writes, 0);
});

test('explicit no-merge verification needs no MR tools or source branch read and cannot write', async () => {
  const fake = fixture();
  const plan = { ...input(), mergeMode: 'CONTAINMENT_ONLY' };
  assert.deepEqual(mergeRequiredTools(plan), ['get_branch', 'get_project']);
  const result = await mergeReviewedBranch(fake.call, plan, fake.io);
  assert.equal(result.state, 'VERIFIED');
  assert.deepEqual(fake.calls.map(row => row.name).sort(), ['get_branch', 'get_project']);
  for (const change of [{ execute: true }, { targetBranch: 'master' }, { sourceSha: null }, { mrIid: '7' }]) {
    await assert.rejects(mergeReviewedBranch(fake.call, { ...plan, ...change }, fake.io), /只读包含关系核验/);
  }
});

test('missing containment, unavailable proof and target drift block no-merge delivery before writes', async () => {
  for (const options of [{ contained: false }, { proofError: true }, { proofTarget: changedSha }]) {
    const fake = fixture(options);
    await assert.rejects(mergeReviewedBranch(fake.call, { ...input(), mergeMode: 'CONTAINMENT_ONLY' }, fake.io));
    assert.ok(fake.calls.every(row => ['get_branch', 'get_project'].includes(row.name)));
  }
});

test('an unavailable or stale AUTO containment check cannot fall through to MR creation', async () => {
  for (const options of [{ proofError: true }, { proofTarget: changedSha }]) {
    const fake = fixture(options);
    await assert.rejects(mergeReviewedBranch(fake.call, { ...input(), execute: true, confirmed: true }, fake.io));
  }
});

test('read-only containment results leave the workflow session usable for later planned steps', async () => {
  const fake = fixture();
  const session = new WorkflowSession({ allowExecute: true, io: fake.io,
    pool: { call: async (_server, name, args) => fake.call(name, args), close() {} } });
  const result = await session.dispatch({ id: 'verify-delivery', action: 'merge', phase: 'PLAN',
    input: { ...input(), mergeMode: 'CONTAINMENT_ONLY' } });
  assert.equal(result.state, 'VERIFIED');
  assert.equal(session.executionBlocked, false);
  assert.equal(session.pendingMerges.size, 0);
  session.close();
});

test('local Git containment refreshes the target ref and distinguishes ancestry from missing objects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'test-merge-containment-'));
  const remote = join(root, 'remote.git'), repo = join(root, 'repo');
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(root, 'init', '--bare', remote);
    git(root, 'init', repo);
    git(repo, 'config', 'user.name', 'Fixture');
    git(repo, 'config', 'user.email', 'fixture@example.test');
    git(repo, 'remote', 'add', 'origin', remote);
    writeFileSync(join(repo, 'source.txt'), 'reviewed');
    git(repo, 'add', '.'); git(repo, 'commit', '-m', 'reviewed');
    const source = git(repo, 'rev-parse', 'HEAD');
    writeFileSync(join(repo, 'target.txt'), 'target advancement');
    git(repo, 'add', '.'); git(repo, 'commit', '-m', 'advance');
    const target = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'push', 'origin', 'HEAD:refs/heads/develop');
    git(repo, 'update-ref', 'refs/remotes/origin/develop', source);
    const proof = await inspectTargetContainment({ repositoryPath: repo, sourceSha: source, targetBranch: 'develop' });
    assert.deepEqual(proof, { contained: true, targetSha: target });
    assert.equal(git(repo, 'rev-parse', 'refs/remotes/origin/develop'), target);
    git(repo, 'checkout', '--orphan', 'unrelated');
    git(repo, 'rm', '-rf', '.');
    writeFileSync(join(repo, 'other.txt'), 'unrelated');
    git(repo, 'add', '.'); git(repo, 'commit', '-m', 'unrelated');
    assert.deepEqual(await inspectTargetContainment({ repositoryPath: repo,
      sourceSha: git(repo, 'rev-parse', 'HEAD'), targetBranch: 'develop' }), { contained: false, targetSha: target });
    await assert.rejects(inspectTargetContainment({ repositoryPath: repo, sourceSha: 'd'.repeat(40), targetBranch: 'develop' }), /包含关系未能验证/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
