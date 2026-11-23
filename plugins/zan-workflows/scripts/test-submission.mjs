import { readFile } from 'node:fs/promises';
import { inspectSelectedWikiLinks } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { prepareSubmissionGit, executeSubmissionGit } from './submission-git.mjs';
import { validateReviewedBugRecord, publishSubmissionBugRecord } from './submit-bug-record.mjs';
import { checkDeliveryPrerequisites } from './register-test-submission.mjs';
import { verifyAcceptedTestBuild } from './jenkins-readonly.mjs';
import { bindFrozenJenkinsJob, loadFrozenJenkinsContract, verifyFrozenJenkinsReceiptParameters } from './frozen-jenkins-contracts.mjs';
import { readTool, repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';
import { deliveryTargetKind, isBranchName, isTestDelivery } from './branch-roles.mjs';

const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const id = value => typeof value === 'string' && /^\d+$/.test(value);
const snapshot = value => structuredClone(value);
const repositoryRows = plan => plan.repositories || [plan];
const repoKey = ({ merge }) => repositoryKey(merge.originUrl);
const workKeys = plan => repositoryRows(plan).map(row => stableJson([
  plan.registration.workspaceId, plan.registration.entryType, plan.registration.entryId, repoKey(row),
]));
const reviewedMerges = plan => plan.repositories ? plan.repositories.map(row => row.merge) : plan.merge;
const repositoryReceipts = (plan, receipts) => plan.repositories ? receipts.repositories : [receipts];
const wikiEntryKey = row => stableJson([repositoryKey(row.entryRepoUrl), row.sourceBranch]);

function planFingerprint(plan) {
  if (!plan.wiki) return sha256(stableJson(plan));
  const { bodyFile, ...wiki } = plan.wiki;
  // The approved bytes, target and scope are bound separately from their temporary carrier.
  return sha256(stableJson({ ...plan, wiki }));
}

function prepareRepositoryInput({ merge, release, localGit }) {
  if (!merge || !sha(merge.sourceSha) || !sha(merge.targetSha) || !isBranchName(merge.targetBranch) ||
      (merge.testBranch !== undefined && merge.testBranch !== merge.targetBranch) ||
      !/^(feature|fixbug)\/[^\s]+$/.test(merge.sourceBranch) || merge.reviewPassed !== true ||
      typeof merge.pipelineRequired !== 'boolean' || !merge.projectId || !merge.originUrl ||
      !merge.repositoryPath || !merge.purpose?.trim() || !merge.mockSafety || merge.mockSafeties ||
      merge.pendingWiki || merge.targetEnvironment && merge.targetEnvironment !== 'test' ||
      !['AUTO', 'CONTAINMENT_ONLY', undefined].includes(merge.mergeMode) ||
      localGit && merge.mergeMode === 'CONTAINMENT_ONLY') {
    throw new Error('连续提测的每个仓库都需已评审的原分支、准确源码/目标 SHA 和测试交付清单');
  }
  if (release === null) return { merge, release, localGit };
  if (!release || Array.isArray(release) || typeof release !== 'object') throw new Error('需要选择准确 Job 或明确传 null 跳过测试构建');
  const targetProject = release.targetProject ?? release.jenkinsProjectKey;
  const bound = { releaseKind: 'deployment', releaseChannel: 'canary', targetEnvironment: 'test',
    targetProject, releaseTarget: targetProject, releaseRef: merge.targetBranch, sourceRepository: merge.originUrl,
    ...release, repositoryPath: merge.repositoryPath };
  if (bound.releaseKind !== 'deployment' || bound.releaseChannel !== 'canary' ||
      bound.targetEnvironment !== 'test' || !bound.targetProject?.trim() || !bound.releaseTarget?.trim() ||
      !(bound.jobName && bound.jobUrl || bound.jenkinsProjectKey?.trim()) || bound.releaseRef !== merge.targetBranch ||
      repositoryKey(bound.sourceRepository) !== repositoryKey(merge.originUrl)) {
    throw new Error('测试构建需给定同仓测试分支、releaseTarget、准确 Job 或其固定项目映射，或明确选择 null 跳过');
  }
  return { merge, release: bound, localGit };
}

function bindWikiSelection(wiki, registration, repositories) {
  if (wiki === null) return null;
  if (!wiki || (wiki.mode ?? 'ensure') !== 'ensure' || !(wiki.creator || wiki.commentAuthor)?.trim() ||
      wiki.workspaceId !== registration.workspaceId || wiki.entryType !== registration.entryType || wiki.entryId !== registration.entryId) {
    throw new Error('Wiki 需绑定本轮条目、仓库、分支，或明确选择 null');
  }
  const entries = repositories.map(({ merge }) => ({ sourceBranch: merge.sourceBranch, entryRepoUrl: merge.originUrl }));
  const keys = new Set(entries.map(wikiEntryKey));
  const primary = { ...entries[0], ...wiki };
  if (!keys.has(wikiEntryKey(primary))) throw new Error('Wiki 主条目需绑定本轮仓库和原分支');
  if (wiki.entryUpdates !== undefined) {
    if (!Array.isArray(wiki.entryUpdates) || wiki.entryUpdates.length !== keys.size ||
        new Set(wiki.entryUpdates.map(wikiEntryKey)).size !== keys.size ||
        wiki.entryUpdates.some(row => !keys.has(wikiEntryKey(row)))) {
      throw new Error('Wiki 条目必须准确覆盖本轮全部交付仓库');
    }
  } else if (entries.length > 1) {
    primary.entryUpdates = entries;
  }
  return primary;
}

function validatePlan(input) {
  const { wiki, registration, linkTaskIds = [] } = input;
  if (input.decisions !== undefined && (!Array.isArray(input.decisions) ||
      input.decisions.some(value => typeof value !== 'string' || !value.trim()))) throw new Error('当前清单的决定需为简短的已核实事实');
  if (input.repositories !== undefined && (!Array.isArray(input.repositories) || input.repositories.length < 2 ||
      input.repositories.some(row => !row || typeof row !== 'object') ||
      ['merge', 'localGit', 'release'].some(field => Object.hasOwn(input, field)))) {
    throw new Error('跨仓提测需在 repositories 中提供全部仓库，各仓字段不能与单仓输入混用');
  }
  const repositories = repositoryRows(input).map(prepareRepositoryInput);
  if (new Set(repositories.map(repoKey)).size !== repositories.length ||
      repositories.some(row => row.merge.purpose !== repositories[0].merge.purpose)) {
    throw new Error('跨仓提测的仓库不得重复，且需绑定同一交付目的');
  }
  const bug = registration?.entryType === 'bug';
  if (!registration || !['stories', 'tasks', 'bug'].includes(registration.entryType) || !id(registration.entryId) ||
      !Number.isSafeInteger(registration.workspaceId) || registration.workspaceId < 1 ||
      registration.statusAction !== (bug ? 'WAITING_TEST' : 'NONE') || !['NONE', 'WRITE'].includes(registration.versionAction)) {
    throw new Error('连续提测需绑定准确工作项和状态/版本动作，Bug 必须核实待测试登记');
  }
  if (bug) validateReviewedBugRecord(input.repairRecord, registration, input.repositories
    ? repositories.map(row => row.merge) : repositories[0].merge);
  else if (input.repairRecord != null) throw new Error('Story/Task 不发表 Bug 修复记录');
  if (!Array.isArray(linkTaskIds) || linkTaskIds.some(value => !id(value)) || bug && linkTaskIds.length ||
      new Set(linkTaskIds).size !== linkTaskIds.length || !wiki && linkTaskIds.length) throw new Error('任务回链范围无效');
  return { repositories, wiki: bindWikiSelection(wiki, registration, repositories) };
}

async function wikiPlan(wiki, taskIds, steps) {
  if (!wiki) return { wiki: null };
  const fileHash = wiki.bodyFile ? sha256(await readFile(wiki.bodyFile)) : null;
  const preview = await steps.run('wiki', { ...wiki, expectedApprovedBodySha256: fileHash }, false);
  const afterHash = fileHash || preview.approvedBodySha256 || null;
  if (preview.entryOperation === 'APPEND_ENTRY' && !afterHash || !preview.wikiId && !afterHash) {
    throw new Error('连续提测需要已经准备好的完整 Wiki 正文或补丁');
  }
  const result = { ...wiki, expectedApprovedBodySha256: afterHash, expectedOwnerId: preview.wikiOwner.entryId,
    expectedOwnerType: preview.wikiOwner.entryType,
    expectTarget: preview.target, expectedWikiId: preview.wikiId, expectedMonthId: preview.monthWikiId,
    expectedBodySha256: preview.beforeBodySha256, month: preview.month || wiki.month, wikiTitle: preview.wikiTitle };
  await inspectSelectedWikiLinks(steps.call('tapd-mcp'), result, taskIds);
  return { wiki: result, approvedWikiBody: preview.approvedBody };
}

function immutableSource(merge, revision) {
  return { mockSafety: { ...merge.mockSafety, revisionSha: revision } };
}
function summary(record) {
  return { state: record.state, planId: record.hash, receipts: snapshot(record.receipts),
    ...(record.detail ? { detail: record.detail } : {}), ...(record.repository ? { repository: record.repository } : {}) };
}
async function prepareLocalMerge(merge, { call }) {
  const gitlab = call('gitlab-mcp'), args = { project_id: merge.projectId };
  const [project, target] = await Promise.all([readTool(gitlab, 'get_project', args),
    readTool(gitlab, 'get_branch', { ...args, branch_name: merge.targetBranch })]);
  if (![project.http_url_to_repo, project.ssh_url_to_repo].filter(Boolean).some(url =>
    repositoryKey(url) === repositoryKey(merge.originUrl)) || target.commit?.id !== merge.targetSha || !merge.title?.trim()) {
    throw new Error('本地提交前的 GitLab 项目、目标分支或 MR 标题不匹配');
  }
  deliveryTargetKind({ ...merge, testBranch: merge.targetBranch }, project.default_branch);
  return { ...merge, defaultBranch: project.default_branch,
    pipelineRequired: merge.pipelineRequired || project.only_allow_merge_if_pipeline_succeeds === true };
}

function mergeTestTarget(steps, merge, execute) {
  return steps.run('merge', { ...merge, testBranch: merge.targetBranch }, execute);
}

async function prepareRepository({ merge, release, localGit }, steps) {
  const local = localGit && await prepareSubmissionGit(merge, localGit, steps.io);
  const [git, build] = await Promise.all([
    localGit ? prepareLocalMerge(merge, steps) : mergeTestTarget(steps, merge, false),
    prepareRelease(merge, release, merge.targetSha, steps),
  ]);
  if (!localGit && !['VERIFIED', 'AWAITING_CONFIRMATION'].includes(git.state)) throw new Error('合并预览尚未就绪');
  return { merge: { ...merge, sourceSha: git.sourceSha, targetSha: git.targetSha, defaultBranch: git.defaultBranch,
    pipelineRequired: git.pipelineRequired ?? merge.pipelineRequired, mrIid: git.mrIid || merge.mrIid },
    localGit: local || null, release: build };
}

async function prepareRelease(merge, release, expectedSha, steps) {
  if (!release) return null;
  const input = release.jobName && release.jobUrl ? release : await bindFrozenJenkinsJob(release, steps.io);
  return steps.run('release', { ...input, expectedSha, completionMode: 'TRIGGER_ACCEPTED',
    purpose: merge.purpose, mockSafety: merge.mockSafety }, false);
}

async function prepareSubmission(input, steps) {
  const { repositories, wiki } = validatePlan(input);
  if (wiki?.supersededWiki && !input.recoverDelivery) throw new Error('明确作废的历史页只在已有交付回执的 Wiki 续接使用');
  const { registration, repairRecord, decisions = [], linkTaskIds = [] } = input;
  const purpose = repositories[0].merge.purpose;
  const recovered = input.recoverDelivery;
  let savedReceipts;
  if (recovered !== undefined) {
    if (!recovered || typeof recovered !== 'object' || Array.isArray(recovered)) throw new Error('跨会话续接需要原连续提测回执');
    savedReceipts = input.repositories ? recovered.repositories : [recovered];
    if (!Array.isArray(savedReceipts) || savedReceipts.length !== repositories.length) {
      throw new Error('跨会话续接必须提供全部仓库的 Git 和所选构建回执');
    }
  }
  const checks = [
    ...repositories.map((row, index) => ({ repository: row.merge.originUrl, phase: 'repository',
      work: savedReceipts ? prepareRecoveredRepository(row, savedReceipts[index], steps) : prepareRepository(row, steps) })),
    { phase: 'wiki', work: wikiPlan(wiki, linkTaskIds, steps) },
    { phase: 'registration', work: steps.run('registration', { ...registration, purpose }, false) },
  ];
  const results = await Promise.allSettled(checks.map(check => check.work));
  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const { repository, phase } = checks[index];
    return [{ repository, phase, error: result.reason }];
  });
  if (failures.length) {
    const error = (failures.find(failure => failure.error.code === 'MCP_TIMEOUT') || failures[0]).error;
    throw Object.assign(new Error(error.message, { cause: error }), { code: error.code,
      result: { state: 'BLOCKED', writes: 0, error: error.message,
      checks: failures.map(failure => ({ repository: failure.repository, phase: failure.phase,
        error: failure.error.message, code: failure.error.code })) } });
  }
  const values = results.map(result => result.value);
  const rows = values.slice(0, repositories.length);
  const [page, register] = values.slice(repositories.length);
  return { ...(input.repositories ? { repositories: rows } : rows[0]), ...page,
    registration: { ...registration, ...register }, ...(repairRecord ? { repairRecord } : {}), decisions, linkTaskIds };
}

async function recheckAcceptedBuild(merge, receipt, steps) {
  const contract = await loadFrozenJenkinsContract({ ...receipt, repositoryPath: merge.repositoryPath }, steps.io);
  const reader = steps.reader(receipt);
  if (reader.instanceUrl !== contract.instance.url.replace(/\/$/, '') || contract.profile.environmentKind !== 'test') {
    throw new Error('原测试构建的 Jenkins 实例或环境与已核实约定不一致');
  }
  verifyFrozenJenkinsReceiptParameters(contract, receipt);
  const verification = await verifyAcceptedTestBuild(reader, receipt);
  return { ...receipt, reused: true, verification: { ...verification, writes: 0 } };
}

const buildIdentity = ['instance', 'jobName', 'jobUrl', 'targetProject', 'releaseTarget', 'releaseKind',
  'releaseRef', 'releaseChannel', 'targetEnvironment', 'jenkinsProfile', 'parameterDefinitionsHash',
  'jenkinsProfileHash', 'jenkinsParametersValueHash', 'jenkinsContractHash'];

async function prepareRecoveredRepository(row, saved, steps) {
  const { merge } = row;
  const git = saved?.git, target = saved?.target;
  const builtSha = target?.deliveredSha || git?.deliveredSha;
  const matchesLocalCommit = row.localGit?.commit && saved?.localGit?.state === 'VERIFIED' &&
    saved.localGit.sourceSha === git?.sourceSha;
  const matchesTargetReview = !target || (target.state === 'VERIFIED' && target.sourceSha === git?.sourceSha &&
    repositoryKey(target.originUrl) === repoKey(row) && target.targetBranch === merge.targetBranch &&
    sha(target.deliveredSha));
  if (!git || !['MERGED', 'VERIFIED'].includes(git.state) || git.containment !== true || !isTestDelivery(git) ||
      repositoryKey(git.originUrl) !== repoKey(row) || git.sourceBranch !== merge.sourceBranch ||
      git.targetBranch !== merge.targetBranch || String(git.projectId) !== String(merge.projectId) ||
      !sha(git.sourceSha) || !sha(git.deliveredSha) ||
      git.sourceSha !== merge.sourceSha && !matchesLocalCommit ||
      merge.mrIid && String(merge.mrIid) !== git.mrIid ||
      (git.state === 'MERGED' ? !id(git.mrIid) : git.mrIid != null) || !matchesTargetReview) {
    throw new Error('跨会话续接缺少与原仓库、分支和评审匹配的 Git 回执');
  }
  const releaseReceipt = saved.release;
  if (row.release ? releaseReceipt?.state !== 'BUILD_SUBMITTED' || releaseReceipt.completionMode !== 'TRIGGER_ACCEPTED' ||
      releaseReceipt.writes !== 1 || releaseReceipt.expectedSha !== builtSha ||
      !Number.isSafeInteger(releaseReceipt.queueId) || releaseReceipt.queueId < 1 || !releaseReceipt.queueUrl ||
      repositoryKey(releaseReceipt.sourceRepository) !== repoKey(row)
    : releaseReceipt?.state !== 'SKIPPED_BY_INTENT' || releaseReceipt.writes !== 0) {
    throw new Error('跨会话续接需要所选测试构建的确切回执，或原计划明确跳过构建');
  }

  const release = await prepareRelease(merge, row.release, builtSha, steps);
  if (release && (buildIdentity.some(field => releaseReceipt[field] !== release[field]) ||
      stableJson(releaseReceipt.submittedParams) !== stableJson(release.params))) {
    throw new Error('原队列回执的 Job、参数或环境已变化，无法仅续接登记和 Wiki');
  }
  const receiptFields = [...buildIdentity, 'state', 'completionMode', 'writes', 'queueId', 'queueUrl',
    'sourceRepository', 'expectedSha', 'submittedParams', 'refParameter', 'jenkinsProjectKey'];
  const recovery = {
    mrIid: git.mrIid, sourceSha: git.sourceSha, deliveredSha: git.deliveredSha, targetSha: target?.deliveredSha,
    releaseReceipt: release ? {
      ...Object.fromEntries(receiptFields.map(field => [field, releaseReceipt[field]])),
      jenkinsContractsPath: release.jenkinsContractsPath,
    } : null,
  };
  const prepared = { merge, release, localGit: null, recovery };
  await recheckRecoveredRepository(prepared, steps);
  return prepared;
}

async function recheckRecoveredRepository(row, steps) {
  const { merge, recovery } = row;
  const { mrIid, sourceSha, deliveredSha, targetSha, releaseReceipt } = recovery;
  const [git, release] = await Promise.all([
    mergeTestTarget(steps, { ...merge, sourceSha, mrIid: mrIid || undefined,
      mergeMode: mrIid ? 'VERIFY_ONLY' : 'CONTAINMENT_ONLY',
      targetSha: mrIid ? merge.targetSha : undefined, expectedDeliveredSha: deliveredSha }, false),
    releaseReceipt && recheckAcceptedBuild(merge, releaseReceipt, steps),
  ]);
  if (git.state !== (mrIid ? 'MERGED' : 'VERIFIED') || git.writes !== 0 || git.containment !== true ||
      (git.mrIid || null) !== (mrIid || null) || git.deliveredSha !== deliveredSha) {
    throw new Error('没有读回原交付 MR 或已交付的测试分支版本');
  }
  const result = { git };
  if (targetSha && targetSha !== deliveredSha) {
    result.target = await mergeTestTarget(steps, { ...merge, sourceSha, targetSha: undefined, mrIid: undefined,
      mergeMode: 'CONTAINMENT_ONLY', expectedDeliveredSha: targetSha }, false);
    if (result.target.state !== 'VERIFIED' || result.target.containment !== true ||
        result.target.deliveredSha !== targetSha) throw new Error('原构建所用的目标增量无法重新核实');
  }
  if (release) result.release = release;
  return result;
}

async function recheckWikiDelivery(plan, steps) {
  const { merge, wikiRecovery: { releaseReceipt } } = plan;
  const [git, release] = await Promise.all([
    mergeTestTarget(steps, { ...merge, mergeMode: 'VERIFY_ONLY', expectedDeliveredSha: releaseReceipt.expectedSha }, false),
    recheckAcceptedBuild(merge, releaseReceipt, steps),
  ]);
  if (git.state !== 'MERGED' || git.writes !== 0 || git.containment !== true ||
      git.mrIid !== merge.mrIid || git.deliveredSha !== releaseReceipt.expectedSha) {
    throw new Error('未只读核实原 MR 及队列回执对应的实际交付 SHA');
  }
  return { git, release };
}

async function prepareWikiRecovery(input, steps) {
  const { recoverWiki, merge, wiki, registration, decisions = [], linkTaskIds = [] } = input;
  const receipt = recoverWiki?.releaseReceipt;
  if (Object.keys(input).some(key => !['recoverWiki', 'merge', 'wiki', 'registration', 'decisions', 'linkTaskIds'].includes(key)) ||
      Object.keys(recoverWiki || {}).some(key => !['previousWikiId', 'releaseReceipt', 'jenkinsProjectKey'].includes(key)) ||
      !id(merge?.mrIid) || merge.mergeMode === 'CONTAINMENT_ONLY' ||
      !['stories', 'tasks'].includes(registration?.entryType) || registration.versionAction !== 'NONE') {
    throw new Error('跨会话续接限已有原 MR 的 Story/Task，仅处理 Wiki 及任务回链');
  }
  if (!id(recoverWiki?.previousWikiId) || wiki?.supersededWiki?.wikiId !== recoverWiki.previousWikiId ||
      !id(wiki.expectedWikiId) || wiki.expectedWikiId === recoverWiki.previousWikiId ||
      wiki.expectedOwnerType !== 'stories' || !id(wiki.expectedOwnerId) || !wiki.bodyFile) {
    throw new Error('跨会话换页需要同一 Story 的准确新旧页、替代证明和已审正文');
  }
  if (receipt?.state !== 'BUILD_SUBMITTED' || receipt.writes !== 1 || !sha(receipt.expectedSha) ||
      typeof receipt.jobName !== 'string' || !receipt.jobName.trim() || !receipt.queueUrl ||
      typeof receipt.instance !== 'string' || !receipt.instance.trim() ||
      typeof receipt.targetProject !== 'string' || !receipt.targetProject.trim() ||
      (receipt.jenkinsProjectKey && recoverWiki.jenkinsProjectKey && receipt.jenkinsProjectKey !== recoverWiki.jenkinsProjectKey) ||
      !Number.isSafeInteger(receipt.queueId) || receipt.queueId < 1 ||
      !receipt.submittedParams || typeof receipt.submittedParams !== 'object' || Array.isArray(receipt.submittedParams) ||
      !['parameterDefinitionsHash', 'jenkinsProfileHash', 'jenkinsParametersValueHash'].every(
        key => typeof receipt[key] === 'string' && /^[a-f0-9]{64}$/.test(receipt[key]))) {
    throw new Error('跨会话换页需要原测试构建的确切队列回执及提交参数');
  }
  validatePlan({ ...input, release: receipt });
  const { jobName, jobUrl, instance, targetProject, releaseTarget, releaseKind, releaseRef, releaseChannel,
    targetEnvironment, sourceRepository, expectedSha, queueId, queueUrl, submittedParams, jenkinsProfile,
    parameterDefinitionsHash, jenkinsProfileHash, jenkinsParametersValueHash, refParameter } = receipt;
  const plan = {
    merge, localGit: null, release: null, decisions, linkTaskIds,
    registration: { ...registration, state: 'NOT_APPLICABLE' },
    wikiRecovery: { previousWikiId: recoverWiki.previousWikiId, releaseReceipt: {
      state: 'BUILD_SUBMITTED', writes: 1, jobName, jobUrl, instance, targetProject, releaseTarget, releaseKind,
      releaseRef, releaseChannel, targetEnvironment, sourceRepository, expectedSha, queueId, queueUrl, submittedParams,
      jenkinsProjectKey: receipt.jenkinsProjectKey || recoverWiki.jenkinsProjectKey, jenkinsProfile,
      parameterDefinitionsHash, jenkinsProfileHash, jenkinsParametersValueHash, refParameter,
    } },
  };
  const [page, receipts] = await Promise.all([
    wikiPlan({ ...wiki, expectTarget: 'REUSE_EXISTING' }, linkTaskIds, steps),
    recheckWikiDelivery(plan, steps),
  ]);
  if (page.wiki.expectedWikiId !== wiki.expectedWikiId || page.wiki.expectTarget !== 'REUSE_EXISTING') {
    throw new Error('跨会话续接只能使用已核实的现有替代 Wiki');
  }
  return { plan: { ...plan, ...page }, receipts };
}

function reviewRepository({ merge, localGit, release, recovery }) {
  return { repository: merge.originUrl, sourceBranch: merge.sourceBranch, sourceSha: merge.sourceSha,
    targetBranch: merge.targetBranch, targetSha: merge.targetSha,
    localGit: localGit && { commit: localGit.commit, push: localGit.push, message: localGit.message, files: Object.keys(localGit.files) },
    mergeMode: merge.mergeMode || 'AUTO', purpose: merge.purpose,
    mockModules: merge.mockSafety.mockModules, release: release && { jobUrl: release.jobUrl, params: release.params },
    ...(recovery ? { recoveredDelivery: { mrIid: recovery.mrIid, deliveredSha: recovery.targetSha || recovery.deliveredSha,
      queueId: recovery.releaseReceipt?.queueId } } : {}) };
}

// One session owns the plans and the actual effects. The public ID is not a
// receipt, and callers cannot replace an earlier Git or queue result on resume.
export class TestSubmissions {
  plans = new Map();

  async prepare(input, steps) {
    const previous = input.resumePlanId && this.plans.get(input.resumePlanId);
    const resumeState = previous?.state;
    let plan, targetReceipt, targetIndex, recoveryReceipts;
    if (input.resumePlanId) {
      if (resumeState === 'AWAITING_MERGE') return this.resumeManualMerge(input, previous, steps);
      const affected = { NEEDS_WIKI_REVIEW: 'wiki', NEEDS_TARGET_REVIEW: 'targetEvidence', NEEDS_REPAIR_REVIEW: 'repairRecord' }[resumeState];
      if (!affected) throw new Error('没有可定向续接的提测计划');
      const allowed = ['resumePlanId', 'decisions', affected];
      if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('续接只允许补受影响的清单部分');
      plan = snapshot(previous.plan);
      if (input.decisions !== undefined) {
        if (!Array.isArray(input.decisions) || input.decisions.some(value => typeof value !== 'string' || !value.trim())) {
          throw new Error('续接评审说明无效');
        }
        plan.reviewUpdate = { step: affected, decisions: input.decisions };
      }
      if (affected === 'wiki') {
        if (!input.wiki || !plan.wiki) throw new Error('续接不能取消已确认 Wiki');
        if (input.wiki.supersededWiki?.wikiId && input.wiki.supersededWiki.wikiId !== plan.wiki.expectedWikiId) {
          throw new Error('作废页必须是前一份已审 Wiki 计划的准确目标');
        }
        const { wiki: bound } = validatePlan({ ...plan, wiki: input.wiki });
        const page = await wikiPlan({ ...bound, expectedOwnerType: plan.wiki.expectedOwnerType,
          expectedOwnerId: plan.wiki.expectedOwnerId }, plan.linkTaskIds, steps);
        if (page.wiki.expectedOwnerId !== plan.wiki.expectedOwnerId || page.wiki.expectedOwnerType !== plan.wiki.expectedOwnerType) {
          throw new Error('替换 Wiki 改变了已确认归属');
        }
        Object.assign(plan, page);
      } else if (affected === 'repairRecord') {
        const draft = input.repairRecord, original = plan.repairRecord;
        validateReviewedBugRecord(draft, plan.registration, reviewedMerges(plan));
        if (!original || draft.author !== original.author || original.previousRecord &&
            draft.previousRecord?.commentId !== original.previousRecord.commentId) throw new Error('记录续接必须保留原账号和已知的本轮评论 ID');
        plan.repairRecord = draft;
        plan.registration = await steps.run('registration', plan.registration, false);
      } else {
        const evidence = input.targetEvidence;
        if (!evidence || !sha(evidence.deliveredSha) || !/^[a-f0-9]{64}$/.test(evidence.scopeFingerprint || '') ||
            !/^[a-f0-9]{64}$/.test(evidence.contentFingerprint || '') ||
            !Array.isArray(evidence.evidenceRefs) || !evidence.evidenceRefs.length) throw new Error('缺少准确交付版本的增量评审依据');
        const rows = repositoryRows(plan);
        targetIndex = plan.repositories ? rows.findIndex(row => row.merge.originUrl === previous.repository) : 0;
        const { merge } = rows[targetIndex];
        if (plan.repositories && repositoryKey(evidence.sourceRepository) !== repositoryKey(merge.originUrl)) {
          throw new Error('增量评审不属于当前暂停的仓库');
        }
        const { git } = repositoryReceipts(plan, previous.receipts)[targetIndex];
        targetReceipt = await mergeTestTarget(steps, { ...merge, mergeMode: 'CONTAINMENT_ONLY', mrIid: undefined,
          sourceSha: git.sourceSha, targetSha: evidence.deliveredSha }, false);
        if (targetReceipt.state !== 'VERIFIED' || targetReceipt.containment !== true ||
            targetReceipt.deliveredSha !== evidence.deliveredSha) throw new Error('增量评审目标与实时包含关系不一致');
        merge.mockSafety.deliverySourceEvidence = evidence;
      }
    } else if (input.recoverWiki !== undefined) {
      ({ plan, receipts: recoveryReceipts } = await prepareWikiRecovery(input, steps));
    } else {
      if (input.registration?.entryType === 'bug' && input.repairRecord && input.registration.prerequisites?.repairRecord) {
        const prior = input.registration.prerequisites.repairRecord, declared = input.repairRecord.previousRecord;
        if (declared !== undefined && (!declared || ['commentId', 'author', 'bodySha256'].some(key => declared[key] !== prior[key]))) {
          throw new Error('实施终点的修复记录与登记输入冲突');
        }
        input = { ...input, repairRecord: { ...input.repairRecord, previousRecord: prior } };
      }
      plan = await prepareSubmission(input, steps);
    }
    const hash = planFingerprint(plan), keys = workKeys(plan);
    const prior = [...this.plans.values()].filter(record => record.keys.some(key => keys.includes(key)));
    if (!previous && !recoveryReceipts && prior.some(record => record.plan.wikiRecovery && record.state !== 'SUPERSEDED')) {
      throw new Error('此项交付已进入换页续接，只能沿用原回执');
    }
    if (prior.some(record => record !== previous && record.started && record.state !== 'SUPERSEDED' &&
        !(record.hash === hash && record.state === 'AWAITING_CONFIRMATION'))) {
      throw new Error('此项交付已有实际执行；请沿用其回执，仅续接未完成动作');
    }
    for (const record of prior) {
      if (record.hash === hash && record.state === 'AWAITING_CONFIRMATION') {
        if (plan.wiki) record.plan.wiki.bodyFile = plan.wiki.bodyFile;
        return this.preview(record);
      }
      record.state = 'SUPERSEDED';
    }
    const receipts = previous?.receipts || recoveryReceipts || (plan.repositories
      ? { repositories: plan.repositories.map(row => ({ repository: row.merge.originUrl })) } : {});
    const record = { hash, keys, plan: snapshot(plan), receipts: snapshot(receipts),
      started: Boolean(previous || recoveryReceipts || repositoryRows(plan).some(row => row.recovery)), state: 'AWAITING_CONFIRMATION' };
    if (targetReceipt) repositoryReceipts(plan, record.receipts)[targetIndex].target = targetReceipt;
    if (resumeState === 'NEEDS_WIKI_REVIEW' && record.receipts.wiki) {
      (record.receipts.previousWikiReceipts ??= []).push({ wiki: record.receipts.wiki, links: record.receipts.links || [] });
      delete record.receipts.wiki; delete record.receipts.links;
    }
    this.plans.set(hash, record);
    return this.preview(record);
  }

  async resumeManualMerge(input, record, steps) {
    if (Object.keys(input).length !== 1) throw new Error('人工合并续接只能核实原计划中的 MR');
    const pending = repositoryReceipts(record.plan, record.receipts).find(row => row.git?.state === 'AWAITING_MERGE');
    const verified = await mergeTestTarget(steps, pending.git.resumePlan, false);
    if (verified.state === 'AWAITING_MERGE') return summary(record);
    if (verified.state !== 'MERGED' || verified.writes !== 0 || verified.containment !== true) {
      throw new Error('未只读核实原 MR 的实际合并和源码包含关系');
    }
    pending.git = verified;
    record.state = 'AWAITING_CONFIRMATION';
    delete record.detail;
    delete record.repository;
    return this.preview(record);
  }

  preview(record) {
    const p = record.plan;
    return { ...summary(record), writes: 0, review: snapshot({ decisions: p.decisions, update: p.reviewUpdate,
      ...(p.repositories ? { repositories: p.repositories.map(reviewRepository) } : reviewRepository(p)),
      ...(p.wikiRecovery ? { recoverWiki: { previousWikiId: p.wikiRecovery.previousWikiId, mrIid: p.merge.mrIid,
        deliveredSha: p.wikiRecovery.releaseReceipt.expectedSha, jobUrl: p.wikiRecovery.releaseReceipt.jobUrl,
        queueId: p.wikiRecovery.releaseReceipt.queueId } } : {}),
      wiki: p.wiki, approvedWikiBody: p.approvedWikiBody, linkTaskIds: p.linkTaskIds, ...(p.repairRecord ? { repairRecord: p.repairRecord } : {}),
      registration: { state: p.registration.state, entryType: p.registration.entryType, entryId: p.registration.entryId,
        statusAction: p.registration.statusAction, versionAction: p.registration.versionAction,
        expectedStatus: p.registration.expectedStatus, payload: p.registration.payload || {} } }) };
  }
  assertReviewed(input) {
    const record = this.plans.get(input.planId);
    if (!record || input.confirmed !== true || input.reviewedPlanHash !== record.hash || planFingerprint(record.plan) !== record.hash ||
        Object.keys(input).some(key => !['planId', 'confirmed', 'reviewedPlanHash'].includes(key))) {
      throw new Error('执行必须引用当前会话已审、已确认的同一完整计划');
    }
    if (record.state === 'SUPERSEDED') throw new Error('计划已被当前事实替换');
    return record;
  }
  async execute(input, steps) {
    const record = this.assertReviewed(input);
    if (record.state !== 'AWAITING_CONFIRMATION') return summary(record);
    record.started = true; record.state = 'RUNNING';
    const { plan, receipts } = record;
    let repository, activeReceipts;
    const pause = (state, error) => {
      record.state = state; record.detail = error.message; record.repository = repository;
      return summary(record);
    };
    let phase = plan.wikiRecovery ? 'wikiRecovery' : 'git';
    try {
      if (plan.wikiRecovery) Object.assign(receipts, await recheckWikiDelivery(plan, steps));
      const rows = repositoryRows(plan);
      const repoReceipts = repositoryReceipts(plan, receipts);
      if (plan.wiki && repoReceipts.some((row, index) => !row.git && !rows[index].recovery)) {
        try {
          await steps.run('wiki', plan.wiki, false);
          await inspectSelectedWikiLinks(steps.call('tapd-mcp'), plan.wiki, plan.linkTaskIds);
        } catch (error) { return pause('NEEDS_WIKI_REVIEW', error); }
      }
      const deliveries = [], mockSafeties = [];
      for (const [index, row] of rows.entries()) {
        repository = plan.repositories ? row.merge.originUrl : undefined;
        activeReceipts = repoReceipts[index];
        if (row.recovery) {
          phase = 'recoverDelivery';
          Object.assign(activeReceipts, await recheckRecoveredRepository(row, steps));
        }
        phase = 'git';
        if (!activeReceipts.git) {
          let merge = row.merge;
          if (row.localGit) {
            activeReceipts.localGit = {};
            const sourceSha = await executeSubmissionGit(merge, row.localGit, activeReceipts.localGit, steps.io);
            merge = { ...merge, sourceSha, ...immutableSource(merge, sourceSha) };
          }
          activeReceipts.git = await mergeTestTarget(steps, merge, merge.mergeMode !== 'CONTAINMENT_ONLY');
          if (activeReceipts.git.state === 'AWAITING_MERGE') {
            return pause('AWAITING_MERGE', new Error('需按原 MR 只读核实人工合并'));
          }
        }
        const git = activeReceipts.target || activeReceipts.git;
        if (!['MERGED', 'VERIFIED'].includes(git.state) || git.containment !== true || !sha(git.deliveredSha)) {
          throw new Error('缺少已核实的交付源码回执');
        }
        if (!plan.wikiRecovery && !row.recovery && git.observedTargetSha !== git.deliveredSha) {
          return pause('NEEDS_TARGET_REVIEW', new Error('测试分支已前进，需核对目标增量及新的交付版本'));
        }
        const { mockSafety } = immutableSource(row.merge, git.sourceSha);
        deliveries.push(git);
        mockSafeties.push(mockSafety);
        phase = 'release';
        if (activeReceipts.release) continue;
        if (!row.release) {
          activeReceipts.release = { state: 'SKIPPED_BY_INTENT', writes: 0,
            ...(plan.repositories ? { sourceRepository: git.originUrl, expectedSha: git.deliveredSha } : {}) };
          continue;
        }
        try {
          activeReceipts.release = await steps.run('release', { ...row.release, mockSafety,
            requiredRepositories: [git.originUrl], gitDeliveryReceipts: [git], purpose: row.merge.purpose,
            targetEnvironment: 'test', targetBranch: git.targetBranch, expectedSha: git.deliveredSha,
            version: row.release.versionParameter ? row.release.version : git.deliveredSha }, true);
        } catch (error) {
          if (!error.result && /目标分支包含额外内容|发布前源码 ref\/SHA 已变化/.test(error.message)) {
            return pause('NEEDS_TARGET_REVIEW', error);
          }
          throw error;
        }
        if (activeReceipts.release.state !== 'BUILD_SUBMITTED' || !Number.isSafeInteger(activeReceipts.release.queueId) ||
            activeReceipts.release.expectedSha !== git.deliveredSha) throw new Error('未取得本次目标 SHA 的确切队列回执');
      }
      repository = undefined;
      const binding = { requiredRepositories: rows.map(row => row.merge.originUrl), gitDeliveryReceipts: deliveries,
        purpose: rows[0].merge.purpose, targetEnvironment: 'test',
        ...(plan.repositories ? { mockSafeties } : { mockSafety: mockSafeties[0], targetBranch: deliveries[0].targetBranch }) };
      const builds = repoReceipts.map(row => row.release);
      const prerequisites = { git: 'VERIFIED',
        deployment: builds.some(build => build.state === 'BUILD_SUBMITTED') ? 'BUILD_SUBMITTED' : 'SKIPPED_BY_INTENT',
        ...(plan.repositories ? { deploymentReceipts: builds } : { deploymentReceipt: builds[0] }),
        profile: plan.wiki ? 'STANDARD' : 'NO_WIKI', wiki: plan.wiki ? 'VERIFIED' : 'SKIPPED_NO_WIKI' };
      if (plan.repositories) checkDeliveryPrerequisites({ ...binding, prerequisites });
      phase = 'wiki';
      if (plan.wiki && !receipts.wiki) {
        await inspectSelectedWikiLinks(steps.call('tapd-mcp'), plan.wiki, plan.linkTaskIds);
        receipts.wiki = await steps.run('wiki', { ...plan.wiki, ...binding }, true);
        if (!receipts.wiki.wikiId || !receipts.wiki.bodySha256) throw new Error('未取得共享 Wiki 正文读回');
      }
      phase = 'links';
      receipts.links ??= [];
      for (const taskId of plan.linkTaskIds) {
        if (receipts.links.some(link => link.entryId === taskId)) continue;
        const wiki = receipts.wiki;
        const link = await steps.run('wiki', { ...plan.wiki, ...binding, mode: 'link', entryType: 'tasks', entryId: taskId,
          bodyFile: undefined, entryMarkdown: undefined, expectedApprovedBodySha256: undefined, expectTarget: 'REUSE_EXISTING',
          expectedWikiId: wiki.wikiId, wikiTitle: wiki.wikiTitle, expectedMonthId: wiki.monthWikiId,
          expectedBodySha256: wiki.bodySha256 }, true);
        if (link.wikiId !== wiki.wikiId || !['LINKED', 'ALREADY_LINKED'].includes(link.state)) throw new Error('任务回链未读回');
        receipts.links.push({ entryId: taskId, wikiId: link.wikiId, state: link.state });
      }
      if (plan.repairRecord && !receipts.repairRecord) {
        phase = 'repairRecord';
        receipts.repairRecord = await publishSubmissionBugRecord(steps.call('tapd-mcp'), plan.repairRecord,
          { ...binding, prerequisites, registration: plan.registration,
            ...(plan.repositories ? { reviewedSources: rows.map(({ merge }) => ({ originUrl: merge.originUrl,
              sourceSha: merge.sourceSha, contentFingerprint: merge.mockSafety.contentFingerprint })) }
              : { reviewedSourceSha: plan.merge.sourceSha }),
            wikiReceipt: receipts.wiki, confirmed: true }, steps.io);
      }
      phase = 'registration';
      receipts.registration = plan.registration.state === 'NOT_APPLICABLE' ? { state: 'NOT_APPLICABLE', writes: 0 }
        : await steps.run('registration', { ...plan.registration, ...binding, prerequisites: { ...prerequisites,
          ...(receipts.repairRecord ? { repairRecord: receipts.repairRecord } : {}) } }, true);
      if (!['REGISTERED', 'ALREADY_REGISTERED', 'SKIPPED_ALREADY_WAITING_TEST', 'NOT_APPLICABLE'].includes(receipts.registration.state)) throw new Error('登记尚未完成');
      record.state = 'SUBMITTED';
      return summary(record);
    } catch (error) {
      const step = error.result;
      if (phase === 'repairRecord' && error.code === 'REPAIR_REVIEW_REQUIRED' && (!step || step.writes === 0)) {
        return pause('NEEDS_REPAIR_REVIEW', error);
      }
      if (['wiki', 'links'].includes(phase) && error.code === 'WIKI_REVIEW_REQUIRED' &&
          (!step || step.writes === 0 && !['UNKNOWN'].includes(step.wikiState) && step.commentState !== 'UNKNOWN')) {
        return pause('NEEDS_WIKI_REVIEW', error);
      }
      const readOnly = ['wikiRecovery', 'recoverDelivery'].includes(phase);
      const uncertain = !readOnly && (step?.state === 'UNKNOWN' || ['CREATE_MR', 'MERGE_MR', 'READ_MERGE', 'TRIGGER', 'UPDATE', 'READBACK', 'CREATE_MONTH', 'CREATE_WIKI',
        'UPDATE_WIKI', 'LINK_COMMENT', 'READ_COMMENT'].includes(step?.phase) ||
        step?.wikiState === 'UNKNOWN' || step?.commentState === 'UNKNOWN' ||
        phase === 'git' && activeReceipts?.localGit?.state !== 'VERIFIED' && ['COMMIT', 'PUSH'].includes(activeReceipts?.localGit?.phase));
      record.state = uncertain ? 'UNKNOWN' : 'BLOCKED'; record.detail = error.message; record.repository = repository;
      error.result = { ...summary(record), phase, writes: readOnly ? 0 : null, failedStep: step || null, error: error.message };
      throw error;
    }
  }
}
