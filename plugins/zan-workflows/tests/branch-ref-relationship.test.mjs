import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBranchRefs } from '../skills/preparing-work/scripts/inspect-branch-refs.mjs';

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'zan-ref-relationship-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (args, input) => execFileSync('git', ['-C', cwd, ...args], { input, encoding: 'utf8', env }).trim();
  git(['init', '--quiet']);
  const tree = git(['mktree'], '');
  const root = git(['commit-tree', tree, '-m', 'root']);
  const local = git(['commit-tree', tree, '-p', root, '-m', 'local work']);
  const remote = git(['commit-tree', tree, '-p', root, '-m', 'remote work']);
  return { cwd, git, root, local, remote };
}

test('existing branch inspection distinguishes equal, local-ahead, remote-ahead and divergence without modifying refs', t => {
  const repo = repository(t), branch = 'fixbug/cfj.1022.123.修复示例';
  const localRef = `refs/heads/${branch}`, remoteRef = `refs/remotes/origin/${branch}`;
  for (const [local, remote, relation] of [
    [repo.root, repo.root, 'EQUAL'], [repo.local, repo.root, 'LOCAL_AHEAD'],
    [repo.root, repo.remote, 'REMOTE_AHEAD'], [repo.local, repo.remote, 'DIVERGED'],
  ]) {
    repo.git(['update-ref', localRef, local]); repo.git(['update-ref', remoteRef, remote]);
    const refsBefore = repo.git(['show-ref']);
    const result = inspectBranchRefs({ cwd: repo.cwd, branch });
    assert.deepEqual(result, { branch, localRef, remoteRef, localSha: local, remoteSha: remote, relation });
    assert.equal(repo.git(['show-ref']), refsBefore);
  }
});

test('one-sided or absent refs remain exact facts rather than selecting a similarly named branch', t => {
  const repo = repository(t), branch = 'feature/cfj.1022.原分支';
  assert.equal(inspectBranchRefs({ cwd: repo.cwd, branch }).relation, 'ABSENT');
  repo.git(['update-ref', `refs/heads/${branch}`, repo.local]);
  assert.equal(inspectBranchRefs({ cwd: repo.cwd, branch }).relation, 'LOCAL_ONLY');
  repo.git(['update-ref', '-d', `refs/heads/${branch}`]);
  repo.git(['update-ref', `refs/remotes/origin/${branch}`, repo.remote]);
  assert.equal(inspectBranchRefs({ cwd: repo.cwd, branch }).relation, 'REMOTE_ONLY');
  assert.equal(inspectBranchRefs({ cwd: repo.cwd, branch: `${branch}-other` }).relation, 'ABSENT');
});

test('invalid repository or branch inputs fail instead of claiming an absent branch', t => {
  const repo = repository(t);
  for (const branch of ['--help', 'bad..branch', 'missing branch', '']) {
    assert.throws(() => inspectBranchRefs({ cwd: repo.cwd, branch }));
  }
  assert.throws(() => inspectBranchRefs({ cwd: join(repo.cwd, 'missing'), branch: 'valid' }));
});

test('missing shallow ancestry does not masquerade as proven divergence', t => {
  const repo = repository(t), branch = 'feature/cfj.1022.浅克隆';
  repo.git(['update-ref', `refs/heads/${branch}`, repo.local]);
  repo.git(['update-ref', `refs/remotes/origin/${branch}`, repo.remote]);
  writeFileSync(join(repo.cwd, '.git', 'shallow'), `${repo.local}\n${repo.remote}\n`);
  assert.throws(() => inspectBranchRefs({ cwd: repo.cwd, branch }), /浅克隆/);
});

test('stdin inspection returns the verified local-ahead tips without network or repository writes', t => {
  const repo = repository(t), branch = 'fixbug/cfj.1022.修复示例';
  repo.git(['update-ref', `refs/heads/${branch}`, repo.local]);
  repo.git(['update-ref', `refs/remotes/origin/${branch}`, repo.root]);
  const refsBefore = repo.git(['show-ref']);
  const script = new URL('../skills/preparing-work/scripts/inspect-branch-refs.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify({ cwd: repo.cwd, branch }), encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).relation, 'LOCAL_AHEAD');
  assert.equal(JSON.parse(result.stdout).localSha, repo.local);
  assert.equal(repo.git(['show-ref']), refsBefore);
});
