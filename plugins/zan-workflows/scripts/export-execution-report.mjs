#!/usr/bin/env node
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { hash, limits, outcomes, privateDirectory, readFeedbackInput, readPrivateFile,
  readRun, redactText, runDirectory, writePrivateFile } from './execution-recorder.mjs';

const digestPattern = /^[a-f0-9]{64}$/;
const exporterFingerprint = hash(Buffer.concat([
  fs.readFileSync(fileURLToPath(import.meta.url)),
  fs.readFileSync(new URL('./execution-recorder.mjs', import.meta.url)),
]));
const textFields = ['stage', 'action', 'operationId', 'phase', 'state', 'code', 'subject', 'summary', 'outcome', 'artifactUrl'];
const numberFields = ['elapsedMs', 'idleBeforeMs', 'busyMs', 'idleMs', 'requestCount'];
const safe = (object, fields, max = 1000) => Object.fromEntries(fields.filter(key =>
  typeof object?.[key] === 'string').map(key => [key, redactText(object[key], max)]));
const codeBlock = text => {
  const tick = String.fromCharCode(96);
  let longest = 2;
  for (const match of text.matchAll(new RegExp(tick + '+', 'g'))) longest = Math.max(longest, match[0].length);
  const fence = tick.repeat(longest + 1);
  return fence + '\n' + text + '\n' + fence;
};

// Small dependency-free ZIP writer. Entries are fixed filenames; no arbitrary paths or files.
export function reportZip(files) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    table[i] = n >>> 0;
  }
  const locals = [], central = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(filename), data = Buffer.from(value), compressed = deflateRawSync(data);
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(header, name, compressed); central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, index, end]);
}

export function buildReport(run, input = {}) {
  const metadata = run.metadata;
  const events = run.events.map(event => ({ at: new Date(event.at).toISOString(), type: event.type,
    source: event.source, ...safe(event, textFields),
    ...Object.fromEntries(numberFields.filter(key => Number.isSafeInteger(event[key]) && event[key] >= 0)
      .map(key => [key, event[key]])) }));
  const terminal = events.findLast(event => event.type === 'run_finished');
  const goalReached = input.feedback?.goalReached || 'UNKNOWN';
  if (!['REACHED', 'PARTIAL', 'NOT_REACHED', 'UNKNOWN'].includes(goalReached)) throw new Error('目标达成评价无效');
  if (input.evidence !== undefined && (!Array.isArray(input.evidence) || input.evidence.length > 5 ||
      input.evidence.some(row => !row || typeof row.text !== 'string'))) throw new Error('最多提供 5 个明确选取的文本证据片段');
  const actions = events.filter(event => event.type === 'action_finished');
  const confirmations = events.filter(event => event.type === 'confirmation_requested');
  const report = { schemaVersion: 1, exporterFingerprint,
    runId: metadata.runId, startedAt: new Date(metadata.startedAt).toISOString(),
    plugin: { name: 'zan-workflows', version: redactText(metadata.plugin?.version, 100),
      fingerprint: digestPattern.test(metadata.plugin?.fingerprint || '') ? metadata.plugin.fingerprint : 'unknown' },
    skill: redactText(metadata.skill, 64), goal: redactText(metadata.goal), project: redactText(metadata.project, 100),
    ...(typeof metadata.parentRunId === 'string' && /^run-[a-f0-9-]{36}$/.test(metadata.parentRunId) ? { parentRunId: metadata.parentRunId } : {}),
    host: safe(metadata.host, ['name', 'version', 'model'], 100),
    runtime: safe(metadata.runtime, ['node', 'platform', 'arch'], 80),
    outcome: !run.incomplete && outcomes.has(terminal?.outcome) ? terminal.outcome : 'UNKNOWN',
    coverage: { scope: metadata.coverage === 'DELIVERY_ONLY' ? 'DELIVERY_ONLY' : 'PARTIAL',
      incomplete: run.incomplete, hasTerminalEvent: !!terminal,
      sources: [...new Set(events.map(event => event.source))],
      gaps: ['仅覆盖已接入的步骤；摘要不等于完整执行审计', ...events.filter(e => e.type === 'coverage_gap').map(e => e.summary || '未覆盖步骤')] },
    feedback: { source: 'user_feedback', goalReached, ...safe(input.feedback, ['problem', 'correction']) },
    evidence: (input.evidence || []).map(row => ({ source: 'user_selected', label: redactText(row.label, 100), text: redactText(row.text, 2000) })),
    metrics: { observedActions: actions.length, confirmationCount: confirmations.length,
      correctionCount: events.filter(e => e.type === 'user_correction').length,
      retryCount: events.filter(e => e.type === 'retry').length,
      actionElapsedMs: actions.reduce((sum, e) => sum + (e.elapsedMs || 0), 0),
      precedingIdleMs: events.filter(e => e.type === 'action_started').reduce((sum, e) => sum + (e.idleBeforeMs || 0), 0),
      explicitWaitMs: events.filter(e => e.type === 'wait_finished').reduce((sum, e) => sum + (e.elapsedMs || 0), 0) },
    artifacts: [...new Set(events.map(event => event.artifactUrl).filter(Boolean))], events };
  report.revision = hash(JSON.stringify(report));
  return report;
}

export function renderReport(report, maxEvents = Infinity) {
  const overview = ['技能：' + report.skill, '插件版本：' + report.plugin.version,
    '运行：' + report.runId, '结果：' + report.outcome, '目标达成：' + report.feedback.goalReached,
    '目标：' + (report.goal || '未记录'), '主要问题：' + (report.feedback.problem || '未补充'),
    '人工纠正：' + (report.feedback.correction || '未补充'),
    '确认次数：' + report.metrics.confirmationCount, '人工纠正次数：' + report.metrics.correctionCount,
    '明确记录的重试：' + report.metrics.retryCount,
    '已记录动作耗时：' + report.metrics.actionElapsedMs + ' ms',
    '动作前空闲：' + report.metrics.precedingIdleMs + ' ms（不推断全部为用户等待）',
    '明确记录的等待：' + report.metrics.explicitWaitMs + ' ms',
    '记录范围：' + report.coverage.scope + '；日志损坏或截断：' + report.coverage.incomplete,
    '结束事件：' + (report.coverage.hasTerminalEvent ? '已记录' : '未记录')].join('\n');
  const selected = report.events.slice(-maxEvents);
  const timeline = selected.map(event => [event.at, event.source, event.type, event.stage, event.action,
    event.state || event.outcome, event.subject, event.code, event.summary, event.artifactUrl].filter(Boolean).join(' | ')).join('\n');
  return '# 插件执行反馈\n\n' + codeBlock(overview) +
    '\n\n## 执行时间线\n\n' + (selected.length < report.events.length ? '正文仅展示末尾步骤，完整记录见附件。\n\n' : '') +
    codeBlock(timeline || '没有可用事件') +
    '\n\n## 记录限制\n\n' + codeBlock(report.coverage.gaps.join('\n')) +
    (report.evidence.length ? '\n\n## 主动选取的证据\n\n' + codeBlock(report.evidence.map(row => row.label + '\n' + row.text).join('\n\n')) : '') +
    '\n\n报告修订：' + report.revision + '\n';
}

export function exportExecutionReport(input, options = {}) {
  const run = readRun(input.runId, options), report = buildReport(run, input);
  const root = privateDirectory(join(runDirectory(input.runId, options), 'reports'));
  const dir = join(root, report.revision);
  if (!fs.existsSync(dir) && fs.readdirSync(root).length >= limits.revisions) throw new Error('本次运行已保留 10 个报告修订，请先清理');
  privateDirectory(dir);
  const files = { 'report.json': JSON.stringify(report, null, 2) + '\n', 'report.md': renderReport(report),
    'events.jsonl': report.events.map(row => JSON.stringify(row) + '\n').join('') };
  const zip = reportZip(files);
  for (const [filename, value] of Object.entries({ ...files, 'execution-report.zip': zip })) {
    const path = join(dir, filename), expected = Buffer.from(value);
    if (fs.existsSync(path)) {
      if (!readPrivateFile(path, 4194304).equals(expected)) throw new Error('已生成报告发生修改，拒绝覆盖或上传');
    } else writePrivateFile(path, value, { exclusive: true });
  }
  return { state: 'EXPORTED', runId: input.runId, revision: report.revision,
    reportPath: join(dir, 'report.md'), archivePath: join(dir, 'execution-report.zip'), archiveHash: hash(zip), report };
}

async function main() {
  const input = await readFeedbackInput(process.argv.slice(2));
  const { report, ...result } = exportExecutionReport(input);
  process.stdout.write(JSON.stringify({ ...result, outcome: report.outcome, coverage: report.coverage }) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(redactText(error.message) + '\n'); process.exitCode = 1; });
}
