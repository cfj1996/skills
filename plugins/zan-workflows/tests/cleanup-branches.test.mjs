import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const git = (cwd, args) => exec('git', args, { cwd,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } });
const output = async (cwd, args) => (await git(cwd, args)).stdout.trim();

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zan-cleanup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), remote = join(root, 'remote.git');
  await git(root, ['init', '--bare', '--initial-branch=master', remote]);
  await git(root, ['init', '--initial-branch=master', repo]);
  await git(repo, ['config', 'user.name', 'Cleanup fixture']);
  await git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  await git(repo, ['commit', '--allow-empty', '-m', 'base']);
  const base = await output(repo, ['rev-parse', 'HEAD']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  await git(repo, ['switch', '--no-track', '-c', 'dev']);
  await git(repo, ['commit', '--allow-empty', '-m', 'dev integration']);
  const integration = await output(repo, ['rev-parse', 'HEAD']);
  await git(repo, ['push', 'origin', 'master', 'dev']);
  await git(repo, ['switch', 'master']);
  return { root, repo, remote, base, integration };
}

test('temporary test-merge cleanup removes its worktree then checks dev without forcing or persisting tracking', async t => {
  const { root, repo, remote, integration } = await fixture(t);
  const branch = 'merge/delivery-to-dev', path = join(root, 'test-worktree');
  await git(repo, ['branch', '--no-track', branch, 'dev']);
  await git(repo, ['push', 'origin', branch]);
  await git(repo, ['worktree', 'add', path, branch]);
  const deletion = ['-c', `branch.${branch}.remote=origin`,
    '-c', `branch.${branch}.merge=refs/heads/dev`, 'branch', '-d', '--', branch];
  await assert.rejects(git(repo, deletion)); // A checked-out worktree stays protected.
  await git(repo, ['worktree', 'remove', path]);
  await assert.rejects(git(repo, ['branch', '-d', '--', branch])); // HEAD/master lacks dev-only commits.
  await git(repo, ['merge-base', '--is-ancestor', branch, 'refs/remotes/origin/dev']);
  await git(repo, deletion);
  await assert.rejects(git(repo, ['show-ref', '--verify', `refs/heads/${branch}`]));
  assert.equal(await output(repo, ['branch', '--show-current']), 'master');
  await assert.rejects(git(repo, ['config', '--local', '--get-regexp', `^branch\\.${branch}\\.`]), { code: 1 });
  assert.equal(await output(remote, ['rev-parse', `refs/heads/${branch}`]), integration);
  assert.equal((await output(repo, ['worktree', 'list', '--porcelain'])).includes(path), false);
});

test('exact remote lease deletion removes only the approved remote ref and preserves local branches', async t => {
  const { repo, remote, base, integration } = await fixture(t);
  const branch = 'feature/delivery', ref = `refs/heads/${branch}`;
  await git(repo, ['branch', '--no-track', branch, 'master']);
  await git(repo, ['push', 'origin', branch]);
  await git(repo, ['push', '--porcelain', '--no-follow-tags', `--force-with-lease=${ref}:${base}`, remote, `:${ref}`]);
  await assert.rejects(git(repo, ['ls-remote', '--exit-code', '--heads', remote, ref]), { code: 2 });
  assert.equal(await output(repo, ['rev-parse', ref]), base);
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/master']), base);
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/dev']), integration);
});

test('a remote tip changed after preview rejects deletion using the stale expected SHA', async t => {
  const { repo, remote, base, integration } = await fixture(t);
  const branch = 'feature/delivery', ref = `refs/heads/${branch}`;
  await git(repo, ['branch', '--no-track', branch, 'master']);
  await git(repo, ['push', 'origin', branch]);
  await git(remote, ['update-ref', ref, integration, base]); // Simulate another writer in the disposable bare repo.
  await assert.rejects(git(repo, ['push', '--porcelain', '--no-follow-tags', `--force-with-lease=${ref}:${base}`, remote, `:${ref}`]));
  assert.equal(await output(remote, ['rev-parse', ref]), integration);
  assert.equal(await output(repo, ['rev-parse', ref]), base);
});

test('remote temporary deletion cannot publish local tags when push.followTags is enabled', async t => {
  const { repo, remote, base, integration } = await fixture(t);
  const branch = 'merge/delivery-to-dev', ref = `refs/heads/${branch}`;
  await git(repo, ['branch', '--no-track', branch, 'dev']);
  await git(repo, ['push', 'origin', branch]);
  await git(repo, ['branch', '--no-track', 'feature/delivery', 'master']);
  await git(repo, ['push', 'origin', 'feature/delivery']);
  await git(repo, ['tag', '-a', 'local-review-tag', 'master', '-m', 'must stay local']);
  await git(repo, ['config', 'push.followTags', 'true']);
  await git(repo, ['push', '--porcelain', '--no-follow-tags',
    `--force-with-lease=${ref}:${integration}`, remote, `:${ref}`]);
  await assert.rejects(git(repo, ['ls-remote', '--exit-code', '--heads', remote, ref]), { code: 2 });
  assert.equal(await output(repo, ['ls-remote', '--tags', remote]), '');
  assert.ok(await output(repo, ['rev-parse', 'refs/tags/local-review-tag']));
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/master']), base);
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/dev']), integration);
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/feature/delivery']), base);
});

test('existing mismatched upstream is normalized and read back before ordinary temporary branch deletion', async t => {
  const { repo, remote, base, integration } = await fixture(t);
  const branch = 'merge/old-upstream-to-dev';
  await git(repo, ['branch', '--no-track', branch, 'dev']);
  await git(repo, ['branch', '--set-upstream-to=origin/master', branch]);
  await git(repo, ['merge-base', '--is-ancestor', branch, 'refs/remotes/origin/dev']);
  await git(repo, ['branch', '--set-upstream-to=origin/dev', branch]);
  assert.equal(await output(repo, ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]), 'refs/remotes/origin/dev');
  await git(repo, ['branch', '-d', '--', branch]);
  await assert.rejects(git(repo, ['show-ref', '--verify', `refs/heads/${branch}`]));
  assert.equal(await output(repo, ['branch', '--show-current']), 'master');
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/master']), base);
  assert.equal(await output(remote, ['rev-parse', 'refs/heads/dev']), integration);
});

test('failed temporary deletion restores its unchanged prior upstream and preserves the branch', async t => {
  const { root, repo } = await fixture(t);
  const branch = 'merge/restore-upstream', path = join(root, 'occupied-worktree');
  await git(repo, ['branch', '--no-track', branch, 'dev']);
  await git(repo, ['branch', '--set-upstream-to=origin/master', branch]);
  const beforeRemote = await output(repo, ['config', '--local', '--get-all', `branch.${branch}.remote`]);
  const beforeMerge = await output(repo, ['config', '--local', '--get-all', `branch.${branch}.merge`]);
  const tip = await output(repo, ['rev-parse', `refs/heads/${branch}`]);
  await git(repo, ['worktree', 'add', path, branch]);
  await git(repo, ['branch', '--set-upstream-to=origin/dev', branch]);
  await assert.rejects(git(repo, ['branch', '-d', '--', branch]));
  assert.equal(await output(repo, ['rev-parse', `refs/heads/${branch}`]), tip);
  assert.equal(await output(repo, ['config', '--local', '--get-all', `branch.${branch}.remote`]), 'origin');
  assert.equal(await output(repo, ['config', '--local', '--get-all', `branch.${branch}.merge`]), 'refs/heads/dev');
  await git(repo, ['config', '--local', '--replace-all', `branch.${branch}.remote`, beforeRemote]);
  await git(repo, ['config', '--local', '--replace-all', `branch.${branch}.merge`, beforeMerge]);
  assert.equal(await output(repo, ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]), 'refs/remotes/origin/master');
  assert.equal(await output(repo, ['rev-parse', `refs/heads/${branch}`]), tip);
});
