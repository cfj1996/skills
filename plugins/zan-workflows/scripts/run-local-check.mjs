#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setPriority, constants } from 'node:os';
import { processGroup, signalGroup } from './process-group.mjs';
import { readCliPlan, stableJson } from './workflow-runtime.mjs';
import { recordEvent } from './execution-recorder.mjs';

const deadlines = { lint: 120, type: 180, test: 120, build: 300 };
const tailBytes = 16 * 1024;

function recordCheck(event) {
  const runId = process.env.ZAN_WORKFLOWS_RUN_ID;
  if (!runId || process.env.ZAN_WORKFLOWS_RECORDING === 'off') return;
  try { recordEvent(runId, { ...event, stage: 'verification', source: 'executor' }); } catch { /* diagnostics are optional */ }
}

// Bounds this invocation and its process group, not unrelated user processes.
export async function runLocalCheck({ command, args = [], cwd = process.cwd(), kind,
  timeoutMs = deadlines[kind] * 1000, maxRssMb = 2048, intervalMs = 1000,
  graceMs = 1000, onProgress = () => {}, signal, stdinText }) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('本地检查执行器目前仅支持 macOS/Linux');
  if (!Object.hasOwn(deadlines, kind) || typeof command !== 'string' || !command ||
      !Array.isArray(args) || args.some(arg => typeof arg !== 'string') ||
      (stdinText !== undefined && (typeof stdinText !== 'string' || Buffer.byteLength(stdinText) > 262144)) ||
      [timeoutMs, maxRssMb, intervalMs, graceMs].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('需要 kind=lint|type|test|build、命令和正数资源预算');
  }
  await processGroup(-1); // Fail before starting work if memory monitoring is unavailable.
  signal?.throwIfAborted();
  const start = Date.now();
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd, detached: true, stdio: [stdinText === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), peakRssMb = null;
    let stopping = false, monitoring = false, exitCode = null, exitSignal = null, stopReason = null;
    let backgroundPids = [], settleElapsedMs = 0;
    let deadline, monitor, progress;
    const retain = (old, chunk) => Buffer.concat([old, chunk]).subarray(-tailBytes);
    child.stdout.on('data', chunk => { stdout = retain(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = retain(stderr, chunk); });

    async function stop(reason) {
      if (reason && !stopReason) stopReason = reason;
      if (stopping) return;
      stopping = true;
      clearTimeout(deadline); clearInterval(monitor); clearInterval(progress);
      let cleanupComplete = !child.pid;
      if (child.pid) {
        try {
          let before = await processGroup(child.pid);
          // Build workers may finish shortly after their successful parent exits.
          // Let them drain naturally before classifying them as abandoned work.
          if (!stopReason && exitCode === 0 && before.pids.length) {
            const settleStart = Date.now();
            const settleEnd = Math.min(settleStart + graceMs, start + timeoutMs);
            while (!stopReason && before.pids.length && Date.now() < settleEnd) {
              peakRssMb = Math.max(peakRssMb ?? 0, before.rssMb);
              if (before.rssMb > maxRssMb) { stopReason = 'MEMORY_LIMIT'; break; }
              await delay(Math.min(50, Math.max(1, settleEnd - Date.now())));
              before = await processGroup(child.pid);
            }
            settleElapsedMs = Date.now() - settleStart;
            if (!stopReason && before.pids.length && Date.now() >= start + timeoutMs) stopReason = 'TIMEOUT';
          }
          backgroundPids = before.pids;
          if (!stopReason && exitCode === 0 && before.pids.length) stopReason = 'BACKGROUND_PROCESSES';
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
      const status = !cleanupComplete ? 'CLEANUP_FAILED' : stopReason || (exitCode === 0 ? 'PASSED' : 'FAILED');
      resolveResult({ status, command, args, cwd: resolve(cwd), kind, timeoutMs, maxRssMb,
        exitCode, signal: exitSignal, elapsedMs: Date.now() - start,
        peakRssMb: peakRssMb === null ? null : Math.ceil(peakRssMb), cleanupComplete,
        backgroundPids, settleElapsedMs,
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
      if (stdinText !== undefined) {
        child.stdin.on('error', error => {
          // A rejected message may close stdin before consuming it; retain the command's verdict.
          if (error.code !== 'EPIPE') { stderr = retain(stderr, Buffer.from(error.message)); void stop('INPUT_ERROR'); }
        });
        child.stdin.end(stdinText);
      }
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

// One approved, stable working tree. Coalesce identical checks selected by
// multiple Tasks before running anything. Results are local to this batch.
export async function runVerificationBatch({ checks }, { run = runLocalCheck, signal, onProgress } = {}) {
  if (!Array.isArray(checks) || !checks.length || checks.length > 50) throw new Error('验证批次需要 1～50 个已经选定的检查');
  const ids = new Set(), groups = new Map();
  const fields = new Set(['id', 'covers', 'cwd', 'command', 'args', 'kind', 'timeoutMs', 'maxRssMb', 'fullScope', 'fullScopeReason']);
  for (const check of checks) {
    if (!check || Object.keys(check).some(key => !fields.has(key)) ||
        typeof check.id !== 'string' || !check.id.trim() || ids.has(check.id) ||
        !Object.hasOwn(deadlines, check.kind) || typeof check.command !== 'string' || !check.command ||
        !Array.isArray(check.args) || !check.args.every(arg => typeof arg === 'string') ||
        typeof check.cwd !== 'string' || !check.cwd || !Array.isArray(check.covers) || !check.covers.length ||
        !check.covers.every(item => typeof item === 'string' && item.trim()) ||
        check.fullScope !== undefined && typeof check.fullScope !== 'boolean' ||
        check.fullScope === true && (typeof check.fullScopeReason !== 'string' || !check.fullScopeReason.trim())) {
      throw new Error('检查需要准确目录、命令及覆盖项；全量检查需说明实际触发原因');
    }
    for (const key of ['timeoutMs', 'maxRssMb']) if (check[key] !== undefined &&
      (!Number.isFinite(check[key]) || check[key] <= 0)) throw new Error('检查资源预算无效');
    ids.add(check.id);
    const options = { kind: check.kind, command: check.command, args: check.args, cwd: resolve(check.cwd),
      timeoutMs: check.timeoutMs ?? deadlines[check.kind] * 1000, maxRssMb: check.maxRssMb ?? 2048 };
    const identity = stableJson(options);
    if (!groups.has(identity)) groups.set(identity, { options, ids: [], covers: new Set(), fullScopeReasons: new Set() });
    const group = groups.get(identity);
    group.ids.push(check.id);
    if (check.fullScope) group.fullScopeReasons.add(check.fullScopeReason);
    for (const covered of check.covers) group.covers.add(covered);
  }
  const receipts = [], started = Date.now();
  for (const group of groups.values()) {
    signal?.throwIfAborted();
    const action = group.options.kind, operationId = 'check-' + (receipts.length + 1);
    const before = Date.now();
    recordCheck({ type: 'action_started', action, operationId });
    let result;
    try { result = await run({ ...group.options, signal, onProgress }); }
    catch (error) {
      recordCheck({ type: 'action_finished', action, operationId, state: 'BLOCKED', elapsedMs: Date.now() - before });
      throw error;
    }
    const passed = result.status === 'PASSED' && result.cleanupComplete === true;
    recordCheck({ type: 'action_finished', action, operationId, state: passed ? 'PASSED' :
      result.status === 'PASSED' ? 'CLEANUP_FAILED' : result.status, elapsedMs: result.elapsedMs });
    receipts.push({ ids: group.ids, covers: [...group.covers], ...group.options, status: result.status,
      ...(group.fullScopeReasons.size ? { fullScopeReasons: [...group.fullScopeReasons] } : {}),
      cleanupComplete: result.cleanupComplete, elapsedMs: result.elapsedMs, exitCode: result.exitCode,
      ...(!passed ? { stdoutTail: result.stdoutTail, stderrTail: result.stderrTail, backgroundPids: result.backgroundPids } : {}) });
    if (!passed) {
      const ran = new Set(receipts.flatMap(row => row.ids));
      return { status: result.status === 'PASSED' ? 'CLEANUP_FAILED' : result.status,
        elapsedMs: Date.now() - started, requestedChecks: ids.size, executedCommands: receipts.length,
        receipts, notRun: [...ids].filter(id => !ran.has(id)) };
    }
  }
  return { status: 'PASSED', elapsedMs: Date.now() - started, requestedChecks: ids.size, executedCommands: receipts.length, receipts, notRun: [] };
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
  if (argv.length === 1 && argv[0] === '--batch') {
    const result = await runVerificationBatch(await readCliPlan([]), { signal: controller.signal,
      onProgress: state => process.stderr.write('本地 ' + state.kind + ' 检查已运行 ' + Math.round(state.elapsedMs / 1000) + 's\n') });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = controller.signal.aborted ? 1 : result.status === 'PASSED' ? 0 : result.status === 'TIMEOUT' ? 124 : 1;
    return;
  }
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
