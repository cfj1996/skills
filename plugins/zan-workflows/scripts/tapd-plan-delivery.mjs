import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureTestWiki } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { runStoryWiki, executionFromPlan } from '../skills/collecting-requirements/scripts/story-execution-wiki.mjs';
import { repositoryKey, gitScopeKey, sha256, stableJson } from './workflow-runtime.mjs';

// The caller maps the human's start instruction. This readback proves the
// selected version and its limits, not that a user has asked to start.
export async function readExecutionPlan(reference, call) {
  if (!reference?.wikiUrl || !Number.isSafeInteger(reference.expectedRevision) || reference.expectedRevision < 1 ||
      !/^[a-f0-9]{64}$/.test(reference.expectedApprovalFingerprint || '') ||
      Object.keys(reference).some(key => !['wikiUrl', 'expectedRevision', 'expectedApprovalFingerprint', 'limit', 'selectedFeatures'].includes(key))) {
    throw new Error('从执行上下文交付须引用已启动的正式 Wiki、准确版本和确认指纹');
  }
  let confirmed;
  try { confirmed = await runStoryWiki('READ', reference, call); }
  catch (cause) { throw Object.assign(new Error(cause.message, { cause }), { code: 'PLAN_RECHECK_REQUIRED' }); }
  const plan = executionFromPlan(confirmed, reference.limit, reference);
  if (plan.missing.length) throw new Error('本轮所选交付待核实：' + plan.missing.join('、'));
  if (plan.delivery.legacy) throw new Error('旧版 Plan 未结构化绑定交付目标。请对照原文及当前开工指令核实实际约定');
  return plan;
}

function matchesRelease(project, release, purpose) {
  const target = project?.release;
  return target && release && repositoryKey(release.sourceRepository) === repositoryKey(project.repository) &&
    release.releaseKind === target.kind && release.targetEnvironment === 'test' && release.releaseChannel === 'canary' &&
    release.targetProject === target.project && release.releaseTarget === target.target && release.releaseRef === target.ref &&
    release.jobUrl?.replace(/\/$/, '') === target.jobUrl && release.jenkinsParametersValueHash === target.parametersHash &&
    purpose === project.purpose;
}

// Local recovery uses the approved work, immutable source and Jenkins identity.
export function planBuildKey(plan, job) {
  return sha256(stableJson([plan.wikiUrl, plan.revision, plan.approvalFingerprint, repositoryKey(job.sourceRepository),
    job.releaseRef, job.expectedSha, job.jobUrl.replace(/\/$/, ''), job.targetProject, job.releaseTarget, job.releaseKind,
    job.releaseChannel, job.targetEnvironment, job.jenkinsParametersValueHash]));
}

// Only a hash-named intent and its exact accepted queue are persisted outside
// the business repository. Params/credentials/Plan content stay out of this
// journal. The current frozen Jenkins contract verifies a recovered queue.
export async function recoverOrRunPlanBuild(plan, input, { stateDir, run, verify }) {
  const key = planBuildKey(plan, input);
  const dir = stateDir || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'zan-workflows', 'plan-builds');
  const path = join(dir, key);
  const unknown = () => Object.assign(new Error('此版本和源码的构建已派发，队列结果待核实。请读回原队列'), { code: 'UNKNOWN_WRITE' });
  const read = async () => {
    try {
      const data = await readFile(path, 'utf8');
      return data ? JSON.parse(data) : {};
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  async function remember(receipt) {
    // Atomic replacement of the existing claim. Only public queue identity is written.
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = path + '.' + randomUUID();
    const out = await open(tmp, 'wx', 0o600);
    try { await out.writeFile(JSON.stringify({ queueId: receipt.queueId, queueUrl: receipt.queueUrl, pipelineBodyHash: receipt.pipelineBodyHash })); }
    finally { await out.close(); }
    try { await rename(tmp, path); } finally { await unlink(tmp).catch(() => {}); }
  }
  const project = plan.delivery.projects.find(p => matchesRelease(p, input, input.purpose));
  const candidates = (input.planBuildReceipts || []).filter(receipt =>
    receipt?.state === 'BUILD_SUBMITTED' && receipt.writes === 1 && receipt.completionMode === 'TRIGGER_ACCEPTED' &&
    Number.isSafeInteger(receipt.queueId) && receipt.queueId > 0 && receipt.queueUrl && receipt.expectedSha === input.expectedSha &&
    matchesRelease(project, receipt, input.purpose));
  for (const prior of candidates) {
    if (prior.planBuildKey && prior.planBuildKey !== key) throw new Error('已接受构建的 Plan 版本或范围不符');
  }
  const stored = await read();
  if (stored?.queueId && stored.pipelineBodyHash !== input.pipelineBodyHash) throw new Error('已接受队列与当前流水线脚本不一致');
  if (new Set([...candidates, ...(stored?.queueId ? [stored] : [])].map(r => String(r.queueId) + '|' + r.queueUrl)).size > 1) {
    throw new Error('同一构建身份有多个队列，需核实实际回执');
  }
  if (candidates.length || stored?.queueId) {
    const receipt = await verify(candidates[0] || stored);
    if (!stored?.queueId) await remember(receipt);
    return { ...receipt, planBuildKey: key };
  }
  if (stored) throw unknown();
  let owned = false;
  const claimTrigger = async () => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      const lock = await open(path, 'wx', 0o600);
      await lock.close();
      owned = true;
    } catch (error) {
      if (error.code === 'EEXIST') throw unknown();
      throw error;
    }
  };
  try {
    const receipt = await run(claimTrigger);
    if (receipt.state === 'BUILD_SUBMITTED') {
      try { await remember(receipt); }
      catch (error) { error.result = { ...receipt, planBuildKey: key }; throw error; }
      return { ...receipt, planBuildKey: key };
    }
    return receipt;
  } catch (error) {
    if (owned && ['PLAN_RECHECK_REQUIRED', 'WRITE_REJECTED'].includes(error.code)) await unlink(path);
    throw error;
  }
}

export function recoveredQueueReceipt(preview, queue) {
  const fields = ['instance', 'jobName', 'jobUrl', 'targetProject', 'releaseTarget', 'releaseKind', 'releaseRef',
    'releaseChannel', 'targetEnvironment', 'sourceRepository', 'expectedSha', 'jenkinsProjectKey', 'jenkinsContractHash',
    'jobAdapter', 'releaseScope', 'pipelineSource', 'pipelineBodyHash', 'versionStrategy', 'jenkinsProfile', 'jenkinsProfileHash', 'parameterDefinitionsHash', 'jenkinsParametersValueHash', 'refParameter', 'versionParameter'];
  return { ...Object.fromEntries(fields.filter(k => preview[k] !== undefined).map(k => [k, preview[k]])),
    state: 'BUILD_SUBMITTED', completionMode: 'TRIGGER_ACCEPTED', submittedParams: preview.params,
    writes: 1, sourceVerified: false, queueId: queue.queueId, queueUrl: queue.queueUrl };
}

function checkSelectedFeatures(plan, project, reviewed) {
  const selected = project.reviewedFeatures;
  if (!plan.partial || !selected) return;
  if (!Array.isArray(reviewed) || reviewed.length !== selected.length || !selected.every(id => reviewed.includes(id))) {
    throw new Error('局部功能交付须绑定仅包含本轮功能的已审差异：' + selected.join('、'));
  }
}

export function checkPlanBuild(plan, release) {
  const project = plan.delivery.projects.find(p => matchesRelease(p, release, release.purpose));
  if (!plan.build || !project) throw new Error('构建与执行 Plan 的仓库、项目/对象、Job、ref、测试通道、参数或目的不一致');
  checkSelectedFeatures(plan, project, release.reviewedFeatures);
}

export function checkPlanMerge(plan, merge, localGit) {
  const allowed = plan.delivery.projects.filter(p => plan.submit && p.target && p.source === merge.sourceBranch &&
    p.target === merge.targetBranch && repositoryKey(p.repository) === repositoryKey(merge.originUrl) &&
    p.purpose === merge.purpose);
  const matches = allowed.some(p =>
    (p.git !== '仅核验已交付' || merge.mergeMode === 'CONTAINMENT_ONLY') &&
    (p.git !== '仅合并已有 MR' || Boolean(merge.mrIid) || merge.mergeMode === 'CONTAINMENT_ONLY') &&
    (!localGit?.push || ['提交推送并合并 MR', '仅推送并合并 MR'].includes(p.git)) &&
    (!localGit?.commit || p.git === '提交推送并合并 MR'));
  if (!matches) throw new Error('Git 仓库、源/目标分支、提交推送或合并操作与执行 Plan 不一致');
  for (const p of allowed) checkSelectedFeatures(plan, p, merge.reviewedFeatures);
}

export function checkPlanItem(plan, item, action) {
  const bug = Boolean(plan.bugId);
  if (plan.partial) throw new Error('局部功能只回填对应进度，不能登记整个工作项');
  if (!plan.submit || String(item.workspaceId) !== plan.workspaceId || item.entryId !== (plan.bugId || plan.storyId) ||
      item.entryType !== (bug ? 'bug' : 'stories')) throw new Error('工作项与本轮执行范围不一致');
  if (action === 'wiki') {
    if (plan.delivery.testWiki !== '需要' || item.expectedWikiId && String(item.expectedWikiId) === plan.wikiId) {
      throw new Error('本轮未选此提测 Wiki 或回链');
    }
    const entries = [item, ...(item.entryUpdates || [])];
    for (const entry of entries) {
      if (!plan.delivery.projects.some(project => project.target && project.source === entry.sourceBranch &&
          repositoryKey(project.repository) === repositoryKey(entry.entryRepoUrl))) throw new Error('提测 Wiki 条目的仓库或分支超出已选范围');
    }
  }
  if (action === 'registration' && (item.statusAction !== (bug ? 'WAITING_TEST' : 'NONE') ||
      (item.versionAction === 'WRITE' ? item.testVersion : null) !== plan.delivery.testVersion)) {
    throw new Error('本轮未选此状态或测试版本登记');
  }
}

export async function verifyPlanTestWiki(context, work, wiki, call, supersededWiki, io) {
  if (!wiki?.wikiId || !wiki.bodySha256 || wiki.entryId !== work.entryId || wiki.workspaceId !== work.workspaceId ||
      wiki.entryType !== work.entryType || String(wiki.wikiId) === String(context.wikiId)) {
    throw Object.assign(new Error('提测 Wiki 回执缺失或与当前工作项不符'), { code: 'PLAN_WIKI_RECHECK_REQUIRED' });
  }
  const project = context.delivery.projects.find(p => p.target);
  try {
    const page = await ensureTestWiki(call, { workspaceId: work.workspaceId, entryType: work.entryType, entryId: work.entryId,
      mode: 'link', expectedWikiId: wiki.wikiId, expectedMonthId: wiki.monthWikiId, expectedBodySha256: wiki.bodySha256,
      sourceBranch: project.source, entryRepoUrl: project.repository, supersededWiki }, new Date(), io);
    if (page.state !== 'ALREADY_LINKED' || page.beforeBodySha256 !== wiki.bodySha256) throw new Error('提测 Wiki 正文或工作项回链已变化');
  } catch (cause) {
    throw Object.assign(new Error(cause.message, { cause }), { code: 'PLAN_WIKI_RECHECK_REQUIRED' });
  }
}

export function checkPlanSubmission(plan, submission) {
  checkPlanItem(plan, submission.registration, 'registration');
  if (plan.workflow !== 'CONTINUOUS_SUBMIT') throw new Error('当前 Plan 选择逐项交付，请按 gitProjects 和 buildProjects 复用同一启动指令');
  if (Boolean(submission.wiki) !== (plan.delivery.testWiki === '需要') || submission.linkTaskIds.length) {
    throw new Error('提测 Wiki 或回链与本轮执行范围不一致');
  }
  if (submission.wiki) checkPlanItem(plan, submission.wiki, 'wiki');
  const projects = plan.delivery.projects;
  const selected = projects.filter(p => plan.gitProjects.includes(p.id));
  const rows = submission.repositories || [submission];
  const repos = new Set(rows.map(row => repositoryKey(row.merge.originUrl)));
  if (repos.size !== rows.length || repos.size !== selected.length ||
      selected.some(p => !repos.has(repositoryKey(p.repository)))) throw new Error('交付仓库集合与本轮执行 Plan 不一致');
  for (const { merge, localGit, release } of rows) {
    checkPlanMerge(plan, merge, localGit);
    const job = projects.find(p => plan.buildProjects.includes(p.id) && repositoryKey(p.repository) === repositoryKey(merge.originUrl));
    if (job ? !matchesRelease(job, release, merge.purpose) : Boolean(release)) {
      throw new Error('该仓所选的测试 Job、构建来源、参数或环境已变化');
    }
  }
}

// Individual Git/Job operations can cover a topology the continuous helper
// cannot represent. The final item writes wait for every selected Job.
export function checkPriorPlanBuild(plan, receipt) {
  if (!plan.buildProjects.some(id => {
    const project = plan.delivery.projects.find(p => p.id === id);
    return matchesRelease(project, receipt, project.purpose);
  })) throw new Error('待恢复的构建回执不属于本版选择的 Job、源码或参数');
}

const commit = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

export function planGitCoverage(plan, receipts) {
  const planned = plan.gitProjects.map(id => {
    const p = plan.delivery.projects.find(project => project.id === id);
    return { id, originUrl: p.repository, sourceBranch: p.source, targetBranch: p.target };
  });
  const expected = new Map(planned.map(scope => [gitScopeKey(scope), scope]));
  const scopes = [...expected.values()];
  const seen = new Set();
  for (const receipt of receipts) {
    const key = gitScopeKey(receipt);
    if (!expected.has(key) || seen.has(key)) throw new Error('Git 回执超出本轮项目/分支范围或重复');
    if (!['MERGED', 'VERIFIED'].includes(receipt.state) || receipt.containment !== true ||
        !commit(receipt.sourceSha) || !commit(receipt.deliveredSha)) throw new Error('Git 回执缺少已审源码、交付 SHA 或包含关系');
    seen.add(key);
  }
  return { scopes, missing: planned.filter(scope => !seen.has(gitScopeKey(scope))).map(scope => scope.id) };
}

export function missingPlanBuilds(plan, receipts, gitReceipts, reviewedBuildSources = {}) {
  return plan.buildProjects.filter(id => {
    const project = plan.delivery.projects.find(p => p.id === id);
    const git = gitReceipts.find(row => row.targetBranch === project.release.ref && row.sourceBranch === project.source &&
      repositoryKey(row.originUrl || row.sourceRepository) === repositoryKey(project.repository));
    // An independent Job has no Git delivery receipt. Its expected SHA must
    // come from the current review/ref verification, never from an old queue.
    const expectedSha = git?.deliveredSha ?? reviewedBuildSources[id];
    if (!commit(expectedSha)) return true;
    return !receipts.some(receipt => matchesRelease(project, receipt, project.purpose) &&
      (!receipt.planBuildKey || receipt.planBuildKey === planBuildKey(plan, receipt)) &&
      receipt.state === 'BUILD_SUBMITTED' && receipt.completionMode === 'TRIGGER_ACCEPTED' && receipt.writes === 1 &&
      Number.isSafeInteger(receipt.queueId) && receipt.queueId > 0 && receipt.queueUrl && receipt.expectedSha === expectedSha);
  });
}
