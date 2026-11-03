import { realpath } from 'node:fs/promises';
import { apiData } from './register-test-submission.mjs';
import { repositoryKey, runScopedCommand, stableJson } from './workflow-runtime.mjs';
import { resolveBugStatusCodes } from './tapd-mappings.mjs';
import { planBugRepairStatus } from '../skills/implementing-work/scripts/bug-repair-status.mjs';
import { inspectBranchRefs } from '../skills/preparing-work/scripts/inspect-branch-refs.mjs';
import { listAllComments } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';

const fields = {
  stories: 'id,name,description,developer,status,modified',
  tasks: 'id,name,description,story_id,owner,effort,status,modified',
  bug: 'id,title,description,de,te,status,current_owner,workitem_type_id,modified',
};
const kinds = { stories: 'Story', tasks: 'Task', bug: 'Bug' };
const numericId = id => typeof id === 'string' && /^\d+$/.test(id);
const modes = ['BRANCH_ONLY', 'PLAN_ONLY', 'IMPLEMENT', 'SUBMIT', 'GO_LIVE'];
const key = row => row.entryType + ':' + row.entryId;
const publicOrigin = url => {
  if (/^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('仓库地址包含非公开认证或查询信息，不能作为交接');
  }
  return repositoryKey(url);
};

async function collectRepositories(rows, io) {
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('需要有限的已定位仓库列表');
  const groups = new Map();
  for (const row of rows) {
    if (!row || typeof row.repositoryPath !== 'string' || !row.repositoryPath || !row.originUrl ||
        typeof row.fixedBranch !== 'string' || !/^(feature|fixbug)\/[^\s]+$/.test(row.fixedBranch)) {
      throw new Error('仓库采集需要准确路径、origin 和原工作分支');
    }
    const root = await realpath(row.repositoryPath);
    if (!groups.has(root)) groups.set(root, { root, originUrl: row.originUrl, branches: new Set() });
    const group = groups.get(root);
    if (publicOrigin(group.originUrl) !== publicOrigin(row.originUrl)) throw new Error('同一工作树的 origin 约束冲突');
    group.branches.add(row.fixedBranch);
  }
  return Promise.all([...groups.values()].map(async ({ root, originUrl, branches }) => {
    const git = async args => (await runScopedCommand('git', args, { cwd: root, timeout: 30000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } }, io)).stdout.trim();
    const [actualRoot, origin, head, branch] = await Promise.all([['rev-parse', '--show-toplevel'],
      ['remote', 'get-url', 'origin'], ['rev-parse', '--verify', 'HEAD'], ['branch', '--show-current']].map(git));
    if (await realpath(actualRoot) !== root || publicOrigin(origin) !== publicOrigin(originUrl)) {
      throw new Error('采集仓库的根目录或 origin 与所选项目不符');
    }
    const local = [...branches].map(name => inspectBranchRefs({ cwd: root, branch: name }));
    // Only contact the verified origin. Read all requested remote tips together.
    const output = await git(['ls-remote', '--refs', 'origin', ...local.map(row => row.localRef)]);
    const remote = new Map(output ? output.split('\n').map(line => {
      const [sha, ref] = line.split('\t');
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha) || !local.some(row => row.localRef === ref)) throw new Error('远端分支读回无效');
      return [ref, sha];
    }) : []);
    return { repositoryPath: root, originUrl: origin, head, currentBranch: branch,
      branches: local.map(row => {
        const liveRemoteSha = remote.get(row.localRef) ?? null;
        return { ...row, liveRemoteSha, relation: row.remoteSha === liveRemoteSha ? row.relation : 'NEEDS_REF_REFRESH' };
      }) };
  }));
}

// Collection is evidence for the existing TapdWorkDefinition, never a READY
// result. Sharing is scoped to this invocation; write-bound facts are read live.
export async function collectWorkInputs(call, input, io = {}) {
  const { workspaceId, items, repositories = [], deliveryMode } = input;
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1 || !Array.isArray(items) || !items.length || items.length > 50 ||
      deliveryMode !== undefined && !modes.includes(deliveryMode) ||
      items.some(item => !item || !Object.hasOwn(fields, item.entryType) || !numericId(item.entryId) ||
        item.workspaceId != null && String(item.workspaceId) !== String(workspaceId) ||
        item.repair !== undefined && (item.entryType !== 'bug' || deliveryMode === 'BRANCH_ONLY' ||
          !['INITIAL', 'CONTINUE'].includes(item.repair?.workMode)) ||
        item.comments !== undefined && typeof item.comments !== 'boolean')) throw new Error('采集需要准确空间和所选工作项');
  const selected = new Map();
  for (const item of items) {
    const id = key(item);
    const existing = selected.get(id);
    if (existing?.repair && item.repair && stableJson(existing.repair) !== stableJson(item.repair)) throw new Error('同一 Bug 的修复约束冲突');
    selected.set(id, { entryType: item.entryType, entryId: item.entryId, comments: !!(existing?.comments || item.comments),
      repair: item.repair || existing?.repair });
  }
  const fetched = new Map();
  const workflowMaps = new Map();
  async function repairPlan(item, current) {
    if (!current.status || !Object.hasOwn(current, 'current_owner') || !Object.hasOwn(current, 'workitem_type_id')) {
      return { action: 'PENDING', reason: '缺少当前 Bug 状态、处理人或工作流类型', writes: 0 };
    }
    const type = String(current.workitem_type_id || '');
    if (!workflowMaps.has(type)) workflowMaps.set(type, Promise.resolve(call('get_workflows_status_map', { workspace_id: workspaceId,
      options: { system: 'bug', ...(type ? { workitem_type_id: type } : {}) } })).then(value => apiData(value, 'get_workflows_status_map')));
    const codes = resolveBugStatusCodes(await workflowMaps.get(type), item.repair);
    if (!(item.repair.workMode === 'CONTINUE' && current.status === codes.waitingStatus) && !item.repair.repairOwner) {
      return { action: 'PENDING', reason: '需核实本次修复人员的空间成员/可分配账号证据', ...codes, writes: 0 };
    }
    return { ...codes, ...planBugRepairStatus({ entryType: 'bug', entryId: item.entryId, workspaceId, current,
      workMode: item.repair.workMode, repairOwner: item.repair.repairOwner, ...codes }) };
  }
  function read(entryType, entryId) {
    const id = key({ entryType, entryId });
    if (!fetched.has(id)) fetched.set(id, (async () => {
      const tool = entryType === 'bug' ? 'get_bug' : 'get_stories_or_tasks';
      const requested = deliveryMode === 'BRANCH_ONLY' ? { bug: 'id,title', stories: 'id,name', tasks: 'id,name,story_id' }[entryType] : fields[entryType];
      const data = apiData(await call(tool, { workspace_id: workspaceId, options: {
        ...(entryType === 'bug' ? {} : { entity_type: entryType }), id: entryId, limit: 1, fields: requested } }), tool);
      const rows = Array.isArray(data) ? data : [data];
      const item = rows.length === 1 && rows[0]?.[kinds[entryType]];
      if (!item || String(item.id) !== entryId || item.workspace_id != null && String(item.workspace_id) !== String(workspaceId) ||
          entryType === 'tasks' && (!numericId(String(item.story_id ?? '')) || String(item.story_id) === '0')) {
        throw new Error('工作项身份、空间或父需求不一致：' + id);
      }
      return { entryType, entryId, fields: Object.fromEntries(requested.split(',').filter(field => Object.hasOwn(item, field)).map(field => [field, item[field]])) };
    })());
    return fetched.get(id);
  }
  const [selectedItems, repos] = await Promise.all([
    Promise.all([...selected.values()].map(async item => {
      const [record, comments] = await Promise.all([read(item.entryType, item.entryId), item.comments
        ? listAllComments(call, workspaceId, item.entryType, item.entryId) : undefined]);
      if (item.entryType === 'tasks' && String(record.fields.story_id) !== '0') await read('stories', String(record.fields.story_id));
      return { ...record, ...(item.comments ? { comments } : {}),
        ...(item.repair ? { statusProposal: await repairPlan(item, record.fields) } : {}) };
    })),
    collectRepositories(repositories, io),
  ]);
  const parentKeys = [...new Set(selectedItems.filter(row => row.entryType === 'tasks' && String(row.fields.story_id) !== '0')
    .map(row => 'stories:' + row.fields.story_id))];
  const parents = await Promise.all(parentKeys.filter(id => !selected.has(id)).map(id => fetched.get(id)));
  return { state: 'COLLECTED', workspaceId, items: selectedItems, parents, repositories: repos, writes: 0 };
}
