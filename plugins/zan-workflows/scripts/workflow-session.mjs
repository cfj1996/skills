#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClientPool } from './mcp-client.mjs';
import { configuredJenkinsReader } from './jenkins-readonly.mjs';
import { mergeReviewedBranch } from './merge-reviewed-branch.mjs';
import { runJenkinsRelease } from './run-jenkins-release.mjs';
import { registerTestSubmission } from './register-test-submission.mjs';
import { checkLocalCloseout } from './check-local-closeout.mjs';
import { ensureTestWiki } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { sessionInput } from './session-input.mjs';
import { resolveJenkinsJob } from './resolve-jenkins-job.mjs';
import { markPendingMergeWiki, validatePendingWikiPlan } from './pending-merge-wiki.mjs';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { validateWait, waitForDeadline } from './workflow-runtime.mjs';
import { sessionRecorder } from './execution-recorder.mjs';

const ordinaryTimeoutMs = 180000;
const maxTimeoutMs = 43200000;
const positiveBudget = value => Number.isFinite(value) && value > 0 && value <= maxTimeoutMs;
const abortedError = code => Object.assign(new Error(code === 'REQUEST_TIMEOUT'
  ? '请求超时；先核实实际效果，不自动重试写操作' : '请求已中止；先核实实际效果，不自动重试写操作'), { code });

// Keep bounded public identities, never arbitrary helper input, parameters or output.
const recoveryFields = ['projectId', 'repositoryPath', 'originUrl', 'sourceBranch', 'targetBranch',
  'sourceSha', 'targetSha', 'deliveredSha', 'mrIid', 'mrUrl', 'mergeCommitSha', 'phase',
  'targetProject', 'releaseTarget', 'releaseKind', 'instance', 'sourceRepository', 'jobName',
  'jobUrl', 'releaseRef', 'expectedSha', 'releaseChannel', 'targetEnvironment', 'queueId',
  'queueUrl', 'buildNumber', 'buildUrl', 'workspaceId', 'entryType', 'entryId',
  'wikiId', 'wikiUrl', 'monthWikiId'];
const publicRecovery = value => Object.fromEntries(recoveryFields.filter(key => {
  const field = value?.[key];
  return typeof field === 'string' && field.length <= 4096 || Number.isSafeInteger(field);
}).map(key => [key, value[key]]));
const progressRecovery = event => {
  const fields = publicRecovery(event);
  return Object.fromEntries(['mrIid', 'mrUrl', 'queueId', 'queueUrl', 'buildNumber', 'buildUrl']
    .filter(key => Object.hasOwn(fields, key)).map(key => [key, fields[key]]));
};

export function requestBudget(request, io = {}, override) {
  if (override !== undefined) return override;
  const waits = request.phase === 'EXECUTE' && (request.action === 'merge' ||
    request.action === 'release' && (request.input?.completionMode || 'BUILD_TERMINAL') === 'BUILD_TERMINAL');
  return waits ? Math.min(maxTimeoutMs, validateWait(io) + ordinaryTimeoutMs) : ordinaryTimeoutMs;
}

export class WorkflowSession {
  constructor({ allowExecute = false, pool = new McpClientPool(), reader = configuredJenkinsReader, io = {},
    requestTimeoutMs, shutdownTimeoutMs = 2000, onEvent = () => {}, recorder = () => {}, clock = () => performance.now() } = {}) {
    if (requestTimeoutMs !== undefined && !positiveBudget(requestTimeoutMs) || !positiveBudget(shutdownTimeoutMs) || shutdownTimeoutMs > 30000) {
      throw new Error('会话期限必须为正数；请求最多 12 小时，关闭最多 30 秒');
    }
    this.allowExecute = allowExecute;
    this.pool = pool;
    this.reader = reader;
    this.io = io;
    this.executionBlocked = false;
    this.pendingMerges = new Map();
    this.ids = new Set();
    this.closed = false;
    this.whenClosing = new Promise(resolve => { this.notifyClosing = resolve; });
    this.requestTimeoutMs = requestTimeoutMs;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.onEvent = onEvent;
    this.recorder = recorder;
    this.clock = clock;
    this.startedAt = this.lastFinishedAt = clock();
    this.busyMs = 0; this.idleMs = 0; this.requestCount = 0;
    this.executions = new Set();
    this.events = new Set();
  }

  emit(event) {
    // Local feedback is best-effort and must not share the output channel's failure semantics.
    try { Promise.resolve(this.recorder(event)).catch(() => {}); } catch {}
    const failed = () => { this.outputFailed = true; void this.close('OUTPUT_ERROR'); };
    try {
      const result = this.onEvent({ at: new Date().toISOString(), ...event });
      let pending;
      pending = Promise.resolve(result).then(() => { this.events.delete(pending); }, () => {
        failed(); this.events.delete(pending);
      });
      this.events.add(pending);
      return pending;
    } catch { failed(); return Promise.resolve(); }
  }

  async dispatch(request) {
    if (this.closed) throw new Error('工作流会话已关闭');
    if (this.active) throw new Error('会话已有运行中的请求；读取其结果后再发送下一项');
    if (request?.action === 'finish') {
      if (request.phase !== 'PLAN' || typeof request.id !== 'string' || !request.id || request.id.length > 128 || this.ids.has(request.id)) {
        throw new Error('finish 需要唯一请求 ID 和只读 PLAN 阶段');
      }
      this.ids.add(request.id);
      return this.close('FINISHED');
    }
    const timeoutMs = requestBudget(request || {}, this.io, this.requestTimeoutMs);
    const startedAt = this.clock(), controller = new AbortController();
    let markDone;
    const context = { controller, done: new Promise(resolve => { markDone = resolve; }),
      id: typeof request?.id === 'string' && request.id.length <= 128 ? request.id : null,
      action: ['merge', 'release', 'wiki', 'registration', 'closeout', 'job'].includes(request?.action) ? request.action : null,
      phase: ['PLAN', 'EXECUTE'].includes(request?.phase) ? request.phase : null,
      recovery: {}, observedIdentifiers: {} };
    const idleBeforeMs = startedAt - this.lastFinishedAt;
    this.idleMs += idleBeforeMs;
    this.active = context; this.requestCount++;
    const guard = () => {
      controller.signal.throwIfAborted();
      if (this.closed) throw abortedError('SESSION_CLOSED');
    };
    const guarded = fn => (...args) => {
      guard();
      const result = fn(...args);
      if (result?.then) return result.then(value => { guard(); return value; });
      guard(); return result;
    };
    const io = Object.fromEntries(Object.entries(this.io).map(([key, value]) => [key, typeof value === 'function' ? guarded(value.bind(this.io)) : value]));
    io.signal = controller.signal;
    io.onProgress = guarded(event => {
      Object.assign(context.observedIdentifiers, progressRecovery(event));
      return this.io.onProgress?.(event);
    });
    context.children = [];
    io.trackLocalChild = child => {
      const tracked = { child, closed: false };
      tracked.done = new Promise(resolve => child.once('close', () => {
        tracked.closed = true; resolve();
        if (context.executionSettled && context.children.every(child => child.closed)) this.executions.delete(context);
      }));
      context.children.push(tracked);
      this.executions.add(context);
    };
    io.sleep ||= ms => delay(ms, undefined, { signal: controller.signal });
    io.maxWaitMs = Math.min(this.io.maxWaitMs ?? 1800000, timeoutMs);
    const call = server => guarded((name, args) => this.pool.call(server, name, args));
    const reader = input => {
      guard();
      return new Proxy(this.reader(input, { signal: controller.signal }), {
        get: (target, key) => typeof target[key] === 'function' ? guarded(target[key].bind(target)) : target[key],
      });
    };
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(abortedError('REQUEST_TIMEOUT')), timeoutMs);
    let state = 'BLOCKED', reason, interrupted;
    try {
      this.emit({ state: 'REQUEST_STARTED', requestId: context.id, action: context.action, phase: context.phase,
        timeoutMs, idleBeforeMs: Math.round(idleBeforeMs) });
      this.executions.add(context);
      const work = Promise.resolve().then(() => this.executeRequest(request, { call, reader, io }));
      const settled = () => {
        context.executionSettled = true;
        if (context.children.every(child => child.closed)) this.executions.delete(context);
      };
      context.settled = work.then(result => {
        Object.assign(context.recovery, publicRecovery(result)); settled();
      }, error => {
        Object.assign(context.recovery, publicRecovery(error.result));
        settled();
      });
      const result = await Promise.race([work, cancelled]);
      state = result.state;
      return result;
    } catch (error) {
      if (controller.signal.aborted || error.code === 'MCP_TIMEOUT') {
        reason = controller.signal.reason?.code || error.code;
        state = request?.phase === 'EXECUTE' ? 'UNKNOWN' : 'BLOCKED';
        this.executionBlocked = true;
        // A helper may have already sent a write; never replace uncertainty with writes=0.
        Object.assign(context.recovery, publicRecovery(error.result));
        interrupted = Object.assign(abortedError(reason), { result: { state, reason,
          writes: state === 'UNKNOWN' ? null : 0, error: '请求未能完整核验；先检查实际效果，不自动重放写操作' } });
        throw interrupted;
      }
      state = error.result?.state || 'BLOCKED';
      throw error;
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
      const elapsedMs = this.clock() - startedAt;
      this.busyMs += elapsedMs; this.lastFinishedAt = this.clock(); this.active = null;
      this.emit({ state: 'REQUEST_FINISHED', requestId: context.id, action: context.action, phase: context.phase,
        resultState: state, ...(reason ? { reason } : {}), elapsedMs: Math.round(elapsedMs) });
      markDone();
      if (context.executionSettled && context.children.every(child => child.closed)) this.executions.delete(context);
      if (controller.signal.aborted || reason === 'MCP_TIMEOUT') await this.close(reason || controller.signal.reason?.code);
      // Bounded close may settle the helper after the outer deadline; keep its known identities.
      if (interrupted) interrupted.result = {
        ...(Object.keys(context.observedIdentifiers).length ? { observedIdentifiers: context.observedIdentifiers } : {}),
        ...context.recovery, ...interrupted.result };
    }
  }

  async executeRequest(request, { call, reader, io }) {
    if (this.closed) throw new Error('工作流会话已关闭');
    if (!request || typeof request.id !== 'string' || !request.id || request.id.length > 128 ||
        this.ids.has(request.id) || !['PLAN', 'EXECUTE'].includes(request.phase) ||
        !request.input || typeof request.input !== 'object' || Array.isArray(request.input) ||
        !['merge', 'release', 'wiki', 'registration', 'closeout', 'job'].includes(request.action)) {
      throw new Error('请求身份、阶段、动作或输入无效；请求 ID 不可重复');
    }
    this.ids.add(request.id);
    const execute = request.phase === 'EXECUTE';
    if (execute && (!this.allowExecute || this.executionBlocked || ['closeout', 'job'].includes(request.action))) {
      throw new Error('当前会话不允许此写操作；关闭会话并重新核实实际状态');
    }
    if (execute && this.pendingMerges.size) throw new Error('存在待人工合并 MR；先用 PLAN 和 VERIFY_ONLY 核验原 MR，后续写入暂不执行');
    const input = { ...request.input, execute };
    if (execute && input.confirmed !== true) throw new Error('执行缺少已展示清单的明确确认');
    if (request.action === 'merge' && input.pendingWiki) validatePendingWikiPlan(input.pendingWiki, input);
    if (request.action === 'merge' && input.mergeMode === 'VERIFY_ONLY') {
      const pending = this.pendingMerges.get(`${input.projectId}:${input.mrIid}`);
      if (pending && !['originUrl', 'repositoryPath', 'sourceBranch', 'targetBranch', 'sourceSha',
        'targetSha', 'pipelineRequired', 'reviewPassed'].every(field => pending[field] === input[field])) {
        throw new Error('待合并清单身份或校验要求已变化；需重新评审和确认');
      }
    }
    try {
      let result;
      switch (request.action) {
        case 'merge': result = await mergeReviewedBranch(call('gitlab-mcp'), input, io); break;
        case 'release': result = await runJenkinsRelease(call('jenkins-mcp'), reader(input), input, io); break;
        case 'registration': result = await registerTestSubmission(call('tapd-mcp'), input, io); break;
        case 'wiki': result = await ensureTestWiki(call('tapd-mcp'), input, new Date(), io); break;
        case 'closeout': result = await checkLocalCloseout(input, io); break;
        case 'job': result = await resolveJenkinsJob(call('jenkins-mcp'), input); break;
      }
      if (request.action === 'merge' && result.state === 'AWAITING_MERGE') {
        this.pendingMerges.set(`${result.projectId}:${result.mrIid}`, result.resumePlan);
        if (execute && input.pendingWiki) {
          try {
            result.pendingWiki = await markPendingMergeWiki(call('gitlab-mcp'), call('tapd-mcp'), { ...input.pendingWiki,
              mockSafety: input.mockSafety, mockSafeties: input.mockSafeties, mockRepositories: input.mockRepositories },
              result, { execute: true, confirmed: input.confirmed, io });
          } catch (error) {
            this.executionBlocked = true;
            result.pendingWiki = error.result || { state: 'BLOCKED', writes: 0, error: error.message };
          }
        }
      }
      if (request.action === 'merge' && input.mergeMode === 'VERIFY_ONLY' && result.state === 'MERGED') {
        const key = `${result.projectId}:${result.mrIid}`;
        const pending = this.pendingMerges.get(key);
        if (pending && ['originUrl', 'repositoryPath', 'sourceBranch', 'targetBranch', 'sourceSha']
          .every(field => pending[field] === result[field])) this.pendingMerges.delete(key);
      }
      if (execute && ['BLOCKED', 'FAILED', 'UNKNOWN'].includes(result?.state)) this.executionBlocked = true;
      return result;
    } catch (error) {
      if (execute) this.executionBlocked = true;
      throw error;
    }
  }

  close(reason = 'FINISHED') {
    if (this.closing) return this.closing;
    this.closed = true;
    this.notifyClosing(reason);
    const active = this.active, executions = [...this.executions], closingAt = this.clock(), closeDeadline = Date.now() + this.shutdownTimeoutMs;
    if (!active) this.idleMs += closingAt - this.lastFinishedAt;
    active?.controller.abort(abortedError(reason));
    let cleanup;
    try { cleanup = Promise.resolve(this.pool.close({ timeoutMs: this.shutdownTimeoutMs })); }
    catch { cleanup = Promise.resolve({ cleanupComplete: false }); }
    this.closing = (async () => {
      if (active) await active.done;
      const shutdownStartedAt = active ? this.lastFinishedAt : closingAt;
      const { value: result } = await waitForDeadline(cleanup, closeDeadline);
      await waitForDeadline(Promise.all(executions.flatMap(execution =>
        [execution.settled, ...execution.children.map(child => child.done)])), closeDeadline);
      const executionSettled = executions.every(execution => execution.executionSettled === true);
      const pendingChildren = executions.flatMap(execution => execution.children.filter(child => !child.closed));
      // Stop only tracked direct children; unknown descendants are not claimed clean.
      for (const { child } of pendingChildren) {
        try { child.kill('SIGKILL'); } catch {}
        child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
      }
      const cleanupComplete = result?.cleanupComplete === true && executionSettled && pendingChildren.length === 0;
      if (!(await waitForDeadline(Promise.all([...this.events]), closeDeadline)).settled) this.outputFailed = true;
      const receipt = { state: cleanupComplete ? 'SESSION_CLOSED' : 'CLEANUP_FAILED', reason,
        cleanupComplete, executionSettled, localProcessesClosed: pendingChildren.length === 0,
        pendingLocalPids: pendingChildren.map(({ child }) => child.pid ?? null), clients: result?.clients || [],
        requestCount: this.requestCount, busyMs: Math.round(this.busyMs), idleMs: Math.round(this.idleMs),
        shutdownMs: Math.round(this.clock() - shutdownStartedAt), lifetimeMs: Math.round(this.clock() - this.startedAt) };
      if (this.outputFailed) receipt.reason = 'OUTPUT_ERROR';
      if (!(await waitForDeadline(this.emit(receipt), closeDeadline)).settled) this.outputFailed = true;
      if (this.outputFailed) receipt.reason = 'OUTPUT_ERROR';
      return receipt;
    })();
    return this.closing;
  }
}

export function parseSessionOptions(argv) {
  const options = { idleTimeoutMs: 300000, allowExecute: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error('会话选项不可重复');
    seen.add(flag);
    if (flag === '--allow-execute') options.allowExecute = true;
    else if (flag !== '--json') {
      const key = { '--idle-timeout-seconds': 'idleTimeoutMs', '--request-timeout-seconds': 'requestTimeoutMs',
        '--shutdown-timeout-seconds': 'shutdownTimeoutMs' }[flag];
      const value = Number(argv[++i]) * 1000;
      if (!key || !positiveBudget(value) || key === 'shutdownTimeoutMs' && value > 30000) {
        throw new Error('无效会话选项；期限须为正数，关闭期限最多 30 秒');
      }
      options[key] = value;
    }
  }
  return options;
}

export async function serveWorkflowSession({ session = new WorkflowSession(), input = process.stdin,
  output = process.stdout, diagnostics = process.stderr, idleTimeoutMs = 300000 } = {}) {
  if (!positiveBudget(idleTimeoutMs)) throw new Error('会话空闲期限无效');
  const observer = session.onEvent;
  session.onEvent = event => {
    const observed = Promise.resolve().then(() => observer(event));
    try { diagnostics.write(JSON.stringify(event) + '\n'); }
    catch (error) { void observed.catch(() => {}); throw error; }
    return observed;
  };
  let lines, transport;
  let timer, stopped;
  const stop = (reason, code = 0) => {
    stopped ||= { reason, code };
    lines?.close(); transport?.restore();
    void session.close(reason);
  };
  const outputError = () => stop('OUTPUT_ERROR', 1);
  output.on('error', outputError); diagnostics.on('error', outputError);
  transport = sessionInput(input, () => stop('INTERRUPTED', 130));
  lines = createInterface({ input: transport.stream, terminal: false });
  void session.whenClosing.then(() => {
    clearTimeout(timer); lines.close(); transport.restore();
  });
  const arm = () => {
    clearTimeout(timer);
    if (!stopped && !session.closed) timer = setTimeout(() => stop('IDLE_TIMEOUT'), idleTimeoutMs);
  };
  const interrupt = () => stop('INTERRUPTED', 130), terminate = () => stop('TERMINATED', 143);
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  session.emit({ state: 'SESSION_READY', inputMode: transport.mode, idleTimeoutMs,
    requestTimeoutMs: session.requestTimeoutMs ?? null, timeoutPolicy: 'ACTION_BUDGET',
    ...(session.recorder.status ? { feedbackRecording: session.recorder.status } : {}) });
  arm();
  try {
    for await (const line of lines) {
      if (stopped || session.closed) break;
      if (!line.trim()) continue;
      clearTimeout(timer); // dispatch owns a separate deadline, including active requests.
      let request;
      try {
        if (Buffer.byteLength(line) > 262144) throw new Error('请求超过 256 KiB');
        try { request = JSON.parse(line); } catch { throw new Error('请求不是有效 JSON'); }
        const result = await session.dispatch(request);
        output.write(JSON.stringify({ id: request.id, result }) + '\n');
      } catch (error) {
        output.write(JSON.stringify({ id: request?.id || null,
          result: error.result || { state: 'BLOCKED', writes: 0, error: error.message } }) + '\n');
      }
      if (session.closed) break;
      arm();
    }
  } finally {
    clearTimeout(timer); lines.close(); transport.restore(); input.destroy();
    const receipt = await session.close(stopped?.reason || 'EOF');
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
    output.removeListener('error', outputError); diagnostics.removeListener('error', outputError);
    const failed = session.outputFailed || !receipt.cleanupComplete || ['REQUEST_TIMEOUT', 'MCP_TIMEOUT', 'OUTPUT_ERROR'].includes(receipt.reason);
    // A successful close cannot convert an uncertain request into a successful command.
    process.exitCode = stopped?.code || (failed ? 1 : 0);
  }
}

async function main() {
  const options = parseSessionOptions(process.argv.slice(2));
  const session = new WorkflowSession({ ...options,
    recorder: sessionRecorder(),
    io: { onProgress: event => process.stderr.write(JSON.stringify(event) + '\n') } });
  await serveWorkflowSession({ session, idleTimeoutMs: options.idleTimeoutMs });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
