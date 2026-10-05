import { buildLaunch, configPath, readConfig } from './start-mcp.mjs';
import { repositoryKey, readTool } from './workflow-runtime.mjs';

const count = value => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) &&
  Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function approvalEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('审批返回格式不可验证');
  if (Object.hasOwn(value, 'rules')) {
    if (!Array.isArray(value.rules)) throw new Error('审批规则格式不可验证');
    for (const rule of value.rules) {
      const required = count(rule?.approvals_required);
      if (required === null) throw new Error('审批规则缺少明确的审批数量');
      if (required > 0 && rule.approved !== true) throw new Error('MR 需要的审批尚未完成');
    }
    return { state: 'RULES_VERIFIED', ruleCount: value.rules.length };
  }
  if (Object.hasOwn(value, 'approvals_required') || Object.hasOwn(value, 'approvals_left')) {
    const required = count(value.approvals_required), left = count(value.approvals_left);
    if (required === null || left === null || left > required) throw new Error('旧版审批计数不完整或不一致');
    if (Object.hasOwn(value, 'approved') && typeof value.approved !== 'boolean') throw new Error('旧版审批状态格式不可验证');
    if (left > 0 || required > 0 && value.approved === false) throw new Error('MR 需要的审批尚未完成');
    return { state: 'COUNTS_VERIFIED', required, remaining: left };
  }
  if (typeof value.approved === 'boolean' && Array.isArray(value.approved_by) &&
      (!value.source_endpoint || value.source_endpoint === 'approvals')) {
    return { state: 'LEGACY_SUMMARY', approved: value.approved };
  }
  throw new Error('审批返回格式不可验证');
}

export function createGitlabApprovalReader(env, { projectId, originUrl }, fetchImpl = fetch) {
  const base = new URL(env.GITLAB_API_URL);
  const key = repositoryKey(originUrl);
  const sourceHost = new URL('https://' + key).hostname;
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash ||
      base.hostname.toLowerCase() !== sourceHost.toLowerCase() || !/^[1-9]\d*$/.test(String(projectId))) {
    throw new Error('审批只读 API 未绑定已核实的 GitLab 实例和项目');
  }
  const root = base.href.replace(/\/$/, '');
  const get = async path => {
    let response;
    try { response = await fetchImpl(root + path, { method: 'GET', redirect: 'error',
      headers: { 'PRIVATE-TOKEN': env.GITLAB_PERSONAL_ACCESS_TOKEN, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('GitLab 审批只读 API 连接失败'); }
    if (!response.ok) throw new Error(`GitLab 审批只读 API HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error('GitLab 审批只读 API 返回非 JSON'); }
  };
  return {
    async metadata() {
      const data = await get('/metadata');
      if (typeof data.enterprise !== 'boolean' || typeof data.version !== 'string' || !data.version) {
        throw new Error('GitLab 实例版本/发行版不可验证');
      }
      return { enterprise: data.enterprise, version: data.version };
    },
    async approvals(mrIid) {
      if (!/^[1-9]\d*$/.test(String(mrIid))) throw new Error('审批核验 MR IID 无效');
      return get(`/projects/${projectId}/merge_requests/${mrIid}/approvals`);
    },
  };
}

export function configuredGitlabApprovalReader(input, project) {
  const launch = buildLaunch('gitlab-mcp', readConfig(configPath()), {});
  return createGitlabApprovalReader(launch.env, { projectId: project.id, originUrl: input.originUrl });
}

export async function verifyMergeApprovals(call, mrArgs, input, project, io = {}) {
  const value = await readTool(call, 'get_merge_request_approval_state', mrArgs);
  const evidence = approvalEvidence(value);
  if (evidence.state !== 'LEGACY_SUMMARY') return { ...evidence, source: 'gitlab-mcp' };
  // The MCP normalizer omits /approvals counters. Missing rules is not proof
  // that approvals are absent. Verify the edition rather than guessing it from 404.
  const reader = io.approvalReader || configuredGitlabApprovalReader(input, project);
  const metadata = await reader.metadata();
  if (typeof metadata?.enterprise !== 'boolean' || typeof metadata.version !== 'string' || !metadata.version) {
    throw new Error('GitLab 实例版本/发行版不可验证');
  }
  if (!metadata.enterprise) return {
    state: 'COMMUNITY_OPTIONAL', source: 'gitlab-mcp+readonly-metadata', version: metadata.version,
  };
  const raw = await reader.approvals(mrArgs.merge_request_iid);
  const actual = approvalEvidence(raw);
  if (actual.state === 'LEGACY_SUMMARY') {
    if (actual.approved !== true) throw new Error('MR 需要的审批尚未完成');
    return { state: 'ENTERPRISE_SUMMARY_VERIFIED', source: 'readonly-approvals', version: metadata.version };
  }
  return { ...actual, source: 'readonly-approvals', version: metadata.version };
}
