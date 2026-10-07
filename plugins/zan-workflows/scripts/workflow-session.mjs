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

export class WorkflowSession {
  constructor({ allowExecute = false, pool = new McpClientPool(), reader = configuredJenkinsReader, io = {} } = {}) {
    this.allowExecute = allowExecute;
    this.pool = pool;
    this.reader = reader;
    this.io = io;
    this.executionBlocked = false;
    this.pendingMerges = new Map();
    this.ids = new Set();
    this.closed = false;
  }

  async dispatch(request) {
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
    if (request.action === 'merge' && input.mergeMode === 'VERIFY_ONLY') {
      const pending = this.pendingMerges.get(`${input.projectId}:${input.mrIid}`);
      if (pending && !['originUrl', 'repositoryPath', 'sourceBranch', 'targetBranch', 'sourceSha',
        'targetSha', 'pipelineRequired', 'reviewPassed'].every(field => pending[field] === input[field])) {
        throw new Error('待合并清单身份或校验要求已变化；需重新评审和确认');
      }
    }
    const call = server => (name, args) => this.pool.call(server, name, args);
    try {
      let result;
      switch (request.action) {
        case 'merge': result = await mergeReviewedBranch(call('gitlab-mcp'), input, this.io); break;
        case 'release': result = await runJenkinsRelease(call('jenkins-mcp'), this.reader(input), input, this.io); break;
        case 'registration': result = await registerTestSubmission(call('tapd-mcp'), input); break;
        case 'wiki': result = await ensureTestWiki(call('tapd-mcp'), input); break;
        case 'closeout': result = await checkLocalCloseout(input, this.io); break;
        case 'job': result = await resolveJenkinsJob(call('jenkins-mcp'), input); break;
      }
      if (request.action === 'merge' && result.state === 'AWAITING_MERGE') {
        this.pendingMerges.set(`${result.projectId}:${result.mrIid}`, result.resumePlan);
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

  close() { this.closed = true; this.pool.close(); }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.some(value => !['--allow-execute', '--json'].includes(value)) || new Set(argv).size !== argv.length) {
    throw new Error('用法：workflow-session.mjs [--allow-execute] [--json]；stdin 每行一个请求');
  }
  const session = new WorkflowSession({ allowExecute: argv.includes('--allow-execute'),
    io: { onProgress: event => process.stderr.write(JSON.stringify(event) + '\n') } });
  let lines, transport;
  let timer;
  const stop = code => { lines?.close(); transport?.restore(); session.close(); process.exit(code); };
  transport = sessionInput(process.stdin, () => stop(130));
  lines = createInterface({ input: transport.stream, terminal: false });
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { lines.close(); transport.restore(); session.close(); process.stdin.destroy(); }, 1800000);
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  process.stderr.write(JSON.stringify({ state: 'SESSION_READY', inputMode: transport.mode }) + '\n');
  arm();
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      clearTimeout(timer); // A running build owns its own bounded deadline.
      let request;
      try {
        if (Buffer.byteLength(line) > 262144) throw new Error('请求超过 256 KiB');
        try { request = JSON.parse(line); } catch { throw new Error('请求不是有效 JSON'); }
        const result = await session.dispatch(request);
        process.stdout.write(JSON.stringify({ id: request.id, result }) + '\n');
      } catch (error) {
        process.stdout.write(JSON.stringify({ id: request?.id || null,
          result: error.result || { state: 'BLOCKED', writes: 0, error: error.message } }) + '\n');
      }
      arm();
    }
  } finally { clearTimeout(timer); lines.close(); transport.restore(); session.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
