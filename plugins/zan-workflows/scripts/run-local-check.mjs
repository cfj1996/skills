#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setPriority, constants } from 'node:os';

const exec = promisify(execFile);
const deadlines = { lint: 120, type: 180, test: 120, build: 300 };
const tailBytes = 16 * 1024;

async function processGroup(pid) {
  const { stdout } = await exec('ps', ['-axo', 'pid=,pgid=,rss=,stat='],
    { timeout: 2000, maxBuffer: 8 * 1024 * 1024 });
  const rows = stdout.trim().split('\n').filter(Boolean).map(line => line.trim().split(/\s+/));
  if (rows.some(row => row.length < 4 || row.slice(0, 3).some(value => !/^\d+$/.test(value)))) {
    throw new Error('无法解析进程内存，检查未运行或已中止');
  }
  const group = rows.filter(row => Number(row[1]) === pid && !row[3].startsWith('Z'));
  return { pids: group.map(row => Number(row[0])), rssMb: group.reduce((sum, row) => sum + Number(row[2]), 0) / 1024 };
}

function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

// Bounds this invocation and its process group, not unrelated user processes.
export async function runLocalCheck({ command, args = [], cwd = process.cwd(), kind,
  timeoutMs = deadlines[kind] * 1000, maxRssMb = 2048, intervalMs = 1000,
  graceMs = 1000, onProgress = () => {}, signal }) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('本地检查执行器目前仅支持 macOS/Linux');
  if (!Object.hasOwn(deadlines, kind) || typeof command !== 'string' || !command ||
      !Array.isArray(args) || args.some(arg => typeof arg !== 'string') ||
      [timeoutMs, maxRssMb, intervalMs, graceMs].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('需要 kind=lint|type|test|build、命令和正数资源预算');
  }
  await processGroup(-1); // Fail before starting work if memory monitoring is unavailable.
  signal?.throwIfAborted();
  const start = Date.now();
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), peakRssMb = null;
    let stopping = false, monitoring = false, exitCode = null, exitSignal = null;
    let deadline, monitor, progress;
    const retain = (old, chunk) => Buffer.concat([old, chunk]).subarray(-tailBytes);
    child.stdout.on('data', chunk => { stdout = retain(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = retain(stderr, chunk); });

    async function stop(reason) {
      if (stopping) return;
      stopping = true;
      clearTimeout(deadline); clearInterval(monitor); clearInterval(progress);
      let cleanupComplete = !child.pid;
      if (child.pid) {
        try {
          const before = await processGroup(child.pid);
          if (!reason && before.pids.length) reason = 'BACKGROUND_PROCESSES';
          signalGroup(child.pid, 'SIGTERM');
          const end = Date.now() + graceMs;
          while (Date.now() < end && (await processGroup(child.pid)).pids.length) await delay(50);
          signalGroup(child.pid, 'SIGKILL');
          const killEnd = Date.now() + 1000;
          do {
            cleanupComplete = !(await processGroup(child.pid)).pids.length;
            if (cleanupComplete) break;
            await delay(50);
          } while (Date.now() < killEnd);
        } catch (error) {
          // Monitoring failure must still attempt to stop the owned group.
          try { signalGroup(child.pid, 'SIGKILL'); } catch {}
          stderr = retain(stderr, Buffer.from('\n' + error.message));
        }
      }
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
      signal?.removeEventListener('abort', abort);
      child.stdout.destroy(); child.stderr.destroy();
      const status = !cleanupComplete ? 'CLEANUP_FAILED' : reason || (exitCode === 0 ? 'PASSED' : 'FAILED');
      resolveResult({ status, command, args, cwd: resolve(cwd), kind, timeoutMs, maxRssMb,
        exitCode, signal: exitSignal, elapsedMs: Date.now() - start,
        peakRssMb: peakRssMb === null ? null : Math.ceil(peakRssMb), cleanupComplete,
        stdoutTail: stdout.toString('utf8'), stderrTail: stderr.toString('utf8') });
    }
    const interrupt = () => { void stop('CANCELLED'); };
    const terminate = () => { void stop('CANCELLED'); };
    const abort = () => { void stop(signal.reason?.code === 'OUTPUT_ERROR' ? 'OUTPUT_ERROR' : 'CANCELLED'); };
    signal?.addEventListener('abort', abort, { once: true });
    // Keep handlers throughout asynchronous cleanup; a second cancellation
    // must not restore the default action and strand TERM-resistant children.
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    child.once('error', error => {
      stderr = retain(stderr, Buffer.from(error.message)); void stop('SPAWN_ERROR');
    });
    child.once('exit', (code, signal) => {
      exitCode = code; exitSignal = signal; void stop(null);
    });
    child.once('spawn', () => {
      if (stopping) return;
      try { setPriority(child.pid, constants.priority.PRIORITY_LOW); }
      catch (error) {
        if (error.code !== 'ESRCH') { void stop('RESOURCE_SETUP_FAILED'); return; }
      }
      deadline = setTimeout(() => { void stop('TIMEOUT'); }, timeoutMs);
      const sample = async () => {
        if (stopping || monitoring) return;
        monitoring = true;
        try {
          const snapshot = await processGroup(child.pid);
          if (snapshot.pids.length) peakRssMb = Math.max(peakRssMb ?? 0, snapshot.rssMb);
          if (!stopping && snapshot.rssMb > maxRssMb) void stop('MEMORY_LIMIT');
        } catch { if (!stopping) void stop('MONITOR_UNAVAILABLE'); }
        finally { monitoring = false; }
      };
      monitor = setInterval(sample, intervalMs);
      void sample();
      progress = setInterval(() => {
        if (stopping) return;
        Promise.resolve().then(() => onProgress({ kind, elapsedMs: Date.now() - start,
          peakRssMb: peakRssMb === null ? null : Math.ceil(peakRssMb) })).catch(error => {
          stderr = retain(stderr, Buffer.from('\n进度输出失败：' + (error?.message || String(error))));
          void stop('OUTPUT_ERROR');
        });
      }, 30000);
    });
  });
}

async function main(argv) {
  const controller = new AbortController();
  const outputError = () => {
    process.exitCode = 1;
    controller.abort(Object.assign(new Error('输出通道不可用'), { code: 'OUTPUT_ERROR' }));
  };
  // Stream write errors arrive asynchronously, outside the progress callback's
  // try/catch. Keep these handlers until process exit, including receipt writes.
  process.stdout.on('error', outputError); process.stderr.on('error', outputError);
  const split = argv.indexOf('--');
  if (split < 0 || !argv[split + 1]) throw new Error('用法：--kind lint|type|test|build [--cwd PATH] [--timeout-seconds N] [--max-rss-mb N] -- COMMAND ARGS...');
  const options = {};
  for (let i = 0; i < split; i += 2) {
    const key = { '--kind': 'kind', '--cwd': 'cwd', '--timeout-seconds': 'timeoutMs', '--max-rss-mb': 'maxRssMb' }[argv[i]];
    if (!key || i + 1 >= split || Object.hasOwn(options, key)) throw new Error('无效或重复的检查选项');
    options[key] = key === 'timeoutMs' ? Number(argv[i + 1]) * 1000 : key === 'maxRssMb' ? Number(argv[i + 1]) : argv[i + 1];
  }
  const result = await runLocalCheck({ ...options, signal: controller.signal,
    command: argv[split + 1], args: argv.slice(split + 2),
    onProgress: state => process.stderr.write(`本地 ${state.kind} 检查运行 ${Math.round(state.elapsedMs / 1000)}s，进程组采样峰值 RSS ${state.peakRssMb === null ? '尚未观测' : state.peakRssMb + 'MiB'}\n`) });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = controller.signal.aborted ? 1 : result.status === 'PASSED' ? 0 : result.status === 'TIMEOUT' ? 124 : 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => {
    process.exitCode = 1;
    if (!process.stderr.destroyed) {
      try { process.stderr.write((error?.message || String(error)) + '\n'); } catch {}
    }
  });
}
