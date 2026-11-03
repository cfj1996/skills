import { apiData, checkDeliveryPrerequisites } from './register-test-submission.mjs';
import { checkMockSafetySet } from './mock-safety.mjs';
import { repositoryKey, sha256 } from './workflow-runtime.mjs';
import { listAllComments, records, assertSuccess } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';

import { bugRecordTitle as title, semanticBody, hasBugRepairTitle } from './bug-record-content.mjs';
const fields = 'id,workspace_id,entry_id,entry_type,author,description,created';
const recordDrift = message => Object.assign(new Error(message), { code: 'REPAIR_REVIEW_REQUIRED' });
const numeric = value => typeof value === 'string' && /^\d+$/.test(value);
const normalize = body => body.trim().replace(/\r\n/g, '\n').replace(/>\s+</g, '><');

export function validateReviewedBugRecord(draft, registration, merge) {
  if (!draft || !Object.hasOwn(draft, 'previousRecord') || draft.previousRecord === undefined ||
      draft.workspaceId !== registration.workspaceId || draft.entryId !== registration.entryId ||
      !draft.author?.trim() || draft.author.trim() !== draft.author || typeof draft.body !== 'string' ||
      draft.reviewedSourceSha !== merge.sourceSha || draft.contentFingerprint !== merge.mockSafety.contentFingerprint ||
      !Array.isArray(draft.requiredRepositories) || draft.requiredRepositories.length !== 1 ||
      repositoryKey(draft.requiredRepositories[0]) !== repositoryKey(merge.originUrl)) {
    throw new Error('单 Bug 修复记录需绑定完整已审仓库、源码/内容、空间、Bug 和准确评论账号');
  }
  const body = normalize(draft.body);
  const filled = (tag, label) => {
    const match = body.match(new RegExp('<' + tag + '><strong>' + label + '：</strong>((?:(?!</' + tag + '>)[\\s\\S])*)</' + tag + '>'));
    return Boolean(match?.[1].replace(/<[^>]+>|&nbsp;/gi, '').trim());
  };
  if (Buffer.byteLength(body) > 65536 || !body.startsWith('<p><strong>' + title + '</strong></p>') ||
      body.split(title).length !== 2 || !['产生原因', '引入人', '引入时间', '引入提交／MR', '依据', '修复方式', '改动', '验证']
        .every(label => body.split('<strong>' + label + '：</strong>').length === 2) ||
      !['产生原因', '引入人', '引入时间', '引入提交／MR', '依据'].every(label => filled('p', label)) ||
      !['改动', '验证'].every(label => filled('li', label)) || !body.includes('<strong>修复方式：</strong></p><ul>') ||
      /<(?!\/?(?:p|strong|ul|li|br)\s*\/?>|\/a\s*>|a\s+href="https?:\/\/[^"<>]+"\s*>)/i.test(body)) {
    throw new Error('修复记录必须是已评审的单条完整 HTML 正文，保持规定字段、实际验证与安全链接');
  }
  const prior = draft.priorRounds ?? [];
  const previous = draft.previousRecord;
  if (previous != null && (!numeric(previous.commentId) || previous.author !== draft.author ||
      !/^[a-f0-9]{64}$/.test(previous.bodySha256 || '') ||
      previous.workspaceId != null && previous.workspaceId !== registration.workspaceId ||
      previous.entryId != null && previous.entryId !== registration.entryId)) throw new Error('当前轮既有评论回执与 Bug、账号或正文指纹不符');
  if (!Array.isArray(prior) || new Set(prior.map(row => row?.commentId)).size !== prior.length ||
      prior.some(row => !numeric(row?.commentId) || row.commentId === previous?.commentId || !row.author?.trim() || !row.created?.trim() ||
        !/^[a-f0-9]{64}$/.test(row.bodySha256 || '') || !row.roundEvidence?.trim())) {
    throw new Error('已结束的其他修复轮次需准确评论 ID、读回指纹和独立轮次依据');
  }
}

// Called only after this submission's Git, selected build, Wiki and link
// receipts. Never edit or replace an ambiguous historical repair comment.
export async function publishSubmissionBugRecord(call, draft, binding, io) {
  const { registration, prerequisites } = binding;
  const [git] = binding.gitDeliveryReceipts || [];
  if (binding.confirmed !== true || registration?.entryType !== 'bug' || !git ||
      !['SKIPPED_BY_INTENT', 'BUILD_SUBMITTED'].includes(prerequisites?.deployment) ||
      prerequisites.deploymentReceipt?.state !== prerequisites.deployment ||
      prerequisites?.deployment === 'BUILD_SUBMITTED' && (prerequisites.deploymentReceipt?.expectedSha !== git.deliveredSha ||
        repositoryKey(prerequisites.deploymentReceipt.sourceRepository) !== repositoryKey(git.originUrl)) ||
      prerequisites?.profile === 'STANDARD' && (binding.wikiReceipt?.entryType !== 'bug' ||
        binding.wikiReceipt.entryId !== draft.entryId || binding.wikiReceipt.workspaceId !== draft.workspaceId ||
        !binding.wikiReceipt.links?.some(row => row.entryType === 'bug' && row.entryId === draft.entryId &&
          ['LINKED', 'ALREADY_LINKED'].includes(row.state)))) throw new Error('Bug 修复记录缺少匹配的交付授权、队列或 Wiki 回链');
  checkDeliveryPrerequisites(binding);
  validateReviewedBugRecord(draft, registration, { originUrl: git.originUrl, sourceSha: binding.reviewedSourceSha, mockSafety: binding.mockSafety });
  const { workspaceId, entryId, author, body } = draft;
  const expected = semanticBody(body), prior = new Map((draft.priorRounds || []).map(row => [row.commentId, row]));
  const exact = async id => {
    const data = apiData(await call('get_comments', { workspace_id: workspaceId,
      options: { id, entry_type: 'bug', entry_id: entryId, limit: 2, page: 1, fields } }), 'get_comments');
    const rows = Array.isArray(data) ? data : [data];
    const live = rows.length === 1 && rows[0]?.Comment;
    if (!live || String(live.id) !== id || String(live.workspace_id) !== String(workspaceId) ||
        live.entry_type !== 'bug' || String(live.entry_id) !== entryId || live.author !== author ||
        typeof live.description !== 'string' || semanticBody(live.description) !== expected) {
      throw recordDrift('本轮 Bug 记录精确读回不一致');
    }
    return live;
  };
  const list = async () => {
    const comments = await listAllComments(call, workspaceId, 'bug', entryId, fields);
    const candidates = [], foundPrior = new Set();
    for (const row of comments) {
      if (!numeric(String(row.id)) || String(row.workspace_id) !== String(workspaceId) ||
          row.entry_type !== 'bug' || String(row.entry_id) !== entryId || typeof row.description !== 'string') {
        throw new Error('无法核实 Bug 评论列表的身份或正文');
      }
      const id = String(row.id);
      if (prior.has(id)) {
        const old = prior.get(id);
        if (!hasBugRepairTitle(row.description) || row.author !== old.author || row.created !== old.created ||
            sha256(row.description) !== old.bodySha256) throw recordDrift('历史修复记录已变化');
        foundPrior.add(id); continue;
      }
      if (!hasBugRepairTitle(row.description)) continue;
      if (row.author !== author || semanticBody(row.description) !== expected) {
        throw recordDrift('已有不同的修复记录，先核实本轮归属或更正原评论');
      }
      candidates.push(row);
    }
    if (prior.size !== foundPrior.size || candidates.length > 1) throw recordDrift('修复记录缺失或重复，不能自动新建或登记');
    return candidates[0];
  };
  await checkMockSafetySet(binding, { operation: 'test-registration', purpose: binding.purpose, environmentKind: 'test',
    targetEnvironment: 'test', targetBranch: binding.targetBranch, requireCommitted: true }, io);
  if (draft.previousRecord) {
    const previous = await exact(draft.previousRecord.commentId);
    if (sha256(previous.description) !== draft.previousRecord.bodySha256) throw recordDrift('当前轮已发表记录发生变化，需核实原评论');
    const only = await list();
    if (String(only?.id) !== draft.previousRecord.commentId) throw recordDrift('当前轮已发表记录与完整列表不一致');
    return { ...draft.previousRecord, state: 'VERIFIED', workspaceId, entryId, writes: 0 };
  }
  let comment = await list(), attempted = false, createdId;
  try {
    if (!comment) {
      const state = apiData(await call('get_bug', { workspace_id: workspaceId, options: {
        id: entryId, limit: 1, fields: ['id', 'status', 'current_owner', 'te', 'reporter', registration.versionField].filter(Boolean).join(',') } }), 'get_bug');
      const rows = Array.isArray(state) ? state : [state], bug = rows.length === 1 && rows[0]?.Bug;
      if (String(bug?.id) !== entryId || bug.status !== registration.expectedStatus ||
          registration.expectedAssignee && Object.entries(registration.expectedAssignee).some(([key, value]) => (bug[key] ?? null) !== value) ||
          registration.versionAction === 'WRITE' && bug[registration.versionField] !== registration.expectedVersion) {
        throw recordDrift('发表修复记录前 Bug 状态、处理人或版本已变化，重核受影响的登记计划');
      }
      attempted = true;
      const response = assertSuccess(await call('create_comments', { workspace_id: workspaceId,
        options: { entry_type: 'bug', entry_id: entryId, author, description: body } }), 'create_comments');
      const returned = records(response, 'Comment');
      if (returned.length > 1) throw new Error('新评论 ID 不唯一');
      createdId = returned[0]?.id == null ? undefined : String(returned[0].id);
      comment = await list();
      if (!comment || createdId && String(comment.id) !== createdId) throw new Error('未读回本次唯一修复记录');
    }
    const id = String(comment.id);
    const live = await exact(id);
    return { state: 'VERIFIED', workspaceId, entryId, commentId: id, author,
      bodySha256: sha256(live.description), writes: attempted ? 1 : 0 };
  } catch (error) {
    error.result = { state: attempted ? 'UNKNOWN' : 'BLOCKED', phase: attempted ? 'PUBLISH_REPAIR_RECORD' : 'CHECK_REPAIR_RECORD',
      workspaceId, entryId, commentId: createdId || (comment && String(comment.id)), writes: attempted ? null : 0, error: error.message };
    throw error;
  }
}
