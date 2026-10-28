import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkflowSession, requestBudget, parseSessionOptions, serveWorkflowSession } from '../scripts/workflow-session.mjs';
import { McpClientPool, StdioMcpClient } from '../scripts/mcp-client.mjs';
import { processGroup, signalGroup } from '../scripts/process-group.mjs';
import { createJenkinsReader } from '../scripts/jenkins-readonly.mjs';
import { FixtureWorkflowSession } from './helpers/mock-safety-fixture.mjs';
import { runScopedCommand } from '../scripts/workflow-runtime.mjs';
import { PassThrough } from 'node:stream';

const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const api = value => reply({ status: 1, data: value });
const job = id => ({ id, action: 'job', phase: 'PLAN', input: { jobName: 'demo-test', note: 'private-input-marker' } });
const closedPool = call => ({ call, close: () => ({ cleanupComplete: true, clients: [] }) });

test('request telemetry separates active work, input gaps and shutdown without logging payloads', async () => {
  let time = 0;
  const events = [];
  const pool = closedPool(async (_server, name) => {
    time += 5;
    return reply(name === 'jenkins_list_instances' ? [{ name: 'ops', url: 'https://ci.example.test/' }]
      : [{ name: 'demo-test', url: 'https://ci.example.test/job/demo-test/' }]);
  });
  const session = new WorkflowSession({ pool, clock: () => time, onEvent: event => events.push(event) });
  time = 10; await session.dispatch(job('first'));
  time = 50; await session.dispatch(job('second'));
  time = 70; const receipt = await session.dispatch({ id: 'done', action: 'finish', phase: 'PLAN', input: {} });
  assert.equal(receipt.state, 'SESSION_CLOSED');
  assert.equal(receipt.requestCount, 2);
  assert.equal(receipt.busyMs, 20);
  assert.equal(receipt.idleMs, 50);
  assert.equal(receipt.lifetimeMs, 70);
  assert.equal(receipt.shutdownMs, 0);
  assert.deepEqual(events.filter(e => e.state === 'REQUEST_STARTED').map(e => e.idleBeforeMs), [10, 30]);
  assert.deepEqual(events.filter(e => e.state === 'REQUEST_FINISHED').map(e => e.elapsedMs), [10, 10]);
  assert.equal(JSON.stringify(events).includes('private-input-marker'), false);
});

test('a hanging read-only request has a bounded verdict and closes rather than accepting more work', async () => {
  const events = [];
  const session = new WorkflowSession({ pool: closedPool(() => new Promise(() => {})),
    requestTimeoutMs: 35, shutdownTimeoutMs: 25, onEvent: event => events.push(event) });
  await assert.rejects(session.dispatch(job('hung')), error => {
    assert.equal(error.result.reason, 'REQUEST_TIMEOUT');
    assert.equal(error.result.state, 'BLOCKED');
    assert.equal(error.result.writes, 0); return true;
  });
  assert.equal(session.closed, true);
  await assert.rejects(session.dispatch(job('next')), /已关闭/);
  assert.equal(events.filter(e => e.state === 'REQUEST_FINISHED').length, 1);
  assert.equal(events.at(-1).state, 'CLEANUP_FAILED');
  assert.equal(events.at(-1).executionSettled, false);
});

test('an EXECUTE timeout stays UNKNOWN and a late write response cannot start readback or another write', async () => {
  let completeWrite, updates = 0, calls = 0;
  const item = { id: '123450001', status: 'fixing', current_owner: 'developer', te: 'tester', reporter: 'creator', version_test: '' };
  const pool = closedPool(async (_server, name, args) => {
    calls++;
    if (name === 'get_workflows_status_map') return api({ fixing: '修复中', testing: '待测试' });
    if (name === 'get_workflows_all_transitions') return api({ fixing: ['testing'] });
    if (name === 'get_bug') return api([{ Bug: { ...item } }]);
    if (name === 'update_bug') {
      updates++; return new Promise(resolve => { completeWrite = () => { Object.assign(item, args.options); resolve(api({ Bug: item })); }; });
    }
    throw new Error(name);
  });
  const session = new FixtureWorkflowSession({ pool, allowExecute: true, requestTimeoutMs: 40, shutdownTimeoutMs: 25 });
  const input = { workspaceId: 12345, entryId: item.id, entryType: 'bug', workMode: 'INITIAL', workitemTypeId: 'bugs',
    purpose: '测试真实写入边界', statusAction: 'WAITING_TEST', versionAction: 'WRITE', versionField: 'version_test',
    testVersion: 'demo@1.0.1', prerequisites: { git: 'VERIFIED', deployment: 'SKIPPED_BY_INTENT', profile: 'NO_WIKI', wiki: 'SKIPPED_NO_WIKI' } };
  const plan = await session.dispatch({ id: 'preview', action: 'registration', phase: 'PLAN', input });
  await assert.rejects(session.dispatch({ id: 'write', action: 'registration', phase: 'EXECUTE', input: { ...plan, confirmed: true } }), error => {
    assert.equal(error.result.state, 'UNKNOWN');
    assert.equal(error.result.writes, null); return true;
  });
  assert.equal(updates, 1);
  const countAtClose = calls;
  completeWrite(); await delay(10);
  assert.equal(calls, countAtClose);
  await assert.rejects(session.dispatch({ id: 'replay', action: 'registration', phase: 'EXECUTE', input: plan }), /已关闭/);
  assert.equal(updates, 1);
});

for (const timeout of ['MCP_TIMEOUT', 'REQUEST_TIMEOUT']) {
  test(`${timeout} retains a created MR identity without reporting the merge as completed`, async () => {
    const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40);
    const originUrl = 'https://git.example.test/team/demo.git', sourceBranch = 'fixbug/demo';
    const mrUrl = 'https://git.example.test/team/demo/-/merge_requests/7';
    let session, creates = 0, merges = 0;
    const pool = closedPool(async (_server, name, args) => {
      if (name === 'get_branch') return reply({ commit: { id: args.branch_name === sourceBranch ? sourceSha : targetSha } });
      if (name === 'get_project') return reply({ id: 1, default_branch: 'master', http_url_to_repo: originUrl });
      if (name === 'list_merge_requests') return reply([]);
      if (name === 'create_merge_request') {
        creates++;
        return reply({ iid: 7, source_branch: sourceBranch, target_branch: 'develop', sha: sourceSha,
          source_project_id: 1, target_project_id: 1, state: 'opened', web_url: mrUrl });
      }
      if (name === 'get_merge_request') {
        if (timeout === 'MCP_TIMEOUT') throw Object.assign(new Error('fixture read timed out'), { code: timeout });
        return delay(10000, undefined, { signal: session.active.controller.signal });
      }
      if (name === 'merge_merge_request') merges++;
      throw new Error(name);
    });
    session = new FixtureWorkflowSession({ pool, allowExecute: true, requestTimeoutMs: 150,
      shutdownTimeoutMs: 150, io: { checkRepository: async () => {},
        inspectContainment: async () => ({ contained: false, targetSha }) } });
    await assert.rejects(session.dispatch({ id: 'merge', action: 'merge', phase: 'EXECUTE', input: {
      projectId: '1', repositoryPath: '/fixture/demo', originUrl, sourceBranch, targetBranch: 'develop', sourceSha, targetSha,
      title: 'fix: 保留已创建 MR', purpose: '测试不确定结果的可核实标识', reviewPassed: true,
      pipelineRequired: true, confirmed: true,
    } }), error => {
      assert.equal(error.result.state, 'UNKNOWN');
      assert.equal(error.result.reason, timeout);
      assert.equal(error.result.writes, null);
      assert.equal(error.result.mrIid, '7');
      assert.equal(error.result.mrUrl, mrUrl);
      assert.equal(error.result.phase, 'WAIT_MR');
      assert.equal(error.result.mergeReadback, undefined);
      return true;
    });
    assert.equal(creates, 1);
    assert.equal(merges, 0);
    assert.equal(session.executionBlocked, true);
    assert.equal((await session.close()).cleanupComplete, true);
  });
}

test('progress-only queue identifiers remain observations when a timed-out helper never settles', async () => {
  class HangingSession extends WorkflowSession {
    async executeRequest(_request, { io }) {
      io.onProgress({ state: 'DEPLOYED', queueId: 8, queueUrl: 'https://ci.example.test/queue/item/8/',
        sourceVerified: true, writes: 1, params: { token: 'private-progress-marker' } });
      return new Promise(() => {});
    }
  }
  const session = new HangingSession({ pool: closedPool(() => {}), requestTimeoutMs: 25, shutdownTimeoutMs: 20 });
  await assert.rejects(session.dispatch({ id: 'hung', action: 'release', phase: 'EXECUTE', input: {} }), error => {
    assert.equal(error.result.state, 'UNKNOWN');
    assert.equal(error.result.writes, null);
    assert.equal(error.result.queueId, undefined);
    assert.deepEqual(error.result.observedIdentifiers, { queueId: 8, queueUrl: 'https://ci.example.test/queue/item/8/' });
    assert.equal(JSON.stringify(error.result).includes('private-progress-marker'), false);
    assert.equal(error.result.sourceVerified, undefined);
    return true;
  });
  assert.equal((await session.close()).executionSettled, false);
});

test('Wiki and TAPD identities survive MCP timeout without retaining body or payload content', async () => {
  const identities = { workspaceId: 1, entryType: 'bug', entryId: '999', wikiId: '123',
    wikiUrl: 'https://www.tapd.cn/1/markdown_wikis/show/#123', monthWikiId: '10' };
  class TimedOutWikiSession extends WorkflowSession {
    async executeRequest() {
      throw Object.assign(new Error('fixture Wiki readback timed out'), { code: 'MCP_TIMEOUT', result: {
        ...identities, state: 'BLOCKED', writes: 1, phase: 'READBACK',
        body: 'private-body-marker', payload: { token: 'private-payload-marker' },
      } });
    }
  }
  const session = new TimedOutWikiSession({ pool: closedPool(() => {}), allowExecute: true });
  await assert.rejects(session.dispatch({ id: 'wiki', action: 'wiki', phase: 'EXECUTE', input: {} }), error => {
    for (const [key, value] of Object.entries(identities)) assert.equal(error.result[key], value);
    assert.equal(error.result.state, 'UNKNOWN');
    assert.equal(error.result.writes, null);
    assert.equal(error.result.phase, 'READBACK');
    assert.equal(JSON.stringify(error.result).includes('private-'), false);
    return true;
  });
});

test('deadline cancellation waits for the tracked local command to really close before reporting cleanup', async () => {
  let pid;
  const session = new WorkflowSession({ pool: closedPool(() => { throw new Error('must not reach MCP'); }), requestTimeoutMs: 45,
    shutdownTimeoutMs: 500, io: { checkRepository: async (_input, io) => {
      const pending = runScopedCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {}, io);
      pid = pending.child.pid; await pending;
    } } });
  await assert.rejects(session.dispatch({ id: 'local', action: 'merge', phase: 'PLAN', input: {
    projectId: '1', repositoryPath: '/fixture', originUrl: 'https://git.example.test/team/demo.git',
    sourceBranch: 'fixbug/demo', targetBranch: 'develop', purpose: '本地取消检查', reviewPassed: true, pipelineRequired: false,
  } }), error => error.result?.reason === 'REQUEST_TIMEOUT');
  const receipt = await session.close();
  assert.equal(receipt.cleanupComplete, true);
  assert.equal(receipt.executionSettled, true);
  assert.equal(receipt.localProcessesClosed, true);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('a hanging close adapter is bounded and never produces a verified close receipt', async () => {
  const session = new WorkflowSession({ pool: { close: () => new Promise(() => {}) }, shutdownTimeoutMs: 20 });
  const result = await session.dispatch({ id: 'finish', action: 'finish', phase: 'PLAN' });
  assert.equal(result.state, 'CLEANUP_FAILED');
  assert.equal(result.cleanupComplete, false);
});

test('action budgets keep full build/CI waits while ordinary submission and previews stay bounded', () => {
  assert.equal(requestBudget(job('read')), 180000);
  assert.equal(requestBudget({ action: 'release', phase: 'EXECUTE', input: { completionMode: 'TRIGGER_ACCEPTED' } }), 180000);
  assert.equal(requestBudget({ action: 'release', phase: 'EXECUTE', input: {} }), 1980000);
  assert.equal(requestBudget({ action: 'merge', phase: 'EXECUTE' }, { maxWaitMs: 1000 }), 181000);
  assert.equal(requestBudget(job('explicit'), {}, 75), 75);
  assert.equal(parseSessionOptions([]).idleTimeoutMs, 300000);
  assert.equal(parseSessionOptions(['--request-timeout-seconds', '2']).requestTimeoutMs, 2000);
  for (const args of [['--idle-timeout-seconds', '0'], ['--json', '--json'], ['--shutdown-timeout-seconds', '31']]) {
    assert.throws(() => parseSessionOptions(args));
  }
});

test('a pool closed during initialization never calls the newly initialized client', async () => {
  let initialized, calls = 0;
  const pool = new McpClientPool(() => ({ initialize: () => new Promise(resolve => { initialized = resolve; }),
    call: () => { calls++; }, close: () => ({ cleanupComplete: true }) }));
  const pending = pool.call('tapd-mcp', 'get_bug', {});
  const rejected = assert.rejects(pending, /已关闭/);
  await delay(0);
  const close = pool.close(); initialized();
  await rejected;
  assert.equal((await close).cleanupComplete, true);
  assert.equal(calls, 0);
  assert.equal(pool.close(), close);
});

test('closing after pool get resolves still blocks the queued tool call', async () => {
  let calls = 0;
  const pool = new McpClientPool(() => ({ initialize: async () => {}, call: () => { calls++; },
    close: () => ({ cleanupComplete: true }) }));
  const get = pool.get.bind(pool);
  pool.get = async name => {
    const client = await get(name); queueMicrotask(() => { void pool.close(); }); return client;
  };
  await assert.rejects(pool.call('tapd-mcp', 'update_bug', {}), /已关闭/);
  assert.equal(calls, 0);
});

test('MCP shutdown verifies its owned group, including TERM-resistant descendants, without touching another group', async t => {
  const other = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  await once(other, 'spawn');
  t.after(() => { try { signalGroup(other.pid, 'SIGKILL'); } catch {} });
  const code = `
    process.on('SIGTERM',()=>{});
    const {spawn}=require('node:child_process');
    spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
    require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      const request=JSON.parse(line);process.stdout.write(JSON.stringify({id:request.id,result:{ok:true}})+'\\n');
    });setInterval(()=>{},1000);`;
  const client = new StdioMcpClient(process.execPath, ['-e', code], 'fixture');
  t.after(() => client.close({ timeoutMs: 100 }));
  await client.request('probe', {}, 1000);
  const closing = client.close({ timeoutMs: 200 });
  assert.equal(client.close(), closing);
  const receipt = await closing;
  assert.equal(receipt.cleanupComplete, true);
  assert.equal(receipt.forced, true);
  assert.deepEqual((await processGroup(client.child.pid)).pids, []);
  assert.doesNotThrow(() => process.kill(other.pid, 0));
});

test('Jenkins read fallback observes session cancellation instead of continuing its HTTP request', async () => {
  const controller = new AbortController();
  const reader = createJenkinsReader({ MCP_JENKINS_URL: 'https://ci.example.test/', MCP_JENKINS_USER: '', MCP_JENKINS_API_TOKEN: '' },
    'demo-test', 'https://ci.example.test/job/demo-test/', async (_url, options) => {
      await delay(1000, undefined, { signal: options.signal });
    }, controller.signal);
  const rejected = assert.rejects(reader.job(), /只读 API 连接失败/);
  controller.abort(); await rejected;
});

test('finish can force and verify a stubborn MCP within the shared shutdown budget', async t => {
  const code = `process.on('SIGTERM',()=>{});require('node:readline').createInterface({input:process.stdin})
    .on('line',line=>{const r=JSON.parse(line);if(r.id)process.stdout.write(JSON.stringify({id:r.id,result:{tools:[]}})+'\\n')});
    setInterval(()=>{},1000);`;
  const pool = new McpClientPool(() => new StdioMcpClient(process.execPath, ['-e', code], 'fixture'));
  const session = new WorkflowSession({ pool, shutdownTimeoutMs: 400 });
  t.after(() => session.close());
  await pool.get('tapd-mcp');
  const result = await session.dispatch({ id: 'finish', action: 'finish', phase: 'PLAN' });
  assert.equal(result.state, 'SESSION_CLOSED');
  assert.equal(result.cleanupComplete, true);
  assert.equal(result.clients[0].forced, true);
});

async function cli(args, body, keepInput = false) {
  const script = new URL('../scripts/workflow-session.mjs', import.meta.url).pathname;
  const child = spawn(process.execPath, [script, '--json', ...args]);
  let stdout = '', stderr = '';
  child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  if (keepInput) child.stdin.write(body); else child.stdin.end(body);
  const watchdog = setTimeout(() => child.kill('SIGTERM'), 4000);
  try {
    const [code] = await once(child, 'close');
    return { code, replies: stdout.trim().split('\n').filter(Boolean).map(JSON.parse),
      events: stderr.trim().split('\n').filter(Boolean).map(JSON.parse) };
  } finally { clearTimeout(watchdog); }
}

test('explicit finish returns one verified close receipt and ignores queued later work', async () => {
  const result = await cli([], [
    { id: 'read', action: 'closeout', phase: 'PLAN', input: {} },
    { id: 'finish', action: 'finish', phase: 'PLAN', input: {} },
    { id: 'must-not-run', action: 'closeout', phase: 'PLAN', input: {} },
  ].map(JSON.stringify).join('\n') + '\n');
  assert.equal(result.code, 0);
  assert.deepEqual(result.replies.map(row => row.id), ['read', 'finish']);
  assert.equal(result.replies[1].result.state, 'SESSION_CLOSED');
  assert.equal(result.replies[1].result.cleanupComplete, true);
  assert.equal(result.events.filter(row => row.state === 'SESSION_CLOSED').length, 1);
  assert.equal(result.events.filter(row => row.requestId === 'read').length, 2);
  assert.equal(result.events.some(row => Object.hasOwn(row, 'id')), false,
    'PTY diagnostics must not be mistaken for an id/result response');
});

test('configured idle shutdown closes even when the caller keeps stdin open', async () => {
  const result = await cli(['--idle-timeout-seconds', '0.08'], '', true);
  assert.equal(result.code, 0);
  assert.equal(result.events.at(-1).reason, 'IDLE_TIMEOUT');
  assert.equal(result.events.at(-1).requestCount, 0);
  assert.equal(result.events.at(-1).cleanupComplete, true);
});

test('async observer failure wakes idle serve with stdin open and makes its exit status nonzero', async () => {
  const previous = process.exitCode;
  const unhandled = [], listener = error => unhandled.push(error);
  process.on('unhandledRejection', listener);
  try {
    const input = new PassThrough(), output = new PassThrough(), diagnostics = new PassThrough();
    output.resume(); diagnostics.resume();
    const session = new WorkflowSession({ pool: closedPool(() => {}), shutdownTimeoutMs: 100,
      onEvent: async () => { throw new Error('observer failed'); } });
    const serving = serveWorkflowSession({ session, input, output, diagnostics, idleTimeoutMs: 10000 });
    try {
      const returned = await Promise.race([serving.then(() => true), delay(500).then(() => false)]);
      assert.equal(returned, true, 'output failure must wake idle input without waiting for EOF or idle expiry');
      assert.equal(input.destroyed, true);
    } finally { input.end(); await serving; }
    await delay(0);
    assert.equal(process.exitCode, 1);
    assert.equal(session.outputFailed, true);
    assert.equal((await session.close()).reason, 'OUTPUT_ERROR');
    assert.deepEqual(unhandled, []);
  } finally { process.exitCode = previous; process.removeListener('unhandledRejection', listener); }
});

test('a never-settling lifecycle observer cannot hang the close handshake', async () => {
  const session = new WorkflowSession({ pool: closedPool(() => {}), shutdownTimeoutMs: 20,
    onEvent: () => new Promise(() => {}) });
  const result = await session.close();
  assert.equal(result.cleanupComplete, true);
  assert.equal(result.reason, 'OUTPUT_ERROR');
  assert.equal(session.outputFailed, true);
});

test('close waits for earlier asynchronous lifecycle callbacks so a late rejection cannot escape exit status', async () => {
  const previous = process.exitCode;
  try {
    const input = new PassThrough(), output = new PassThrough(), diagnostics = new PassThrough();
    output.resume(); diagnostics.resume();
    const session = new WorkflowSession({ pool: closedPool(() => {}), shutdownTimeoutMs: 150,
      onEvent: async event => {
        if (event.state === 'REQUEST_STARTED') { await delay(35); throw new Error('late observer failure'); }
      } });
    input.end(JSON.stringify({ id: 'read', action: 'closeout', phase: 'PLAN', input: {} }) + '\n');
    await serveWorkflowSession({ session, input, output, diagnostics });
    assert.equal(process.exitCode, 1);
    assert.equal((await session.close()).reason, 'OUTPUT_ERROR');
    assert.equal(session.outputFailed, true);
  } finally { process.exitCode = previous; }
});
