#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMON_MAIN_BRANCHES, COMMON_TEST_BRANCHES, isBranchName } from '../../scripts/branch-roles.mjs';

const WORKING_BRANCH_PATTERN = /^(?:feature|fixbug)\//;
const MERGE_BRANCH_PATTERN = /^merge\//;
const ORIGIN_REFS = 'refs/remotes/origin/';
const BRANCH_OPTIONS_WITH_VALUES = ['--format', '--sort', '--set-upstream-to', '-u'];

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
    return { subcommand: token, args: tokens.slice(index + 1), globalArgs: tokens.slice(gitIndex + 1, index) };
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

function branchOptions(args) {
  const options = [];
  for (let index = 0; index < args.length && args[index] !== '--'; index += 1) {
    const option = args[index];
    options.push(option);
    if (BRANCH_OPTIONS_WITH_VALUES.includes(option)) index += 1;
  }
  return options;
}

function isBranchQuery(args) {
  const options = branchOptions(args);
  // Explicit mutation modes must still reach their own checks, even if mixed
  // with display options. Formatting alone does not imply a list operation.
  if (options.some(option => /^--(?:delete|move|copy|set-upstream-to|unset-upstream|edit-description)(?:=|$)/.test(option)
    || (/^-[A-Za-z]+$/.test(option) && /[dDmMcCu]/.test(option)))) return false;
  let list = false;
  let showCurrent = false;
  for (const option of options) {
    if (option === '--list' || (/^-[A-Za-z]+$/.test(option) && option.includes('l'))) list = true;
    if (option === '--no-list') list = false;
    if (option === '--show-current') showCurrent = true;
    if (option === '--no-show-current') showCurrent = false;
  }
  return list || showCurrent || options.some(option =>
    /^--(?:contains|no-contains|merged|no-merged|points-at)(?:=|$)/.test(option));
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
    if (isBranchQuery(args)) return undefined;
    const positional = positionalArgs(args, [...BRANCH_OPTIONS_WITH_VALUES, '-m', '-M', '-c', '-C']);
    if (positional.length === 0) return undefined;
    return { branch: positional[0], startRef: positional[1], hasNoTrack: args.includes('--no-track') };
  }

  if (subcommand === 'worktree' && args[0] === 'add') {
    const worktreeArgs = args.slice(1);
    const branch = optionValue(worktreeArgs, ['-b', '-B']);
    if (!branch) return undefined;
    const positional = positionalArgs(worktreeArgs, ['-b', '-B']);
    return { branch, startRef: positional[1], hasNoTrack: worktreeArgs.includes('--no-track') };
  }

  return undefined;
}

function branchDeletion(invocation) {
  if (invocation.subcommand !== 'branch') return undefined;
  const options = branchOptions(invocation.args);
  const shortFlags = options.filter(arg => /^-[A-Za-z]+$/.test(arg)).join('');
  if (!options.includes('--delete') && !/[dD]/.test(shortFlags)) return undefined;
  return {
    branches: positionalArgs(invocation.args, BRANCH_OPTIONS_WITH_VALUES),
    forced: /[Df]/.test(shortFlags) || options.includes('--force'),
    remote: /[ra]/.test(shortFlags) || options.includes('--remotes') || options.includes('--all'),
  };
}

function readGit(cwd, globalArgs, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...globalArgs, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  }
  catch {
    return '';
  }
}

function inferCurrentBranch(cwd, globalArgs) {
  return readGit(cwd, globalArgs, ['branch', '--show-current']);
}

function inferMainBranch(cwd, globalArgs) {
  const git = (...args) => readGit(cwd, globalArgs, args);
  const remoteHead = git('symbolic-ref', '--quiet', `${ORIGIN_REFS}HEAD`);
  if (remoteHead.startsWith(ORIGIN_REFS) && git('show-ref', '--verify', '--hash', remoteHead)) {
    const branch = remoteHead.slice(ORIGIN_REFS.length);
    if (isBranchName(branch)) return branch;
  }
  if (!git('remote', 'get-url', 'origin')) return undefined;
  const head = /^ref: refs\/heads\/([^\t]+)\tHEAD$/m.exec(git('ls-remote', '--symref', 'origin', 'HEAD'));
  return isBranchName(head?.[1]) ? head[1] : undefined;
}

function branchFromRef(ref, mainBranch) {
  if (ref === 'origin/HEAD' || ref === `${ORIGIN_REFS}HEAD`) return mainBranch;
  for (const prefix of [ORIGIN_REFS, 'refs/heads/', 'origin/']) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

function isRemoteMainRef(ref, mainBranch, cwd, globalArgs) {
  const qualifiedRef = `${ORIGIN_REFS}${mainBranch}`;
  if (ref === `origin/${mainBranch}` || ref === qualifiedRef) return true;
  return (ref === 'origin/HEAD' || ref === `${ORIGIN_REFS}HEAD`) &&
    readGit(cwd, globalArgs, ['symbolic-ref', '--quiet', `${ORIGIN_REFS}HEAD`]) === qualifiedRef;
}

function repositoryBranches(cwd, globalArgs, mainOverride) {
  const mainBranch = mainOverride ?? inferMainBranch(cwd, globalArgs);
  const configuredTests = readGit(cwd, globalArgs, ['config', '--local', '--get-all', 'zan-workflows.testBranch'])
    .split('\n').filter(isBranchName);
  const testBranches = configuredTests.length ? configuredTests : COMMON_TEST_BRANCHES;
  return { mainBranch, testBranches: testBranches.filter(branch => branch !== mainBranch) };
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

export function evaluateHookInput(input, { workspaceRoot, currentBranch, mainBranch: mainOverride } = {}) {
  if (!workspaceRoot || input?.tool_name !== 'Bash') return undefined;

  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return undefined;

  const cwd = path.resolve(input.cwd || process.cwd());
  const root = path.resolve(workspaceRoot);
  if (!isPathInside(cwd, root)) return undefined;

  for (const tokens of tokenizeShell(command)) {
    const invocation = findGitInvocation(tokens);
    if (!invocation) continue;

    const deletion = branchDeletion(invocation);
    if (deletion) {
      if (deletion.forced) return deny('Blocked force branch deletion. Use ordinary git branch -d after verified delivery and explicit confirmation.');
      if (deletion.remote) return deny('Blocked non-local branch cleanup. Only exact confirmed local branches may be removed.');
      const branch = currentBranch ?? inferCurrentBranch(cwd, invocation.globalArgs);
      const { mainBranch, testBranches } = repositoryBranches(cwd, invocation.globalArgs, mainOverride);
      const protectedBranches = new Set([...(mainBranch ? [mainBranch] : COMMON_MAIN_BRANCHES), ...testBranches, branch]);
      if (deletion.branches.some(name => protectedBranches.has(name))) {
        return deny('Blocked deletion of a baseline or currently checked-out branch.');
      }
      // A deletion operand is not a new branch or its start ref. Continue
      // checking any subsequent shell commands without applying creation rules.
      continue;
    }

    const creation = branchCreation(invocation);
    if (creation) {
      const branch = creation.branch || '';
      const startRef = creation.startRef || '';
      const isWorkingBranch = WORKING_BRANCH_PATTERN.test(branch);
      const isMergeBranch = MERGE_BRANCH_PATTERN.test(branch);
      const { mainBranch, testBranches } = repositoryBranches(cwd, invocation.globalArgs, mainOverride);
      const startBranch = startRef ? branchFromRef(startRef, mainBranch)
        : currentBranch ?? inferCurrentBranch(cwd, invocation.globalArgs);
      const mainRef = mainBranch && `origin/${mainBranch}`;

      if (testBranches.includes(startBranch) && !isMergeBranch) {
        return deny(`Blocked working branch creation from test-submission branch ${startBranch}. Use the verified remote default branch.`);
      }

      if (isWorkingBranch && !mainRef) {
        return deny(`Blocked ${branch}: verify the repository's remote default branch before creating a working branch.`);
      }
      if (isWorkingBranch && !isRemoteMainRef(startRef, mainBranch, cwd, invocation.globalArgs)) {
        return deny(`Blocked ${branch}: feature/* and fixbug/* branches must be created from the latest ${mainRef}.`);
      }

      if (isWorkingBranch && !creation.hasNoTrack) {
        return deny(`Blocked ${branch}: create working branches with --no-track so no upstream is configured.`);
      }
    }

    if (invocation.subcommand === 'rebase') {
      const { mainBranch, testBranches } = repositoryBranches(cwd, invocation.globalArgs, mainOverride);
      const refs = invocation.args.map(ref => branchFromRef(ref.replace(/^--onto=/, ''), mainBranch));
      const branch = currentBranch ?? inferCurrentBranch(cwd, invocation.globalArgs);
      const targetsTest = refs.some(ref => testBranches.includes(ref));
      const mainRefs = mainBranch ? [mainBranch] : COMMON_MAIN_BRANCHES;
      const crossesProtectedBases = targetsTest
        && (refs.some(ref => mainRefs.includes(ref)) || WORKING_BRANCH_PATTERN.test(branch));

      if (crossesProtectedBases) {
        return deny('Blocked cross-base rebase between the main and test-submission branches. Create the ordinary MR with the original working branch base.');
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
