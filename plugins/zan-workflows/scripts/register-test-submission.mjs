#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFor } from './mcp-client.mjs';
import { assertTransitionFields, resolveBugWorkflow, resolveVersionField } from './tapd-mappings.mjs';
import { readCliPlan, sha256, stableJson, requireText } from './workflow-runtime.mjs';

export function apiData(result, name) {
  if (result?.isError) throw new Error(`${name} 调用失败`);
  let value = result;
  let successEnvelope = false;
  for (let depth = 0; depth < 8; depth++) {
    if (value?.isError === true) throw new Error(`${name} 调用失败`);
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch {
        if (successEnvelope && name.startsWith('update_')) return value;
        throw new Error(`${name} 返回不可识别的数据`);
      }
    } else if (value?.content) {
      const texts = value.content.filter(item => item.type === 'text');
      if (texts.length !== 1) throw new Error(`${name} 返回结果不唯一`);
      value = texts[0].text;
    } else if (value && Object.hasOwn(value, 'status') && Object.hasOwn(value, 'data')) {
      if (String(value.status) !== '1') throw new Error(`${name} 返回失败状态`);
      successEnvelope = true;
      value = value.data;
    } else if (value && Object.hasOwn(value, 'result')) value = value.result;
    else if (value?.structuredContent) value = value.structuredContent;
    else if (value && Object.hasOwn(value, 'data')) value = value.data;
    else if (Array.isArray(value) || value && typeof value === 'object') return value;
    else if (successEnvelope) return value;
    else throw new Error(`${name} 缺少成功的数据封装`);
  }
  throw new Error(`${name} 返回封装过深`);
}

async function readApi(call, name, args) {
  return apiData(await call(name, args), name);
}

const ownerNames = value => typeof value === 'string'
  ? [...new Set(value.split(';').map(name => name.trim()).filter(Boolean))].sort().join(';') : '';
const assigneeFields = item => Object.fromEntries(['current_owner', 'te', 'reporter'].map(name => [name, item[name] ?? null]));

function checkPrerequisites(input) {
  const gates = input.prerequisites;
  if (!gates || gates.git !== 'VERIFIED' || !['BUILD_SUBMITTED', 'DEPLOYED', 'SKIPPED_BY_INTENT'].includes(gates.deployment)) {
    throw new Error('登记前必须有 Git 交付和构建提交/部署/跳过部署的成功证据');
  }
  if (gates.deployment === 'BUILD_SUBMITTED') {
    const receipt = gates.deploymentReceipt;
    if (receipt?.state !== 'BUILD_SUBMITTED' || receipt.completionMode !== 'TRIGGER_ACCEPTED' ||
        receipt.writes !== 1 || !Number.isSafeInteger(receipt.queueId) || receipt.queueId < 1 ||
        !receipt.queueUrl || !receipt.jobUrl || !receipt.jobName || !receipt.sourceRepository ||
        !/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(receipt.expectedSha || '') ||
        !receipt.submittedParams || !Object.keys(receipt.submittedParams).length) {
      throw new Error('登记前缺少本次 Jenkins 构建提交的确切队列和参数回执');
    }
  }
  if (gates.profile === 'NO_WIKI' ? gates.wiki !== 'SKIPPED_NO_WIKI'
    : gates.profile !== 'STANDARD' || !['VERIFIED', 'SKIPPED_NON_FUNCTIONAL'].includes(gates.wiki)) {
    throw new Error('登记前的 Wiki/评论或政策跳过证据不完整');
  }
}

export async function registerTestSubmission(call, input) {
  if (!Number.isSafeInteger(input.workspaceId) || input.workspaceId < 1 || !/^\d+$/.test(input.entryId || '') ||
      !['bug', 'stories', 'tasks'].includes(input.entryType) || !['INITIAL', 'CONTINUE'].includes(input.workMode) ||
      !['WAITING_TEST', 'NONE'].includes(input.statusAction) || !['WRITE', 'NONE'].includes(input.versionAction)) {
    throw new Error('登记身份、工作模式或动作无效');
  }
  requireText(input.purpose, '登记目的');
  if (input.statusAction === 'WAITING_TEST') {
    if (input.entryType !== 'bug') throw new Error('只有已验证 Bug 工作流可以写待测试状态');
  }
  if (input.versionAction === 'WRITE') {
    requireText(input.testVersion, '完整测试版本载荷');
    const native = input.entryType === 'bug' ? 'test_version' : 'version';
    if (input.versionField && input.versionField !== native && !/^custom_field_[a-z0-9_]+$/.test(input.versionField)) {
      throw new Error('版本字段未采用已解析的原生/自定义字段');
    }
  }
  if (input.entryType === 'bug' && input.versionAction === 'WRITE' && input.statusAction !== 'WAITING_TEST') {
    throw new Error('自动 Bug 提测登记必须采用可跳过重复登记的 WAITING_TEST 策略');
  }
  if (input.execute) {
    if (input.confirmed !== true) throw new Error('缺少当前登记清单确认');
    checkPrerequisites(input);
    if (input.statusAction === 'WAITING_TEST' && (!input.metadataHashes?.statusMap || !input.metadataHashes?.transitions)) {
      throw new Error('执行缺少已确认的工作流指纹');
    }
    if (input.versionField?.startsWith('custom_field_') && !input.metadataHashes?.customFields) throw new Error('执行缺少已确认的字段配置指纹');
  }
  const common = { workspace_id: input.workspaceId };
  let baseItem;
  if (input.statusAction === 'WAITING_TEST' && !input.workitemTypeId) {
    const rows = await readApi(call, 'get_bug', { ...common, options: { id: input.entryId, limit: 1,
      fields: 'id,status,workitem_type_id' } });
    const matching = (Array.isArray(rows) ? rows : [rows]).map(row => row?.Bug).filter(row => String(row?.id) === input.entryId);
    if (matching.length !== 1) throw new Error('登记条目不存在或身份不唯一');
    baseItem = matching[0];
    input = { ...input, workitemTypeId: baseItem.workitem_type_id || '' };
  }
  const metadata = {};
  const jobs = [];
  if (input.statusAction === 'WAITING_TEST') {
    const options = { system: 'bug', ...(input.workitemTypeId ? { workitem_type_id: input.workitemTypeId } : {}) };
    for (const [key, name] of [['statusMap', 'get_workflows_status_map'], ['transitions', 'get_workflows_all_transitions']]) {
      jobs.push(readApi(call, name, { ...common, options }).then(value => { metadata[key] = value; }));
    }
  }
  if ((input.versionAction === 'WRITE' && (!input.versionField || input.versionField.startsWith('custom_field_'))) || input.metadataHashes?.customFields) {
    jobs.push(readApi(call, 'get_entity_custom_fields', { ...common,
      options: { entity_type: input.entryType === 'bug' ? 'bugs' : input.entryType } })
      .then(value => { metadata.customFields = value; }));
  }
  // Custom field configuration must be read before querying a custom field.
  await Promise.all(jobs);
  const metadataHashes = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, sha256(stableJson(value))]));
  for (const [key, hash] of Object.entries(input.metadataHashes || {})) {
    if (metadataHashes[key] !== hash) throw new Error('TAPD 工作流或字段配置已变化，需要重新核实映射');
  }
  if (input.statusAction === 'WAITING_TEST') input = { ...input, ...resolveBugWorkflow(metadata.statusMap, metadata.transitions, input) };
  if (input.versionAction === 'WRITE') input = { ...input, ...resolveVersionField(metadata.customFields, input) };
  const itemTool = input.entryType === 'bug' ? 'get_bug' : 'get_stories_or_tasks';
  const kind = { bug: 'Bug', stories: 'Story', tasks: 'Task' }[input.entryType];
  if ((input.requiredFields || []).some(name => name.startsWith('custom_field_')) && !metadata.customFields) {
    // Required workflow fields follow the same configuration-before-use rule.
    metadata.customFields = await readApi(call, 'get_entity_custom_fields', { ...common, options: { entity_type: 'bugs' } });
    const hash = sha256(stableJson(metadata.customFields));
    if (input.execute && input.metadataHashes?.customFields !== hash) throw new Error('TAPD 工作流必填字段配置已变化');
    metadataHashes.customFields = hash;
  }
  const fields = [...new Set(['id', 'status', 'workitem_type_id', ...(input.requiredFields || []),
    ...(input.statusAction === 'WAITING_TEST' ? ['current_owner', 'te', 'reporter'] : []),
    ...(input.versionAction === 'WRITE' ? [input.versionField] : [])])];
  const options = { id: input.entryId, limit: 1, fields: fields.join(','),
    ...(input.entryType === 'bug' ? {} : { entity_type: input.entryType }) };
  const readItem = async () => {
    const data = await readApi(call, itemTool, { ...common, options });
    const rows = Array.isArray(data) ? data : [data];
    const found = rows.map(row => row?.[kind]).filter(row => String(row?.id) === input.entryId);
    if (found.length !== 1) throw new Error('登记条目不存在或身份不唯一');
    return found[0];
  };
  const before = await readItem();
  if (input.statusAction === 'WAITING_TEST' && before.workitem_type_id && String(before.workitem_type_id) !== input.workitemTypeId) {
    throw new Error('登记条目的工作流类别已变化');
  }
  if (typeof before.status !== 'string') throw new Error('当前状态不可核实');
  if (input.versionAction === 'WRITE' && !Object.hasOwn(before, input.versionField)) throw new Error('条目未读回实际测试版本字段');
  const currentVersion = input.versionAction === 'WRITE' ? before[input.versionField] : undefined;
  const alreadyWaiting = input.statusAction === 'WAITING_TEST' && before.status === input.waitingStatus;
  const skipContinue = input.workMode === 'CONTINUE' && alreadyWaiting;
  const statusWrite = input.statusAction === 'WAITING_TEST' && !alreadyWaiting;
  const versionWrite = input.versionAction === 'WRITE' && currentVersion !== input.testVersion && !skipContinue;
  if (input.statusAction === 'WAITING_TEST' && before.status !== input.activeStatus && !alreadyWaiting) {
    throw new Error('当前 Bug 状态不符合已验证的修复中/待测试策略');
  }
  let assigneeSource, owner;
  if (statusWrite) {
    assigneeSource = ownerNames(before.te) ? 'te' : 'reporter';
    owner = before[assigneeSource];
    if (!ownerNames(owner)) throw new Error('Bug 测试人员和创建人均为空，无法确定待测试处理人');
    owner = owner.trim();
    assertTransitionFields(input.requiredFields || [], { ...before, current_owner: owner });
  }
  const payload = { id: input.entryId,
    ...(statusWrite ? { status: input.waitingStatus, current_owner: owner } : {}),
    ...(versionWrite ? { [input.versionField]: input.testVersion } : {}) };
  const state = input.statusAction === 'NONE' && input.versionAction === 'NONE' ? 'NOT_APPLICABLE'
    : skipContinue ? 'SKIPPED_ALREADY_WAITING_TEST'
    : !statusWrite && !versionWrite ? 'ALREADY_REGISTERED' : 'AWAITING_CONFIRMATION';
  const plan = { ...input, execute: false, confirmed: false, state, metadataHashes, metadata,
    expectedStatus: before.status, expectedVersion: currentVersion,
    ...(statusWrite ? { expectedAssignee: assigneeFields(before), assigneeSource } : {}), payload, writes: 0 };
  if (!input.execute) return plan;
  if (skipContinue || (!statusWrite && !versionWrite)) return {
    state, entryId: input.entryId, statusState: 'UNCHANGED', versionState: skipContinue ? 'SKIPPED_ALREADY_WAITING_TEST' : 'UNCHANGED',
    ownerState: 'UNCHANGED', actualOwner: before.current_owner,
    actualStatus: before.status, actualVersion: currentVersion, writes: 0,
  };
  if (input.expectedStatus !== before.status || (input.versionAction === 'WRITE' && input.expectedVersion !== currentVersion)) {
    throw new Error('TAPD 状态或版本已变化，不能覆盖其他人的登记');
  }
  if (statusWrite && stableJson(input.expectedAssignee) !== stableJson(assigneeFields(before))) {
    throw new Error('TAPD 处理人、测试人员或创建人已变化，需要重新确认登记计划');
  }
  const result = { state: 'BLOCKED', entryId: input.entryId, writes: 0,
    statusState: statusWrite ? 'UNKNOWN' : 'UNCHANGED', ownerState: statusWrite ? 'UNKNOWN' : 'UNCHANGED',
    versionState: versionWrite ? 'UNKNOWN' : 'UNCHANGED' };
  let phase = 'UPDATE';
  try {
    await readApi(call, input.entryType === 'bug' ? 'update_bug' : 'update_story_or_task', { ...common,
      options: { ...payload, ...(input.entryType === 'bug' ? {} : { entity_type: input.entryType }) } });
    result.writes = 1;
    phase = 'READBACK';
    const after = await readItem();
    result.actualStatus = after.status;
    result.actualOwner = after.current_owner;
    result.actualVersion = input.versionAction === 'WRITE' ? after[input.versionField] : undefined;
    result.statusState = statusWrite ? after.status === input.waitingStatus ? 'WRITTEN' : 'UNVERIFIED' : 'UNCHANGED';
    result.ownerState = statusWrite ? ownerNames(after.current_owner) === ownerNames(owner) ? 'WRITTEN' : 'UNVERIFIED' : 'UNCHANGED';
    result.versionState = versionWrite ? result.actualVersion === input.testVersion ? 'WRITTEN' : 'UNVERIFIED' : 'UNCHANGED';
    if ([result.statusState, result.ownerState, result.versionState].includes('UNVERIFIED')) throw new Error('登记读回不完整；保留实际状态，不回滚或重试');
    return { ...result, state: 'REGISTERED' };
  } catch (error) { error.result = { ...result, phase, error: error.message }; throw error; }
}

async function main() {
  const input = await readCliPlan();
  const client = clientFor('tapd-mcp');
  try {
    await client.initialize();
    const result = await registerTestSubmission((name, args) => client.call(name, args), input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify(error.result || { state: 'BLOCKED', error: error.message, writes: 0 }, null, 2) + '\n');
    process.exitCode = 1;
  } finally { client.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('无法读取登记计划\n'); process.exitCode = 1; });
}
