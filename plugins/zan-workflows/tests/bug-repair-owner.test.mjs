import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planBugRepairStatus, validateBugRepairReadback } from '../skills/implementing-work/scripts/bug-repair-status.mjs';

const input = () => ({ entryType: 'bug', workspaceId: 123, entryId: '111230010000001',
  workMode: 'INITIAL', activeStatus: 'fixing', waitingStatus: 'testing',
  current: { id: '111230010000001', status: 'open', current_owner: 'tester' },
  repairOwner: { account: 'developer', workspaceId: 123, source: 'Bug.de', evidence: 'exact Bug developer and workspace member readback' } });

test('entering repair always plans status and verified repair owner in one payload', () => {
  const value = input();
  const plan = planBugRepairStatus(value);
  assert.equal(plan.action, 'WRITE_ACTIVE');
  assert.equal(plan.expectedOwner, 'tester');
  assert.deepEqual(plan.payload, { id: value.entryId, status: 'fixing', current_owner: 'developer' });
  assert.equal(plan.writes, 0);
});

test('already fixing still requires an owner correction for a tester, partial assignee set or missing owner', () => {
  for (const current_owner of ['tester', 'developer;tester;', '', null]) {
    const value = input(); value.current = { ...value.current, status: 'fixing', current_owner };
    assert.equal(planBugRepairStatus(value).action, 'WRITE_ACTIVE');
    assert.equal(planBugRepairStatus(value).payload.current_owner, 'developer');
  }
});

test('only both fixing status and matching repair owner permit a no-write result', () => {
  const value = input(); value.current.status = 'fixing'; value.current.current_owner = ' developer; ';
  const plan = planBugRepairStatus(value);
  assert.equal(plan.action, 'NO_CHANGE');
  assert.deepEqual(plan.payload, {});
  assert.equal(validateBugRepairReadback(value, value.current).valid, true);
});

test('continue already waiting preserves tester ownership without requiring a repair account', () => {
  const value = input(); value.workMode = 'CONTINUE'; value.current.status = 'testing'; delete value.repairOwner;
  const plan = planBugRepairStatus(value);
  assert.equal(plan.action, 'SKIPPED_ALREADY_WAITING_TEST');
  assert.deepEqual(plan.payload, {});
  assert.equal(validateBugRepairReadback(value, value.current).valid, true);
  assert.equal(validateBugRepairReadback(value, { ...value.current, current_owner: 'developer' }).valid, false);
});

test('missing, ambiguous or cross-workspace repair accounts block a write plan', () => {
  for (const change of [
    value => { delete value.repairOwner; },
    value => { value.repairOwner.account = ''; },
    value => { value.repairOwner.account = 'alice;bob'; },
    value => { value.repairOwner.workspaceId = 456; },
    value => { value.repairOwner.evidence = ''; },
    value => { value.repairOwner.source = ''; },
  ]) {
    const value = input(); change(value);
    assert.throws(() => planBugRepairStatus(value), /修复人员/);
  }
});

test('Story and Task never receive a Bug state or owner payload', () => {
  for (const entryType of ['stories', 'tasks']) {
    assert.throws(() => planBugRepairStatus({ ...input(), entryType }), /准确 Bug/);
  }
});

test('readback must prove the exact Bug, repairing state and complete repair owner together', () => {
  const value = input();
  const after = { id: value.entryId, status: 'fixing', current_owner: 'developer;' };
  assert.equal(validateBugRepairReadback(value, after).valid, true);
  for (const change of [
    row => { row.id = 'other'; }, row => { row.status = 'open'; },
    row => { row.current_owner = 'tester'; }, row => { delete row.current_owner; },
    row => { row.current_owner = 'developer;tester'; },
  ]) {
    const row = { ...after }; change(row);
    assert.equal(validateBugRepairReadback(value, row).valid, false);
  }
});

test('read-only CLI rejects a status-only readback instead of reporting successful repair activation', () => {
  const script = fileURLToPath(new URL('../skills/implementing-work/scripts/bug-repair-status.mjs', import.meta.url));
  const value = input();
  const plan = spawnSync(process.execPath, [script], { input: JSON.stringify(value), encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).payload.current_owner, 'developer');
  const invalid = spawnSync(process.execPath, [script], { input: JSON.stringify({ input: value, readback: { id: value.entryId, status: 'fixing' } }), encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).valid, false);
});
