#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const text = value => typeof value === 'string' && value.trim().length > 0;
const owners = value => typeof value === 'string'
  ? [...new Set(value.split(';').map(name => name.trim()).filter(Boolean))].sort() : [];
const sameOwner = (left, right) => JSON.stringify(owners(left)) === JSON.stringify(owners(right));

// This helper plans and verifies only; the authorized caller owns all TAPD calls.
export function planBugRepairStatus(input) {
  if (input?.entryType !== 'bug' || !Number.isSafeInteger(input.workspaceId) || input.workspaceId < 1 ||
      !/^\d+$/.test(input.entryId || '') || !['INITIAL', 'CONTINUE'].includes(input.workMode)) {
    throw new Error('修复状态计划必须绑定准确 Bug、空间和工作模式');
  }
  const current = input.current;
  if (String(current?.id) !== input.entryId || !text(current.status) ||
      !Object.hasOwn(current, 'current_owner') || !text(input.activeStatus) ||
      !text(input.waitingStatus) || input.activeStatus === input.waitingStatus) {
    throw new Error('缺少 Bug 当前状态、处理人或已核实的工作流映射');
  }
  const base = { entryType: 'bug', workspaceId: input.workspaceId, entryId: input.entryId,
    expectedStatus: current.status, expectedOwner: current.current_owner, writes: 0 };
  if (input.workMode === 'CONTINUE' && current.status === input.waitingStatus) {
    return { ...base, action: 'SKIPPED_ALREADY_WAITING_TEST', payload: {} };
  }
  const repairOwner = input.repairOwner;
  const accounts = owners(repairOwner?.account);
  if (accounts.length !== 1 || repairOwner.workspaceId !== input.workspaceId ||
      !text(repairOwner.source) || !text(repairOwner.evidence)) {
    throw new Error('必须核实唯一修复人员的 TAPD 账号、空间、来源和成员证据');
  }
  const account = accounts[0];
  if (current.status === input.activeStatus && sameOwner(current.current_owner, account)) {
    return { ...base, repairOwner: { ...repairOwner, account }, action: 'NO_CHANGE', payload: {} };
  }
  return { ...base, repairOwner: { ...repairOwner, account }, action: 'WRITE_ACTIVE',
    payload: { id: input.entryId, status: input.activeStatus, current_owner: account } };
}

export function validateBugRepairReadback(input, readback) {
  const plan = planBugRepairStatus(input);
  const errors = [];
  if (String(readback?.id) !== plan.entryId) errors.push('读回 Bug 身份不匹配');
  const status = plan.action === 'WRITE_ACTIVE' ? plan.payload.status : plan.expectedStatus;
  const owner = plan.action === 'WRITE_ACTIVE' ? plan.payload.current_owner : plan.expectedOwner;
  if (readback?.status !== status) errors.push('修复状态读回不一致');
  if (!readback || !Object.hasOwn(readback, 'current_owner') || !sameOwner(readback.current_owner, owner)) {
    errors.push('修复处理人读回缺失或不一致');
  }
  return { valid: errors.length === 0, action: plan.action, actualStatus: readback?.status,
    actualOwner: readback?.current_owner, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let stdin = '';
  for await (const chunk of process.stdin) stdin += chunk;
  try {
    const request = JSON.parse(stdin);
    const result = Object.hasOwn(request, 'readback')
      ? validateBugRepairReadback(request.input, request.readback) : planBugRepairStatus(request);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.valid === false) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ state: 'BLOCKED', error: error.message, writes: 0 }) + '\n');
    process.exitCode = 1;
  }
}
