#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runLocalCheck } from './run-local-check.mjs';
import { readCliPlan, requireText } from './workflow-runtime.mjs';

const exec = promisify(execFile);
const optionalText = async path => {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

// Inspects effective hooks and runs only the installed message linter, never a Git hook or commit.
export async function checkCommitReadiness(input) {
  requireText(input.repositoryPath, '仓库路径');
  requireText(input.message, '准确提交说明');
  const cwd = resolve(input.repositoryPath);
  const git = async args => (await exec('git', ['-C', cwd, ...args], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout.trim();
  const root = await git(['rev-parse', '--show-toplevel']);
  const hook = resolve(cwd, await git(['rev-parse', '--git-path', 'hooks/commit-msg']));
  const checks = { repositoryPath: root, hookPath: hook, hooksExecuted: false, writes: 0 };
  const blocked = (error, details = {}) => ({ ...checks, ...details, state: 'BLOCKED', error });
  const unconfigured = (hookStatus, warning) => ({ ...checks, state: 'READY', hookStatus,
    messageValidation: 'NOT_CONFIGURED', ...(warning ? { warning } : {}),
    limitation: '未执行自定义 Hook；此预检不代替实际 git commit 的 Hook 结果或项目硬性检查' });
  const hookText = await optionalText(hook);
  if (hookText === null) return unconfigured('MISSING',
    '有效 commit-msg Hook 不存在，Git 不会执行它；如项目明确要求该检查，仍须满足对应门禁');
  try { await access(hook, constants.X_OK); }
  catch { return unconfigured('INACTIVE',
    '有效 commit-msg Hook 不可执行，Git 不会执行它；如项目明确要求该检查，仍须满足对应门禁'); }
  checks.hookStatus = 'ACTIVE';
  const sources = [{ path: hook, text: hookText }];
  // Husky 9's generated hook dispatches to the project's sibling commit-msg.
  if (hookText !== null && dirname(hook).endsWith('/.husky/_')) {
    if (await optionalText(join(dirname(hook), 'h')) === null) {
      return blocked('Husky 转发初始化文件缺失；先恢复项目既有 Hook 安装');
    }
    const projectHook = join(dirname(dirname(hook)), 'commit-msg');
    sources.push({ path: projectHook, text: await optionalText(projectHook) || '' });
  }
  for (const source of sources) {
    if (source.text.includes('/_/husky.sh')) {
      const init = join(dirname(source.path), '_', 'husky.sh');
      if (await optionalText(init) === null) return blocked(`Husky 初始化文件缺失：${init}；先恢复项目既有安装`);
    }
  }
  const usesCommitlint = sources.some(source => /\bcommitlint\b/.test(source.text));
  if (!usesCommitlint) return unconfigured('ACTIVE');

  let bin;
  try {
    const require = createRequire(join(cwd, 'package.json'));
    const packagePath = require.resolve('@commitlint/cli/package.json');
    const config = JSON.parse(await readFile(packagePath, 'utf8'));
    const relative = typeof config.bin === 'string' ? config.bin : config.bin?.commitlint;
    if (typeof relative !== 'string' || !relative) throw new Error('missing bin');
    bin = isAbsolute(relative) ? relative : resolve(dirname(packagePath), relative);
    await access(bin, constants.R_OK);
  } catch { return blocked('项目本地 @commitlint/cli 不可用；先恢复锁定依赖，不用 npx 临时下载最新版'); }

  // Run under the same cwd/PATH as the planned git commit so project Node shims are respected.
  const runtime = await runLocalCheck({ kind: 'lint', command: 'node', args: ['--version'], cwd,
    timeoutMs: 10000, maxRssMb: 512, graceMs: 250 });
  if (runtime.status !== 'PASSED') return blocked('提交环境的 Node 不可用', { runtime });
  const lint = await runLocalCheck({ kind: 'lint', command: 'node', args: [bin, '--cwd', cwd], cwd,
    stdinText: input.message + '\n', timeoutMs: 10000, maxRssMb: 512, graceMs: 250 });
  if (lint.status !== 'PASSED') return blocked('本地 commitlint 未通过；检查当前 Node 兼容性、项目配置与提交正文，修正后再提交',
    { nodeVersion: runtime.stdoutTail.trim(), commitlint: lint });
  return { ...checks, state: 'READY', nodeVersion: runtime.stdoutTail.trim(), messageValidation: 'PASSED',
    commitlint: lint, limitation: '未执行自定义 Hook；实际提交须沿用本次 cwd/PATH/Node 环境并保留所有 Hook' };
}

async function main() {
  const input = await readCliPlan();
  if (input.execute) throw new Error('提交预检只读，不支持 --execute');
  const result = await checkCommitReadiness(input);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.state === 'READY' ? 0 : 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({ state: 'BLOCKED', error: error.message, writes: 0 }) + '\n');
    process.exitCode = 1;
  });
}
