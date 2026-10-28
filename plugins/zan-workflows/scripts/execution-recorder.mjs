#!/usr/bin/env node
import * as fs from 'node:fs';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const limits = Object.freeze({ runs: 100, bytes: 1048576, revisions: 10, input: 32768 });
const runPattern = /^run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const types = new Set(['stage_started', 'stage_finished', 'action_started', 'action_finished',
  'confirmation_requested', 'user_correction', 'wait_started', 'wait_finished',
  'session_closed', 'coverage_gap', 'interrupted', 'run_finished', 'retry']);
const sources = new Set(['executor', 'agent_summary', 'user_feedback']);
export const outcomes = new Set(['COMPLETED', 'FAILED', 'WAITING', 'CANCELLED', 'UNKNOWN']);
export const hash = value => createHash('sha256').update(value).digest('hex');

// Only small, selected descriptions enter storage. Raw tool inputs/results are never accepted.
export function redactText(value, max = 1000) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 16000)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\b(?:https?|ssh):\/\/[^\s<>"')\]]+/gi, value => {
      try {
        const url = new URL(value);
        url.username = ''; url.password = ''; url.search = ''; url.hash = '';
        return url.href;
      } catch { return '[URL]'; }
    })
    .replace(/\b(?:authorization\s*[:=]\s*["']?\s*)?(?:bearer|basic)\s+[A-Za-z0-9+/_.=-]+/gi, '[CREDENTIAL]')
    .replace(/\bauthorization["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n,;}]+)/gi, '[CREDENTIAL]')
    .replace(/((?:[\w-]*(?:token|password|passwd|secret|api[_-]?key|cookie)[\w-]*|密码|令牌|密钥)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:glpat-|gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}/g, '[CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[CREDENTIAL]')
    .replace(/(?:\b[A-Za-z]:[\\/]|\/(?:Users|home|private|tmp|var|Volumes|etc)\/)[^\s<>"')\]]+/g, '[LOCAL_PATH]')
    .slice(0, max);
}

export function dataDirectory(options = {}) {
  return resolve(options.dataDir || process.env.ZAN_WORKFLOWS_DATA_DIR ||
    process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.local/share/zan-workflows'));
}

export function privateDirectory(path) {
  fs.mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('诊断目录必须为真实目录');
  return path;
}

export function readPrivateFile(path, max = limits.bytes) {
  const fd = fs.openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > max) throw new Error('诊断文件类型或大小无效');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

export function readPrivateJson(path, max = limits.bytes) {
  const bytes = readPrivateFile(path, max);
  try { return JSON.parse(bytes.toString()); } catch { throw new Error('诊断 JSON 无效'); }
}

export function writePrivateFile(path, value, { exclusive = false } = {}) {
  if (exclusive) {
    const fd = fs.openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      (constants.O_NOFOLLOW || 0), 0o600);
    try { fs.writeFileSync(fd, value); } finally { fs.closeSync(fd); }
    return;
  }
  if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) throw new Error('拒绝写入符号链接');
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    writePrivateFile(temp, value, { exclusive: true });
    fs.renameSync(temp, path);
  } finally { fs.rmSync(temp, { force: true }); }
}

export function runDirectory(runId, options = {}) {
  if (!runPattern.test(runId || '')) throw new Error('运行编号无效');
  const root = privateDirectory(dataDirectory(options));
  const runs = privateDirectory(join(root, 'runs'));
  const path = join(runs, runId);
  const stat = fs.lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('运行目录无效');
  return path;
}

export function pluginIdentity(root = pluginRoot) {
  const digest = createHash('sha256');
  let count = 0, bytes = 0;
  const walk = path => {
    for (const entry of fs.readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['tests', 'node_modules', '.git', '__pycache__'].includes(entry.name)) continue;
      if (entry.name === '.env' || entry.name.startsWith('.env.') || entry.name === 'credentials.json') continue;
      if (path === root && !['.codex-plugin', '.mcp.json', '.app.json', 'plugin.json',
        'skills', 'scripts', 'references', 'hooks', 'assets', 'README.md'].includes(entry.name)) continue;
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('插件指纹不支持符号链接');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const size = fs.statSync(full).size;
        if (++count > 5000 || (bytes += size) > 67108864) throw new Error('插件指纹超过预算');
        digest.update(full.slice(root.length).replaceAll('\\', '/') + '\0');
        digest.update(fs.readFileSync(full)); digest.update('\0');
      }
    }
  };
  walk(root);
  const manifest = readPrivateJson(join(root, '.codex-plugin/plugin.json'));
  return { name: 'zan-workflows', version: redactText(manifest.version, 100), fingerprint: digest.digest('hex') };
}

export function startRun(input = {}, options = {}) {
  if (process.env.ZAN_WORKFLOWS_RECORDING === 'off' && !options.force) return { state: 'DISABLED' };
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.skill || '')) throw new Error('需要准确技能名称');
  if (input.parentRunId !== undefined) runDirectory(input.parentRunId, options);
  const runs = privateDirectory(join(privateDirectory(dataDirectory(options)), 'runs'));
  if (fs.readdirSync(runs).filter(name => runPattern.test(name)).length >= limits.runs) {
    throw new Error('本地已保留 100 次运行；请先导出并清理不再需要的诊断记录');
  }
  const runId = 'run-' + randomUUID(), dir = join(runs, runId);
  const metadata = { schemaVersion: 1, runId, startedAt: new Date().toISOString(),
    plugin: pluginIdentity(options.pluginRoot || pluginRoot), skill: input.skill,
    goal: redactText(input.goal), project: redactText(input.project, 100),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    coverage: input.coverage === 'DELIVERY_ONLY' ? 'DELIVERY_ONLY' : 'PARTIAL',
    host: { name: redactText(input.host?.name || 'unknown', 60),
      version: redactText(input.host?.version || 'unknown', 80), model: redactText(input.host?.model || 'unknown', 100) },
    runtime: { node: process.version, platform: process.platform, arch: process.arch } };
  fs.mkdirSync(dir, { mode: 0o700 });
  writePrivateFile(join(dir, 'run.json'), JSON.stringify(metadata) + '\n', { exclusive: true });
  writePrivateFile(join(dir, 'events.jsonl'), '', { exclusive: true });
  return { state: 'RECORDING', runId };
}

export function recordEvent(runId, input, options = {}) {
  if (process.env.ZAN_WORKFLOWS_RECORDING === 'off' && !options.force) return { state: 'DISABLED', runId };
  if (!types.has(input?.type) || !sources.has(input?.source)) throw new Error('事件类型或证据来源无效');
  if (input.type === 'run_finished' && !outcomes.has(input.outcome)) throw new Error('运行结局无效');
  const dir = runDirectory(runId, options);
  // Enforce an explicit terminal event; a process close does not finish the user's task.
  if (fs.existsSync(join(dir, 'finished.json'))) throw new Error('运行已结束；请新建关联运行记录后续工作');
  const event = { schemaVersion: 1, at: new Date().toISOString(), type: input.type, source: input.source };
  for (const field of ['stage', 'action', 'operationId', 'phase', 'state', 'code', 'subject', 'summary', 'outcome']) {
    if (typeof input[field] === 'string') event[field] = redactText(input[field], field === 'summary' ? 1000 : 180);
  }
  if (typeof input.artifactUrl === 'string') {
    const url = new URL(input.artifactUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('产物只接受 HTTP/HTTPS 链接');
    event.artifactUrl = redactText(url.href, 2000);
  }
  for (const field of ['elapsedMs', 'idleBeforeMs', 'busyMs', 'idleMs', 'requestCount']) {
    if (Number.isSafeInteger(input[field]) && input[field] >= 0) event[field] = input[field];
  }
  const path = join(dir, 'events.jsonl'), line = JSON.stringify(event) + '\n';
  const fd = fs.openSync(path, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size + Buffer.byteLength(line) > limits.bytes) {
      writePrivateFile(join(dir, 'truncated'), 'true\n');
      return { state: 'CAPACITY_REACHED', runId };
    }
    fs.writeFileSync(fd, line);
  } finally { fs.closeSync(fd); }
  if (input.type === 'run_finished') writePrivateFile(join(dir, 'finished.json'), JSON.stringify(event) + '\n');
  return { state: 'RECORDED', runId };
}

export function readRun(runId, options = {}) {
  const dir = runDirectory(runId, options);
  const metadata = readPrivateJson(join(dir, 'run.json'), 32768);
  if (metadata.runId !== runId || metadata.schemaVersion !== 1) throw new Error('运行元数据无效');
  const rows = readPrivateFile(join(dir, 'events.jsonl')).toString().split('\n').filter(Boolean);
  const events = [];
  let incomplete = fs.existsSync(join(dir, 'truncated'));
  for (const row of rows) {
    try {
      const event = JSON.parse(row);
      if (!types.has(event.type) || !sources.has(event.source) || !Number.isFinite(Date.parse(event.at)) ||
          event.type === 'run_finished' && !outcomes.has(event.outcome)) throw new Error();
      events.push(event);
    } catch { incomplete = true; }
  }
  return { metadata, events, incomplete };
}

export function listRuns(options = {}) {
  const path = join(dataDirectory(options), 'runs');
  if (!fs.existsSync(path)) return [];
  return fs.readdirSync(privateDirectory(path)).filter(name => runPattern.test(name)).map(runId => {
    try {
      const { metadata, events, incomplete } = readRun(runId, options);
      return { runId, skill: metadata.skill, startedAt: metadata.startedAt, goal: metadata.goal,
        outcome: events.findLast(e => e.type === 'run_finished')?.outcome || 'UNKNOWN', incomplete };
    } catch { return { runId, outcome: 'UNKNOWN', incomplete: true }; }
  }).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}

// Deliberately separate from WorkflowSession.onEvent: diagnostics must never poison delivery.
export function sessionRecorder(options = {}) {
  const observer = () => {};
  observer.status = { state: 'UNAVAILABLE' };
  if (process.env.ZAN_WORKFLOWS_RECORDING === 'off' && !options.force) {
    observer.status.state = 'DISABLED';
    return observer;
  }
  try {
    const runId = options.runId || process.env.ZAN_WORKFLOWS_RUN_ID ||
      startRun({ skill: 'scripted-delivery', coverage: 'DELIVERY_ONLY' }, options).runId;
    if (!runId) return observer;
    runDirectory(runId, options);
    const record = event => {
      try {
        const type = { REQUEST_STARTED: 'action_started', REQUEST_FINISHED: 'action_finished',
          SESSION_CLOSED: 'session_closed', CLEANUP_FAILED: 'session_closed' }[event.state];
        if (type) {
          const result = recordEvent(runId, { type, source: 'executor', stage: 'delivery',
          action: event.action, operationId: event.requestId, phase: event.phase,
          state: event.resultState || event.state, code: event.reason,
          elapsedMs: event.elapsedMs, idleBeforeMs: event.idleBeforeMs,
          busyMs: event.busyMs, idleMs: event.idleMs, requestCount: event.requestCount }, options);
          if (result.state !== 'RECORDED') record.status.state = 'PARTIAL';
        }
      } catch { record.status.state = 'PARTIAL'; } // No raw error details enter business output.
    };
    record.status = { state: 'RECORDING', runId };
    return record;
  } catch { return observer; }
}

export async function readFeedbackInput(argv, { execute = false } = {}) {
  const allowed = execute ? ['--json', '--execute'] : ['--json'];
  if (new Set(argv).size !== argv.length || argv.some(value => !allowed.includes(value))) throw new Error('无效命令选项');
  let body = '';
  for await (const chunk of process.stdin) {
    body += chunk;
    if (Buffer.byteLength(body) > limits.input) throw new Error('输入超过 32 KiB');
  }
  let input;
  try { input = JSON.parse(body || '{}'); } catch { throw new Error('stdin 不是有效 JSON'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('stdin 需要 JSON 对象');
  return { ...input, execute: argv.includes('--execute') };
}

async function main() {
  const [action, ...argv] = process.argv.slice(2), input = await readFeedbackInput(argv);
  let result;
  if (action === 'start') result = startRun(input);
  else if (action === 'event') result = recordEvent(input.runId, input.event);
  else if (action === 'finish') result = recordEvent(input.runId, { type: 'run_finished',
    source: 'agent_summary', outcome: input.outcome, summary: input.summary });
  else if (action === 'list') result = { state: 'LISTED', runs: listRuns() };
  else throw new Error('使用 start|event|finish|list');
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(redactText(error.message) + '\n'); process.exitCode = 1; });
}
