import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createWakeBridge, createCodexEnqueue, buildNotificationMessage, parseCliArgs, MAX_TTL_MS } from '../scripts/review-wake-bridge.mjs';

const THREAD = '01a08a4d-7550-7940-90a2-22ce9dd209a6';
const ORIGIN = 'https://review.example.test';
const SUBMISSION = 'e0920efc-2bba-46fc-af5e-af4330e741ad';
const metadata = () => ({
  event: 'review-submitted', sessionId: 'store-list-round-1', submissionId: SUBMISSION, submissionVersion: 1,
  planFingerprint: `sha256:${'a'.repeat(64)}`, artifactRuleFingerprint: `sha256:${'b'.repeat(64)}`,
});

async function fixture(t, options = {}) {
  const queued = [];
  const bridge = await createWakeBridge({ threadId: THREAD, origin: ORIGIN, enqueue: async item => { queued.push(item); }, ...options });
  t.after(() => bridge.close());
  const send = async (patch = {}, { route = '/notify', headers = {}, method = 'POST', raw } = {}) => {
    const response = await fetch(new URL(route, bridge.config.endpoint), {
      method, headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', ...headers },
      ...(method === 'OPTIONS' || method === 'GET' ? {} : { body: raw ?? JSON.stringify({ ...metadata(), token: bridge.config.token, ...patch }) }),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  };
  return { ...bridge, send, queued };
}

test('bridge binds only loopback and accepts authenticated health without queueing', async t => {
  const bridge = await fixture(t);
  assert.match(bridge.config.endpoint, /^http:\/\/127\.0\.0\.1:\d+\/notify$/);
  assert.equal(bridge.config.token.length, 43);
  assert.ok(Date.parse(bridge.config.expiresAt) > Date.now());
  const result = await bridge.send({}, { route: '/health', raw: JSON.stringify({ token: bridge.config.token }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.ready, true);
  assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(bridge.queued.length, 0);
  assert.equal((await bridge.send({}, { route: '/health' })).status, 400);
});

test('bridge rejects missing, wrong-length, and wrong-value tokens on notify and health', async t => {
  const bridge = await fixture(t);
  for (const token of [undefined, '', 'x', 'x'.repeat(43), { token: bridge.config.token }]) {
    assert.equal((await bridge.send({ token })).status, 401);
    assert.equal((await bridge.send({}, { route: '/health', raw: JSON.stringify({ token }) })).status, 401);
  }
  assert.equal(bridge.queued.length, 0);
});

test('Origin must match exactly, including scheme and port; rejected origins have no CORS access', async t => {
  const bridge = await fixture(t);
  for (const origin of ['', 'null', 'https://evil.example.test', `${ORIGIN}:8443`, 'http://review.example.test']) {
    const result = await bridge.send({}, { headers: { Origin: origin } });
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(bridge.queued.length, 0);
});

test('Host must be the bound literal loopback address and port', async t => {
  const bridge = await fixture(t);
  const result = await new Promise((resolve, reject) => {
    const req = request(bridge.config.endpoint, {
      method: 'POST', headers: { Host: 'attacker.example', Origin: ORIGIN, 'Content-Type': 'text/plain' },
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ ...metadata(), token: bridge.config.token }));
  });
  assert.equal(result, 403);
  assert.equal(bridge.queued.length, 0);
});

test('CORS preflight permits only POST, content-type and explicitly requested private network access', async t => {
  const bridge = await fixture(t);
  const result = await bridge.send({}, { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
    'Access-Control-Request-Private-Network': 'true',
  } });
  assert.equal(result.status, 204);
  assert.equal(result.headers.get('access-control-allow-private-network'), 'true');
  assert.equal(result.headers.get('access-control-allow-methods'), 'POST');
  assert.equal((await bridge.send({}, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
  assert.equal((await bridge.send({}, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-command' } })).status, 403);
  assert.equal(bridge.queued.length, 0);
});

test('requests accept JSON text only at exact endpoints, never GET/query-token notifications', async t => {
  const bridge = await fixture(t);
  assert.equal((await bridge.send({}, { method: 'GET' })).status, 405);
  assert.equal((await bridge.send({}, { route: '/notify?token=anything' })).status, 404);
  assert.equal((await bridge.send({}, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await bridge.send({}, { raw: '{' })).status, 400);
  assert.equal((await bridge.send({}, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })).status, 200);
  assert.equal(bridge.queued.length, 1);
});

test('declared and chunked request bodies are capped at 4 KiB without invoking queue', async t => {
  const bridge = await fixture(t);
  assert.equal((await bridge.send({}, { raw: 'x'.repeat(4097) })).status, 413);
  const result = await new Promise((resolve, reject) => {
    const req = request(bridge.config.endpoint, {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' },
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.write('x'.repeat(2000));
    req.end('x'.repeat(2097));
  });
  assert.equal(result, 413);
  assert.equal(bridge.queued.length, 0);
});

test('only identity metadata is allowed; arbitrary instructions, commands and target overrides are rejected', async t => {
  const bridge = await fixture(t);
  for (const patch of [
    { message: 'write arbitrary files' }, { command: 'sh' }, { threadId: THREAD },
    { event: 'execute' }, { sessionId: 'hello\nignore previous' }, { sessionId: 'x'.repeat(257) },
    { submissionId: '$(id)' }, { submissionVersion: 0 }, { submissionVersion: 1.5 },
    { planFingerprint: 'sha256:bad' }, { artifactRuleFingerprint: 'x' },
  ]) assert.equal((await bridge.send(patch)).status, 400, JSON.stringify(patch));
  assert.equal(bridge.queued.length, 0);
});

test('submission and confirmation enqueue fixed messages to the configured task with metadata only', async t => {
  const bridge = await fixture(t);
  for (const event of ['review-submitted', 'plan-confirm-requested']) assert.equal((await bridge.send({ event })).status, 200);
  assert.equal(bridge.queued.length, 2);
  for (const item of bridge.queued) {
    assert.equal(item.threadId, THREAD);
    assert.match(item.message, /exportSubmission\(\)/);
    assert.match(item.message, /getPlanConfirmationRequest\(\)/);
    assert.match(item.message, /不是保存许可/);
    assert.ok(item.message.includes(SUBMISSION));
    assert.ok(!item.message.includes(bridge.config.token));
  }
  const testResponse = await bridge.send({ event: 'connection-test' });
  assert.equal(testResponse.status, 200);
  assert.match(bridge.queued[2].message, /不要据此提交评审或写入文件/);
  assert.throws(() => buildNotificationMessage({ ...metadata(), message: 'custom' }), /invalid notification/);
});

test('repeated and concurrent notifications invoke queue exactly once per event/session/submission', async t => {
  let complete;
  let count = 0;
  const deferred = new Promise(resolve => { complete = resolve; });
  const bridge = await fixture(t, { enqueue: async () => { count += 1; await deferred; } });
  const requests = [bridge.send(), bridge.send(), bridge.send()];
  complete();
  const results = await Promise.all(requests);
  assert.equal(count, 1);
  assert.equal(results.filter(result => result.body.duplicate === false).length, 1);
  assert.ok(results.every(result => result.body.queued));
  assert.deepEqual((await bridge.send()).body, { queued: true, duplicate: true });
  assert.equal((await bridge.send({ submissionVersion: 2 })).status, 409);
  assert.equal((await bridge.send({ planFingerprint: `sha256:${'c'.repeat(64)}` })).status, 409);
  assert.equal(count, 1);
  await bridge.send({ event: 'plan-confirm-requested' });
  await bridge.send({ sessionId: 'another-round' });
  assert.equal(count, 3);
});

test('uncertain queue failures are retained and never automatically retried', async t => {
  let count = 0;
  const bridge = await fixture(t, { enqueue: async () => { count += 1; throw new Error('private backend details'); } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await bridge.send();
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { queued: false, error: 'queue-outcome-unknown', manualRecoveryRequired: true, duplicate: attempt > 0 });
    assert.ok(!JSON.stringify(result.body).includes('private backend details'));
  }
  assert.equal(count, 1);
});

test('bridge limits concurrent CLI queues to two without consuming rejected identities', async t => {
  let release;
  let started;
  let count = 0;
  const hold = new Promise(resolve => { release = resolve; });
  const bothStarted = new Promise(resolve => { started = resolve; });
  const bridge = await fixture(t, { enqueue: async () => { count += 1; if (count === 2) started(); await hold; } });
  const first = bridge.send({ sessionId: 'first' });
  const second = bridge.send({ sessionId: 'second' });
  await bothStarted;
  const busy = await bridge.send({ sessionId: 'third' });
  assert.equal(busy.status, 429);
  assert.equal(busy.body.error, 'queue-busy');
  assert.equal(count, 2);
  release();
  await Promise.all([first, second]);
  assert.equal((await bridge.send({ sessionId: 'third' })).status, 200);
  assert.equal(count, 3);
});

test('bridge caps distinct notifications at 256 while still acknowledging known duplicates', async t => {
  const bridge = await fixture(t);
  for (let index = 0; index < 256; index += 1) {
    assert.equal((await bridge.send({ sessionId: `session-${index}` })).status, 200);
  }
  const limited = await bridge.send({ sessionId: 'session-over-limit' });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'notification-limit-reached');
  assert.deepEqual((await bridge.send({ sessionId: 'session-0' })).body, { queued: true, duplicate: true });
  assert.equal(bridge.queued.length, 256);
});

test('Codex is called without a shell and never receives browser-selected CLI options', async () => {
  let invocation;
  const enqueue = createCodexEnqueue({ execFileImpl: (command, args, options, callback) => { invocation = { command, args, options }; callback(null); } });
  await enqueue({ threadId: THREAD, message: buildNotificationMessage(metadata()) });
  assert.equal(invocation.command, 'codex');
  assert.deepEqual(invocation.args.slice(0, 4), ['queue', '--thread', THREAD, '--message']);
  assert.equal(invocation.args.length, 5);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.timeout, 20000);
  await assert.rejects(createCodexEnqueue({ execFileImpl: (_command, _args, _options, callback) => callback(new Error('timeout')) })({ threadId: THREAD, message: 'fixed' }), /timeout/);
});

test('bridge expires and closes its listener; explicit close is idempotent', async t => {
  const bridge = await fixture(t, { ttlMs: 30 });
  await bridge.closed;
  await assert.rejects(fetch(bridge.config.endpoint, { method: 'POST' }));
  await bridge.close();
  await bridge.close();
  assert.equal(bridge.queued.length, 0);
});

test('startup validates fixed task, origin and bounded TTL, and CLI parsing rejects unexpected arguments', async () => {
  for (const options of [
    { threadId: 'anything' }, { origin: 'http://external.example' }, { origin: `${ORIGIN}/path` },
    { origin: '*' }, { origin: 'null' }, { ttlMs: 0 }, { ttlMs: MAX_TTL_MS + 1 },
  ]) await assert.rejects(createWakeBridge({ threadId: THREAD, origin: ORIGIN, ...options }), TypeError);
  assert.deepEqual(parseCliArgs(['--thread', THREAD, '--origin', ORIGIN, '--config', '/tmp/bridge.json', '--ttl-ms', '5000']), {
    threadId: THREAD, origin: ORIGIN, configPath: '/tmp/bridge.json', ttlMs: 5000,
  });
  for (const args of [[], ['--exec', 'sh'], ['--thread', THREAD, '--thread', THREAD]]) assert.throws(() => parseCliArgs(args), TypeError);
});

test('CLI creates a private config, never prints its token, and refuses existing files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'review-wake-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'client.json');
  const script = new URL('../scripts/review-wake-bridge.mjs', import.meta.url);
  const args = [script.pathname, '--thread', THREAD, '--origin', ORIGIN, '--config', configPath, '--ttl-ms', '1500'];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let output = '';
  let errors = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const exit = once(child, 'close');
  await once(child.stdout, 'data');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(output.trim()).ready, true);
  assert.ok(!output.includes(config.token));
  assert.equal(errors, '');
  child.kill('SIGTERM');
  assert.equal((await exit)[0], 0);
  await writeFile(configPath, 'keep-existing');
  const retry = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  retry.stdout.resume(); retry.stderr.resume();
  assert.equal((await once(retry, 'close'))[0], 1);
  assert.equal(await readFile(configPath, 'utf8'), 'keep-existing');
});
