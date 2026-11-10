import { readFile } from 'node:fs/promises';
import { inspectSelectedWikiLinks } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { prepareSubmissionGit, executeSubmissionGit } from './submission-git.mjs';
import { validateReviewedBugRecord, publishSubmissionBugRecord } from './submit-bug-record.mjs';
import { verifyAcceptedTestBuild } from './jenkins-readonly.mjs';
import { loadFrozenJenkinsContract, verifyFrozenJenkinsReceiptParameters } from './frozen-jenkins-contracts.mjs';
import { readTool, repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';

const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const id = value => typeof value === 'string' && /^\d+$/.test(value);
const workKey = plan => stableJson([plan.registration.workspaceId, plan.registration.entryType,
  plan.registration.entryId, repositoryKey(plan.merge.originUrl)]);
const testBranch = name => ['dev', 'develop'].includes(name);
const snapshot = value => structuredClone(value);

function planFingerprint(plan) {
  if (!plan.wiki) return sha256(stableJson(plan));
  const { bodyFile, ...wiki } = plan.wiki;
  // The approved bytes, target and scope are bound separately from their temporary carrier.
  return sha256(stableJson({ ...plan, wiki }));
}

function validatePlan(input) {
  const { merge, release, wiki, registration, linkTaskIds = [] } = input;
  if (input.decisions !== undefined && (!Array.isArray(input.decisions) ||
      input.decisions.some(value => typeof value !== 'string' || !value.trim()))) throw new Error('当前清单的决定需为简短的已核实事实');
  if (!merge || !sha(merge.sourceSha) || !sha(merge.targetSha) || !testBranch(merge.targetBranch) ||
      !/^(feature|fixbug)\/[^\s]+$/.test(merge.sourceBranch) || merge.reviewPassed !== true ||
      typeof merge.pipelineRequired !== 'boolean' || !merge.projectId || !merge.originUrl ||
      !merge.repositoryPath || !merge.purpose?.trim() || !merge.mockSafety || merge.mockSafeties ||
      merge.pendingWiki || merge.targetEnvironment && merge.targetEnvironment !== 'test' ||
      !['AUTO', 'CONTAINMENT_ONLY', undefined].includes(merge.mergeMode) ||
      input.localGit && merge.mergeMode === 'CONTAINMENT_ONLY') throw new Error('连续提测需要一个已评审的原分支、准确源码/目标 SHA 和测试交付清单');
  const bug = registration?.entryType === 'bug';
  if (!registration || !['stories', 'tasks', 'bug'].includes(registration.entryType) || !id(registration.entryId) ||
      !Number.isSafeInteger(registration.workspaceId) || registration.workspaceId < 1 ||
      registration.statusAction !== (bug ? 'WAITING_TEST' : 'NONE') || !['NONE', 'WRITE'].includes(registration.versionAction)) {
    throw new Error('连续提测需绑定单仓的准确工作项和状态/版本动作，Bug 必须核实待测试登记');
  }
  if (bug) validateReviewedBugRecord(input.repairRecord, registration, merge);
  else if (input.repairRecord != null) throw new Error('Story/Task 不发表 Bug 修复记录');
  if (release !== null && (!release || release.releaseKind !== 'deployment' || release.releaseChannel !== 'canary' ||
      release.targetEnvironment !== 'test' || !release.releaseTarget || !release.jobUrl ||
      release.releaseRef !== merge.targetBranch || repositoryKey(release.sourceRepository) !== repositoryKey(merge.originUrl))) {
    throw new Error('测试构建需给定同仓测试分支、releaseTarget、准确 Job，或明确选择 null 跳过');
  }
  if (wiki !== null && (!wiki || (wiki.mode ?? 'ensure') !== 'ensure' || !(wiki.creator || wiki.commentAuthor)?.trim() ||
      wiki.workspaceId !== registration.workspaceId || wiki.entryType !== registration.entryType ||
      wiki.entryId !== registration.entryId || wiki.sourceBranch !== merge.sourceBranch ||
      repositoryKey(wiki.entryRepoUrl) !== repositoryKey(merge.originUrl))) throw new Error('Wiki 需绑定本轮条目、仓库、分支，或明确选择 null');
  if (!Array.isArray(linkTaskIds) || linkTaskIds.some(value => !id(value)) || bug && linkTaskIds.length ||
      new Set(linkTaskIds).size !== linkTaskIds.length || !wiki && linkTaskIds.length) throw new Error('任务回链范围无效');
}

async function wikiPlan(wiki, taskIds, steps) {
  if (!wiki) return null;
  const afterHash = wiki.bodyFile ? sha256(await readFile(wiki.bodyFile)) : null;
  const bound = { ...wiki, expectedApprovedBodySha256: afterHash };
  const preview = await steps.run('wiki', bound, false);
  if (preview.entryOperation === 'APPEND_ENTRY' && !afterHash || !preview.wikiId && !afterHash) {
    throw new Error('连续提测需要已经准备好的完整 Wiki 正文或补丁');
  }
  const result = { ...bound, expectedOwnerId: preview.wikiOwner.entryId, expectedOwnerType: preview.wikiOwner.entryType,
    expectTarget: preview.target, expectedWikiId: preview.wikiId, expectedMonthId: preview.monthWikiId,
    expectedBodySha256: preview.beforeBodySha256, month: preview.month || wiki.month, wikiTitle: preview.wikiTitle };
  await inspectSelectedWikiLinks(steps.call('tapd-mcp'), result, taskIds);
  return result;
}

function immutableSource(merge, revision) {
  return { mockSafety: { ...merge.mockSafety, revisionSha: revision } };
}
function summary(record) {
  return { state: record.state, planId: record.hash, receipts: snapshot(record.receipts),
    ...(record.detail ? { detail: record.detail } : {}) };
}
async function prepareLocalMerge(merge, { call }) {
  const gitlab = call('gitlab-mcp'), args = { project_id: merge.projectId };
  const [project, target] = await Promise.all([readTool(gitlab, 'get_project', args),
    readTool(gitlab, 'get_branch', { ...args, branch_name: merge.targetBranch })]);
  if (![project.http_url_to_repo, project.ssh_url_to_repo].filter(Boolean).some(url =>
    repositoryKey(url) === repositoryKey(merge.originUrl)) || target.commit?.id !== merge.targetSha || !merge.title?.trim()) {
    throw new Error('本地提交前的 GitLab 项目、目标分支或 MR 标题不匹配');
  }
  return { ...merge, pipelineRequired: merge.pipelineRequired || project.only_allow_merge_if_pipeline_succeeds === true };
}

async function recheckWikiDelivery(plan, steps) {
  const { merge, wikiRecovery: { releaseReceipt } } = plan;
  const contract = await loadFrozenJenkinsContract({ ...releaseReceipt, repositoryPath: merge.repositoryPath }, steps.io);
  const reader = steps.reader(releaseReceipt);
  if (reader.instanceUrl !== contract.instance.url.replace(/\/$/, '') || contract.profile.environmentKind !== 'test') {
    throw new Error('原测试构建的 Jenkins 实例或环境与已核实约定不一致');
  }
  verifyFrozenJenkinsReceiptParameters(contract, releaseReceipt);
  const [git, verification] = await Promise.all([
    steps.run('merge', { ...merge, mergeMode: 'VERIFY_ONLY', expectedDeliveredSha: releaseReceipt.expectedSha }, false),
    verifyAcceptedTestBuild(reader, releaseReceipt),
  ]);
  if (git.state !== 'MERGED' || git.writes !== 0 || git.containment !== true ||
      git.mrIid !== merge.mrIid || git.deliveredSha !== releaseReceipt.expectedSha) {
    throw new Error('未只读核实原 MR 及队列回执对应的实际交付 SHA');
  }
  return { git, release: { ...releaseReceipt, reused: true, verification: { ...verification, writes: 0 } } };
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
  if (page.expectedWikiId !== wiki.expectedWikiId || page.expectTarget !== 'REUSE_EXISTING') {
    throw new Error('跨会话续接只能使用已核实的现有替代 Wiki');
  }
  return { plan: { ...plan, wiki: page }, receipts };
}

// One session owns the plans and the actual effects. The public ID is not a
// receipt, and callers cannot replace an earlier Git or queue result on resume.
export class TestSubmissions {
  plans = new Map();

  async prepare(input, steps) {
    const previous = input.resumePlanId && this.plans.get(input.resumePlanId);
    const resumeState = previous?.state;
    let plan, targetReceipt, recoveryReceipts;
    if (input.resumePlanId) {
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
        validatePlan({ ...plan, wiki: input.wiki });
        const wiki = await wikiPlan({ ...input.wiki, expectedOwnerType: plan.wiki.expectedOwnerType,
          expectedOwnerId: plan.wiki.expectedOwnerId }, plan.linkTaskIds, steps);
        if (wiki.expectedOwnerId !== plan.wiki.expectedOwnerId || wiki.expectedOwnerType !== plan.wiki.expectedOwnerType) {
          throw new Error('替换 Wiki 改变了已确认归属');
        }
        plan.wiki = wiki;
      } else if (affected === 'repairRecord') {
        const draft = input.repairRecord, original = plan.repairRecord;
        validateReviewedBugRecord(draft, plan.registration, plan.merge);
        if (!original || draft.author !== original.author || original.previousRecord &&
            draft.previousRecord?.commentId !== original.previousRecord.commentId) throw new Error('记录续接必须保留原账号和已知的本轮评论 ID');
        plan.repairRecord = draft;
        plan.registration = await steps.run('registration', plan.registration, false);
      } else {
        const evidence = input.targetEvidence;
        if (!evidence || !sha(evidence.deliveredSha) || !/^[a-f0-9]{64}$/.test(evidence.scopeFingerprint || '') ||
            !/^[a-f0-9]{64}$/.test(evidence.contentFingerprint || '') ||
            !Array.isArray(evidence.evidenceRefs) || !evidence.evidenceRefs.length) throw new Error('缺少准确交付版本的增量评审依据');
        targetReceipt = await steps.run('merge', { ...plan.merge, mergeMode: 'CONTAINMENT_ONLY', mrIid: undefined,
          sourceSha: previous.receipts.git.sourceSha, targetSha: evidence.deliveredSha }, false);
        if (targetReceipt.state !== 'VERIFIED' || targetReceipt.containment !== true ||
            targetReceipt.deliveredSha !== evidence.deliveredSha) throw new Error('增量评审目标与实时包含关系不一致');
        plan.merge.mockSafety.deliverySourceEvidence = evidence;
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
      validatePlan(input);
      if (input.wiki?.supersededWiki) throw new Error('明确作废的历史页只在已有交付回执的 Wiki 续接使用');
      const { localGit, merge, release, wiki, registration, repairRecord, decisions = [], linkTaskIds = [] } = input;
      const preparedLocal = localGit && await prepareSubmissionGit(merge, localGit, steps.io);
      const [git, build, page, register] = await Promise.all([
        localGit ? prepareLocalMerge(merge, steps) : steps.run('merge', merge, false),
        release && steps.run('release', { ...release, expectedSha: merge.targetSha,
          completionMode: 'TRIGGER_ACCEPTED', purpose: merge.purpose, mockSafety: merge.mockSafety }, false),
        wikiPlan(wiki, linkTaskIds, steps),
        steps.run('registration', { ...registration, purpose: merge.purpose }, false),
      ]);
      if (!localGit && !['VERIFIED', 'AWAITING_CONFIRMATION'].includes(git.state)) throw new Error('合并预览尚未就绪');
      plan = { merge: { ...merge, sourceSha: git.sourceSha, targetSha: git.targetSha, pipelineRequired: git.pipelineRequired ?? merge.pipelineRequired,
        mrIid: git.mrIid || merge.mrIid }, localGit: preparedLocal || null, release: build, wiki: page,
        registration: { ...registration, ...register }, ...(repairRecord ? { repairRecord } : {}), decisions, linkTaskIds };
    }
    const hash = planFingerprint(plan), key = workKey(plan);
    const prior = [...this.plans.values()].filter(record => record.key === key);
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
    const record = { hash, key, plan: snapshot(plan), receipts: snapshot(previous?.receipts || recoveryReceipts || {}),
      started: Boolean(previous), state: 'AWAITING_CONFIRMATION' };
    if (targetReceipt) record.receipts.target = targetReceipt;
    if (resumeState === 'NEEDS_WIKI_REVIEW' && record.receipts.wiki) {
      (record.receipts.previousWikiReceipts ??= []).push({ wiki: record.receipts.wiki, links: record.receipts.links || [] });
      delete record.receipts.wiki; delete record.receipts.links;
    }
    this.plans.set(hash, record);
    return this.preview(record);
  }
  preview(record) {
    const p = record.plan;
    return { ...summary(record), writes: 0, review: snapshot({ decisions: p.decisions, update: p.reviewUpdate, repository: p.merge.originUrl,
      sourceBranch: p.merge.sourceBranch, sourceSha: p.merge.sourceSha, targetBranch: p.merge.targetBranch, targetSha: p.merge.targetSha,
      localGit: p.localGit && { commit: p.localGit.commit, push: p.localGit.push, message: p.localGit.message, files: Object.keys(p.localGit.files) },
      mergeMode: p.merge.mergeMode || 'AUTO', purpose: p.merge.purpose,
      mockModules: p.merge.mockSafety.mockModules, release: p.release && { jobUrl: p.release.jobUrl, params: p.release.params },
      ...(p.wikiRecovery ? { recoverWiki: { previousWikiId: p.wikiRecovery.previousWikiId, mrIid: p.merge.mrIid,
        deliveredSha: p.wikiRecovery.releaseReceipt.expectedSha, jobUrl: p.wikiRecovery.releaseReceipt.jobUrl,
        queueId: p.wikiRecovery.releaseReceipt.queueId } } : {}),
      wiki: p.wiki, linkTaskIds: p.linkTaskIds, ...(p.repairRecord ? { repairRecord: p.repairRecord } : {}),
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
    const pause = (state, error) => {
      record.state = state; record.detail = error.message;
      return summary(record);
    };
    let phase = plan.wikiRecovery ? 'wikiRecovery' : 'git';
    try {
      if (plan.wikiRecovery) Object.assign(receipts, await recheckWikiDelivery(plan, steps));
      if (!receipts.git) {
        if (plan.wiki) {
          try {
            await steps.run('wiki', plan.wiki, false);
            await inspectSelectedWikiLinks(steps.call('tapd-mcp'), plan.wiki, plan.linkTaskIds);
          } catch (error) { return pause('NEEDS_WIKI_REVIEW', error); }
        }
        let merge = plan.merge;
        if (plan.localGit) {
          receipts.localGit = {};
          const sourceSha = await executeSubmissionGit(merge, plan.localGit, receipts.localGit, steps.io);
          merge = { ...merge, sourceSha, ...immutableSource(merge, sourceSha) };
        }
        receipts.git = await steps.run('merge', merge, merge.mergeMode !== 'CONTAINMENT_ONLY');
        if (receipts.git.state === 'AWAITING_MERGE') return pause('AWAITING_MERGE', new Error('需按原 MR 只读核实人工合并'));
      }
      const git = receipts.target || receipts.git;
      if (!['MERGED', 'VERIFIED'].includes(git.state) || git.containment !== true || !sha(git.deliveredSha)) {
        throw new Error('缺少已核实的交付源码回执');
      }
      if (!plan.wikiRecovery && git.observedTargetSha !== git.deliveredSha) return pause('NEEDS_TARGET_REVIEW',
        new Error('测试分支已前进，需核对目标增量及新的交付版本'));
      const binding = { ...immutableSource(plan.merge, git.sourceSha), requiredRepositories: [git.originUrl],
        gitDeliveryReceipts: [git], purpose: plan.merge.purpose, targetEnvironment: 'test', targetBranch: git.targetBranch };
      phase = 'release';
      if (!receipts.release) {
        if (plan.release) {
          try { receipts.release = await steps.run('release', { ...plan.release, ...binding, expectedSha: git.deliveredSha,
            version: plan.release.versionParameter ? plan.release.version : git.deliveredSha }, true); }
          catch (error) {
            // Release reports a structured phase for every attempted trigger.
            // A missing delivered-tree review is a pre-write, local evidence gap.
            if (!error.result && /目标分支包含额外内容|发布前源码 ref\/SHA 已变化/.test(error.message)) return pause('NEEDS_TARGET_REVIEW', error);
            throw error;
          }
          if (receipts.release.state !== 'BUILD_SUBMITTED' || !Number.isSafeInteger(receipts.release.queueId) ||
              receipts.release.expectedSha !== git.deliveredSha) throw new Error('未取得本次目标 SHA 的确切队列回执');
        } else receipts.release = { state: 'SKIPPED_BY_INTENT', writes: 0 };
      }
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
          bodyFile: undefined, expectedApprovedBodySha256: undefined, expectTarget: 'REUSE_EXISTING',
          expectedWikiId: wiki.wikiId, wikiTitle: wiki.wikiTitle, expectedMonthId: wiki.monthWikiId,
          expectedBodySha256: wiki.bodySha256 }, true);
        if (link.wikiId !== wiki.wikiId || !['LINKED', 'ALREADY_LINKED'].includes(link.state)) throw new Error('任务回链未读回');
        receipts.links.push({ entryId: taskId, wikiId: link.wikiId, state: link.state });
      }
      const prerequisites = { git: 'VERIFIED', deployment: receipts.release.state, deploymentReceipt: receipts.release,
        profile: plan.wiki ? 'STANDARD' : 'NO_WIKI', wiki: plan.wiki ? 'VERIFIED' : 'SKIPPED_NO_WIKI' };
      if (plan.repairRecord && !receipts.repairRecord) {
        phase = 'repairRecord';
        receipts.repairRecord = await publishSubmissionBugRecord(steps.call('tapd-mcp'), plan.repairRecord,
          { ...binding, prerequisites, registration: plan.registration, reviewedSourceSha: plan.merge.sourceSha,
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
      const readOnly = phase === 'wikiRecovery';
      const uncertain = !readOnly && (step?.state === 'UNKNOWN' || ['CREATE_MR', 'MERGE_MR', 'READ_MERGE', 'TRIGGER', 'UPDATE', 'READBACK', 'CREATE_MONTH', 'CREATE_WIKI',
        'UPDATE_WIKI', 'LINK_COMMENT', 'READ_COMMENT'].includes(step?.phase) ||
        step?.wikiState === 'UNKNOWN' || step?.commentState === 'UNKNOWN' ||
        phase === 'git' && receipts.localGit?.state !== 'VERIFIED' && ['COMMIT', 'PUSH'].includes(receipts.localGit?.phase));
      record.state = uncertain ? 'UNKNOWN' : 'BLOCKED'; record.detail = error.message;
      error.result = { ...summary(record), phase, writes: readOnly ? 0 : null, failedStep: step || null, error: error.message };
      throw error;
    }
  }
}
