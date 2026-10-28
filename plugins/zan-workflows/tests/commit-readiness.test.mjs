import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCommitReadiness } from '../scripts/check-commit-readiness.mjs';

function fixture(t, { init = true, installed = true, modern = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zan commit preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['config', 'core.hooksPath', modern ? '.husky/_' : '.husky']);
  mkdirSync(join(root, '.husky/_'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, '.husky/commit-msg'),
    `${modern ? '' : '. "$(dirname "$0")/_/husky.sh"\n'}touch hook-was-executed\nnpx commitlint --edit "$1"\n`, { mode: 0o755 });
  if (init) writeFileSync(join(root, '.husky/_/husky.sh'), '# fixture\n');
  if (modern) {
    writeFileSync(join(root, '.husky/_/commit-msg'), '. "$(dirname "$0")/h"\n', { mode: 0o755 });
    if (init) writeFileSync(join(root, '.husky/_/h'), '# fixture\n');
  }
  const cli = join(root, 'node_modules/@commitlint/cli');
  if (installed) {
    mkdirSync(cli, { recursive: true });
    writeFileSync(join(cli, 'package.json'), JSON.stringify({ name: '@commitlint/cli', bin: { commitlint: './cli.js' } }));
    writeFileSync(join(cli, 'cli.js'), `
      const message = require('node:fs').readFileSync(0, 'utf8');
      if (message.split('\\n').some(line=>line.length>100)) {
        console.error('body-max-line-length'); process.exitCode=1;
      } else console.log(JSON.stringify({message,cwd:process.cwd(),args:process.argv.slice(2)}));
    `);
  }
  return { root, cli, git, input: { repositoryPath: root, message: 'fix: 修复订单备注上限\n\n--bug=1018520' } };
}

test('checks local commitlint using the exact multiline message without executing hooks or Git writes', async t => {
  const f = fixture(t);
  const before = f.git(['status', '--porcelain']);
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.messageValidation, 'PASSED');
  assert.equal(result.hooksExecuted, false);
  assert.equal(result.writes, 0);
  const actual = JSON.parse(result.commitlint.stdoutTail);
  assert.equal(actual.message, f.input.message + '\n');
  assert.equal(actual.args[0], '--cwd');
  assert.equal(existsSync(join(f.root, 'hook-was-executed')), false);
  assert.equal(f.git(['status', '--porcelain']), before);
});

test('missing Husky initialization blocks before lint or commit', async t => {
  const f = fixture(t, { init: false });
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'BLOCKED');
  assert.match(result.error, /Husky 初始化文件缺失/);
  assert.equal(result.commitlint, undefined);
  assert.equal(result.writes, 0);
});

test('missing local commitlint blocks instead of invoking npx to install a different version', async t => {
  const f = fixture(t, { installed: false });
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'BLOCKED');
  assert.match(result.error, /本地 @commitlint\/cli 不可用/);
  assert.equal(existsSync(join(f.root, 'node_modules')), false);
});

test('project message validation and CLI/runtime errors remain blockers with diagnostic output', async t => {
  const f = fixture(t);
  const invalid = await checkCommitReadiness({ ...f.input, message: 'fix: 标题\n\n' + 'x'.repeat(101) });
  assert.equal(invalid.state, 'BLOCKED');
  assert.match(invalid.commitlint.stderrTail, /body-max-line-length/);
  writeFileSync(join(f.cli, 'cli.js'), 'export { as missing };');
  const incompatible = await checkCommitReadiness(f.input);
  assert.equal(incompatible.state, 'BLOCKED');
  assert.match(incompatible.commitlint.stderrTail, /SyntaxError/);
  assert.equal(incompatible.writes, 0);
});

test('modern Husky dispatch still locates the installed project message linter', async t => {
  const f = fixture(t, { modern: true });
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.messageValidation, 'PASSED');
  assert.equal(existsSync(join(f.root, 'hook-was-executed')), false);
});

test('modern dispatch resolves a retained legacy bootstrap relative to its project hook', async t => {
  const f = fixture(t, { modern: true });
  writeFileSync(join(f.root, '.husky/commit-msg'),
    '. "$(dirname "$0")/_/husky.sh"\nnpx commitlint --edit "$1"\n');
  // Husky runs the project hook via sh; only the effective Git dispatcher needs X_OK.
  chmodSync(join(f.root, '.husky/commit-msg'), 0o644);
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.hookStatus, 'ACTIVE');
  assert.equal(result.messageValidation, 'PASSED');
  assert.equal(result.writes, 0);
});

test('missing modern Husky forwarding initialization blocks before lint', async t => {
  const f = fixture(t, { modern: true, init: false });
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'BLOCKED');
  assert.match(result.error, /Husky 转发初始化文件缺失/);
  assert.equal(result.commitlint, undefined);
});

test('an absent effective dispatcher is diagnosed without inventing an active check or installing hooks', async t => {
  const f = fixture(t, { modern: true });
  rmSync(join(f.root, '.husky/_/commit-msg'));
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.hookStatus, 'MISSING');
  assert.equal(result.messageValidation, 'NOT_CONFIGURED');
  assert.match(result.warning, /Git 不会执行/);
  assert.equal(result.commitlint, undefined);
  assert.equal(existsSync(join(f.root, '.husky/_/commit-msg')), false);
});

test('an ineffective non-executable Git hook does not start lint or bootstrap repairs', async t => {
  const f = fixture(t, { init: false, installed: false });
  chmodSync(join(f.root, '.husky/commit-msg'), 0o644);
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.hookStatus, 'INACTIVE');
  assert.equal(result.messageValidation, 'NOT_CONFIGURED');
  assert.match(result.warning, /项目明确要求/);
  assert.equal(result.commitlint, undefined);
});

test('repositories without a message hook report unconfigured validation without inventing checks', async t => {
  const f = fixture(t);
  rmSync(join(f.root, '.husky/commit-msg'));
  const result = await checkCommitReadiness(f.input);
  assert.equal(result.state, 'READY');
  assert.equal(result.messageValidation, 'NOT_CONFIGURED');
  assert.match(result.limitation, /不代替实际 git commit/);
});
