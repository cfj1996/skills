#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCliPlan, requireText } from './workflow-runtime.mjs';
import { collectLocalOccupancy } from './collect-local-occupancy.mjs';

const exec = promisify(execFile);
const BASELINE = new Set(['main', 'master', 'develop', 'dev']);
const under = (path, parent) => {
  const rel = relative(resolve(parent), resolve(path));
  return !rel || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function parseWorktrees(value) {
  return value.split('\0\0').filter(Boolean).map(block => {
    const row = {};
    for (const field of block.split('\0').filter(Boolean)) {
      const index = field.indexOf(' ');
      row[index < 0 ? field : field.slice(0, index)] = index < 0 ? true : field.slice(index + 1);
    }
    return { path: row.worktree, branch: row.branch?.replace(/^refs\/heads\//, ''),
      locked: Object.hasOwn(row, 'locked'), prunable: Object.hasOwn(row, 'prunable'), head: row.HEAD };
  });
}

function evidenceFor(input, branch, path, now) {
  const found = (input.occupancyEvidence || []).find(item => item.branch === branch && (item.path || null) === path);
  if (!found || !Number.isFinite(found.checkedAt) || now - found.checkedAt < 0 || now - found.checkedAt > 60000 || !found.source) {
    return { task: 'UNKNOWN', process: 'UNKNOWN', needed: 'UNKNOWN' };
  }
  if (found.scopeComplete !== true) return {
    task: found.task === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN', process: found.process === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN',
    needed: found.needed === true ? true : 'UNKNOWN',
  };
  return { task: found.task, process: found.process, needed: found.needed };
}

function validBranch(branch) {
  return typeof branch === 'string' && /^(feature|fixbug|merge)\/[^\s]+$/.test(branch) &&
    !/[~^:?*\[\\]/.test(branch) && !branch.includes('..') && !branch.includes('@{') && !branch.includes('//');
}

export async function checkLocalCloseout(input, io = {}) {
  if (input.execute) throw new Error('预检执行器只有只读模式，不接受删除执行');
  const delivery = input.delivery;
  if (!delivery || delivery.state !== 'MERGED' || delivery.mergeReadback !== true || delivery.containment !== true ||
      delivery.defaultTargetVerified !== true || !['master', 'main'].includes(delivery.targetBranch)) {
    return { state: 'NOT_TRIGGERED', resources: [], candidates: [], readOnly: true, reason: '默认分支交付尚未核实' };
  }
  for (const key of ['repositoryPath', 'originUrl', 'currentTaskPath']) requireText(input[key], key);
  if (!delivery.repositoryPath || resolve(delivery.repositoryPath) !== resolve(input.repositoryPath) || delivery.originUrl !== input.originUrl) {
    throw new Error('交付证据不属于本次核验仓库');
  }
  if (!validBranch(delivery.sourceBranch) || !/^(feature|fixbug)\//.test(delivery.sourceBranch)) throw new Error('原始开发分支无效');
  const git = io.git || (async (cwd, args) => {
    try { const result = await exec('git', args, { cwd, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      return { code: 0, stdout: result.stdout }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '' }; }
  });
  const checked = async (cwd, args) => {
    const result = await git(cwd, args);
    if (result.code !== 0) throw new Error(`本地只读检查失败：${args[0]}`);
    return result.stdout;
  };
  const scoped = [{ branch: delivery.sourceBranch, targetBranch: delivery.targetBranch, verified: true }];
  for (const extra of input.relatedBranches || []) {
    if (!validBranch(extra.branch) || !['master', 'main', 'develop', 'dev'].includes(extra.targetBranch)) throw new Error('关联分支或核验目标无效');
    if (scoped.some(row => row.branch === extra.branch)) throw new Error('关联分支重复');
    scoped.push({ branch: extra.branch, targetBranch: extra.targetBranch,
      verified: extra.association?.state === 'MERGED' && extra.association?.sourceBranch === extra.branch &&
        extra.association?.targetBranch === extra.targetBranch && /^\d+$/.test(String(extra.association?.mrIid || '')) &&
        extra.association?.repositoryPath === input.repositoryPath && extra.association?.originUrl === input.originUrl });
  }
  const root = resolve(input.repositoryPath);
  const result = { state: 'UNAVAILABLE', resources: [], candidates: [], readOnly: true };
  try {
    const [actualRoot, origin, currentBranch, worktreeText] = await Promise.all([
      checked(root, ['rev-parse', '--show-toplevel']), checked(root, ['remote', 'get-url', 'origin']),
      checked(root, ['branch', '--show-current']), checked(root, ['worktree', 'list', '--porcelain', '-z']),
    ]);
    if (resolve(actualRoot.trim()) !== root || origin.trim() !== input.originUrl) throw new Error('仓库路径或 origin 已变化');
    result.currentBranch = currentBranch.trim();
    const worktrees = parseWorktrees(worktreeText);
    if (worktrees.some(tree => !tree.path)) throw new Error('worktree 列表不可解析');
    const targets = [...new Set(scoped.filter(row => row.verified).map(row => row.targetBranch))];
    await checked(root, ['fetch', '--no-tags', 'origin', ...targets.map(branch =>
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`)]);
    const refs = new Map((await checked(root, ['for-each-ref', '--format=%(refname)%09%(objectname)',
      ...scoped.filter(row => row.verified).map(row => `refs/heads/${row.branch}`),
      ...targets.map(branch => `refs/remotes/origin/${branch}`)])).trim().split('\n').filter(Boolean).map(line => line.split('\t')));
    if (!input.occupancyEvidence) {
      const resources = scoped.filter(row => row.verified).flatMap(row => {
        const trees = worktrees.filter(tree => tree.branch === row.branch);
        return (trees.length ? trees : [{ path: null }]).map(tree => ({ branch: row.branch, path: tree.path }));
      });
      input = { ...input, occupancyEvidence: await (io.collectOccupancy || collectLocalOccupancy)(resources, input, io) };
      result.occupancySource = 'AUTOMATIC';
    }
    const now = (io.now || Date.now)();
    const protectedPaths = [input.currentTaskPath, io.cwd || process.cwd()];
    const inspect = async row => {
      const base = { branch: row.branch, targetBranch: row.targetBranch, path: null, disposition: 'VERIFY', reasons: [] };
      if (!row.verified) return [{ ...base, reasons: ['缺少本次交付关联证据'] }];
      const trees = worktrees.filter(tree => tree.branch === row.branch);
      const tip = refs.get(`refs/heads/${row.branch}`), target = refs.get(`refs/remotes/origin/${row.targetBranch}`);
      if (!tip && !trees.length) return [{ ...base, disposition: 'ABSENT', reasons: ['本地分支和关联 worktree 均不存在'] }];
      if (!tip || !target) return [{ ...base, reasons: ['分支或目标 ref 未能读取'] }];
      const ancestry = await git(root, ['merge-base', '--is-ancestor', tip, target]);
      return Promise.all((trees.length ? trees : [{ path: null }]).map(async tree => {
        const resource = { ...base, path: tree.path, tip, targetSha: target, contained: ancestry.code === 0,
          dirty: false, ignoredPaths: [], occupancy: evidenceFor(input, row.branch, tree.path, now), reasons: [] };
        let partial = false;
        if (BASELINE.has(row.branch) || row.branch === result.currentBranch ||
            (tree.path && protectedPaths.some(path => under(path, tree.path)))) resource.reasons.push('当前分支或当前工作位置需保留');
        if (tree.locked) resource.reasons.push('worktree 已锁定');
        if (tree.prunable) { partial = true; resource.reasons.push('worktree 注册已失效，不能当成空目录'); }
        if (tree.path && !tree.prunable) {
          try {
            const [status, ignored] = await Promise.all([
              checked(tree.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
              checked(tree.path, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--no-empty-directory', '-z']),
            ]);
            resource.dirty = Boolean(status);
            resource.untracked = status.split('\0').some(line => line.startsWith('?? '));
            resource.ignoredPaths = ignored.split('\0').filter(Boolean);
            if (resource.dirty) resource.reasons.push('存在未提交或未跟踪内容');
            const unknownIgnored = resource.ignoredPaths.filter(path =>
              !(input.disposableIgnoredPaths || []).some(prefix => path === prefix || path.startsWith(prefix.replace(/\/$/, '') + '/')));
            if (unknownIgnored.length) {
              partial = true;
              resource.reasons.push('忽略数据未声明为可丢弃，需核实或保留');
            }
          } catch { partial = true; resource.reasons.push('worktree 状态或忽略数据读取失败'); }
        }
        if (resource.occupancy.task === 'ACTIVE' || resource.occupancy.process === 'ACTIVE' || resource.occupancy.needed === true) {
          resource.reasons.push('任务/进程仍在使用或后续工作仍需要');
        }
        const idle = resource.occupancy.task === 'IDLE' && resource.occupancy.process === 'IDLE' && resource.occupancy.needed === false;
        if (!idle && !resource.reasons.some(reason => reason.includes('仍在使用'))) {
          partial = true; resource.reasons.push('任务或进程空闲证据不足');
        }
        if (ancestry.code !== 0) {
          partial = true; resource.reasons.push(ancestry.code === 1 ? '完整本地 tip 未证实已交付，包含 squash/cherry-pick 时需核实' : '包含关系查询失败');
        }
        const retain = resource.reasons.some(reason => /当前|锁定|未提交|未跟踪|仍在使用/.test(reason));
        resource.disposition = retain ? 'RETAIN' : partial ? 'VERIFY' : 'CANDIDATE';
        resource.partial = partial;
        return resource;
      }));
    };
    result.resources = (await Promise.all(scoped.map(inspect))).flat();
    result.candidates = result.resources.filter(row => row.disposition === 'CANDIDATE');
    result.state = result.resources.some(row => row.partial || row.disposition === 'VERIFY') ? 'PARTIAL' : 'CHECKED';
    result.cleanupState = result.state !== 'CHECKED' ? 'BLOCKED' : result.candidates.length ? 'AWAITING_CONFIRMATION' : 'NO_CANDIDATE';
    return result;
  } catch (error) { return { ...result, state: 'UNAVAILABLE', cleanupState: 'BLOCKED', error: error.message }; }
}

async function main() {
  const result = await checkLocalCloseout(await readCliPlan());
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('无法读取只读预检计划\n'); process.exitCode = 1; });
}
