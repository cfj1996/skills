import { readTool, repositoryKey, requireText, sha256 } from './workflow-runtime.mjs';
import { records } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { wikiEntry } from './wiki-entry.mjs';
import { checkMockSafetySet } from './mock-safety.mjs';

const HASH = /^[a-f\d]{64}$/;

export function validatePendingWikiPlan(plan, merge) {
  if (!plan || !['STANDARD', 'NO_WIKI'].includes(plan.profile) || !['BUSINESS', 'TOOLING'].includes(plan.serviceType)) {
    throw new Error('待合并 Wiki 计划缺少明确的提测策略和服务类型');
  }
  if (plan.profile === 'NO_WIKI' || plan.serviceType === 'TOOLING') return;
  for (const key of ['wikiTitle', 'entryHeading', 'beforeBodySha256', 'afterBodySha256']) requireText(plan[key], key);
  if (!/^\d+$/.test(String(plan.workspaceId)) || !/^\d+$/.test(String(plan.wikiId)) ||
      !/^\d+$/.test(String(plan.parentWikiId)) || !HASH.test(plan.beforeBodySha256) || !HASH.test(plan.afterBodySha256) ||
      !/^[1-9]\d*[.、]\s*\S/.test(plan.entryHeading) ||
      !['master', 'main'].includes(merge.targetBranch) || !/^(feature|fixbug)\/[^\s]+$/.test(merge.sourceBranch)) {
    throw new Error('待合并 Wiki 计划的目标、条目、正文指纹或原分支无效');
  }
}

// Preserve the exact page bytes outside the one selected business status.
// An exact heading plus repository and branch disambiguates shared Wiki pages.
export function pendingWikiPatch(body, { entryHeading, sourceBranch, originUrl }) {
  const { lines, indexes } = wikiEntry(body, { entryHeading, sourceBranch, originUrl });
  if (indexes.some(i => /^\s*-\s*当前版本\s*[:：]/.test(lines[i]))) throw new Error('工具版本字段不能改为业务待合并状态');
  const statusLines = indexes.filter(i => /^\s*-\s*是否上线\s*[:：]/.test(lines[i]));
  if (statusLines.length !== 1) throw new Error('Wiki 上线状态缺失或重复');
  const index = statusLines[0];
  const match = lines[index].match(/^(\s*-\s*是否上线\s*[:：]\s*)(未合并|待合并)([ \t]*\r?)$/);
  if (!match) throw new Error('Wiki 上线状态不允许改为待合并；不得回退已合并条目');
  lines[index] = `${match[1]}待合并${match[3]}`;
  return { beforeStatus: match[2], afterStatus: '待合并', body: lines.join('\n') };
}

// TAPD responses may contain nested serialized envelopes; never ignore a failure status.
function assertTapdSuccess(value, depth = 0) {
  if (depth > 10) throw new Error('Wiki 响应嵌套过深');
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'status') && Object.hasOwn(value, 'data') && String(value.status) !== '1') throw new Error('Wiki 读写返回失败');
  for (const [key, child] of Object.entries(value)) if (!['description', 'markdown_description'].includes(key)) assertTapdSuccess(child, depth + 1);
}

async function wikiById(call, plan) {
  const raw = await readTool(call, 'get_wiki', { workspace_id: Number(plan.workspaceId), options: { id: plan.wikiId, limit: 1 } });
  assertTapdSuccess(raw);
  const rows = records(raw, 'Wiki');
  if (rows.length !== 1) throw new Error('Wiki 读回不唯一');
  const wiki = rows[0];
  if (String(wiki.id) !== String(plan.wikiId) || String(wiki.workspace_id) !== String(plan.workspaceId) ||
      String(wiki.parent_wiki_id) !== String(plan.parentWikiId) || wiki.name !== plan.wikiTitle ||
      typeof wiki.markdown_description !== 'string') throw new Error('Wiki 身份或 Markdown 正文与计划不一致');
  return wiki;
}

export async function markPendingMergeWiki(gitlab, tapd, plan, mergeResult, { execute = false, confirmed = false, io = {} } = {}) {
  validatePendingWikiPlan(plan, mergeResult);
  if (plan.profile === 'NO_WIKI') return { state: 'SKIPPED_NO_WIKI', writes: 0 };
  if (plan.serviceType === 'TOOLING') return { state: 'SKIPPED_TOOL_PROJECT', writes: 0 };
  if (execute && !confirmed) throw new Error('待合并 Wiki 补丁缺少明确授权');
  if (mergeResult.state !== 'AWAITING_MERGE' || !mergeResult.mrIid || !mergeResult.sourceSha) throw new Error('只有准确的待人工合并 MR 才能更新待合并 Wiki');
  const [project, mr] = await Promise.all([
    readTool(gitlab, 'get_project', { project_id: mergeResult.projectId }),
    readTool(gitlab, 'get_merge_request', { project_id: mergeResult.projectId, merge_request_iid: String(mergeResult.mrIid) }),
  ]);
  if (String(project.id) !== String(mergeResult.projectId) || project.default_branch !== mergeResult.targetBranch ||
      ![project.http_url_to_repo, project.ssh_url_to_repo].filter(Boolean).some(url => repositoryKey(url) === repositoryKey(mergeResult.originUrl)) ||
      String(mr.iid) !== String(mergeResult.mrIid) || mr.state !== 'opened' || mr.source_branch !== mergeResult.sourceBranch ||
      mr.target_branch !== mergeResult.targetBranch || (mr.sha || mr.diff_refs?.head_sha) !== mergeResult.sourceSha ||
      mr.web_url !== mergeResult.mrUrl || mr.has_conflicts === true || mr.draft === true || mr.work_in_progress === true ||
      (mr.source_project_id !== undefined && String(mr.source_project_id) !== String(project.id)) ||
      (mr.target_project_id !== undefined && String(mr.target_project_id) !== String(project.id)) ||
      ['failed', 'canceled', 'manual'].includes((mr.head_pipeline || mr.pipeline)?.status)) {
    throw new Error('MR 状态、仓库、原分支或 source SHA 已变化；停止待合并 Wiki 写入');
  }
  const wiki = await wikiById(tapd, plan);
  const beforeBody = wiki.markdown_description;
  const patch = pendingWikiPatch(beforeBody, { ...plan, ...mergeResult });
  const beforeHash = sha256(beforeBody), afterHash = sha256(patch.body);
  if (afterHash !== plan.afterBodySha256 || (beforeHash !== plan.beforeBodySha256 && beforeHash !== plan.afterBodySha256)) {
    throw new Error('Wiki 正文或批准的待合并补丁已变化，需要重新预览确认');
  }
  const result = { state: patch.beforeStatus === '待合并' ? 'ALREADY_PENDING_MERGE' : 'PLANNED_PENDING_MERGE',
    wikiId: String(plan.wikiId), wikiUrl: `https://www.tapd.cn/${plan.workspaceId}/markdown_wikis/show/#${plan.wikiId}`,
    beforeBodySha256: beforeHash, afterBodySha256: afterHash, mrUrl: mergeResult.mrUrl, writes: 0 };
  if (!execute || patch.body === beforeBody) return result;
  await checkMockSafetySet(plan, { operation: 'production-wiki', purpose: plan.purpose || '记录已确认上线 MR 的待人工合并状态',
    environmentKind: 'production', targetEnvironment: 'production', targetBranch: mergeResult.targetBranch,
    sourceRepository: mergeResult.originUrl, sourceSha: mergeResult.sourceSha, requireCommitted: true }, io);
  try {
    const updated = await readTool(tapd, 'update_wiki', { workspace_id: Number(plan.workspaceId),
      options: { id: plan.wikiId, markdown_description: patch.body } });
    assertTapdSuccess(updated);
    result.writes = 1;
    const readback = await wikiById(tapd, plan);
    if (readback.markdown_description !== patch.body) throw new Error('Wiki 待合并状态写入后读回不一致');
    return { ...result, state: 'UPDATED_PENDING_MERGE' };
  } catch (error) {
    error.result = { ...result, state: 'BLOCKED', writeOutcome: result.writes ? 'READBACK_FAILED' : 'UNKNOWN', error: error.message };
    throw error;
  }
}
