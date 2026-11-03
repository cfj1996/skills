import rules from './validate-task-breakdown.js';
import { apiData } from '../../../scripts/register-test-submission.mjs';
import { totalCount } from '../../submitting-for-test/scripts/ensure-test-wiki.mjs';

const id = value => typeof value === 'string' && /^\d+$/.test(value);
// A partial or interrupted batch must be reconciled before the caller chooses
// another write. This helper only reads selected keys and never resends CREATE.
export async function readTaskResults(call, { proposal, idsByKey = {} }) {
  const check = rules.validateTaskBreakdown(proposal);
  if (!check.valid) throw new Error('任务提案不完整：' + check.errors[0]?.message);
  const { requirement, tasks, fieldBinding } = proposal;
  if (idsByKey === null || typeof idsByKey !== 'object' || Array.isArray(idsByKey) ||
      Object.entries(idsByKey).some(([key, value]) => !id(value) || !tasks.some(task => task.key === key && (!task.id || task.id === value)))) {
    throw new Error('任务 ID 与已确认的提案不符');
  }
  const workspaceId = Number(requirement.workspaceId);
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1 || !id(requirement.id)) throw new Error('任务空间或父需求无效');
  const fields = [...new Set(['id', 'workspace_id', 'description', ...tasks.flatMap(task => Object.keys(task.payload))])].join(',');
  const read = async options => {
    const result = await call('get_stories_or_tasks', { workspace_id: workspaceId, options: { entity_type: 'tasks', fields, ...options } });
    const rows = apiData(result, 'get_stories_or_tasks');
    const items = (Array.isArray(rows) ? rows : [rows]).map(row => row?.Task);
    if (items.some(item => !item || !id(String(item.id)) || String(item[fieldBinding.storyField]) !== requirement.id ||
        String(item.workspace_id) !== requirement.workspaceId)) throw new Error('任务读回的父需求或空间缺失/不匹配');
    return { items, count: totalCount(result) };
  };
  const unknown = tasks.filter(task => !idsByKey[task.key] && !task.id);
  const found = new Map(), issues = [];
  async function discover() {
    const seenIds = new Set();
    for (let page = 1; ; page++) {
      if (page > 20) throw new Error('任务分页超过可核实范围，不能认定缺失');
      const { items, count } = await read({ story_id: requirement.id, page, limit: 100 });
      for (const item of items) {
        const itemId = String(item.id);
        if (seenIds.has(itemId)) throw new Error('任务分页重复，不能认定缺失');
        seenIds.add(itemId);
        for (const task of unknown) if (rules.hasTaskMarker(item.description, requirement.id, task.key)) {
          if (found.has(task.key)) throw new Error('同一拟建 Task 匹配多个已有任务，停止写入');
          found.set(task.key, itemId);
        }
      }
      if (count !== undefined ? count < seenIds.size || items.length < 100 && seenIds.size < count : false) throw new Error('任务分页数量不一致');
      if (count !== undefined ? count === seenIds.size : items.length < 100) break;
    }
  }
  if (unknown.length) {
    try { await discover(); }
    catch (error) {
      // Discovery was incomplete: retain supplied IDs and read them independently.
      // An undiscovered key is not evidence that CREATE can be retried.
      issues.push({ stage: 'discovery', keys: unknown.map(task => task.key), message: error.message });
      found.clear();
    }
  }
  const records = [], missingKeys = [];
  for (const task of tasks) {
    const taskId = idsByKey[task.key] || task.id || found.get(task.key);
    if (!taskId) { if (!issues.length) missingKeys.push(task.key); continue; }
    records.push({ key: task.key, id: taskId });
  }
  const results = await Promise.allSettled(records.map(async record => {
    const task = tasks.find(row => row.key === record.key);
    const { items } = await read({ id: record.id, limit: 1 });
    if (items.length !== 1 || String(items[0].id) !== record.id) throw new Error('已知 Task ID 缺失或不唯一，禁止按新建重试');
    const item = items[0], value = item[fieldBinding.estimateField];
    const hours = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
    const payload = Object.fromEntries(Object.keys(task.payload).map(field =>
      [field, field === fieldBinding.estimateField ? hours : item[field]]));
    record.readback = { id: record.id, workspaceId: requirement.workspaceId, storyId: String(item[fieldBinding.storyField]),
      ownerAccount: item[fieldBinding.ownerField], estimateHours: hours, payload };
  }));
  results.forEach((result, index) => {
    if (result.status === 'rejected') issues.push({ key: records[index].key, id: records[index].id, message: result.reason.message });
  });
  const complete = records.filter(row => row.readback);
  const verified = rules.validateTaskReadbacks(proposal, complete);
  const drift = verified.errors.some(error => error.reason !== 'missing-rows');
  const state = verified.valid && !issues.length ? 'TASKS_READY'
    : !drift && (missingKeys.length || complete.length) ? 'PARTIAL' : 'BLOCKED';
  return { state, records, missingKeys, issues, errors: verified.errors, proposalFingerprint: rules.fingerprintProposal(proposal), writes: 0 };
}
