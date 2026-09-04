#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKING_BRANCH_PATTERN = /^(?:feature|fixbug)\//;
const MERGE_BRANCH_PATTERN = /^merge\//;
const DEVELOP_REFS = new Set(['develop', 'dev', 'origin/develop', 'origin/dev']);
const MASTER_REF = 'origin/master';

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function tokenizeShell(command) {
  const commands = [];
  let tokens = [];
  let token = '';
  let quote = '';
  let escaped = false;

  function flushToken() {
    if (token) {
      tokens.push(token);
      token = '';
    }
  }

  function flushCommand() {
    flushToken();
    if (tokens.length > 0) {
      commands.push(tokens);
      tokens = [];
    }
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }

    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) quote = '';
      else token += character;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      flushToken();
      if (character === '\n') flushCommand();
      continue;
    }

    if (character === ';' || character === '|') {
      flushCommand();
      if (command[index + 1] === character) index += 1;
      continue;
    }

    if (character === '&' && command[index + 1] === '&') {
      flushCommand();
      index += 1;
      continue;
    }

    token += character;
  }

  if (escaped) token += '\\';
  flushCommand();
  return commands;
}

function findGitInvocation(tokens) {
  const gitIndex = tokens.findIndex((token, index) => {
    if (!(token === 'git' || token.endsWith('/git'))) return false;
    return tokens.slice(0, index).every(previous =>
      previous === 'command'
      || previous === 'env'
      || previous === '/usr/bin/env'
      || previous.startsWith('-')
      || /^[A-Za-z_][A-Za-z0-9_]*=/.test(previous));
  });

  if (gitIndex === -1) return undefined;

  let index = gitIndex + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      index += 2;
      continue;
    }
    if (token.startsWith('--git-dir=') || token.startsWith('--work-tree=')) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    return { subcommand: token, args: tokens.slice(index + 1) };
  }

  return undefined;
}

function optionValue(args, names) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (names.includes(token)) return args[index + 1];
    for (const name of names) {
      if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
    }
  }
  return undefined;
}

function positionalArgs(args, optionsWithValues = []) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (optionsWithValues.includes(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    positional.push(token);
  }
  return positional;
}

function branchCreation(invocation) {
  const { subcommand, args } = invocation;

  if (subcommand === 'switch') {
    const branch = optionValue(args, ['-c', '-C', '--create', '--force-create']);
    if (!branch) return undefined;
    const positional = positionalArgs(args, ['-c', '-C', '--create', '--force-create']);
    return { branch, startRef: positional.at(-1), hasNoTrack: args.includes('--no-track') };
  }

  if (subcommand === 'checkout') {
    const branch = optionValue(args, ['-b', '-B', '--orphan']);
    if (!branch) return undefined;
    const positional = positionalArgs(args, ['-b', '-B', '--orphan']);
    return { branch, startRef: positional.at(-1), hasNoTrack: args.includes('--no-track') };
  }

  if (subcommand === 'branch') {
    const positional = positionalArgs(args, ['-f', '-m', '-M', '-c', '-C']);
    if (positional.length === 0) return undefined;
    return { branch: positional[0], startRef: positional[1], hasNoTrack: args.includes('--no-track') };
  }

  if (subcommand === 'worktree' && args[0] === 'add') {
    const worktreeArgs = args.slice(1);
    const branch = optionValue(worktreeArgs, ['-b', '-B']);
    if (!branch) return undefined;
    const positional = positionalArgs(worktreeArgs, ['-b', '-B']);
    return { branch, startRef: positional.at(-1), hasNoTrack: worktreeArgs.includes('--no-track') };
  }

  return undefined;
}

function inferCurrentBranch(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }
  catch {
    return '';
  }
}

function inferWorkspaceRoot(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }
  catch {
    return cwd;
  }
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

export function evaluateHookInput(input, { workspaceRoot, currentBranch } = {}) {
  if (!workspaceRoot || input?.tool_name !== 'Bash') return undefined;

  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return undefined;

  const cwd = path.resolve(input.cwd || process.cwd());
  const root = path.resolve(workspaceRoot);
  if (!isPathInside(cwd, root)) return undefined;

  for (const tokens of tokenizeShell(command)) {
    const invocation = findGitInvocation(tokens);
    if (!invocation) continue;

    const creation = branchCreation(invocation);
    if (creation) {
      const branch = creation.branch || '';
      const startRef = creation.startRef || '';
      const isWorkingBranch = WORKING_BRANCH_PATTERN.test(branch);
      const isMergeBranch = MERGE_BRANCH_PATTERN.test(branch);

      if (DEVELOP_REFS.has(startRef) && !isMergeBranch) {
        return deny(`Blocked working branch creation from ${startRef}. Create feature/* and fixbug/* branches from the latest ${MASTER_REF}.`);
      }

      if (isWorkingBranch && startRef !== MASTER_REF) {
        return deny(`Blocked ${branch}: feature/* and fixbug/* branches must be created from the latest ${MASTER_REF}.`);
      }

      if (isWorkingBranch && !creation.hasNoTrack) {
        return deny(`Blocked ${branch}: create working branches with --no-track so no upstream is configured.`);
      }
    }

    if (invocation.subcommand === 'rebase') {
      const refs = new Set(invocation.args);
      const branch = currentBranch ?? inferCurrentBranch(cwd);
      const targetsDevelop = invocation.args.some(argument => DEVELOP_REFS.has(argument));
      const crossesProtectedBases = targetsDevelop
        && (refs.has('master') || refs.has('origin/master') || WORKING_BRANCH_PATTERN.test(branch));

      if (crossesProtectedBases) {
        return deny('Blocked cross-base rebase between master and develop for a feature/* or fixbug/* workflow. Create the ordinary MR without changing the working branch base.');
      }
    }
  }

  return undefined;
}

function workspaceArgument(args) {
  const index = args.indexOf('--workspace');
  return index === -1 ? '' : args[index + 1] || '';
}

async function run() {
  let inputText = '';
  for await (const chunk of process.stdin) inputText += chunk;

  let input;
  try {
    input = JSON.parse(inputText || '{}');
  }
  catch {
    process.stderr.write('Invalid JSON input for git branch safety hook.\n');
    process.exitCode = 2;
    return;
  }

  const cwd = path.resolve(input.cwd || process.cwd());
  const configuredRoot = workspaceArgument(process.argv.slice(2));
  const workspaceRoot = configuredRoot
    || process.env.ZAN_WORKFLOWS_WORKSPACE_ROOT
    || inferWorkspaceRoot(cwd);
  const result = evaluateHookInput(input, { workspaceRoot });
  if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await run();
