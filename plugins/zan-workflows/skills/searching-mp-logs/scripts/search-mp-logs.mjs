import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { configPath, credentialProcessEnv, readConfig, redact } from '../../../scripts/start-mcp.mjs';

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

const options = {
  from: { type: 'string' },
  to: { type: 'string' },
  query: { type: 'string', default: '*' },
  limit: { type: 'string', default: '50' },
  sort: { type: 'string', default: 'desc' },
  context: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

function parseTime(value, flag) {
  const timestamp = Date.parse(value);
  const date = ISO_DATE_TIME.exec(value ?? '')?.[1];
  if (!date || !Number.isFinite(timestamp)) {
    throw new Error(`${flag} 需要带时区的 ISO 8601 时间，例如 2026-11-16T14:00:00+08:00`);
  }
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`${flag} 的日期无效`);
  }
  return timestamp;
}

function buildRequest(values) {
  const start = parseTime(values.from, '--from');
  const end = parseTime(values.to, '--to');
  const limit = Number(values.limit);
  if (start >= end) throw new Error('--from 必须早于 --to');
  if (!/^\d+$/u.test(values.limit) || limit < 1 || limit > 1000) {
    throw new Error('--limit 必须是 1 到 1000 的整数');
  }
  if (!['asc', 'desc'].includes(values.sort)) throw new Error('--sort 只接受 asc 或 desc');
  if (!values.query.trim()) throw new Error('--query 需要非空的 TLS 检索表达式');

  return {
    StartTime: start,
    EndTime: end,
    Query: values.query,
    Limit: limit,
    Sort: values.sort,
    ...(values.context !== undefined && { Context: values.context }),
  };
}

function readTlsConfig() {
  const config = readConfig(configPath());
  if (config?.version !== 1) throw new Error('凭证文件 version 必须为 1');
  const tls = config.volcengineTls;
  for (const field of ['accessKeyId', 'secretAccessKey', 'region', 'endpoint', 'topicId']) {
    if (typeof tls?.[field] !== 'string' || !tls[field].trim() || /[\r\n\0]/u.test(tls[field])) {
      throw new Error(`请在插件凭证文件中填写有效的 volcengineTls.${field}`);
    }
  }
  if (tls.securityToken !== undefined &&
      (typeof tls.securityToken !== 'string' || /[\r\n\0]/u.test(tls.securityToken))) {
    throw new Error('volcengineTls.securityToken 必须是单行字符串');
  }
  const endpoint = URL.canParse(tls.endpoint) ? new URL(tls.endpoint) : null;
  if (endpoint?.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('volcengineTls.endpoint 必须是 HTTPS 服务根地址');
  }
  return tls;
}

function runVolclog(request, tls) {
  const directory = mkdtempSync(join(tmpdir(), 'zan-mp-log-'));
  const credentials = join(directory, 'volclog.env');
  try {
    // An explicit selector keeps the installed CLI's default profile out of this request.
    const lines = [
      `VOLCENGINE_ACCESS_KEY_ID=${tls.accessKeyId}`,
      `VOLCENGINE_ACCESS_KEY_SECRET=${tls.secretAccessKey}`,
    ];
    if (tls.securityToken) lines.push(`VOLCENGINE_TOKEN=${tls.securityToken}`);
    writeFileSync(credentials, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });

    return spawnSync(process.platform === 'win32' ? 'volclog.exe' : 'volclog', [
      '--secrets-file', credentials,
      '--region', tls.region,
      '--endpoint', tls.endpoint,
      '--output', 'json',
      '--output-mode', 'stdout',
      'tool', 'exec', 'log.search',
      '--input', JSON.stringify({ TopicId: tls.topicId, ...request }),
    ], {
      cwd: directory,
      env: credentialProcessEnv(),
      windowsHide: true,
      encoding: 'utf8',
      timeout: 65_000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function searchLogs(request, tls) {
  const child = runVolclog(request, tls);

  if (child.error?.code === 'ENOENT') throw new Error('请安装官方 volclog 并将它加入 PATH');
  if (child.error?.code === 'ETIMEDOUT') throw new Error('volclog 查询超时');
  if (child.error) throw new Error(`无法运行 volclog（${child.error.code ?? '未知原因'}）`);

  let response;
  try {
    response = JSON.parse(child.stdout);
  } catch {
    const detail = child.stderr.trim().split(/\r?\n/u)[0].slice(0, 400);
    throw new Error(detail || 'volclog 未返回有效的 JSON');
  }

  const requestId = response?.requestId || null;
  const requestNote = requestId ? `（requestId ${requestId}）` : '';
  if (child.status !== 0 || response?.status !== 'success') {
    const detail = [response?.error?.code, response?.error?.message].filter(Boolean).join(' ');
    throw new Error(`${detail || '火山 TLS 查询失败'}${requestNote}`);
  }

  if (response.summary?.dryRun === true) {
    throw new Error('volclog 返回请求预览，查询请求未发出');
  }
  const data = response.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`volclog 缺少日志查询结果${requestNote}`);
  }
  if (data.Analysis === true) throw new Error('请使用返回原始日志的 TLS 检索表达式');
  if (!Object.hasOwn(data, 'Logs') && typeof data.ResultStatus !== 'string') {
    throw new Error('volclog 返回的 JSON 中没有日志或查询状态');
  }
  if (data.ResultStatus === 'error') throw new Error(`火山 TLS 返回查询失败${requestNote}`);

  const logs = data.Logs ?? [];
  if (!Array.isArray(logs)) throw new Error(`TLS 返回的 Logs 格式无效${requestNote}`);
  return {
    logs,
    returned: logs.length,
    resultStatus: data.ResultStatus ?? null,
    listOver: data.ListOver ?? null,
    context: data.Context ?? null,
    requestId,
  };
}

let tls;
try {
  const { values } = parseArgs({ options });
  if (values.help) {
    console.log('用法: node search-mp-logs.mjs --from <ISO时间> --to <ISO时间> [--query <表达式>] [--limit <条数>] [--sort <asc|desc>] [--context <游标>]');
  } else {
    const request = buildRequest(values);
    tls = readTlsConfig();
    console.log(JSON.stringify(searchLogs(request, tls)));
  }
} catch (error) {
  console.error(`mp_log 查询失败: ${redact(error.message, tls ?? {})}`);
  process.exitCode = 1;
}
