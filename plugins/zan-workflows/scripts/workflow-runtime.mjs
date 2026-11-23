import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Cancellation and close verification belong to the caller's current request.
export function runScopedCommand(command, args, options = {}, io = {}) {
  io.signal?.throwIfAborted();
  const { stdin, ...execOptions } = options;
  const pending = exec(command, args, { ...execOptions, ...(io.signal ? { signal: io.signal } : {}) });
  io.trackLocalChild?.(pending.child);
  if (stdin !== undefined) {
    const sent = new Promise((resolve, reject) => {
      pending.child.stdin.once('error', reject);
      pending.child.stdin.end(stdin, resolve);
    });
    return Promise.all([pending, sent]).then(([result]) => result);
  }
  return pending;
}

export async function waitForDeadline(promise, deadline) {
  let timer;
  try {
    return await Promise.race([Promise.resolve(promise).then(value => ({ settled: true, value }), () => ({ settled: true })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ settled: false }), Math.max(0, deadline - Date.now())); })]);
  } finally { clearTimeout(timer); }
}

// Only conclusive client-side/server refusals release a dispatch claim.
// A transport timeout mentioning permissions still has an unknown write outcome.
export function rejectedWrite(value) {
  const denied = /缺少[^。\n]{0,24}权限|无权|(?:没有|不具备|无)[^。\n]{0,16}权限|权限不足|拒绝访问|参数.{0,12}(无效|错误|不合法)|(?:permission|access) denied|insufficient permissions?|not authorized|forbidden|unauthorized|invalid (argument|parameter)/i;
  const uncertain = /超时|未知|不明|timeout|timed out|connection (?:lost|reset)|unknown (outcome|write)|lost (?:ack|response)/i;
  for (let i = 0; value && i < 10; i++) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); continue; } catch { /* Some MCP failures contain plain HTTP status text. */ }
      return !uncertain.test(value) && /^(?:HTTP(?:\/\d(?:\.\d)?)?\s+(?:400|401|403|422))\b/i.test(value.trim());
    }
    const status = Number(value.httpStatus ?? value.statusCode ?? value.response?.status ?? value.status);
    if ([400, 401, 403, 422].includes(status)) return true;
    const reason = String(value.info ?? value.message ?? '');
    if (uncertain.test(reason)) return false;
    if ((value.status === 0 || value.status === '0') && denied.test(reason)) return true;
    if (value.content?.length === 1 && value.content[0].type === 'text') value = value.content[0].text;
    else value = value.result ?? value.structuredContent ?? value.data ?? value.message;
  }
  return false;
}

// The underlying read function stays uncached for an actual write boundary.
export function guardRemoteWrites(call, verify) {
  return async (name, args) => {
    if (/^(?:create_|update_|merge_merge_request$|jenkins_trigger_build$)/.test(name)) await verify();
    return call(name, args);
  };
}

export function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少 ${name}`);
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function toolData(result, tool) {
  if (result?.isError) throw new Error(`${tool} 调用失败`);
  if (result?.content) {
    const texts = result.content.filter(item => item.type === 'text');
    if (texts.length !== 1) throw new Error(`${tool} 返回结果不唯一`);
    try { return JSON.parse(texts[0].text); } catch { throw new Error(`${tool} 未返回可识别的 JSON`); }
  }
  if (result?.structuredContent) return result.structuredContent;
  if (result && typeof result === 'object') return result;
  throw new Error(`${tool} 返回结果不可识别`);
}

export async function readTool(call, name, args) {
  return toolData(await call(name, args), name);
}

export function repositoryKey(value) {
  requireText(value, '源码仓库地址');
  const scp = value.match(/^[^@\s]+@([^:]+):(.+)$/);
  const url = scp ? new URL(`ssh://${scp[1]}/${scp[2]}`) : new URL(value);
  if (!['ssh:', 'http:', 'https:', 'git:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('源码仓库协议或地址不可用于受控 Git 查询');
  }
  return (url.host.toLowerCase() + url.pathname.replace(/\/$/, '').replace(/\.git$/, '')).replace(/\/$/, '');
}

// A repository may supply several reviewed branches to the same work item.
export function gitScopeKey(row) {
  const source = row.sourceBranch, target = row.targetBranch;
  requireText(source, 'Git 源分支');
  requireText(target, 'Git 目标分支');
  return stableJson([repositoryKey(row.originUrl || row.sourceRepository), source, target]);
}

export function coversGitScopes(required, receipts) {
  if (!Array.isArray(required) || !Array.isArray(receipts) || required.length !== receipts.length) return false;
  const expected = new Set(required.map(gitScopeKey));
  return expected.size === required.length && receipts.every(row => expected.delete(gitScopeKey(row)));
}

export function validateWait(options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 1800000;
  if (!Number.isFinite(maxWaitMs) || maxWaitMs < 1 || maxWaitMs > 43200000) throw new Error('等待期限无效');
  return maxWaitMs;
}

export async function pollState(read, classify, options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxWaitMs = validateWait(options);
  const deadline = Math.min(now() + maxWaitMs, options.deadline ?? Infinity);
  let previous;
  let delay = 5000;
  while (true) {
    const value = await read();
    const status = classify(value);
    if (!status || typeof status.state !== 'string') throw new Error('远程状态不可识别');
    if (status.state !== previous) {
      options.onProgress?.({ state: status.state });
      delay = 5000;
      previous = status.state;
    } else delay = Math.min(delay * 2, 30000);
    if (status.error) throw Object.assign(new Error(status.error), { code: status.code });
    if (status.done) return value;
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error(`等待 ${status.state} 超时；不重试写操作`);
    await sleep(Math.min(delay, remaining));
  }
}

export async function readCliPlan(argv = process.argv.slice(2), input = process.stdin) {
  if (argv.some(arg => !['--execute', '--json'].includes(arg)) || new Set(argv).size !== argv.length) {
    throw new Error('用法：通过 stdin 提供 JSON 计划；可选 --execute --json');
  }
  let body = '';
  input.setEncoding?.('utf8');
  for await (const chunk of input) {
    body += chunk;
    if (Buffer.byteLength(body) > 262144) throw new Error('计划超过 256 KiB');
  }
  let plan;
  try { plan = JSON.parse(body); } catch { throw new Error('stdin 不是有效 JSON 计划'); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('计划必须是对象');
  return { ...plan, execute: argv.includes('--execute') };
}

export function progressToStderr(event) {
  process.stderr.write(JSON.stringify(event) + '\n');
}
