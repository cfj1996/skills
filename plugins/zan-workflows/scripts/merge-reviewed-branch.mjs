#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFor } from './mcp-client.mjs';
import { pollState, progressToStderr, readCliPlan, readTool, repositoryKey, requireText, validateWait } from './workflow-runtime.mjs';

const run = promisify(execFile);
const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;

async function checkRepository(input) {
  const [root, origin] = await Promise.all([
    run('git', ['rev-parse', '--show-toplevel'], { cwd: input.repositoryPath }),
    run('git', ['remote', 'get-url', 'origin'], { cwd: input.repositoryPath }),
  ]);
  if (resolve(root.stdout.trim()) !== resolve(input.repositoryPath) || origin.stdout.trim() !== input.originUrl) {
    throw new Error('本地仓库路径或 origin 与确认计划不一致');
  }
}

async function containsSource(input) {
  try {
    await run('git', ['fetch', '--no-tags', 'origin',
      `+refs/heads/${input.targetBranch}:refs/remotes/origin/${input.targetBranch}`], { cwd: input.repositoryPath });
    await run('git', ['merge-base', '--is-ancestor', input.sourceSha, `refs/remotes/origin/${input.targetBranch}`], {
      cwd: input.repositoryPath,
    });
    const target = await run('git', ['rev-parse', `refs/remotes/origin/${input.targetBranch}`], { cwd: input.repositoryPath });
    return { contained: true, targetSha: target.stdout.trim() };
  } catch { throw new Error('远端目标分支的 source SHA 包含关系未能验证'); }
}

function bindMr(mr, input, allowMissingSha = false) {
  if (!mr || !mr.iid || mr.source_branch !== input.sourceBranch || mr.target_branch !== input.targetBranch) {
    throw new Error('MR 身份或源/目标分支与计划不一致');
  }
  if (mr.source_project_id !== undefined && mr.target_project_id !== undefined &&
      String(mr.source_project_id) !== String(mr.target_project_id)) throw new Error('不支持跨仓替代原始分支');
  const sha = mr.sha || mr.diff_refs?.head_sha;
  if (!sha && allowMissingSha) return false;
  if (sha !== input.sourceSha) throw new Error('MR source SHA 已变化');
  return true;
}

function mergeState(mr, input) {
  if (!bindMr(mr, input, ['checking', 'unchecked', 'preparing'].includes(mr?.detailed_merge_status || mr?.merge_status))) {
    return { state: 'MR_PREPARING' };
  }
  if (mr.state === 'merged') return { state: 'MERGED', done: true };
  if (mr.state !== 'opened') return { state: mr.state || 'UNKNOWN', error: 'MR 不处于打开状态' };
  if (mr.draft || mr.work_in_progress) return { state: 'DRAFT', error: 'MR 仍是草稿，需要实际决策' };
  const detail = mr.detailed_merge_status;
  if (mr.has_conflicts || detail === 'conflict') return { state: 'CONFLICT', error: 'MR 冲突，停止并转入单独确认的冲突流程' };
  if (mr.blocking_discussions_resolved === false || ['not_approved', 'discussions_not_resolved', 'need_rebase', 'blocked_status', 'status_checks_must_pass'].includes(detail)) {
    return { state: detail || 'DISCUSSION', error: 'MR 存在未满足的审批、讨论或合并条件' };
  }
  const pipeline = mr.head_pipeline || mr.pipeline;
  if (pipeline && ['failed', 'canceled', 'manual'].includes(pipeline.status)) {
    return { state: `CI_${pipeline.status}`, error: '当前 MR 的 CI 失败、取消或需要人工操作' };
  }
  if (pipeline && !['success', 'skipped'].includes(pipeline.status)) return { state: `CI_${pipeline.status || 'pending'}` };
  if (input.pipelineRequired && (!pipeline || pipeline.status !== 'success')) {
    if (['checking', 'unchecked', 'preparing'].includes(detail || mr.merge_status)) return { state: 'CI_PREPARING' };
    return { state: 'CI_MISSING', error: '项目要求 CI，但没有成功的当前 MR 流水线' };
  }
  if (detail === 'mergeable' || mr.merge_status === 'can_be_merged') return { state: 'READY', done: true };
  if (['checking', 'unchecked', 'preparing', 'ci_still_running', 'ci_must_pass'].includes(detail || mr.merge_status)) {
    return { state: detail || mr.merge_status };
  }
  return { state: detail || mr.merge_status || 'UNKNOWN', error: '合并条件不可验证，停止而不是尝试合并' };
}

function checkApprovals(value) {
  if (!value || !Array.isArray(value.rules)) throw new Error('审批规则不可验证');
  if (value.rules.some(rule => !Number.isSafeInteger(Number(rule.approvals_required)) || Number(rule.approvals_required) < 0)) {
    throw new Error('审批规则缺少明确的审批数量');
  }
  if (value.rules.some(rule => Number(rule.approvals_required) > 0 && rule.approved !== true)) {
    throw new Error('MR 需要的审批尚未完成');
  }
}

export async function mergeReviewedBranch(call, input, io = {}) {
  validateWait(io);
  for (const key of ['projectId', 'repositoryPath', 'originUrl', 'sourceBranch', 'targetBranch', 'purpose']) requireText(input[key], key);
  if (!/^(feature|fixbug)\/[^\s]+$/.test(input.sourceBranch) || !['develop', 'dev', 'master', 'main'].includes(input.targetBranch)) {
    throw new Error('只能合并原始 feature/fixbug 分支；禁止 develop/dev 到 master 或替代分支');
  }
  if (input.reviewPassed !== true || typeof input.pipelineRequired !== 'boolean') throw new Error('缺少当前变更评审或 CI 策略');
  if (input.execute && (input.confirmed !== true || !SHA.test(input.sourceSha || '') || !SHA.test(input.targetSha || ''))) {
    throw new Error('执行必须有当前清单确认及固定 source/target SHA');
  }
  await (io.checkRepository || checkRepository)(input);
  const projectArgs = { project_id: input.projectId };
  const [source, target, project, candidates] = await Promise.all([
    readTool(call, 'get_branch', { ...projectArgs, branch_name: input.sourceBranch }),
    readTool(call, 'get_branch', { ...projectArgs, branch_name: input.targetBranch }),
    readTool(call, 'get_project', projectArgs),
    input.mrIid
      ? readTool(call, 'get_merge_request', { ...projectArgs, merge_request_iid: String(input.mrIid) }).then(mr => [mr])
      : readTool(call, 'list_merge_requests', { ...projectArgs, source_branch: input.sourceBranch,
        target_branch: input.targetBranch, state: 'opened', per_page: 2, page: 1 }),
  ]);
  if (!SHA.test(source?.commit?.id || '') || !SHA.test(target?.commit?.id || '') || !Array.isArray(candidates)) {
    throw new Error('分支或 MR 查询不可识别');
  }
  if (![project?.ssh_url_to_repo, project?.http_url_to_repo].filter(Boolean).some(url => repositoryKey(url) === repositoryKey(input.originUrl))) {
    throw new Error('GitLab 项目与确认的源码仓库不一致');
  }
  if (input.targetBranch === 'main' && project.default_branch !== 'main') throw new Error('main 未验证为实际默认分支');
  const plan = { ...input, pipelineRequired: input.pipelineRequired || project.only_allow_merge_if_pipeline_succeeds === true,
    sourceSha: input.sourceSha || source.commit.id, targetSha: input.targetSha || target.commit.id };
  if (source.commit.id !== plan.sourceSha) throw new Error('源分支 SHA 已变化');
  if (candidates.length > 1) throw new Error('同一源/目标有多个打开 MR，停止自动选择');
  let mr = candidates[0];
  if (mr) {
    // List results omit readiness fields; use the exact IID once after discovery.
    if (!input.mrIid) mr = await readTool(call, 'get_merge_request', { ...projectArgs, merge_request_iid: String(mr.iid) });
    bindMr(mr, plan);
  }
  if (target.commit.id !== plan.targetSha && mr?.state !== 'merged') throw new Error('目标分支 SHA 已变化');
  if (!mr) requireText(input.title, '新 MR 标题');
  if (!input.execute) return {
    ...plan, execute: false, confirmed: false, state: 'AWAITING_CONFIRMATION',
    mrIid: mr ? String(mr.iid) : null, mrUrl: mr?.web_url || null,
    operation: mr ? 'REUSE_AND_MERGE' : 'CREATE_AND_MERGE', writes: 0,
  };
  const result = { state: 'BLOCKED', projectId: input.projectId, repositoryPath: input.repositoryPath,
    originUrl: input.originUrl, sourceBranch: input.sourceBranch,
    targetBranch: input.targetBranch, sourceSha: plan.sourceSha, mrIid: mr ? String(mr.iid) : null,
    mrUrl: mr?.web_url || null, mergeReadback: false, containment: false, writes: 0 };
  let phase = 'CREATE_MR';
  try {
    if (!mr) {
      mr = await readTool(call, 'create_merge_request', { ...projectArgs, source_branch: input.sourceBranch,
        target_branch: input.targetBranch, title: input.title, description: input.description || '',
        remove_source_branch: false, squash: false, draft: false, _confirmed: true });
      result.writes++;
      result.mrIid = mr?.iid ? String(mr.iid) : null;
      result.mrUrl = mr?.web_url || null;
      bindMr(mr, plan, true);
      io.onProgress?.({ state: 'MR_CREATED', mrIid: result.mrIid, mrUrl: result.mrUrl });
    }
    const mrArgs = { ...projectArgs, merge_request_iid: String(mr.iid) };
    phase = 'WAIT_MR';
    mr = await pollState(() => readTool(call, 'get_merge_request', mrArgs),
      value => mergeState(value, plan), io);
    if (mr.state !== 'merged') {
      phase = 'CHECK_MERGE';
      const [freshSource, freshTarget, approvals] = await Promise.all([
        readTool(call, 'get_branch', { ...projectArgs, branch_name: input.sourceBranch }),
        readTool(call, 'get_branch', { ...projectArgs, branch_name: input.targetBranch }),
        readTool(call, 'get_merge_request_approval_state', mrArgs),
      ]);
      if (freshSource?.commit?.id !== plan.sourceSha || freshTarget?.commit?.id !== plan.targetSha) {
        throw new Error('合并前 source/target SHA 已变化，需要更新清单');
      }
      checkApprovals(approvals);
      await (io.checkRepository || checkRepository)(input);
      phase = 'MERGE_MR';
      await readTool(call, 'merge_merge_request', { ...mrArgs, sha: plan.sourceSha, auto_merge: false,
        should_remove_source_branch: false, squash: false, _confirmed: true });
      result.writes++;
    }
    phase = 'READ_MERGE';
    const merged = await readTool(call, 'get_merge_request', mrArgs);
    bindMr(merged, plan);
    if (merged.state !== 'merged') throw new Error('MR 未读回 merged；不能把排队自动合并当作完成');
    result.mergeReadback = true;
    phase = 'VERIFY_CONTAINMENT';
    const proof = await (io.containsSource || containsSource)(plan);
    if (proof?.contained !== true || !SHA.test(proof.targetSha || '')) throw new Error('源提交未验证包含在目标分支');
    result.containment = true;
    return { ...result, state: 'MERGED', observedTargetSha: proof.targetSha,
      defaultBranch: project.default_branch, defaultTargetVerified: project.default_branch === input.targetBranch,
      deliveredSha: merged.merge_commit_sha || plan.sourceSha, mergeCommitSha: merged.merge_commit_sha || null };
  } catch (error) {
    error.result = { ...result, phase, error: error.message };
    throw error;
  }
}

async function main() {
  const input = await readCliPlan();
  const client = clientFor('gitlab-mcp');
  try {
    await client.initialize();
    client.requireTools(['get_branch', 'get_project', 'get_merge_request', 'list_merge_requests',
      ...(input.execute ? ['create_merge_request', 'merge_merge_request', 'get_merge_request_approval_state'] : [])]);
    const result = await mergeReviewedBranch((name, args) => client.call(name, args), input, {
      maxWaitMs: input.maxWaitMs, onProgress: progressToStderr,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify(error.result || { state: 'BLOCKED', error: error.message, writes: 0 }, null, 2) + '\n');
    process.exitCode = 1;
  } finally { client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('无法读取合并计划或启动执行器\n'); process.exitCode = 1; });
}
