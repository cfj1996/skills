import { visualResults } from '../../../scripts/visual-acceptance.mjs';

export const recordTitle = '执行与变更记录';
export const receiptIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
export const oneLine = value => typeof value === 'string' && value.trim() && !/[\r\n\u2028\u2029]/u.test(value);
const marker = 'zan-execution-record/v1';
const clock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
});

function requireRecord(test, message) {
  if (!test) throw new Error(message);
}

export function recordTime(now) {
  return clock.format(now);
}

function validTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const time = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 16).replace('T', ' ') === value;
}

function field(name, value) {
  return '- **' + name + '** ' + value;
}

export function parseInlineProgress(history, revision) {
  return history.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const match = line.match(/^- \[([A-Za-z0-9][A-Za-z0-9_.:/-]{0,127})\] (.+?)｜依据 (.+)$/);
    requireRecord(match && oneLine(match[2]) && oneLine(match[3]), '旧执行记录无法按回执完整迁移');
    const [, id, result, evidence] = match;
    return { id, revision, title: result, result, evidence, time: null, executor: null };
  });
}

export function progressEntry(input, revision, now, previous) {
  const { receiptId: id, entry: result, evidence, title = result, executor, occurredAt, nextStep, changeId } = input;
  requireRecord(typeof id === 'string' && receiptIdPattern.test(id) && [title, result, evidence].every(oneLine) &&
    (executor === undefined || oneLine(executor)) && (nextStep === undefined || oneLine(nextStep)) &&
    (changeId === undefined || typeof changeId === 'string' && receiptIdPattern.test(changeId)) &&
    (occurredAt === undefined || validTime(occurredAt)), '进度需要稳定回执编号、单行结果与依据，时间使用北京时间到分');
  return { id, revision: previous?.revision ?? revision, title, result, evidence,
    time: occurredAt ?? (previous ? previous.time : recordTime(now)), executor: executor ?? null,
    ...(nextStep === undefined ? {} : { nextStep }), ...(changeId === undefined ? {} : { changeId }) };
}

export function proposedChange(change) {
  requireRecord(change && typeof change.id === 'string' && receiptIdPattern.test(change.id) &&
    [change.title, change.proposer, change.detail, change.impact].every(oneLine) &&
    (change.occurredAt === undefined || validTime(change.occurredAt)),
  '变更需要稳定编号、标题、提出人、内容、影响与验收，时间使用北京时间到分');
  const { id, title, proposer, detail, impact, occurredAt } = change;
  return { id, title, proposer, detail, impact, ...(occurredAt === undefined ? {} : { occurredAt }) };
}

function anchor(id) {
  return 'change-' + encodeURIComponent(id);
}

function executionLines(entry, changes) {
  const related = changes.find(change => change.id === entry.changeId);
  const relatedTitle = related?.title.replace(/[\\[\]]/g, '\\$&');
  const visual = entry.visualAcceptance;
  return [
    '### ' + (entry.time ?? '时间待核实') + ' · 执行 · ' + entry.title,
    '',
    field('执行人', entry.executor ?? '待核实'),
    field('结果', entry.result),
    field('依据', entry.evidence),
    ...(visual ? [field('视觉独立评审', visual.reviewEvidence),
      ...visual.checks.map(check => field(check.testId, [visualResults[check.result], check.observation, check.evidence].filter(Boolean).join(' ｜ '))),
    ] : []),
    ...(entry.nextStep ? [field('下一步', entry.nextStep)] : []),
    ...(related ? [field('关联变更', '[' + relatedTitle + '](#' + anchor(related.id) + ')')] : []),
  ];
}

function changeLines(entry, planUrl) {
  const confirmation = entry.confirmation;
  const status = !confirmation ? '待确认' : [
    confirmation.at, confirmation.actor,
    ...(confirmation.commentId ? ['已确认', '工作项确认评论 ' + confirmation.commentId] : ['已确认，待核实生效']),
  ].join(' · ');
  return [
    '<a id="' + anchor(entry.id) + '"></a>',
    '### ' + entry.occurredAt + ' · 变更 · ' + entry.title,
    '',
    field('提出人', entry.proposer ?? '待核实'),
    field('变更内容', entry.detail),
    field('影响与验收', entry.impact),
    field('确认', status),
    ...(confirmation?.commentId ? [field('生效版本', '第 ' + confirmation.revision + ' 版 · [主执行计划](' + planUrl + ')')] : []),
    ...(confirmation?.archiveUrl ? [field('上一版', '[计划归档](' + confirmation.archiveUrl + ')')] : []),
  ];
}

export function renderRecord(model, planUrl) {
  const chronological = [
    ...model.progress.map(entry => ({ time: entry.time, entry, execution: true })),
    ...model.changes.map(entry => ({ time: entry.occurredAt, entry, execution: false })),
  ].reverse().sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
  const latest = chronological.find(row => row.execution)?.entry;
  const effective = model.changes.reduce((current, row) =>
    row.confirmation?.revision > (current?.confirmation.revision ?? 0) ? row : current, null);
  const awaitingChange = effective && effective.confirmation.revision > (latest?.revision ?? 0);
  const done = awaitingChange ? '第 ' + effective.confirmation.revision + ' 版计划已确认' : latest?.result ?? '计划已保存，待开工';
  const next = awaitingChange ? '按当前计划继续「' + effective.title + '」'
    : latest ? latest.nextStep ?? '按当前进展核对下一步' : '等待明确开工';
  const meta = JSON.stringify(model).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  return [
    '<!-- ' + marker + ' ' + meta + ' -->',
    '# ' + recordTitle,
    '',
    '[主执行计划](' + planUrl + ')',
    '',
    '## 当前进展',
    '',
    field('做到哪', done),
    field('下一步', next),
    '',
    '## 记录',
    ...chronological.flatMap(({ entry, execution }) => ['', ...(execution
      ? executionLines(entry, model.changes) : changeLines(entry, planUrl))]),
    '',
  ].join('\n');
}

export function readRecord(markdown, planUrl) {
  const prefix = '<!-- ' + marker + ' ';
  const first = typeof markdown === 'string' && markdown.split('\n', 1)[0];
  requireRecord(first && first.startsWith(prefix) && first.endsWith(' -->'), '子 Wiki 缺少执行与变更记录身份');
  const model = JSON.parse(first.slice(prefix.length, -4));
  requireRecord(['progress', 'changes'].every(key => Array.isArray(model[key]) &&
    model[key].every(row => typeof row?.id === 'string' && receiptIdPattern.test(row.id)) &&
    new Set(model[key].map(row => row.id)).size === model[key].length) &&
    renderRecord(model, planUrl) === markdown, '子 Wiki 正文或回执与记录不一致，请先核实');
  return model;
}
