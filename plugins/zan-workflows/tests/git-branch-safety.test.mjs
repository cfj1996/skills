import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateHookInput } from '../hooks/scripts/git-branch-safety.mjs';

const root = '/fixture/workspace';
const current = 'fixbug/active-task';
function evaluate(command, options = {}) {
  return evaluateHookInput({ tool_name: 'Bash', cwd: root, tool_input: { command } },
    { workspaceRoot: root, currentBranch: current, ...options });
}
const denied = command => evaluate(command)?.hookSpecificOutput?.permissionDecision === 'deny';

test('ordinary local deletion is classified separately from branch creation', () => {
  for (const command of [
    'git branch -d feature/issue-13-ui-exports',
    'git branch --delete feature/issue-6-field-target',
    'git branch -d -- feature/issue-9-form-state',
    'git branch -d feature/one fixbug/two merge/three',
    'git branch -vd feature/completed',
    'git branch --delete -- feature/completed',
    'git -C /fixture/workspace/repo branch -d feature/completed',
    'command git branch -d feature/completed',
    'env LANG=C /usr/bin/git branch -d feature/completed',
  ]) assert.equal(denied(command), false, command);
});

test('baseline and currently checked-out branches cannot be deleted even in a mixed list', () => {
  for (const name of ['main', 'master', 'develop', 'dev', current]) {
    for (const flag of ['-d', '--delete']) {
      const command = `git branch ${flag} -- feature/completed ${name}`;
      assert.equal(denied(command), true, command);
    }
  }
});

test('force and remote deletion remain blocked across short, long and combined flags', () => {
  for (const flags of ['-D', '-df', '-fd', '--delete --force', '-d --force',
    '-dr', '-rd', '-ar --delete', '--delete --remotes', '--delete --all']) {
    const command = `git branch ${flags} feature/completed`;
    assert.equal(denied(command), true, command);
  }
});

test('deletion does not skip a later forbidden creation or rebase in the same shell command', () => {
  for (const separator of [' && ', '; ', '\n']) {
    assert.equal(denied(`git branch -d feature/completed${separator}git switch --no-track -c feature/new origin/develop`), true);
    assert.equal(denied(`git branch -d feature/completed${separator}git rebase origin/develop`), true);
  }
  assert.equal(denied('git branch -d feature/one && git branch -d fixbug/two'), false);
});

test('existing creation and cross-base rebase restrictions remain effective', () => {
  for (const command of [
    'git branch feature/new',
    'git branch --no-track feature/new origin/develop',
    'git switch --no-track -c feature/new origin/develop',
    'git switch -c feature/new origin/master',
    'git checkout -b fixbug/new origin/master',
    'git worktree add -b feature/new /fixture/workspace/.worktrees/new origin/develop',
    'git rebase origin/develop',
  ]) assert.equal(denied(command), true, command);
  for (const command of [
    'git branch --no-track feature/new origin/master',
    'git switch --no-track -c feature/new origin/master',
    'git checkout --no-track -b fixbug/new origin/master',
  ]) assert.equal(denied(command), false, command);
});

test('current-branch checks follow git -C rather than the tool working directory', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'zan-hook-'));
  try {
    const repository = path.join(directory, 'repository with spaces');
    execFileSync('git', ['init', '-b', 'fixbug/other-current', repository], { stdio: 'ignore' });
    const input = command => ({ tool_name: 'Bash', cwd: directory, tool_input: { command } });
    const options = { workspaceRoot: directory };
    const result = evaluateHookInput(input(`git -C '${repository}' branch -d fixbug/other-current`), options);
    assert.equal(result?.hookSpecificOutput?.permissionDecision, 'deny');
    assert.equal(evaluateHookInput(input(`git -C '${repository}' branch -d feature/completed`), options), undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('commands outside the configured workspace and non-Bash inputs remain out of scope', () => {
  assert.equal(evaluateHookInput({ tool_name: 'Bash', cwd: '/outside',
    tool_input: { command: 'git branch -D feature/completed' } }, { workspaceRoot: root }), undefined);
  assert.equal(evaluateHookInput({ tool_name: 'Read', cwd: root,
    tool_input: { command: 'git branch -D feature/completed' } }, { workspaceRoot: root }), undefined);
});
