#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const MAX_NOTIFICATIONS = 256;
const MAX_CONCURRENT_QUEUES = 2;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9._:-]{1,256}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/i;
const EVENTS = new Set(['review-submitted', 'plan-confirm-requested', 'connection-test']);
const NOTIFY_KEYS = new Set(['token', 'event', 'sessionId', 'submissionId', 'submissionVersion', 'planFingerprint', 'artifactRuleFingerprint']);

function validateOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { throw new TypeError('origin must be an exact HTTPS or loopback HTTP origin'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new TypeError('origin must be an exact HTTPS or loopback HTTP origin');
  }
  return origin;
}

function validateNotification(body) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(key => NOTIFY_KEYS.has(key)) && EVENTS.has(body.event) &&
    typeof body.sessionId === 'string' && ID.test(body.sessionId) &&
    typeof body.submissionId === 'string' && UUID.test(body.submissionId) &&
    Number.isSafeInteger(body.submissionVersion) && body.submissionVersion > 0 &&
    typeof body.planFingerprint === 'string' && FINGERPRINT.test(body.planFingerprint) &&
    typeof body.artifactRuleFingerprint === 'string' && FINGERPRINT.test(body.artifactRuleFingerprint);
}

export function buildNotificationMessage(body) {
  if (!validateNotification(body)) throw new TypeError('invalid notification metadata');
  const identity = JSON.stringify({
    event: body.event,
    sessionId: body.sessionId,
    submissionId: body.submissionId,
    submissionVersion: body.submissionVersion,
    planFingerprint: body.planFingerprint,
    artifactRuleFingerprint: body.artifactRuleFingerprint,
  });
  if (body.event === 'connection-test') {
    return `评审面板自动唤醒连接测试已送达。此消息仅用于验证连接，请简短确认收到；不要据此提交评审或写入文件。测试身份：${identity}`;
  }
  const action = body.event === 'review-submitted'
    ? '用户已在评审面板统一提交意见。'
    : '评审面板发出了 Plan 确认请求。';
  return `${action}请读取当前原型页的 exportSubmission()，与下列身份逐项核对；若页面或会话不匹配，停止处理并说明。按 reviewing-page-delivery 原有流程继续。通知本身不携带评审内容，也不是保存许可：确认请求必须另读当前 getPlanConfirmationRequest() 并完成原有内容、指纹和保存门槛校验。只处理匹配的当前提交，不从通知推断结论。提交身份：${identity}`;
}

// A fixed executable and argument list; browser input can never select a command or task.
export function createCodexEnqueue({ executable = 'codex', execFileImpl = execFile } = {}) {
  return ({ threadId, message }) => new Promise((resolvePromise, reject) => {
    execFileImpl(executable, ['queue', '--thread', threadId, '--message', message], {
      shell: false,
      timeout: 20000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    }, error => error ? reject(error) : resolvePromise());
  });
}

function reply(response, status, body, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(request) {
  const declaredLength = request.headers['content-length'];
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    request.resume();
    throw Object.assign(new Error('payload-too-large'), { status: 413 });
  }
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (exceeded) return;
      if (size > MAX_BODY_BYTES) {
        exceeded = true;
        chunks.length = 0;
        reject(Object.assign(new Error('payload-too-large'), { status: 413 }));
      } else chunks.push(chunk);
    });
    request.once('error', reject);
    request.once('end', () => {
      if (exceeded) return;
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid-json'), { status: 400 })); }
    });
  });
}

/** Start a short-lived, origin-bound local bridge. No daemon or system settings are installed. */
export async function createWakeBridge({ threadId, origin, enqueue = createCodexEnqueue(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (typeof threadId !== 'string' || !UUID.test(threadId)) throw new TypeError('threadId must be a UUID');
  validateOrigin(origin);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) throw new TypeError(`ttlMs must be between 1 and ${MAX_TTL_MS}`);
  if (typeof enqueue !== 'function') throw new TypeError('enqueue must be a function');

  const token = randomBytes(32).toString('base64url');
  const tokenBytes = Buffer.from(token);
  const expiresAtMs = Date.now() + ttlMs;
  const notifications = new Map();
  let activeQueues = 0;
  let expectedHost;
  let closePromise;
  let timer;
  let resolveClosed;
  const closed = new Promise(resolvePromise => { resolveClosed = resolvePromise; });
  const authenticated = body => {
    const supplied = typeof body?.token === 'string' ? Buffer.from(body.token) : Buffer.alloc(0);
    return supplied.length === tokenBytes.length && timingSafeEqual(supplied, tokenBytes);
  };
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  const server = createServer(async (request, response) => {
    // Host validation also prevents DNS rebinding; unauthenticated responses expose no CORS data.
    if (request.headers.host !== expectedHost) return reply(response, 403, { error: 'host-not-allowed' });
    if (request.headers.origin !== origin) return reply(response, 403, { error: 'origin-not-allowed' });
    if (Date.now() >= expiresAtMs) return reply(response, 410, { error: 'bridge-expired' }, cors);
    if (!['/notify', '/health'].includes(request.url)) return reply(response, 404, { error: 'not-found' }, cors);
    if (request.method === 'OPTIONS') {
      const headers = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' || headers.some(value => value !== 'content-type')) {
        return reply(response, 403, { error: 'preflight-not-allowed' }, cors);
      }
      return reply(response, 204, undefined, {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '60',
        ...(request.headers['access-control-request-private-network'] === 'true' ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
      });
    }
    if (request.method !== 'POST') return reply(response, 405, { error: 'method-not-allowed' }, { ...cors, Allow: 'POST, OPTIONS' });
    const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['application/json', 'text/plain'].includes(contentType)) return reply(response, 415, { error: 'unsupported-content-type' }, cors);
    let body;
    try { body = await readBody(request); }
    catch (error) { return reply(response, error.status || 400, { error: error.message }, cors); }
    if (closePromise || Date.now() >= expiresAtMs) return reply(response, 410, { error: 'bridge-expired' }, cors);
    if (!authenticated(body)) return reply(response, 401, { error: 'unauthorized' }, cors);
    if (request.url === '/health') {
      if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'token')) {
        return reply(response, 400, { error: 'invalid-health-payload' }, cors);
      }
      return reply(response, 200, { ready: true, expiresAt: new Date(expiresAtMs).toISOString() }, cors);
    }
    if (!validateNotification(body)) return reply(response, 400, { error: 'invalid-notification' }, cors);
    const key = JSON.stringify([body.event, body.sessionId, body.submissionId]);
    const message = buildNotificationMessage(body);
    const previous = notifications.get(key);
    if (previous && previous.message !== message) return reply(response, 409, { queued: false, error: 'notification-identity-conflict' }, cors);
    // Keep both in-flight and failed entries. Retrying after an ambiguous CLI failure may queue twice.
    if (!previous) {
      if (notifications.size >= MAX_NOTIFICATIONS) return reply(response, 429, { queued: false, error: 'notification-limit-reached' }, cors);
      if (activeQueues >= MAX_CONCURRENT_QUEUES) return reply(response, 429, { queued: false, error: 'queue-busy' }, cors);
      const entry = { message, result: null };
      notifications.set(key, entry);
      activeQueues += 1;
      entry.result = Promise.resolve().then(() => enqueue({ threadId, message })).then(
        () => ({ status: 200, body: { queued: true } }),
        () => ({ status: 502, body: { queued: false, error: 'queue-outcome-unknown', manualRecoveryRequired: true } }),
      ).finally(() => { activeQueues -= 1; });
    }
    const result = await notifications.get(key).result;
    reply(response, result.status, { ...result.body, duplicate: Boolean(previous) }, cors);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  const close = () => {
    if (!closePromise) {
      clearTimeout(timer);
      closePromise = new Promise(resolvePromise => {
        server.close(() => { resolveClosed(); resolvePromise(); });
        server.closeAllConnections();
      });
    }
    return closePromise;
  };
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolvePromise();
    });
  });
  expectedHost = `127.0.0.1:${server.address().port}`;
  timer = setTimeout(close, Math.max(1, expiresAtMs - Date.now()));
  return {
    config: { endpoint: `http://${expectedHost}/notify`, token, expiresAt: new Date(expiresAtMs).toISOString() },
    close,
    closed,
  };
}

export function parseCliArgs(args) {
  const values = {};
  const names = { '--thread': 'threadId', '--origin': 'origin', '--config': 'configPath', '--ttl-ms': 'ttlMs' };
  for (let index = 0; index < args.length; index += 2) {
    const name = names[args[index]];
    if (!name || values[name] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new TypeError('Usage: review-wake-bridge.mjs --thread UUID --origin ORIGIN --config PATH [--ttl-ms MILLISECONDS]');
    }
    values[name] = args[index + 1];
  }
  if (!values.threadId || !values.origin || !values.configPath) throw new TypeError('--thread, --origin and --config are required');
  if (values.ttlMs !== undefined) values.ttlMs = Number(values.ttlMs);
  return values;
}

export async function runCli(args = process.argv.slice(2)) {
  const { configPath, ...options } = parseCliArgs(args);
  const bridge = await createWakeBridge(options);
  try {
    // Do not overwrite or follow an existing file/symlink containing unrelated data.
    const file = await open(resolve(configPath), 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(bridge.config, null, 2)}\n`); }
    finally { await file.close(); }
  } catch (error) { await bridge.close(); throw error; }
  const stop = () => { void bridge.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(`${JSON.stringify({ ready: true, endpoint: bridge.config.endpoint, expiresAt: bridge.config.expiresAt, configPath: resolve(configPath) })}\n`);
  await bridge.closed;
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => { process.stderr.write(`review-wake-bridge: ${error.message}\n`); process.exitCode = 1; });
}
