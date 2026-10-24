import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLocalCheck } from '../scripts/run-local-check.mjs';

const script = new URL('../scripts/run-local-check.mjs', import.meta.url).pathname;
const check = (code, extra = {}) => runLocalCheck({ kind: 'test', command: process.execPath,
  args: ['-e', code], timeoutMs: 5000, intervalMs: 50, graceMs: 100, ...extra });

function assertGroupStopped(pid) {
  const rows = execFileSync('ps', ['-axo', 'pgid=,stat='], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(rows.some(line => {
    const [group, state] = line.trim().split(/\s+/);
    return Number(group) === pid && !state.startsWith('Z');
  }), false, `process group ${pid} is still running`);
}

test('runs the actual command in its cwd with literal argv and preserves its output', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'zan-local-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = await check('console.log(JSON.stringify({cwd:process.cwd(), args:process.argv.slice(1)}))',
    { cwd, args: ['-e', 'console.log(JSON.stringify({cwd:process.cwd(), args:process.argv.slice(1)}))', 'a b', '$(literal)'] });
  assert.equal(result.status, 'PASSED');
  assert.equal(result.exitCode, 0);
  assert.equal(result.cleanupComplete, true);
  const output = JSON.parse(result.stdoutTail);
  // macOS may resolve /var as /private/var.
  assert.equal(output.cwd.endsWith(cwd.split('/').at(-1)), true);
  assert.deepEqual(output.args, ['a b', '$(literal)']);
});

test('reports command failure and launch failure without treating either as a pass', async () => {
  const failed = await check('console.error("failed behavior"); process.exit(7)');
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stderrTail, /failed behavior/);
  const missing = await check('', { command: '/nonexistent/zan-check-command' });
  assert.equal(missing.status, 'SPAWN_ERROR');
  assert.equal(missing.cleanupComplete, true);
});

test('verification runs with lower CPU scheduling priority', async () => {
  const result = await check('console.log(require("node:os").getPriority())');
  assert.equal(result.status, 'PASSED');
  assert.ok(Number(result.stdoutTail.trim()) > 0);
});

test('a successful parent cannot leave background descendants behind or claim a pass', async () => {
  const result = await check(`
    const {spawn}=require('node:child_process');
    spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    console.log(process.pid);
    process.exit(0);
  `);
  assert.equal(result.status, 'BACKGROUND_PROCESSES');
  assert.equal(result.exitCode, 0);
  assert.equal(result.cleanupComplete, true);
  assertGroupStopped(Number(result.stdoutTail.trim()));
});

test('deadline kills the entire owned group including descendants ignoring TERM', async () => {
  const result = await check(`
    const {spawn} = require('node:child_process');
    process.on('SIGTERM',()=>{});
    spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],{stdio:'ignore'});
    console.log(process.pid);
    setInterval(()=>{},1000);
  `, { timeoutMs: 600 });
  assert.equal(result.status, 'TIMEOUT');
  assert.equal(result.cleanupComplete, true);
  assertGroupStopped(Number(result.stdoutTail.trim()));
});

test('aggregate child memory terminates a group even though each process is below budget', async () => {
  const result = await check(`
    const {spawn} = require('node:child_process');
    console.log(process.pid);
    for (let i=0;i<2;i++) spawn(process.execPath,['-e',
      'global.data=Buffer.alloc(96*1024*1024,1); setInterval(()=>{},1000)'],{stdio:'ignore'});
    setInterval(()=>{},1000);
  `, { maxRssMb: 200 });
  assert.equal(result.status, 'MEMORY_LIMIT');
  assert.ok(result.peakRssMb > 200);
  assert.equal(result.cleanupComplete, true);
  assertGroupStopped(Number(result.stdoutTail.trim()));
});

test('large output is drained but only bounded log tails are retained', async () => {
  const result = await check('process.stdout.write("a".repeat(1024*1024)+"END"); process.stderr.write("b".repeat(1024*1024)+"ERR")');
  assert.equal(result.status, 'PASSED');
  assert.ok(Buffer.byteLength(result.stdoutTail) <= 16384);
  assert.ok(Buffer.byteLength(result.stderrTail) <= 16384);
  assert.ok(result.stdoutTail.endsWith('END'));
  assert.ok(result.stderrTail.endsWith('ERR'));
});

test('invalid budgets and unavailable memory monitoring fail before a command starts', async () => {
  for (const extra of [{ kind: 'unknown' }, { timeoutMs: 0 }, { maxRssMb: NaN }, { graceMs: -1 }]) {
    await assert.rejects(check('process.exit(0)', extra), /预算/);
  }
  const path = process.env.PATH;
  try {
    process.env.PATH = '/nonexistent/zan-monitor';
    await assert.rejects(check('process.exit(0)'), /ENOENT/);
  } finally { process.env.PATH = path; }
});

test('repeated CLI cancellation still cleans TERM-resistant descendants and returns a receipt', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zan-local-cancel-'));
  const pidFile = join(dir, 'pid');
  t.after(() => {
    if (existsSync(pidFile)) {
      try { process.kill(-Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const code = `const {spawn}=require('node:child_process');
    process.on('SIGTERM',()=>{});
    spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],{stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
    console.log(process.pid); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, [script, '--kind', 'test', '--', process.execPath, '-e', code]);
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  let secondCancel;
  // Observe completed fixture startup rather than assuming a fixed startup delay.
  const cancellation = setInterval(() => {
    if (existsSync(pidFile)) {
      clearInterval(cancellation);
      child.kill('SIGTERM');
      secondCancel = setTimeout(() => child.kill('SIGTERM'), 100);
    }
  }, 50);
  const watchdog = setTimeout(() => { clearInterval(cancellation); child.kill('SIGTERM'); }, 5000);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  clearInterval(cancellation); clearTimeout(watchdog); clearTimeout(secondCancel);
  assert.equal(exitCode, 1, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cleanupComplete, true);
  assertGroupStopped(Number(result.stdoutTail.trim()));
});

function outputFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'zan-local-output-'));
  const pidFile = join(dir, 'pid'), preload = join(dir, 'preload.mjs');
  t.after(() => {
    if (existsSync(pidFile)) {
      try { process.kill(-Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    rmSync(dir, { recursive: true, force: true });
  });
  // Accelerate only progress notifications after fixture startup; deadlines,
  // memory monitoring and cleanup are the production implementations.
  writeFileSync(preload, `import {existsSync} from 'node:fs';
    const interval=globalThis.setInterval;
    globalThis.setInterval=(fn,ms,...args)=>ms===30000
      ? interval(()=>{if(existsSync(${JSON.stringify(pidFile)})) fn(...args)},30)
      : interval(fn,ms,...args);`);
  const code = `const {spawn}=require('node:child_process');
    process.on('SIGTERM',()=>{});
    spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],{stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
    setInterval(()=>{},1000);`;
  return { preload, code, pidFile };
}

async function capture(child, closeStderr = false) {
  let stdout = '', stderr = '', broken = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => {
    stderr += chunk;
    if (closeStderr && !broken) { broken = true; child.stderr.destroy(); }
  });
  const watchdog = setTimeout(() => child.kill('SIGTERM'), 5000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    return { code, stdout, stderr, broken };
  } finally { clearTimeout(watchdog); }
}

test('a closed CLI stderr pipe stops the owned group instead of crashing the supervisor', async t => {
  const fixture = outputFixture(t);
  const child = spawn(process.execPath, ['--import', fixture.preload, script,
    '--kind', 'test', '--timeout-seconds', '3', '--', process.execPath, '-e', fixture.code]);
  const output = await capture(child, true);
  assert.equal(output.broken, true);
  assert.equal(output.code, 1);
  const result = JSON.parse(output.stdout);
  assert.equal(result.status, 'OUTPUT_ERROR');
  assert.equal(result.cleanupComplete, true);
  assertGroupStopped(Number(readFileSync(fixture.pidFile, 'utf8')));
});

for (const callback of ['() => { throw new Error("progress failed") }',
  '() => Promise.reject(new Error("progress failed"))']) {
  test(`progress callback failure cleans descendants: ${callback}`, async t => {
    const fixture = outputFixture(t);
    const module = new URL('../scripts/run-local-check.mjs', import.meta.url).href;
    const code = `import {runLocalCheck} from ${JSON.stringify(module)};
      const result=await runLocalCheck({kind:'test',command:process.execPath,
        args:['-e',${JSON.stringify(fixture.code)}],timeoutMs:3000,graceMs:100,onProgress:${callback}});
      console.log(JSON.stringify(result));`;
    const child = spawn(process.execPath, ['--import', fixture.preload, '--input-type=module', '-e', code]);
    const output = await capture(child);
    assert.equal(output.code, 0, output.stderr);
    const result = JSON.parse(output.stdout);
    assert.equal(result.status, 'OUTPUT_ERROR');
    assert.equal(result.cleanupComplete, true);
    assert.match(result.stderrTail, /progress failed/);
    assertGroupStopped(Number(readFileSync(fixture.pidFile, 'utf8')));
  });
}
