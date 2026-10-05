import { createHash } from 'node:crypto';

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
    if (status.error) throw new Error(status.error);
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
