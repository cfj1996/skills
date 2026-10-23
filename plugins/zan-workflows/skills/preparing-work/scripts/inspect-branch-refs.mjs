#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspect already-refreshed refs only. The caller owns remote freshness and authorization.
export function inspectBranchRefs({ cwd, branch }) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof branch !== 'string' || !branch.trim() || branch.startsWith('-')) {
    throw new Error('需要准确仓库路径和固定分支名');
  }
  const git = args => {
    const result = spawnSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    });
    if (result.error || result.signal) throw new Error('无法读取 Git 分支证据');
    return result;
  };
  const exact = args => {
    const result = git(args);
    if (result.status !== 0) throw new Error(`Git 证据读取失败：${result.stderr.trim() || args[0]}`);
    return result.stdout.trim();
  };
  exact(['rev-parse', '--git-dir']);
  exact(['check-ref-format', `refs/heads/${branch}`]);
  const localRef = `refs/heads/${branch}`, remoteRef = `refs/remotes/origin/${branch}`;
  const tip = ref => {
    const result = git(['show-ref', '--verify', '--quiet', ref]);
    if (result.status === 1) return null;
    if (result.status !== 0) throw new Error(`无法核实分支引用：${ref}`);
    return exact(['rev-parse', '--verify', `${ref}^{commit}`]);
  };
  const localSha = tip(localRef), remoteSha = tip(remoteRef);
  let relation;
  if (!localSha && !remoteSha) relation = 'ABSENT';
  else if (!remoteSha) relation = 'LOCAL_ONLY';
  else if (!localSha) relation = 'REMOTE_ONLY';
  else if (localSha === remoteSha) relation = 'EQUAL';
  else {
    const ancestor = (older, newer) => {
      const result = git(['merge-base', '--is-ancestor', older, newer]);
      if (![0, 1].includes(result.status)) throw new Error('无法核实分支提交的祖先关系');
      return result.status === 0;
    };
    if (ancestor(remoteSha, localSha)) relation = 'LOCAL_AHEAD';
    else if (ancestor(localSha, remoteSha)) relation = 'REMOTE_AHEAD';
    else if (exact(['rev-parse', '--is-shallow-repository']) === 'true') {
      throw new Error('浅克隆缺少完整祖先证据，不能判定分叉');
    } else relation = 'DIVERGED';
  }
  return { branch, localRef, remoteRef, localSha, remoteSha, relation };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    process.stdout.write(JSON.stringify(inspectBranchRefs(JSON.parse(input))) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error.message }) + '\n');
    process.exitCode = 1;
  }
}
