#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioMcpClient } from '../../../scripts/mcp-client.mjs';
import { apiData } from '../../../scripts/register-test-submission.mjs';
import { stableJson, repositoryKey, rejectedWrite } from '../../../scripts/workflow-runtime.mjs';
import { normalizeVisualAcceptance } from '../../../scripts/visual-acceptance.mjs';
import { chinaDate, listAllComments, totalCount, wikiCommentLink } from '../../submitting-for-test/scripts/ensure-test-wiki.mjs';
import { validatePlan, planLines, itemLinkMatches, deliveryRoute, startupDelivery, readAcceptanceReview } from './validate-plan.mjs';
import { recordTitle, receiptIdPattern, oneLine, recordTime, parseInlineProgress,
  progressEntry, proposedChange, renderRecord, readRecord } from './execution-record.mjs';

const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const digitId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const sha = value => typeof value === 'string' && /^[\da-f]{64}$/.test(value);
const datedTitle = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]): (.+)$/u;
const link = (workspace, id) => `https://www.tapd.cn/${workspace}/markdown_wikis/show/#${id}`;
const wikiUrlPattern = /^https:\/\/www\.tapd\.cn\/(\d+)\/markdown_wikis\/show\/(\d+)?(?:#|%23)(\d+)$/;
const approvalMarker = '执行计划版本确认：';
const must = (test, message) => { if (!test) throw new Error(message); };
const asId = value => digitId(String(value)) && (typeof value === 'string' || Number.isSafeInteger(value)) ? String(value) : null;
const same = (a, b) => stableJson(a) === stableJson(b);
const digest = obj => hash(stableJson(obj));
const unknown = message => Object.assign(new Error(message), { code: 'UNKNOWN_WRITE' });

function scopeOf(input) {
  const { workspaceId, parentWikiId } = input;
  const keys = ['storyId', 'bugId'].filter(key => Object.hasOwn(input, key));
  must(keys.length === 1, 'storyId 和 bugId 必须且只能指定一项');
  const key = keys[0];
  must([workspaceId, input[key], parentWikiId].every(digitId) && Number.isSafeInteger(Number(workspaceId)), '空间、工作项、父目录需提供准确的数字字符串 ID');
  return { workspaceId, [key]: input[key], parentWikiId };
}

function owner(scope) {
  return scope.bugId
    ? { type: 'bug', id: scope.bugId, legacyTitle: `Bug 修复计划 · ${scope.bugId}`, marker: 'Bug 修复执行文档：' }
    : { type: 'stories', id: scope.storyId, legacyTitle: `需求执行计划 · ${scope.storyId}`, marker: '需求开发执行文档：' };
}

function backlinkBody(item, workspaceId, wikiId) {
  return item.marker + wikiCommentLink(link(workspaceId, wikiId));
}

function commentText(raw) {
  return raw
    .replace(/&amp;/gi, '&').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').replace(/&#(?:35|x23);/gi, '#')
    .replace(/<a\b[^>]*\shref\s*=\s*(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
      (_, quote, href, label) => wikiCommentLink(href, label.replace(/<[^>]*>/g, '').trim()))
    .replace(/<\/(?:p|div|li)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1').replace(/<[^>]*>/g, '').trim();
}

function parseBacklink(value, workspaceId) {
  const markdown = value.match(/^\[([^\]\r\n]+)\]\(([^\s()]+)\)$/);
  const target = markdown?.[2] ?? value;
  const label = markdown?.[1].trim();
  const urls = /^https?:\/\//i.test(label ?? '') ? [target, label] : [target];
  const matches = urls.map(url => url.match(wikiUrlPattern));
  must(matches.every(match => match && match[1] === workspaceId && (!match[2] || match[2] === match[3]) && match[3] === matches[0][3]),
    '执行文档评论包含无效或冲突链接');
  return { id: matches[0][3], clickable: Boolean(markdown) };
}

function validTitle(title, item) {
  return title === item.legacyTitle || oneLine(title) && datedTitle.test(title);
}

function parts(markdown) {
  const lines = planLines(markdown);
  const headings = lines.filter(line => /^##[ \t]+执行记录[ \t]*$/.test(line.text));
  if (!headings.length) return { body: markdown, plan: markdown, history: '' };
  must(headings.length === 1, '正文需要唯一且位于最后的 ## 执行记录');
  const { offset: start, text: heading } = headings[0];
  const offset = start + heading.length;
  const history = markdown.slice(offset);
  must(!lines.some(line => line.offset > offset && /^#{1,2}\s/.test(line.text)), '执行记录须为最后一节');
  return { body: markdown.slice(0, start), plan: markdown.slice(0, offset), history, heading };
}

const statuses = ['待执行', '开发中', '已上线'];
function managedCell(text, label, allowed, value) {
  const pattern = new RegExp(`^(\\|[ \\t]*${label}[ \\t]*\\|[ \\t]*)(${allowed.join('|')})([ \\t]*\\|[ \\t]*)$`);
  const lines = planLines(text);
  const end = lines.findIndex(line => /^##\s+P[1-9]\d*\s/.test(line.text));
  const rows = lines.slice(0, end).filter(line => pattern.test(line.text));
  must(rows.length === 1, `工作项信息需要唯一有效的 ${label} 单元格`);
  const row = rows[0];
  const [, prefix, actual, suffix] = row.text.match(pattern);
  return { actual, text: text.slice(0, row.offset) + prefix + value + suffix + text.slice(row.offset + row.text.length) };
}
function planHash(markdown, schema) {
  const { plan } = parts(markdown);
  return hash(schema < 4 ? managedCell(plan, '执行状态', statuses, '受管').text : plan);
}

function executionDefinition(markdown) {
  // Correcting a page title, TAPD status or creation timestamp does not reopen
  // shipped features. Preserve the actual functional brief, code and tests.
  const { plan } = parts(markdown);
  const headerEnd = planLines(plan).find(line => /^##\s+P[1-9]\d*\s/.test(line.text)).offset;
  const header = plan.slice(0, headerEnd).replace(/^# [^\r\n]+/m, '#')
    .replace(/^\|[ \t]*(?:TAPD (?:需求|缺陷|Bug ?)状态|创建时间|执行状态)[ \t]*\|[^\r\n]*$/gm, '')
    .replace(/^\|[ \t]*是否开启子智能体开发模式[ \t]*\|[ \t]*否[ \t]*\|[ \t]*(?:\r?\n|$)/gm, '');
  return (header + plan.slice(headerEnd)).replace(/\r\n/g, '\n').trimEnd();
}

function recordLink(markdown, scope, recordId, remove = false) {
  const title = planLines(markdown).find(line => /^#[ \t]+/.test(line.text));
  const offset = title && markdown.indexOf('\n', title.offset) + 1;
  must(offset > 0, '主计划标题不可读');
  const eol = markdown[offset - 2] === '\r' ? '\r\n' : '\n';
  const line = eol + '[' + recordTitle + '](' + link(scope.workspaceId, recordId) + ')' + eol;
  const before = markdown.slice(0, offset), after = markdown.slice(offset);
  if (remove) {
    must(after.startsWith(line), '主计划与执行记录入口不一致');
    return before + after.slice(line.length);
  }
  return before + line + after;
}

function pack(approval, markdown, record) {
  const visible = record ? recordLink(parts(markdown).body, approval.scope, record.id) : markdown;
  const meta = JSON.stringify({ approval, approvalFingerprint: digest(approval), currentSha256: hash(visible), ...(record && { record }) })
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  return `<!-- zan-story-execution/v1 ${meta} -->\n${visible}`;
}

function readMetadata(page) {
  const raw = page.markdown_description;
  must(typeof raw === 'string', 'Wiki 正文不可读');
  const end = raw.indexOf('\n');
  const line = raw.slice(0, end).match(/^<!-- zan-story-execution\/v1 (\{.*\}) -->$/);
  must(line, 'Wiki 缺少执行计划身份，须核实正式页');
  const meta = JSON.parse(line[1]);
  must(meta?.approval?.scope, 'Wiki 缺少工作项归属记录');
  return { ...meta, markdown: raw.slice(end + 1) };
}

function unpack(page, scope) {
  const { approval, currentSha256, approvalFingerprint, markdown: visible, record } = readMetadata(page);
  must(!record || approval.schema === 4 && digitId(record.id) &&
    (record.heading === undefined || /^##[ \t]+执行记录[ \t]*$/.test(record.heading)) &&
    (record.migratedFrom === undefined || sha(record.migratedFrom)), '主计划记录入口的归属或格式无效');
  const markdown = record ? recordLink(visible, scope, record.id, true) : visible;
  const canonical = record?.heading ? markdown + record.heading : markdown;
  must(same(approval.scope, scope) && validTitle(approval.title, owner(scope)) && page.name === approval.title
    && digest(approval) === approvalFingerprint
    && Number.isSafeInteger(approval.revision) && approval.revision > 0 && sha(approval.bodySha256)
    && hash(visible) === currentSha256 && planHash(canonical, approval.schema) === approval.planSha256, 'Wiki 归属、确认指纹或正文与记录不一致，须重新核查');
  must(approval.previousWikiId === null || approval.previousWikiId === asId(page.id), '确认版本绑定了其他 Wiki');
  const { delivery, featureIds, featureProjects, executionStatus, visualTests } = validatePlan(markdown, scope, approval.schema);
  return { approval, approvalFingerprint, markdown, record, delivery, featureIds, featureProjects, executionStatus, visualTests,
    pageSha256: hash(page.markdown_description) };
}

async function localClaim(key) {
  const dir = join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'zan-workflows', 'story-execution-writes');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    const path = join(dir, digest(key));
    const file = await open(path, 'wx', 0o600);
    await file.close();
    return () => unlink(path);
  } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}

function verifyDraft(page, scope) {
  const raw = page.markdown_description;
  must(typeof raw === 'string' && !raw.startsWith('<!-- zan-story-execution/'), '原草稿已有版本记录或正文不可读');
  const label = scope.bugId ? '缺陷' : '需求';
  const lines = planLines(raw).map(row => row.text);
  const start = lines.indexOf('## ' + label + '信息');
  must(start >= 0, '原草稿的工作项信息无法核实');
  const info = lines.slice(start + 1);
  const end = info.findIndex(row => /^#{1,2}\s/.test(row));
  const header = end < 0 ? info : info.slice(0, end);
  function field(name) {
    const rows = header.map(row => row.split('|').map(cell => cell.trim()))
      .filter(cells => cells.length === 4 && cells[1] === name);
    must(rows.length === 1, '原草稿的工作项字段缺失或重复：' + name);
    return rows[0][2];
  }
  const id = field(label + ' ID').replace(/^`(\d+)`$/, '$1');
  const rawLink = field(label + '链接');
  const url = rawLink.match(/^\[[^\]]+\]\(([^\s)]+)\)$/)?.[1] ?? rawLink;
  must(id === owner(scope).id && itemLinkMatches(url, scope), '原草稿与选定工作项不符');
}

function storage(call, scope) {
  const { workspaceId, parentWikiId } = scope;
  const item = owner(scope);
  const run = (tool, options) => call(tool, { workspace_id: Number(workspaceId), options });
  async function list(tool, options, kind) {
    const response = await run(tool, options);
    const data = apiData(response, tool);
    const rows = (Array.isArray(data) ? data : [data]).map(row => row?.[kind]);
    must(rows.every(row => asId(row?.id) && String(row.workspace_id) === workspaceId), `${tool} 返回的 ${kind} 身份不符`);
    const count = totalCount(response);
    must(count == null ? rows.length < (options.limit === 1 ? 2 : options.limit) : count === rows.length, `${tool} 返回数据不完整`);
    return rows;
  }
  async function byId(id) {
    const found = await list('get_wiki', { id, limit: 1, fields: 'id,workspace_id,name,parent_wiki_id,note,markdown_description' }, 'Wiki');
    must(found.length === 1 && asId(found[0].id) === id, `Wiki ${id} 读回不唯一或不存在`);
    return found[0];
  }
  async function byName(name, parent) {
    const rows = await list('get_wiki', { name, limit: 100, fields: 'id,workspace_id,name,parent_wiki_id,markdown_description' }, 'Wiki');
    const matches = rows.filter(row => row.name === name && asId(row.parent_wiki_id) === parent);
    must(matches.length <= 1, `父目录存在多个同名 Wiki：${name}`);
    if (!matches.length) return null;
    const page = await byId(asId(matches[0].id));
    must(page.name === name && asId(page.parent_wiki_id) === parent, 'Wiki 标题或父目录读回变化');
    return page;
  }
  async function byNote(note = item.legacyTitle, parent = parentWikiId) {
    // The note carries the work item identity while the display title can collide or change with the date.
    const rows = await list('get_wiki', { note, limit: 100, fields: 'id,workspace_id,note' }, 'Wiki');
    const matches = rows.filter(row => row.note === note);
    must(matches.length <= 1, '工作项存在多个执行 Wiki，须核对页面归属');
    if (!matches.length) return null;
    const page = await byId(asId(matches[0].id));
    must(page.note === note && asId(page.parent_wiki_id) === parent, '执行 Wiki 备注或所在目录与目标不符');
    return page;
  }
  async function notices() {
    const comments = await listAllComments(call, Number(workspaceId), item.type, item.id, 'id,description,entry_id,entry_type,workspace_id,author');
    const matches = [], receipts = [];
    for (const comment of comments) {
      must((comment.entry_id == null || asId(comment.entry_id) === item.id) &&
        (comment.entry_type == null || comment.entry_type === item.type) &&
        (comment.workspace_id == null || String(comment.workspace_id) === workspaceId) && typeof comment.description === 'string', '工作项评论归属或正文不可核实');
      const visible = commentText(comment.description);
      const isLink = visible.startsWith(item.marker);
      const isApproval = visible.startsWith(approvalMarker);
      if (!isLink && !isApproval) continue;
      must(asId(comment.entry_id) === item.id && comment.entry_type === item.type && String(comment.workspace_id) === workspaceId,
        '执行文档评论的空间、类型和工作项 ID 无法核实');
      const combined = isLink ? visible.match(/\s*｜\s*(执行计划版本确认：[\s\S]*)$/u) : null;
      if (isApproval || combined) {
        const receipt = (isApproval ? visible : combined[1]).match(/^执行计划版本确认：(\d+):r([1-9]\d*):([a-f0-9]{64})$/);
        must(receipt && oneLine(comment.author), '版本确认评论的格式或作者不完整');
        receipts.push({ id: asId(comment.id), wikiId: receipt[1], revision: Number(receipt[2]), fingerprint: receipt[3], author: comment.author });
      }
      if (isLink) matches.push(parseBacklink(visible.slice(item.marker.length, combined?.index).trim(), workspaceId));
    }
    must(matches.length <= 1, '执行文档评论重复，须人工核对');
    return { linkedId: matches[0]?.id ?? null, linkedClickable: matches[0]?.clickable ?? false, receipts };
  }
  async function load() {
    const [items, parent, { linkedId, linkedClickable, receipts }] = await Promise.all([
      item.type === 'bug'
        ? list('get_bug', { id: item.id, limit: 1, fields: 'id,title,workspace_id' }, 'Bug')
        : list('get_stories_or_tasks', { entity_type: 'stories', id: item.id, limit: 1, fields: 'id,name,workspace_id' }, 'Story'),
      byId(parentWikiId), notices(),
    ]);
    must(items.length === 1 && asId(items[0].id) === item.id && oneLine(parent.name), '未能核实工作项或父 Wiki');
    const itemName = items[0].name ?? items[0].title;
    const referencedId = linkedId ?? receipts[0]?.wikiId;
    must(receipts.every(row => row.wikiId === referencedId), '确认记录指向其他 Wiki');
    const referenced = referencedId ? await byId(referencedId) : null;
    must(!referenced || asId(referenced.parent_wiki_id) === parentWikiId, '工作项执行文档回链与固定目录冲突');
    const hasVersion = typeof referenced?.markdown_description === 'string' &&
      referenced.markdown_description.startsWith('<!-- zan-story-execution/');
    let official = hasVersion || receipts.length || referenced?.name === item.legacyTitle ||
      referenced?.note === item.legacyTitle ? referenced : null;
    if (!official) {
      const [noted, named] = await Promise.all([byNote(), byName(item.legacyTitle, parentWikiId)]);
      must(!noted || !named || asId(noted.id) === asId(named.id), '工作项存在多个执行 Wiki，须核对页面归属');
      official = noted ?? named;
    }
    let page = official ?? referenced;
    if (!page) {
      must(oneLine(itemName), '无法核实原条目标题以定位已有草稿');
      const oldTitle = itemName + (scope.bugId ? '｜Bug 修复执行文档' : '｜需求执行文档');
      page = await byName(oldTitle, parentWikiId);
    }
    must(!referencedId || referencedId === asId(page?.id), '工作项执行文档回链与固定目录中的页面冲突');
    if (page && !official) verifyDraft(page, scope);
    const current = official ? unpack(official, scope) : null;
    must(receipts.every(row => current && row.wikiId === asId(page?.id) && row.revision <= current.approval.revision),
      '确认记录指向其他 Wiki 或较新版本');
    const approved = receipts.filter(row => row.revision === current?.approval.revision);
    must(approved.length <= 1 && approved.every(row => row.id && row.fingerprint === current.approvalFingerprint && row.author === current.approval.actor),
      '工作项的独立确认记录与 Wiki 中的版本指纹、作者不一致或重复');
    return { parentName: parent.name, itemName, page, linkedId, linkedClickable, current, approvalCommentId: approved[0]?.id ?? null };
  }
  return { run, load, byName, byId, byNote };
}

async function attempt(claim, key, write, verify) {
  const owned = await claim(key);
  let rejected = false;
  if (owned) {
    try { rejected = rejectedWrite(await write()); }
    catch (error) { rejected = rejectedWrite(error); }
  }
  try {
    const result = await verify();
    if (result) return result;
  } catch { /* Remote readback may still be unavailable. */ }
  if (rejected && owned) {
    if (typeof owned === 'function') await owned();
    throw Object.assign(new Error('TAPD 已明确拒绝写入。权限或参数修正后可重新预览并保存'), { code: 'WRITE_REJECTED' });
  }
  throw unknown('写操作的唯一结果尚未读回。保留原确认，先以 CHECK / READ 核查，请勿重发该写操作');
}

function recordStorage(store, scope, planId, claim) {
  const planUrl = link(scope.workspaceId, planId);
  const note = recordTitle + ' · ' + planId;
  function verified(page) {
    const id = asId(page.id);
    must(id && page.name === recordTitle && page.note === note && asId(page.parent_wiki_id) === planId,
      '执行与变更记录的页面身份或父级不符');
    const model = readRecord(page.markdown_description, planUrl);
    must(model.planWikiId === planId && same(model.scope, scope), '执行与变更记录与工作项或主计划不符');
    return { wikiId: id, wikiUrl: link(scope.workspaceId, id), pageSha256: hash(page.markdown_description), model };
  }
  async function find(id) {
    const page = id ? await store.byId(id) : await store.byNote(note, planId);
    return page && verified(page);
  }
  async function update(current, model, checkPlan) {
    if (same(current.model, model)) return current;
    const body = renderRecord(model, planUrl);
    if (checkPlan) await checkPlan();
    const latest = await find(current.wikiId);
    must(latest.pageSha256 === current.pageSha256, '执行与变更记录基版已变化，请 READ 后复核');
    return attempt(claim, [scope, 'replace', current.wikiId, current.pageSha256],
      () => store.run('update_wiki', { id: current.wikiId, markdown_description: body }),
      async () => {
        const readback = await find(current.wikiId);
        return same(readback.model, model) && readback;
      });
  }
  async function ensure(current, actor) {
    const previous = await find(current?.record?.id);
    const model = withInlineProgress(previous?.model ?? { planWikiId: planId, scope, progress: [], changes: [] }, current);
    if (previous) return update(previous, model);
    const body = renderRecord(model, planUrl);
    return attempt(claim, [scope, 'create-record', planId],
      () => store.run('create_wiki', { name: recordTitle, note, parent_wiki_id: planId, creator: actor, markdown_description: body }),
      async () => {
        const readback = await find();
        return readback && same(readback.model, model) && readback;
      });
  }
  return { ensure, find, update };
}

function withInlineProgress(model, current) {
  if (!current || current.record) return model;
  const inline = parseInlineProgress(parts(current.markdown).history, current.approval.revision);
  const existing = new Map(model.progress.map(row => [row.id, row]));
  const missing = inline.filter(row => {
    const copied = existing.get(row.id);
    must(!copied || same(copied, row), '旧回执与已迁移的记录冲突，请先核实');
    return !copied;
  });
  return missing.length ? { ...model, progress: [...model.progress, ...missing] } : model;
}

async function ensurePlanUnchanged(store, page) {
  const latest = await store.byId(asId(page.id));
  must(latest.name === page.name && asId(latest.parent_wiki_id) === asId(page.parent_wiki_id) &&
    latest.markdown_description === page.markdown_description, '写入前主计划已变化，请保留现有记录并重新读取');
}

function boundRecord(record, markdown, migratedFrom) {
  const { heading } = parts(markdown);
  return { id: record.wikiId, ...(heading && { heading, ...(migratedFrom && { migratedFrom }) }) };
}

async function attachRecord(store, scope, state, record, claim) {
  const { current, page } = state;
  if (current.record) {
    must(current.record.id === record.wikiId, '主计划绑定了其他记录页');
    return state;
  }
  const wikiId = asId(page.id);
  const recordRef = boundRecord(record, current.markdown, current.pageSha256);
  const body = pack(current.approval, current.markdown, recordRef);
  await ensurePlanUnchanged(store, page);
  await attempt(claim, [scope, 'replace', wikiId, current.pageSha256],
    () => store.run('update_wiki', { id: wikiId, markdown_description: body }),
    async () => (await store.byId(wikiId)).markdown_description === body);
  return store.load();
}

function addChange(model, proposal, now, confirmation) {
  const previous = model.changes.find(row => row.id === proposal.id);
  const draft = { ...proposal, occurredAt: proposal.occurredAt ?? previous?.occurredAt ?? recordTime(now) };
  must(!previous || same(draft, proposedChange(previous)), '同一变更编号已有不同内容');
  if (confirmation && previous?.confirmation) {
    must(previous.confirmation.fingerprint === confirmation.fingerprint &&
      previous.confirmation.actor === confirmation.actor, '变更已绑定另一次确认，请核实后使用新的变更编号');
  }
  const updated = confirmation ? { ...previous?.confirmation, ...confirmation, at: previous?.confirmation?.at ?? confirmation.at } : previous?.confirmation ?? null;
  const row = { ...draft, confirmation: updated };
  return { ...model, changes: previous ? model.changes.map(change => change.id === draft.id ? row : change) : [...model.changes, row] };
}

async function recordEvent(mode, input, scope, store, state, records, claim, now) {
  const { current } = state;
  const plan = publicRead(scope, state);
  const { expectedPageSha256, expectedRecordPageSha256, expectedApprovalFingerprint, actor } = input;
  must(current.approval.schema === 4 && input.progressAuthorized === true &&
    expectedApprovalFingerprint === current.approvalFingerprint && sha(expectedPageSha256) &&
    (expectedRecordPageSha256 === undefined || sha(expectedRecordPageSha256)) && (actor === undefined || oneLine(actor)),
  '记录回填需要授权、同一确认版与全页指纹');
  const visualAcceptance = mode === 'PROGRESS' && input.visualAcceptance !== undefined
    ? normalizeVisualAcceptance(input.visualAcceptance) : undefined;
  if (visualAcceptance) {
    const declared = new Set(current.visualTests?.map(test => test.testId));
    must(visualAcceptance.approvalFingerprint === current.approvalFingerprint &&
      visualAcceptance.checks.every(check => declared.has(check.testId)), '视觉回执须对应当前确认版的已声明视觉 TC');
  }
  const apply = mode === 'CHANGE' ? model => addChange(model, proposedChange(input.change), now) : model => {
    must(input.executionStatus === undefined && !/｜执行状态 \S+$/.test(input.evidence), '新版执行记录请填写实际回执及依据');
    const previous = model.progress.find(row => row.id === input.receiptId);
    const progress = { ...progressEntry(input, current.approval.revision, now, previous), ...(visualAcceptance && { visualAcceptance }) };
    must(!progress.changeId || model.changes.some(change => change.id === progress.changeId && change.confirmation?.commentId),
      '进度需关联已生效的变更');
    must(!previous || same(previous, progress), '同一回执编号已有不同记录');
    return previous ? model : { ...model, progress: [...model.progress, progress] };
  };
  const prior = await records.find(current.record?.id);
  const model = withInlineProgress(prior?.model ?? { planWikiId: plan.wikiId, scope, changes: [], progress: [] }, current);
  const updated = apply(model);
  if (current.record && same(model, updated)) return readConfirmed(scope, state, store);
  // A retry may resume just after linking the copied records to the main page.
  const migrationRetry = current.record?.migratedFrom === expectedPageSha256 &&
    model.progress.every(row => row.time === null) && !model.changes.length;
  must((expectedPageSha256 === current.pageSha256 || migrationRetry) &&
    (expectedRecordPageSha256 === undefined || prior?.pageSha256 === expectedRecordPageSha256),
  '记录或主计划基版已变化，请 READ 后复核');

  const journal = current.record ? prior : await records.ensure(current, actor ?? current.approval.actor);
  const attached = await attachRecord(store, scope, state, journal, claim);
  must(attached.current.approvalFingerprint === expectedApprovalFingerprint, '回填前主计划确认版已变化');
  await records.update(journal, apply(journal.model), () => ensurePlanUnchanged(store, attached.page));
  return readConfirmed(scope, attached, store);
}

function archiveNote(wikiId, baseline) {
  return '执行计划归档 · ' + wikiId + ' · ' + baseline;
}

async function lookupArchive(store, wikiId, revision, baseline) {
  const legacyTitle = '历史 ' + (revision ? 'r' + revision : '草稿') + ' · ' + baseline;
  return await store.byNote(archiveNote(wikiId, baseline), wikiId) ?? await store.byName(legacyTitle, wikiId);
}

function manualStartCommand(url, revision, delivery, selectionText = '') {
  if (!delivery) return `使用 $executing-tapd-plan 读取 ${url} r${revision}，开工前确定本轮是仅开发验证、提测、提测并构建还是仅构建。`;
  const lines = [`使用 $executing-tapd-plan 执行 ${url} r${revision}，${selectionText || '按此版已选范围开工'}。`];
  for (const project of delivery.projects) {
    const operations = [];
    if (delivery.submit && project.target) operations.push(`${project.git}（${project.source} → ${project.target}）`);
    if (delivery.submit && project.conflict) operations.push(`若冲突经 ${project.conflict.branch} 和 ${project.conflict.worktree} 处理并合并到 ${project.target}`);
    const release = project.release;
    if (delivery.build && release) operations.push(`在测试环境按已审源码与冻结参数构建 ${release.target}（${release.ref}，canary，${release.jobUrl}）`);
    if (operations.length) lines.push(`${project.id} ${project.repository}，${operations.join('，')}。目的为${project.purpose}。`);
  }
  // Avoid turning unresolved targets or stale prose into an affirmative instruction.
  return delivery.gaps?.submit.length || delivery.gaps?.build.length ? lines[0] : lines.join('\n');
}

function publicRead(scope, state) {
  must(state.current && state.linkedId && state.approvalCommentId, '执行 Wiki 尚未同时完成正文、独立确认记录和唯一工作项回链核验');
  const { approval, approvalFingerprint, markdown, pageSha256, executionStatus, visualTests } = state.current;
  const wikiUrl = link(scope.workspaceId, state.linkedId);
  return { state: 'CONFIRMED', ...(executionStatus === undefined ? {} : { executionStatus }), ...scope, wikiId: state.linkedId, wikiUrl,
    wikiTitle: approval.title,
    startCommand: manualStartCommand(wikiUrl, approval.revision, state.current.delivery),
    revision: approval.revision, bodySha256: approval.bodySha256, planSha256: approval.planSha256,
    approvalFingerprint, approvalCommentId: state.approvalCommentId, pageSha256, markdown, featureIds: state.current.featureIds,
    featureProjects: state.current.featureProjects, delivery: state.current.delivery, ...(visualTests && { visualTests }) };
}

async function readConfirmed(scope, state, store) {
  const result = publicRead(scope, state);
  const { current } = state;
  if (current.approval.schema !== 4) return result;
  if (current.record) {
    const { model: { progress, changes }, ...record } = await recordStorage(store, scope, result.wikiId).find(current.record.id);
    return { ...result, executionRecord: { ...record, progress, changes } };
  }
  const { history } = parts(current.markdown);
  return { ...result, executionRecord: { wikiId: null, wikiUrl: null, pageSha256: null,
    progress: parseInlineProgress(history, result.revision), changes: [] } };
}

async function readByUrl(input, call) {
  const match = typeof input.wikiUrl === 'string' && input.wikiUrl.match(wikiUrlPattern);
  must(match && (!match[2] || match[2] === match[3]), '需要准确的 TAPD Markdown Wiki 链接');
  const [, workspaceId, , wikiId] = match;
  must(digitId(workspaceId) && Number.isSafeInteger(Number(workspaceId)) && digitId(wikiId), 'Wiki 链接的空间或页面 ID 无效');
  const response = await call('get_wiki', { workspace_id: Number(workspaceId), options: {
    id: wikiId, limit: 1, fields: 'id,workspace_id,name,parent_wiki_id,markdown_description',
  } });
  const data = apiData(response, 'get_wiki');
  const rows = Array.isArray(data) ? data : [data];
  const page = rows[0]?.Wiki;
  must(rows.length === 1 && asId(page?.id) === wikiId && asId(page.workspace_id) === workspaceId, 'Wiki 链接与实际页面不符');
  const { approval } = readMetadata(page);
  const scope = scopeOf(approval.scope);
  must(scope.workspaceId === workspaceId && scope.parentWikiId === asId(page.parent_wiki_id) && page.name === approval.title,
    'Wiki 链接与正式页的工作项、标题或目录不符');
  for (const key of ['workspaceId', 'storyId', 'bugId', 'parentWikiId']) {
    must(!Object.hasOwn(input, key) || input[key] === scope[key], 'Wiki 链接与指定的工作项或父目录不符');
  }
  const store = storage(call, scope);
  const result = await readConfirmed(scope, await store.load(), store);
  must(result.wikiId === wikiId, 'Wiki 链接与工作项的正式页不符');
  if (input.expectedRevision !== undefined) must(input.expectedRevision === result.revision, '执行 Plan 版本已变化，请核对差异');
  if (input.expectedApprovalFingerprint !== undefined) must(input.expectedApprovalFingerprint === result.approvalFingerprint, '执行 Plan 确认指纹已变化，请核对差异');
  return result;
}

// Selecting a bounded route and proving a Wiki revision are read-only. Neither
// step substitutes for the instruction to start in the active conversation.
export function executionFromPlan(plan, limit = 'AS_PLANNED', selection = {}) {
  must(['AS_PLANNED', 'IMPLEMENT_ONLY', 'NO_BUILD', 'BUILD_ONLY'].includes(limit), '本轮执行限制无效');
  const all = plan.featureIds;
  let features = all;
  for (const [field, depth] of [['selectedProjects', 1], ['selectedModules', 2], ['selectedFeatures', 3]]) {
    if (!Object.hasOwn(selection, field)) continue;
    const ids = selection[field], prefix = id => id.split('-').slice(0, depth).join('-');
    const available = new Set(features.map(prefix));
    must(Array.isArray(ids) && ids.length && ids.every(id => available.has(id)), '所选范围为空、超出已确认功能或与上级选择冲突：' + field);
    features = features.filter(id => ids.includes(prefix(id)));
  }
  const partial = features.length !== all.length;
  const selectedProjects = [...new Set(features.map(id => id.split('-')[0]))];
  const usesStartup = plan.delivery === null || Object.hasOwn(selection, 'startup');
  const startup = usesStartup ? selection.startup : undefined;
  const base = usesStartup ? startupDelivery(plan.featureProjects, selectedProjects, startup, limit) : plan.delivery;
  const gaps = {};
  for (const key of ['submit', 'build']) gaps[key] = (base.gaps?.[key] || []).filter(gap =>
    gap.startsWith('工作项 ') || selectedProjects.includes(gap.split(' ')[0]));
  const projects = base.projects.filter(p => selectedProjects.includes(p.id)).map(p => {
    if (!partial) return p;
    const branchIds = new Set(plan.featureProjects.filter(other => {
      let sameRepo;
      try { sameRepo = repositoryKey(other.repository) === repositoryKey(p.repository); }
      catch { sameRepo = true; } // Historical free-text locations need an exact reviewed diff.
      const branch = other.branch?.match(/(?:feature|fixbug)\/[^\s，、`（）]+/u)?.[0];
      return sameRepo && (!branch || branch === p.source);
    }).map(other => other.id));
    const inBranch = id => branchIds.has(id.split('-')[0]);
    const reviewedFeatures = features.filter(inBranch);
    return reviewedFeatures.length === all.filter(inBranch).length ? p : { ...p, reviewedFeatures };
  });
  const delivery = { ...base, projects, gaps };
  const submit = base.submit && !['IMPLEMENT_ONLY', 'BUILD_ONLY'].includes(limit) &&
    (base.legacy || projects.some(p => p.target) || gaps.submit.length > 0);
  const build = base.build && !['IMPLEMENT_ONLY', 'NO_BUILD'].includes(limit) &&
    (base.legacy || projects.some(p => p.release) || gaps.build.length > 0);
  const tapdPlan = { wikiUrl: plan.wikiUrl, expectedRevision: plan.revision,
    expectedApprovalFingerprint: plan.approvalFingerprint, limit, ...(partial ? { selectedFeatures: features } : {}) };
  if (usesStartup) {
    tapdPlan.startup = structuredClone(startup);
    tapdPlan.startupFingerprint = digest([plan.approvalFingerprint, limit, features, startup]);
  }
  const route = deliveryRoute(delivery, submit, build);
  if (partial && route.workflow === 'CONTINUOUS_SUBMIT') {
    route.workflow = 'DELIVERY_STEPS';
    route.separateBuilds = route.buildProjects;
  }
  if (limit === 'BUILD_ONLY' && !build) route.workflow = 'NO_ACTION';
  const next = route.workflow === 'NO_ACTION' ? 'NO_ACTION' : submit ? 'SUBMIT' : build ? 'BUILD_ONLY' : 'IMPLEMENT_ONLY';
  const handoff = [partial ? '仅执行 ' + features.join('、') : '',
    { IMPLEMENT_ONLY: '只开发验证', NO_BUILD: '不构建', BUILD_ONLY: '只构建' }[limit]].filter(Boolean).join('，');
  const startCommand = next === 'NO_ACTION' ? null : manualStartCommand(plan.wikiUrl, plan.revision, { ...delivery, submit, build }, handoff);
  const visualTests = plan.visualTests?.filter(test => features.includes(test.featureId));
  return { ...plan, tapdPlan, startCommand, delivery, submit, build, selectedProjects, selectedFeatures: features,
    partial, ...route, next, ...(visualTests && { visualTests }) };
}

export async function runStoryWiki(mode, input, call, claim = localClaim, now = new Date()) {
  must(['SESSION', 'PLAN', 'SAVE', 'CHECK', 'READ', 'START', 'PROGRESS', 'CHANGE'].includes(mode), '未知执行计划模式');
  if (mode === 'SESSION') {
    must(typeof input.markdown === 'string' && input.markdown.trim(), '会话输出需要评审正文');
    return { state: 'SESSION', markdown: input.markdown };
  }
  if (mode === 'START') {
    must(['IMMEDIATE', 'MANUAL'].includes(input.startMode), '开工需要明确立即执行或手动执行');
    if (input.startMode === 'IMMEDIATE') {
      must(Number.isSafeInteger(input.expectedRevision) && sha(input.expectedApprovalFingerprint), '立即执行须绑定刚确认的版本与指纹');
    }
    for (const key of Object.keys(input)) {
      if (/^selected|^(?:scope|projectIds|moduleIds|featureIds)$/.test(key)) {
        must(['selectedProjects', 'selectedModules', 'selectedFeatures'].includes(key), '无法识别的开工范围字段：' + key);
      }
    }
    const plan = await readByUrl(input, call);
    const started = executionFromPlan(plan, input.limit, input);
    if (input.checkAcceptancePaths === true) {
      started.acceptanceReview = readAcceptanceReview(plan.markdown, plan, started.selectedFeatures);
    }
    return { ...started, startMode: input.startMode };
  }
  if (Object.hasOwn(input, 'wikiUrl')) {
    must(mode === 'READ', 'Wiki 链接用于读取确认上下文，写入请绑定原工作项和版本');
    return readByUrl(input, call);
  }
  const scope = scopeOf(input);
  const { workspaceId, parentWikiId } = scope;
  const item = owner(scope);
  let markdown = input.markdown;
  const { actor } = input;
  const store = storage(call, scope);
  let draftSchema;
  let draftVisualTests;
  let acceptanceReview;
  if (['SAVE', 'PLAN', 'CHECK'].includes(mode)) {
    must(typeof markdown === 'string' && oneLine(actor), '需要完整 Markdown 和已核实 TAPD 操作者');
    const validated = validatePlan(markdown, scope, mode === 'PLAN' ? input.schema ?? 4 : input.approval?.schema);
    ({ schema: draftSchema, visualTests: draftVisualTests } = validated);
    if (mode === 'PLAN' && input.checkAcceptancePaths === true) acceptanceReview = readAcceptanceReview(markdown, scope);
    parts(markdown);
  }
  const state = await store.load();
  if (mode === 'READ') return readConfirmed(scope, state, store);
  const { current, page, parentName, itemName } = state;
  const wikiId = asId(page?.id);
  const records = wikiId && recordStorage(store, scope, wikiId, claim);
  if (mode === 'CHANGE' || mode === 'PROGRESS' && current?.approval.schema === 4) {
    return recordEvent(mode, input, scope, store, state, records, claim, now);
  }
  if (mode === 'PROGRESS') {
    publicRead(scope, state);
    must(input.visualAcceptance === undefined, '旧版进度格式无法保存结构化视觉回执，请在交付清单提交核实的回执');
    const { receiptId, entry, evidence, executionStatus, expectedPageSha256, expectedApprovalFingerprint } = input;
    must(input.progressAuthorized === true && expectedApprovalFingerprint === current.approvalFingerprint && sha(expectedPageSha256)
      && typeof receiptId === 'string' && receiptIdPattern.test(receiptId)
      && oneLine(entry) && oneLine(evidence), '进度回填需要授权、同一确认版、全页指纹、稳定回执编号和单行证据');
    must(current.approval.schema < 4 || (executionStatus === undefined && !/｜执行状态 \S+$/.test(evidence)),
      '新版执行记录请填写实际回执及依据');
    const prefix = `- [${receiptId}] `;
    const line = `${prefix}${entry}｜依据 ${evidence}${executionStatus ? `｜执行状态 ${executionStatus}` : ''}`;
    const { plan, history } = parts(current.markdown);
    const duplicates = history.split(/\r?\n/).filter(row => row.startsWith(prefix));
    if (duplicates.length) {
      must(duplicates.length === 1 && duplicates[0] === line, '同一回执编号已有不同记录');
      return publicRead(scope, state);
    }
    must(current.pageSha256 === expectedPageSha256, '进度基版已变化，请 READ 后按最新正文复核');
    let updated = plan;
    if (executionStatus !== undefined) {
      const cell = managedCell(plan, '执行状态', statuses, executionStatus);
      const from = statuses.indexOf(cell.actual), to = statuses.indexOf(executionStatus);
      must(to >= from && to <= from + 1, '执行状态只允许按真实进度顺序流转');
      updated = cell.text;
    }
    updated += history + (history.endsWith('\n') ? '' : '\n') + line + '\n';
    validatePlan(updated, scope, current.approval.schema);
    const body = pack(current.approval, updated);
    const latest = await store.byId(wikiId);
    must(latest.name === page.name && asId(latest.parent_wiki_id) === parentWikiId && hash(latest.markdown_description) === expectedPageSha256, '更新进度前发现 Wiki 已变化');
    await attempt(claim, [scope, 'replace', wikiId, expectedPageSha256],
      () => store.run('update_wiki', { id: wikiId, markdown_description: body }),
      async () => (await store.byId(wikiId)).markdown_description === body);
    return publicRead(scope, await store.load());
  }

  let change = input.approval?.change;
  if (mode === 'PLAN' && draftSchema === 4) {
    const draft = parts(markdown);
    const previous = current && parts(current.markdown);
    must(!draft.history.trim() || draft.history === previous?.history, '执行回执单独使用 PROGRESS 回填');
    markdown = draft.body;
    // Resuming a previously approved inline Wiki still uses its original approval.
    if (current?.approval.schema === 4 && markdown === previous.body && !current.record) markdown = current.markdown;
    if (input.change !== undefined || input.changeId !== undefined) {
      must(current && markdown !== current.markdown && !(input.change !== undefined && input.changeId !== undefined),
        '计划变更只绑定已存在计划的实际修订，请指定一个待确认变更或完整说明');
      const previousRecord = current.record && await records.find(current.record.id);
      const pending = previousRecord?.model.changes.find(row => row.id === input.changeId);
      must(input.changeId === undefined || pending && !pending.confirmation?.commentId, '无法核实此计划下待确认的变更');
      const proposal = proposedChange(input.change ?? pending);
      const existing = previousRecord?.model.changes.find(row => row.id === proposal.id);
      change = { ...proposal, occurredAt: proposal.occurredAt ?? existing?.occurredAt ?? recordTime(now) };
      must(!existing || same(change, proposedChange(existing)), '同一变更编号已有不同内容');
    }
  }

  // Completed rN keeps its original progress in its verified archive. A
  // substantive revision starts at 待执行; PLAN exposes the exact reset body.
  const restart = draftSchema < 4 && current?.executionStatus === '已上线' &&
    executionDefinition(markdown) !== executionDefinition(current.markdown);
  if (mode === 'PLAN' && restart || input.approval?.restartsExecution && hash(markdown) !== input.approval.bodySha256) {
    const draft = parts(markdown);
    const status = draftSchema < 4 ? managedCell(draft.plan, '执行状态', statuses, '待执行') : null;
    if (restart && (mode === 'PLAN' || input.approval?.previousPageSha256 === current.pageSha256)) must(draft.history === parts(current.markdown).history ||
      (!draft.history.trim() && (!status || status.actual === '待执行')), '新版开始前须保留可归档的原记录或使用确认稿');
    markdown = (status?.text ?? draft.plan) + '\n';
  }
  const makeApproval = (schema, title) => {
    if (current && current.markdown === markdown) return current.approval;
    const { executionStatus: status } = validatePlan(markdown, scope, schema);
    const next = parts(markdown);
    if (current) {
      publicRead(scope, state);
      const previous = parts(current.markdown);
      must(schema === 4 && !next.history.trim() || restart || (next.history === previous.history && (schema === 4 || current.executionStatus === status)),
        '修订执行范围时须保留完整现有执行记录与顶部状态，单独使用 PROGRESS 回填');
      must((schema === 4 ? next.body !== previous.body : planHash(markdown, schema) !== current.approval.planSha256),
        '只有进度/受管状态变化时请使用 PROGRESS');
    } else must((schema === 4 || status === '待执行') && !next.history.trim(), '初版须使用空执行记录，核实实际证据后再回填');
    return { schema, scope, parentName, title: current?.approval.title ?? title, actor, ...(restart ? { restartsExecution: true } : {}), revision: (current?.approval.revision ?? 0) + 1,
      previousWikiId: wikiId, previousPageSha256: page ? hash(page.markdown_description) : null,
      ...(page && !current ? { previousDraftTitle: page.name } : {}), ...(change && { change }),
      bodySha256: hash(markdown), planSha256: planHash(markdown, schema) };
  };
  if (mode === 'PLAN') {
    if (current?.markdown === markdown && state.linkedId && state.approvalCommentId) {
      return { ...await readConfirmed(scope, state, store), action: 'REUSE', ...(acceptanceReview && { acceptanceReview }) };
    }
    if (draftSchema === 4 && current && current.markdown !== markdown) {
      must(input.expectedPageSha256 === current.pageSha256, '同页修订须绑定最新 READ 的全页指纹，请基于当前正文和执行记录调整');
    }
    must(current || oneLine(itemName), '无法核实工作项标题以生成执行 Wiki 页名');
    const title = current?.approval.title ?? `${chinaDate(now).day}: ${itemName.trim()}`;
    const approval = makeApproval(draftSchema, title);
    const changed = current?.markdown !== markdown;
    const operations = !page ? ['CREATE_WIKI'] : !current ? ['ARCHIVE_DRAFT', 'ADOPT_WIKI']
      : changed ? ['ARCHIVE_PREVIOUS', 'UPDATE_WIKI'] : [];
    if (draftSchema === 4) {
      if (!current?.record) operations.push('UPSERT_EXECUTION_RECORD_WIKI', 'LINK_EXECUTION_RECORD_WIKI');
      if (changed && current) operations.push('RECORD_PLAN_CHANGE');
    }
    const needReceipt = changed || !state.approvalCommentId;
    const combine = needReceipt && !state.linkedId && approval.revision === 1;
    if (needReceipt) operations.push(combine ? 'ADD_LINK_AND_APPROVAL_RECEIPT' : 'ADD_APPROVAL_RECEIPT');
    if (!combine && !state.linkedId) operations.push('ADD_LINK');
    return { state: 'PREVIEW', action: !page ? 'CREATE' : !current ? 'ADOPT' : changed ? 'UPDATE' : 'REUSE',
      operations, approval, markdown, fingerprint: digest(approval), wikiTitle: approval.title, wikiId, wikiUrl: wikiId ? link(workspaceId, wikiId) : null,
      linked: !!state.linkedId, ...(acceptanceReview && { acceptanceReview }), ...(draftVisualTests && { visualTests: draftVisualTests }) };
  }
  const { approval, confirmedFingerprint } = input;
  must(approval && [1, 2, 3, 4].includes(approval.schema) && same(approval.scope, scope) && validTitle(approval.title, item)
    && approval.parentName === parentName && oneLine(approval.actor) && approval.actor === actor && sha(confirmedFingerprint)
    && digest(approval) === confirmedFingerprint && approval.bodySha256 === hash(markdown) && approval.planSha256 === planHash(markdown, approval.schema),
    '必须携带同一正文、目标和操作者的完整已确认 PLAN 指纹');
  if (change !== undefined) must(approval.schema === 4 && approval.revision > 1 && same(proposedChange(change), change), '计划变更的确认资料不完整');
  const applied = current?.approvalFingerprint === confirmedFingerprint;
  if (mode === 'CHECK') {
    let result = !applied ? 'UNVERIFIED' : state.linkedId && state.approvalCommentId ? 'CONFIRMED' : 'WIKI_VERIFIED_LINK_PENDING';
    if (applied && approval.schema === 4) {
      const journal = current.record && await records.find(current.record.id);
      if (!journal || result === 'CONFIRMED' && approval.revision > 1 && !journal.model.changes.some(row =>
        row.confirmation?.fingerprint === confirmedFingerprint && row.confirmation.commentId === state.approvalCommentId)) {
        result = 'WIKI_VERIFIED_RECORD_PENDING';
      }
    }
    return { state: result, wikiId, linked: !!state.linkedId, approvalCommentId: state.approvalCommentId, approvalFingerprint: confirmedFingerprint };
  }
  if (!applied) {
    if (!current && approval.title !== item.legacyTitle) {
      must(oneLine(itemName) && datedTitle.exec(approval.title)[1] === itemName.trim(), '工作项标题已变化，请重新预览并确认页名');
    }
    must(same(makeApproval(approval.schema, approval.title), approval), '目标或原正文已变化，请重新预览并确认');
  }
  let savedId = wikiId;
  const recordsRequired = approval.schema === 4;
  const changeDraft = recordsRequired && approval.revision > 1 ? change ?? {
    id: 'plan.r' + approval.revision + '.' + confirmedFingerprint.slice(0, 16),
    title: '修订执行计划', proposer: '待核实',
    detail: '更新计划正文，具体变更见已确认计划及上一版归档。',
    impact: '按新版中受影响的功能和验收项核对。',
  } : null;
  let snapshot;
  const { title } = approval;
  const naming = title === item.legacyTitle ? { name: title } : { name: title, note: item.legacyTitle };
  if (!applied && page) {
    const baseline = approval.previousPageSha256;
    const archiveTitle = (current ? '第 ' + current.approval.revision + ' 版归档' : '草稿归档') + ' · ' + recordTime(now);
    snapshot = await lookupArchive(store, wikiId, current?.approval.revision, baseline);
    if (snapshot) must(snapshot.markdown_description === page.markdown_description, '历史页已存在但与原文不同');
    else snapshot = await attempt(claim, [scope, 'archive', wikiId, baseline],
      () => store.run('create_wiki', { name: archiveTitle, note: archiveNote(wikiId, baseline), parent_wiki_id: wikiId,
        creator: actor, markdown_description: page.markdown_description }),
      async () => {
        const found = await lookupArchive(store, wikiId, current?.approval.revision, baseline);
        return found?.markdown_description === page.markdown_description && found;
      });
    const latest = await store.byId(wikiId);
    must(latest.name === page.name && asId(latest.parent_wiki_id) === parentWikiId &&
      latest.markdown_description === page.markdown_description, '归档后 Wiki 已变化，保留人工改动并重新确认');
    let recordRef;
    if (recordsRequired) {
      const journal = await records.ensure(current, actor);
      if (changeDraft) await records.update(journal, addChange(journal.model, changeDraft, now,
        { at: recordTime(now), actor, fingerprint: confirmedFingerprint }), () => ensurePlanUnchanged(store, page));
      await ensurePlanUnchanged(store, page);
      recordRef = boundRecord(journal, markdown);
    }
    const body = pack(approval, markdown, recordRef);
    await attempt(claim, [scope, 'replace', wikiId, baseline],
      () => store.run('update_wiki', { id: wikiId, ...(!current ? naming : {}), markdown_description: body }),
      async () => {
        const found = await store.byId(wikiId);
        return found.name === title && asId(found.parent_wiki_id) === parentWikiId && found.markdown_description === body;
      });
  } else if (!applied) {
    const body = pack(approval, markdown);
    const saved = await attempt(claim, [scope, 'create'],
      () => store.run('create_wiki', { ...naming, parent_wiki_id: parentWikiId, creator: actor, markdown_description: body }),
      async () => {
        const found = naming.note ? await store.byNote() : await store.byName(title, parentWikiId);
        return found?.name === title && found.markdown_description === body && found;
      });
    savedId = asId(saved.id);
  }
  let verified = await store.load();
  must(asId(verified.page?.id) === savedId && verified.current?.approvalFingerprint === confirmedFingerprint, '固定入口和正文确认版本读回不一致');
  const savedRecords = recordsRequired && recordStorage(store, scope, savedId, claim);
  if (savedRecords && !verified.current.record) {
    const journal = await savedRecords.ensure(verified.current, actor);
    verified = await attachRecord(store, scope, verified, journal, claim);
    must(verified.current?.approvalFingerprint === confirmedFingerprint, '建立记录入口后确认版已变化');
  }
  if (!verified.approvalCommentId) {
    const backlink = !verified.linkedId && approval.revision === 1 ? backlinkBody(item, workspaceId, savedId) + ' ｜ ' : '';
    const description = backlink + approvalMarker + `${savedId}:r${approval.revision}:${confirmedFingerprint}`;
    verified = await attempt(claim, [scope, 'approve', savedId, approval.revision],
      () => store.run('create_comments', { entry_type: item.type, entry_id: item.id, author: actor, description }),
      async () => {
        const readback = await store.load();
        return readback.current?.approvalFingerprint === confirmedFingerprint && readback.approvalCommentId &&
          (!backlink || readback.linkedId === savedId && readback.linkedClickable) && readback;
      });
  }
  if (!verified.linkedId) {
    await attempt(claim, [scope, 'link', savedId],
      () => store.run('create_comments', { entry_type: item.type, entry_id: item.id, author: actor,
        description: backlinkBody(item, workspaceId, savedId) }),
      async () => {
        const readback = await store.load();
        return readback.linkedId === savedId && readback.linkedClickable;
      });
  }
  const finished = await store.load();
  const result = publicRead(scope, finished);
  must(result.approvalFingerprint === confirmedFingerprint, '完成核验时确认版已变化');
  if (changeDraft) {
    snapshot ??= await lookupArchive(store, savedId, approval.revision - 1, approval.previousPageSha256);
    must(snapshot && hash(snapshot.markdown_description) === approval.previousPageSha256, '无法核实本次变更的上一版归档');
    const journal = await savedRecords.find(finished.current.record.id);
    const confirmation = { at: recordTime(now), actor, fingerprint: confirmedFingerprint,
      revision: approval.revision, commentId: finished.approvalCommentId, archiveUrl: link(workspaceId, asId(snapshot.id)) };
    await savedRecords.update(journal, addChange(journal.model, changeDraft, now, confirmation),
      () => ensurePlanUnchanged(store, finished.page));
  }
  return readConfirmed(scope, finished, store);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  let client;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (mode !== 'SESSION') {
      client = new StdioMcpClient();
      await client.initialize();
    }
    const result = await runStoryWiki(mode, input, client?.call.bind(client));
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write((error.code ? error.code + ' ' : '') + error.message + '\n');
    process.exitCode = 1;
  } finally { await client?.close(); }
}
