#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFor } from './mcp-client.mjs';
import { verifyMergeApprovals } from './gitlab-approvals.mjs';
import { checkMockSafetySet, mockSafetyPreview } from './mock-safety.mjs';
import { deliveryTargetKind, isBranchName, isTestBranch } from './branch-roles.mjs';
import { pollState, progressToStderr, readCliPlan, readTool, repositoryKey, requireText, toolData, validateWait, runScopedCommand } from './workflow-runtime.mjs';

const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;

async function checkRepository(input, io = {}) {
  const run = (command, args, options) => runScopedCommand(command, args, { timeout: 30000, ...options }, io);
  const [root, origin] = await Promise.all([
    run('git', ['rev-parse', '--show-toplevel'], { cwd: input.repositoryPath }),
    run('git', ['remote', 'get-url', 'origin'], { cwd: input.repositoryPath }),
  ]);
  if (resolve(root.stdout.trim()) !== resolve(input.repositoryPath) || origin.stdout.trim() !== input.originUrl) {
    throw new Error('本地仓库路径或 origin 与确认计划不一致');
  }
}

export async function inspectTargetContainment(input, io = {}) {
  const run = (command, args, options) => runScopedCommand(command, args, { timeout: 30000, ...options }, io);
  try {
    await run('git', ['fetch', '--no-tags', 'origin',
      `+refs/heads/${input.targetBranch}:refs/remotes/origin/${input.targetBranch}`], { cwd: input.repositoryPath });
    const target = await run('git', ['rev-parse', `refs/remotes/origin/${input.targetBranch}`], { cwd: input.repositoryPath });
    const targetSha = target.stdout.trim();
    try {
      const historicalSha = input.mergeMode === 'CONTAINMENT_ONLY' ? input.expectedDeliveredSha : undefined;
      const ancestry = historicalSha
        ? [[input.sourceSha, historicalSha], [historicalSha, targetSha]]
        : [...new Set([input.sourceSha, input.expectedDeliveredSha].filter(Boolean))].map(revision => [revision, targetSha]);
      for (const [ancestor, descendant] of ancestry) {
        await run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: input.repositoryPath });
      }
      return { contained: true, targetSha };
    } catch (error) {
      if (error.code === 1) {
        const shallow = await run('git', ['rev-parse', '--is-shallow-repository'], { cwd: input.repositoryPath });
        if (shallow.stdout.trim() === 'true') throw new Error('浅克隆无法排除缺失的祖先关系');
        return { contained: false, targetSha };
      }
      throw error;
    }
  } catch { throw new Error('远端目标分支的 source SHA 包含关系未能验证'); }
}

async function containsSource(input, io) {
  const proof = await inspectTargetContainment(input, io);
  if (!proof.contained) throw new Error('远端目标分支的 source SHA 包含关系未能验证');
  return proof;
}

async function testTargetReceipt(input, targetSha, io) {
  const deliveredSha = input.expectedDeliveredSha ?? targetSha;
  const proof = input.sourceSha === targetSha && deliveredSha === targetSha ? { contained: true, targetSha }
    : await (io.inspectContainment || inspectTargetContainment)(input, io);
  if (typeof proof?.contained !== 'boolean' || !SHA.test(proof.targetSha || '')) {
    throw new Error('测试分支包含关系不可核实');
  }
  if (proof.targetSha !== targetSha) throw new Error('包含关系核验时目标分支 SHA 已变化，需要更新清单');
  if (!proof.contained) return null;
  return { state: 'VERIFIED', operation: 'VERIFY_CONTAINMENT_ONLY', projectId: input.projectId,
    repositoryPath: input.repositoryPath, originUrl: input.originUrl,
    sourceBranch: input.sourceBranch, targetBranch: input.targetBranch, sourceSha: input.sourceSha,
    defaultBranch: input.defaultBranch, defaultTargetVerified: false, testTargetVerified: true,
    targetSha, observedTargetSha: targetSha, deliveredSha, containment: true,
    mrIid: null, mrUrl: null, mergeReadback: false, mergeCommitSha: null, writes: 0 };
}

function bindMr(mr, input, allowMissingSha = false) {
  if (!mr || !mr.iid || (input.mrIid && String(mr.iid) !== String(input.mrIid)) ||
      mr.source_branch !== input.sourceBranch || mr.target_branch !== input.targetBranch) {
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
  if (mr.has_conflicts || detail === 'conflict') {
    return { state: 'CONFLICT', error: '原 MR 存在冲突。核对本次执行上下文的 A → C → B 范围，已覆盖时直接续办',
      code: 'MR_CONFLICT' };
  }
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
  if (detail === 'mergeable' || !detail && mr.merge_status === 'can_be_merged') return { state: 'READY', done: true };
  if (['checking', 'unchecked', 'preparing', 'ci_still_running', 'ci_must_pass'].includes(detail || mr.merge_status)) {
    return { state: detail || mr.merge_status };
  }
  return { state: detail || mr.merge_status || 'UNKNOWN', error: '合并条件不可验证，停止而不是尝试合并' };
}

function mergeMode(input) {
  const mode = input.mergeMode ?? 'AUTO';
  if (!['AUTO', 'MANUAL', 'VERIFY_ONLY', 'CONTAINMENT_ONLY'].includes(mode)) throw new Error('合并模式无效');
  if (mode === 'VERIFY_ONLY' && (input.execute || !/^[1-9]\d*$/.test(String(input.mrIid)) || !SHA.test(input.sourceSha || ''))) {
    throw new Error('人工合并核验必须只读并绑定原 MR IID 和 source SHA');
  }
  if (mode === 'CONTAINMENT_ONLY' && (input.execute || input.mrIid ||
      !isTestBranch(input.targetBranch, input.testBranch) || !SHA.test(input.sourceSha || ''))) {
    throw new Error('只读包含关系核验必须绑定测试分支和已评审 source SHA，不能执行 MR 写入');
  }
  if (input.expectedDeliveredSha !== undefined &&
      (!['VERIFY_ONLY', 'CONTAINMENT_ONLY'].includes(mode) || !SHA.test(input.expectedDeliveredSha))) {
    throw new Error('固定历史交付 SHA 只适用于原 MR 或测试分支包含关系的只读核验');
  }
  return mode;
}

function verifyDefaultBranch(project, expected) {
  if (expected !== undefined && project.default_branch !== expected) {
    throw new Error(`未验证为实际默认分支 ${expected}，远端默认分支已变化，需要更新清单`);
  }
}

export function mergeRequiredTools(input) {
  const mode = mergeMode(input);
  if (mode === 'CONTAINMENT_ONLY') return ['get_branch', 'get_project'];
  return ['get_branch', 'get_project', 'get_merge_request', 'list_merge_requests',
    ...(input.execute && !input.mrIid ? ['create_merge_request'] : []),
    ...(input.execute && mode === 'AUTO' ? ['merge_merge_request', 'get_merge_request_approval_state'] : [])];
}

function permissionDenied(error) {
  return [error?.httpStatus, error?.status, error?.statusCode].some(value => Number(value) === 403) ||
    /\bHTTP\s+403\b|\b403\b.{0,80}\bForbidden\b|\bnot allowed to merge\b/i.test(error?.message || '');
}

async function requestMerge(call, args) {
  const raw = await call('merge_merge_request', args);
  if (raw?.isError) {
    const detail = (raw.content || []).filter(row => row.type === 'text').map(row => row.text).join('\n');
    if (permissionDenied({ ...raw, message: detail })) {
      const error = new Error('当前账号没有合并权限');
      error.httpStatus = 403;
      throw error;
    }
  }
  return toolData(raw, 'merge_merge_request');
}

function awaitingMerge(result, plan, mr, reason) {
  bindMr(mr, { ...plan, mrIid: result.mrIid });
  if (mr.state !== 'opened') throw new Error('待人工合并的 MR 不处于打开状态');
  const readiness = mergeState(mr, plan);
  if (readiness.error) throw new Error(readiness.error);
  requireText(mr.web_url, '待人工合并 MR 链接');
  const resumePrompt = plan.targetBranch === plan.defaultBranch ? '已合并，继续上线' : '已合并，继续交付';
  const explanation = reason === 'MERGE_PERMISSION_DENIED' ? '当前账号没有合并权限。'
    : reason === 'MANUAL_MERGE_PENDING' ? 'MR 仍未合并。' : '本次采用人工合并。';
  return { ...result, state: 'AWAITING_MERGE', phase: 'WAIT_MANUAL_MERGE', mrUrl: mr.web_url,
    reason, targetSha: plan.targetSha, readiness: readiness.state,
    userAction: { type: 'CONTACT_MERGER', resumePrompt,
      message: `${explanation}请联系有权限的同事审核并将 ${plan.sourceBranch} 合并到 ${plan.targetBranch}。`
        + `\nMR：[查看 MR](${mr.web_url})\n合并完成后，回复“${resumePrompt}”。` },
    resumePlan: { ...plan, mrIid: result.mrIid, mergeMode: 'VERIFY_ONLY', execute: false, confirmed: false } };
}

async function conflictOwner(call, plan, result) {
  if (result.writes > 0) return 'CURRENT_OPERATOR';
  try {
    const [current, original] = await Promise.all([
      readTool(call, 'whoami', {}),
      readTool(call, 'get_merge_request', { project_id: plan.projectId, merge_request_iid: result.mrIid }),
    ]);
    bindMr(original, { ...plan, mrIid: result.mrIid });
    if (!current?.id || !original.author?.id) return 'UNVERIFIED';
    return String(current.id) === String(original.author.id) ? 'CURRENT_OPERATOR' : 'OTHER_OPERATOR';
  } catch {
    return 'UNVERIFIED';
  }
}

export async function mergeReviewedBranch(call, input, io = {}) {
  validateWait(io);
  const mode = mergeMode(input);
  for (const key of ['projectId', 'repositoryPath', 'originUrl', 'sourceBranch', 'targetBranch', 'purpose']) requireText(input[key], key);
  if (!/^(feature|fixbug)\//.test(input.sourceBranch) || !isBranchName(input.sourceBranch) || !isBranchName(input.targetBranch) ||
      input.sourceBranch === input.targetBranch || isTestBranch(input.sourceBranch, input.testBranch)) {
    throw new Error('合并需绑定原始 feature/fixbug 源分支和准确目标分支，提测分支不能作为原始开发分支');
  }
  if (input.reviewPassed !== true || typeof input.pipelineRequired !== 'boolean') throw new Error('缺少当前变更评审或 CI 策略');
  if (input.execute && (input.confirmed !== true || !SHA.test(input.sourceSha || '') || !SHA.test(input.targetSha || ''))) {
    throw new Error('执行必须有当前清单确认及固定 source/target SHA');
  }
  await (io.checkRepository || checkRepository)(input, io);
  const projectArgs = { project_id: input.projectId };
  const [target, project, candidates] = await Promise.all([
    readTool(call, 'get_branch', { ...projectArgs, branch_name: input.targetBranch }),
    readTool(call, 'get_project', projectArgs),
    mode === 'CONTAINMENT_ONLY' ? Promise.resolve([]) : input.mrIid
      ? readTool(call, 'get_merge_request', { ...projectArgs, merge_request_iid: String(input.mrIid) }).then(mr => [mr])
      : readTool(call, 'list_merge_requests', { ...projectArgs, source_branch: input.sourceBranch,
        target_branch: input.targetBranch, state: 'opened', per_page: 2, page: 1 }),
  ]);
  if (!SHA.test(target?.commit?.id || '') || (target.name !== undefined && target.name !== input.targetBranch) ||
      !Array.isArray(candidates)) {
    throw new Error('分支或 MR 查询不可识别');
  }
  if (![project?.ssh_url_to_repo, project?.http_url_to_repo].filter(Boolean).some(url => repositoryKey(url) === repositoryKey(input.originUrl))) {
    throw new Error('GitLab 项目与确认的源码仓库不一致');
  }
  verifyDefaultBranch(project, input.defaultBranch);
  const defaultBranch = project.default_branch;
  const targetKind = deliveryTargetKind(input, defaultBranch);
  const production = targetKind === 'production';
  if (input.sourceBranch === defaultBranch) throw new Error('远端默认分支不能作为原始开发分支');
  if (mode === 'CONTAINMENT_ONLY') {
    if (production) throw new Error('只读包含关系核验必须绑定提测分支');
    if (input.targetSha && input.targetSha !== target.commit.id) throw new Error('目标分支 SHA 已变化');
    const receipt = await testTargetReceipt({ ...input, defaultBranch }, target.commit.id, io);
    if (!receipt) throw new Error('测试分支尚未包含已评审变更；本轮未授权合并，不执行其他交付');
    return receipt;
  }
  if (candidates.length > 1) throw new Error('同一源/目标有多个打开 MR，停止自动选择');
  let mr = candidates[0];
  if (mr) {
    // List results omit readiness fields; use the exact IID once after discovery.
    if (!input.mrIid) mr = await readTool(call, 'get_merge_request', { ...projectArgs, merge_request_iid: String(mr.iid) });
  }
  // A maintainer may remove the source branch after merging. Exact MR SHA and
  // fetched target containment remain verifiable without that branch.
  const source = mode === 'VERIFY_ONLY' || mr?.state === 'merged' ? null
    : await readTool(call, 'get_branch', { ...projectArgs, branch_name: input.sourceBranch });
  const plan = { ...input, mergeMode: mode, defaultBranch,
    pipelineRequired: input.pipelineRequired || project.only_allow_merge_if_pipeline_succeeds === true,
    sourceSha: input.sourceSha || source?.commit?.id, targetSha: input.targetSha || target.commit.id };
  if (!SHA.test(plan.sourceSha || '') || (source && source.commit?.id !== plan.sourceSha)) throw new Error('源分支 SHA 已变化或不可识别');
  if (mr) bindMr(mr, plan);
  if (mode === 'VERIFY_ONLY' && !mr) throw new Error('原 MR 未能读回；不会重新创建');
  if (mode !== 'VERIFY_ONLY' && target.commit.id !== plan.targetSha && mr?.state !== 'merged') throw new Error('目标分支 SHA 已变化');
  if (!mr && !production) {
    const receipt = await testTargetReceipt(plan, target.commit.id, io);
    if (receipt) return receipt;
  }
  const mockContext = { operation: 'git-delivery', purpose: input.purpose, environmentKind: targetKind,
    targetEnvironment: production ? 'production' : (input.targetEnvironment || 'test'),
    targetBranch: input.targetBranch, sourceRepository: input.originUrl, sourceSha: plan.sourceSha, requireCommitted: true };
  const mockSafetyReceipts = input.execute && mode !== 'VERIFY_ONLY' ? await checkMockSafetySet(input, mockContext, io) : null;
  if (!mr) requireText(input.title, '新 MR 标题');
  if (!input.execute && mode !== 'VERIFY_ONLY') return {
    ...plan, ...mockSafetyPreview(input, production), execute: false, confirmed: false, state: 'AWAITING_CONFIRMATION',
    mrIid: mr ? String(mr.iid) : null, mrUrl: mr?.web_url || null,
    operation: mode === 'MANUAL' ? (mr ? 'REUSE_FOR_MANUAL_MERGE' : 'CREATE_FOR_MANUAL_MERGE')
      : mr ? 'REUSE_AND_MERGE' : 'CREATE_AND_MERGE', writes: 0,
  };
  const result = { state: 'BLOCKED', projectId: input.projectId, repositoryPath: input.repositoryPath,
    originUrl: input.originUrl, sourceBranch: input.sourceBranch,
    defaultBranch, defaultTargetVerified: production, testTargetVerified: !production,
    mockSafetyReceipts, targetBranch: input.targetBranch, sourceSha: plan.sourceSha, mrIid: mr ? String(mr.iid) : null,
    mrUrl: mr?.web_url || null, mergeReadback: false, containment: false, writes: 0 };
  let phase = 'CREATE_MR';
  try {
    if (mode === 'VERIFY_ONLY' && mr.state !== 'merged') return awaitingMerge(result, plan, mr, 'MANUAL_MERGE_PENDING');
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
    plan.mrIid = result.mrIid;
    mr = await pollState(() => readTool(call, 'get_merge_request', mrArgs),
      value => mergeState(value, plan), io);
    if (mr.state !== 'merged') {
      if (mode === 'MANUAL' || mr.user?.can_merge === false) {
        return awaitingMerge(result, plan, mr, mode === 'MANUAL' ? 'MANUAL_MERGE_REQUESTED' : 'MERGE_PERMISSION_DENIED');
      }
      phase = 'CHECK_MERGE';
      const approvals = await verifyMergeApprovals(call, mrArgs, plan, project, io);
      const [freshSource, freshTarget, freshMr, freshProject] = await Promise.all([
        readTool(call, 'get_branch', { ...projectArgs, branch_name: input.sourceBranch }),
        readTool(call, 'get_branch', { ...projectArgs, branch_name: input.targetBranch }),
        readTool(call, 'get_merge_request', mrArgs),
        readTool(call, 'get_project', projectArgs),
      ]);
      verifyDefaultBranch(freshProject, defaultBranch);
      if (freshSource?.commit?.id !== plan.sourceSha || freshTarget?.commit?.id !== plan.targetSha) {
        throw new Error('合并前 source/target SHA 已变化，需要更新清单');
      }
      // Keep the detailed server readiness check authoritative even when the
      // approval format is Community Edition's optional-approval summary.
      const readiness = mergeState(freshMr, plan);
      if (readiness.state !== 'READY') throw Object.assign(new Error(readiness.error || '合并前 MR 条件已变化'), { code: readiness.code });
      result.approvalEvidence = approvals;
      await (io.checkRepository || checkRepository)(input, io);
      await checkMockSafetySet(input, mockContext, io);
      phase = 'MERGE_MR';
      try {
        await requestMerge(call, { ...mrArgs, sha: plan.sourceSha, auto_merge: false,
          should_remove_source_branch: false, squash: false, _confirmed: true });
        result.writes++;
      } catch (error) {
        if (!permissionDenied(error)) throw error;
        const actual = await readTool(call, 'get_merge_request', mrArgs);
        bindMr(actual, { ...plan, mrIid: result.mrIid });
        if (actual.state !== 'merged') return awaitingMerge(result, plan, actual, 'MERGE_PERMISSION_DENIED');
      }
    }
    phase = 'READ_MERGE';
    const merged = await readTool(call, 'get_merge_request', mrArgs);
    bindMr(merged, plan);
    if (merged.state !== 'merged') throw new Error('MR 未读回 merged；不能把排队自动合并当作完成');
    result.mergeReadback = true;
    const pipeline = merged.head_pipeline || merged.pipeline;
    if ((plan.pipelineRequired && pipeline?.status !== 'success') ||
        (pipeline && !['success', 'skipped'].includes(pipeline.status))) throw new Error('已合并 MR 的当前 CI 未验证通过');
    const deliveredSha = merged.merge_commit_sha || plan.sourceSha;
    if (plan.expectedDeliveredSha && deliveredSha !== plan.expectedDeliveredSha) {
      throw new Error('原 MR 的实际交付 SHA 与回执不一致');
    }
    phase = 'VERIFY_CONTAINMENT';
    const proof = await (io.containsSource || containsSource)(plan, io);
    if (proof?.contained !== true || !SHA.test(proof.targetSha || '')) throw new Error('源提交未验证包含在目标分支');
    result.containment = true;
    return { ...result, state: 'MERGED', observedTargetSha: proof.targetSha,
      deliveredSha, mergeCommitSha: merged.merge_commit_sha || null };
  } catch (error) {
    error.result = { ...result, phase, error: error.message };
    if (error.code === 'MR_CONFLICT') {
      error.result.conflict = { targetSha: plan.targetSha, owner: await conflictOwner(call, plan, result), purpose: plan.purpose };
    }
    throw error;
  }
}

async function main() {
  const input = await readCliPlan();
  const client = clientFor('gitlab-mcp');
  try {
    await client.initialize();
    client.requireTools(mergeRequiredTools(input));
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
