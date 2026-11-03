import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { checkCommitReadiness } from './check-commit-readiness.mjs';
import { checkMockSafetySet } from './mock-safety.mjs';
import { runScopedCommand, sha256, stableJson } from './workflow-runtime.mjs';

const git = async (merge, args, io, extra = {}) => (await runScopedCommand('git',
  ['--literal-pathspecs', ...args], { cwd: merge.repositoryPath, timeout: 30000,
    maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...extra }, io)).stdout;
const paths = output => output.split('\0').filter(Boolean).sort();
const same = (left, right) => stableJson(left) === stableJson(right);
function planFormatHash(data) {
  // Only table padding and separator length in a reviewed Plan may change in a hook.
  let fence = false;
  return sha256(data.toString('utf8').split('\n').map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) fence = !fence;
    if (fence || !/^\|.*\|$/.test(line)) return line;
    return line.split('|').map(cell => cell.trim().replace(/^(:?)-{3,}(:?)$/, '$1---$2')).join('|');
  }).join('\n'));
}
async function branchState(merge, io) {
  const [root, branch, origin, pushUrls, head, unmerged] = await Promise.all([
    ['rev-parse', '--show-toplevel'], ['symbolic-ref', '--short', 'HEAD'], ['remote', 'get-url', 'origin'],
    ['remote', 'get-url', '--push', '--all', 'origin'], ['rev-parse', 'HEAD'], ['ls-files', '-u', '-z'],
  ].map(args => git(merge, args, io)));
  if (await realpath(root.trim()) !== await realpath(merge.repositoryPath) || branch.trim() !== merge.sourceBranch ||
      !/^(feature|fixbug)\/[^\s]+$/.test(merge.sourceBranch) || origin.trim() !== merge.originUrl ||
      pushUrls.trim() !== merge.originUrl || unmerged) throw new Error('提交工作树、原分支、origin 或冲突状态不符合清单');
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const path = (await git(merge, ['rev-parse', '--git-path', marker], io)).trim();
    if (await lstat(resolve(merge.repositoryPath, path)).then(() => true, error => {
      if (error.code === 'ENOENT') return false; throw error;
    })) throw new Error('仓库有未结束的 Git 操作，停止连续提交');
  }
  return head.trim();
}
async function remoteHead(merge, io) {
  const ref = 'refs/heads/' + merge.sourceBranch;
  const result = (await git(merge, ['ls-remote', '--refs', 'origin', ref], io)).trim();
  if (!result) return null;
  const [sha, name] = result.split('\t');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha) || name !== ref) throw new Error('远端原分支不可核实');
  return sha;
}
async function worktreeFiles(merge, io) {
  const [tracked, other] = await Promise.all([git(merge, ['diff', '--no-renames', '--name-only', '-z', 'HEAD', '--'], io),
    git(merge, ['ls-files', '--others', '--exclude-standard', '-z'], io)]);
  const files = Object.create(null), documents = new Set(merge.mockSafety?.nonRuntimePlanPaths || []);
  const root = await realpath(merge.repositoryPath);
  for (const path of [...new Set([...paths(tracked), ...paths(other)])].sort()) {
    const full = resolve(root, path);
    if (!full.startsWith(root + sep) || path.split('/').includes('..')) throw new Error('提交路径超出仓库');
    const stat = await lstat(full).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) { files[path] = null; continue; }
    if (!stat.isFile() || await realpath(full) !== full) throw new Error('连续提交仅支持已审的普通文件');
    const data = await readFile(full);
    files[path] = { sha256: sha256(data), mode: stat.mode & 0o111 ? '100755' : '100644',
      ...(documents.has(path) ? { formatHash: planFormatHash(data) } : {}) };
  }
  return files;
}
async function readiness(merge, local) {
  const result = await checkCommitReadiness({ repositoryPath: merge.repositoryPath, message: local.message });
  if (result.state !== 'READY' || local.requireCommitlint && result.messageValidation !== 'PASSED') {
    throw new Error(result.error || '提交 Hook 或项目必需的说明校验未就绪');
  }
}
export async function prepareSubmissionGit(merge, local, io) {
  if (local?.push !== true || typeof local.commit !== 'boolean' || !local.reviewedFiles ||
      Array.isArray(local.reviewedFiles) || typeof local.reviewedFiles !== 'object' ||
      local.commit && !local.message?.trim()) throw new Error('本地交付需明确 commit、push、已审文件内容和提交说明');
  const [head, remoteSha, files] = await Promise.all([branchState(merge, io), remoteHead(merge, io), worktreeFiles(merge, io)]);
  const reviewed = Object.fromEntries(Object.entries(files).map(([path, fact]) =>
    [path, fact && { sha256: fact.sha256, mode: fact.mode }]));
  if (head !== merge.sourceSha || !same(reviewed, local.reviewedFiles) ||
      Boolean(Object.keys(files).length) !== local.commit) throw new Error('当前 HEAD 或实际文件与已评审的提交范围不符');
  if (local.commit) await readiness(merge, local);
  return { ...local, head, remoteSha, files };
}

export async function executeSubmissionGit(merge, local, receipt, io) {
  const actual = await prepareSubmissionGit(merge, local, io);
  if (actual.remoteSha !== local.remoteSha || !same(actual.files, local.files)) throw new Error('提交或推送前原分支绑定已变化');
  const mockContext = { operation: 'git-delivery', purpose: merge.purpose, environmentKind: 'test',
    targetEnvironment: 'test', targetBranch: merge.targetBranch, sourceRepository: merge.originUrl };
  let sha = local.head;
  if (local.commit) {
    await checkMockSafetySet(merge, { ...mockContext, sourceSha: sha }, io);
    const names = Object.keys(local.files).sort();
    await git(merge, ['add', '-A', '--', ...names], io);
    const staged = paths(await git(merge, ['diff', '--cached', '--no-renames', '--name-only', '-z', '--'], io));
    if (!same(staged, names) || !same(await worktreeFiles(merge, io), local.files) ||
        await branchState(merge, io) !== sha) throw new Error('暂存后的实际差异已变化');
    for (const path of names) {
      const index = (await git(merge, ['ls-files', '--stage', '-z', '--', path], io)).split('\t')[0];
      const expected = local.files[path];
      if (!index && !expected) continue;
      if (!expected || !index.startsWith(expected.mode + ' ') ||
          sha256(await git(merge, ['show', ':' + path], io, { encoding: 'buffer' })) !== expected.sha256) {
        throw new Error('暂存内容与已审文件不符');
      }
    }
    receipt.phase = 'COMMIT';
    await git(merge, ['commit', '--file=-'], io, { stdin: local.message });
    sha = receipt.sourceSha = await branchState(merge, io);
    if ((await git(merge, ['show', '-s', '--format=%P', sha], io)).trim() !== local.head ||
        !same(paths(await git(merge, ['diff', '--no-renames', '--name-only', '-z', local.head, sha, '--'], io)), names)) {
      throw new Error('实际提交的父提交或文件范围发生变化，保留提交并暂停推送');
    }
    for (const path of names) {
      const entry = (await git(merge, ['ls-tree', '-z', sha, '--', path], io)).split('\t')[0];
      const expected = local.files[path];
      if (!expected && !entry) continue;
      if (!expected || !entry.startsWith(expected.mode + ' blob ')) throw new Error('提交改变了已审文件类型');
      const data = await git(merge, ['show', sha + ':' + path], io, { encoding: 'buffer' });
      if (sha256(data) !== expected.sha256 && (!expected.formatHash || planFormatHash(data) !== expected.formatHash)) {
        throw new Error('Hook 改变了已审内容，保留提交并暂停推送');
      }
    }
  }
  if (Object.keys(await worktreeFiles(merge, io)).length || await branchState(merge, io) !== sha ||
      await remoteHead(merge, io) !== local.remoteSha) throw new Error('推送前源码、工作区或远端原分支发生变化');
  await checkMockSafetySet(merge, { ...mockContext, sourceSha: sha, requireCommitted: true }, io);
  if (local.remoteSha !== sha) {
    receipt.phase = 'PUSH';
    await git(merge, ['-c', 'push.autoSetupRemote=false', 'push', '--no-follow-tags', '--recurse-submodules=no',
      'origin', sha + ':refs/heads/' + merge.sourceBranch], io);
    if (await remoteHead(merge, io) !== sha) throw new Error('推送后没有读回批准的原分支 SHA');
  }
  Object.assign(receipt, { state: 'VERIFIED', sourceSha: sha });
  return sha;
}
