#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { StdioMcpClient } from '../../../scripts/mcp-client.mjs';
export { StdioMcpClient } from '../../../scripts/mcp-client.mjs';
const DEFAULT_ROOT_WIKI_ID = '1150372234001008260';
const DEFAULT_WORKSPACE_ID = 50372234;
const PAGE_SIZE = 100;

export function parseArgs(argv) {
  const values = {};
  const allowed = new Set([
    '--tapd-url', '--workspace-id', '--entry-type', '--entry-id', '--source-branch',
    '--creator', '--comment-author', '--body-file', '--wiki-title',
    '--month', '--root-wiki-id', '--expect-target', '--expected-month-id',
    '--expected-wiki-id', '--expected-body-sha256', '--mode',
    '--execute', '--json',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!allowed.has(key) || Object.hasOwn(values, key)) throw new Error(`无效或重复参数：${key}`);
    if (key === '--execute' || key === '--json') values[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`缺少 ${key} 的值`);
      values[key] = value;
    }
  }
  if (values['--tapd-url']) {
    if (['--workspace-id', '--entry-type', '--entry-id'].some(key => values[key])) {
      throw new Error('--tapd-url 不能与 workspace/type/ID 参数混用');
    }
    let url;
    try { url = new URL(values['--tapd-url']); } catch { throw new Error('TAPD URL 无效'); }
    const match = url.pathname.match(/^\/tapd_fe\/(\d+)\/(story|task|bug)\/detail\/(\d+)\/?$/);
    if (!/^(?:www\.)?tapd\.cn$/.test(url.hostname) || !match) {
      throw new Error('请提供完整 TAPD Story/Task/Bug 详情 URL');
    }
    values['--workspace-id'] = match[1];
    values['--entry-type'] = { story: 'stories', task: 'tasks', bug: 'bug' }[match[2]];
    values['--entry-id'] = match[3];
  }
  for (const key of ['--workspace-id', '--entry-type', '--entry-id', '--source-branch']) {
    if (!values[key]) throw new Error(`缺少必填参数 ${key}`);
  }
  if (!/^\d+$/.test(values['--workspace-id']) || !/^\d+$/.test(values['--entry-id'])) {
    throw new Error('workspace-id 和 entry-id 必须是数字');
  }
  if (!['stories', 'tasks', 'bug'].includes(values['--entry-type'])) {
    throw new Error('entry-type 只能是 stories、tasks 或 bug');
  }
  if (!/^(feature|fixbug)\/[^\s]+$/.test(values['--source-branch'])) {
    throw new Error('source-branch 必须是原始 feature/* 或 fixbug/* 分支');
  }
  if (values['--month'] && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values['--month'])) {
    throw new Error('month 必须是 YYYY-MM');
  }
  if (values['--root-wiki-id'] && !/^\d+$/.test(values['--root-wiki-id'])) {
    throw new Error('root-wiki-id 必须是数字');
  }
  if (values['--expect-target'] &&
      !['REUSE_EXISTING', 'CREATE_CHILD', 'CREATE_MONTH_AND_CHILD'].includes(values['--expect-target'])) {
    throw new Error('expect-target 必须是 REUSE_EXISTING、CREATE_CHILD 或 CREATE_MONTH_AND_CHILD');
  }
  for (const key of ['--expected-month-id', '--expected-wiki-id']) {
    if (values[key] && !/^\d+$/.test(values[key])) throw new Error(`${key} 必须是数字`);
  }
  if (values['--expected-body-sha256'] && !/^[a-f\d]{64}$/i.test(values['--expected-body-sha256'])) {
    throw new Error('expected-body-sha256 必须是原正文的 SHA-256');
  }
  if (values['--mode'] && !['ensure', 'link', 'update'].includes(values['--mode'])) {
    throw new Error('mode 只能是 ensure、link 或 update');
  }
  if (values['--mode'] === 'link' && (!values['--expected-wiki-id'] || values['--body-file'])) {
    throw new Error('link 模式必须指定 --expected-wiki-id，且不能提供 --body-file');
  }
  if (values['--mode'] === 'update' && !values['--expected-wiki-id']) throw new Error('update 模式必须指定 --expected-wiki-id');
  return {
    workspaceId: Number(values['--workspace-id']),
    entryType: values['--entry-type'],
    entryId: values['--entry-id'],
    sourceBranch: values['--source-branch'],
    creator: values['--creator'],
    commentAuthor: values['--comment-author'] || values['--creator'],
    bodyFile: values['--body-file'],
    wikiTitle: values['--wiki-title'],
    month: values['--month'],
    rootWikiId: values['--root-wiki-id'],
    expectTarget: values['--expect-target'],
    expectedMonthId: values['--expected-month-id'],
    expectedWikiId: values['--expected-wiki-id'],
    expectedBodySha256: values['--expected-body-sha256']?.toLowerCase(),
    mode: values['--mode'] || 'ensure',
    execute: Boolean(values['--execute']),
    json: Boolean(values['--json']),
  };
}

export function chinaDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { month: `${parts.year}-${parts.month}`, day: `${parts.month}-${parts.day}` };
}

export function contentHash(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function decode(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function walk(value, visit, depth = 0) {
  if (depth > 8) return;
  value = decode(value);
  visit(value);
  if (Array.isArray(value)) value.forEach(item => walk(item, visit, depth + 1));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'markdown_description' && key !== 'description') walk(item, visit, depth + 1);
    }
  }
}

export function records(result, kind) {
  let found;
  walk(result, value => {
    if (!found && Array.isArray(value) && value.some(item => item?.[kind])) {
      found = value.map(item => item[kind]).filter(Boolean);
    } else if (!found && value && typeof value === 'object' &&
        !Array.isArray(value) && value[kind] && typeof value[kind] === 'object') {
      found = [value[kind]];
    }
  });
  return found || [];
}

function createdId(result, kind) {
  const wrapped = records(result, kind)[0]?.id;
  if (wrapped) return wrapped;
  const ids = new Set();
  walk(result, value => {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        /^\d+$/.test(String(value.id || ''))) ids.add(String(value.id));
  });
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function totalCount(result) {
  let count;
  walk(result, value => {
    if (count === undefined && value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.count === null || value.count === undefined || value.count === '') return;
      const n = Number(value.count);
      if (Number.isSafeInteger(n) && n >= 0) count = n;
    }
  });
  return count;
}

function assertSuccess(result, tool) {
  if (result?.isError) throw new Error(`${tool} 调用失败`);
  let failed = false;
  walk(result, value => {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        Object.hasOwn(value, 'status') && Object.hasOwn(value, 'data') &&
        String(value.status) !== '1') failed = true;
  });
  if (failed) throw new Error(`${tool} 返回失败状态`);
  return result;
}

function checkedRecords(result, kind, tool) {
  assertSuccess(result, tool);
  const rows = records(result, kind);
  if (rows.length) return rows;
  let empty = false;
  walk(result, value => {
    if (value && String(value.status) === '1' && Array.isArray(value.data) && !value.data.length) empty = true;
  });
  if (!empty) throw new Error(`${tool} 未返回可识别的 ${kind} 数据，不能判定目标不存在`);
  return [];
}

export function wikiIdsFromComments(comments, workspaceId) {
  const ids = new Set();
  const otherWorkspace = new Set();
  for (const comment of comments) {
    const body = String(comment.description || '')
      .replace(/&amp;/gi, '&').replace(/&#(?:35|x23);/gi, '#')
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
      .replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<(https?:\/\/[^>]+)>/gi, '$1').replace(/<[^>]*>/g, '');
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const marker = lines[i].search(/提测\s*(?:wiki|文档)/i);
      if (marker < 0) continue;
      let marked = lines[i].slice(marker);
      if (/^提测\s*(?:wiki|文档)\s*[:：]?\s*$/i.test(marked)) marked += lines[i + 1] || '';
      const pattern = /https?:\/\/(?:www\.)?tapd\.cn\/(\d+)\/markdown_wikis\/show\/(?:#|%23)(\d+)/gi;
      for (const match of marked.matchAll(pattern)) {
        if (match[1] === String(workspaceId)) ids.add(match[2]);
        else otherWorkspace.add(match[1]);
      }
    }
  }
  if (otherWorkspace.size) throw new Error('详情或评论含其他 TAPD 空间的提测 Wiki 链接');
  return [...ids];
}

async function listAllComments(call, workspaceId, entryType, entryId) {
  const all = [];
  const seenIds = new Set();
  for (let page = 1; page <= 20; page++) {
    const result = assertSuccess(await call('get_comments', {
      workspace_id: workspaceId,
      options: { entry_type: entryType, entry_id: entryId, limit: PAGE_SIZE, page,
        fields: 'id,description,created', order: 'created ASC' },
    }), 'get_comments');
    const rows = checkedRecords(result, 'Comment', 'get_comments');
    for (const row of rows) {
      if (!row.id || seenIds.has(String(row.id))) throw new Error('评论分页重复或缺少 ID，停止查询');
      seenIds.add(String(row.id));
    }
    all.push(...rows);
    const count = totalCount(result);
    if (count !== undefined && (count < all.length || (rows.length < PAGE_SIZE && count > all.length))) {
      throw new Error('评论数量与分页结果不一致，停止执行');
    }
    if (count !== undefined ? all.length >= count : rows.length < PAGE_SIZE) return all;
  }
  throw new Error('评论超过 20 页，停止自动创建 Wiki');
}

async function wikiById(call, workspaceId, id) {
  const result = assertSuccess(await call('get_wiki', {
    workspace_id: workspaceId, options: { id, limit: 1 },
  }), 'get_wiki');
  const matches = checkedRecords(result, 'Wiki', 'get_wiki').filter(wiki => String(wiki.id) === String(id));
  if (matches.length !== 1) throw new Error(`Wiki ${id} 不存在或结果不唯一`);
  return matches[0];
}

async function wikiByName(call, workspaceId, name, parentId) {
  const result = assertSuccess(await call('get_wiki', {
    workspace_id: workspaceId,
    options: { name, limit: PAGE_SIZE, fields: 'id,name,parent_wiki_id,markdown_description,creator' },
  }), 'get_wiki');
  const count = totalCount(result);
  const rows = checkedRecords(result, 'Wiki', 'get_wiki');
  if (count !== undefined ? count > PAGE_SIZE : rows.length >= PAGE_SIZE) {
    throw new Error(`Wiki 标题 ${name} 查询结果不完整，停止自动选择`);
  }
  const matches = rows.filter(wiki =>
    wiki.name === name && String(wiki.parent_wiki_id) === String(parentId));
  if (matches.length > 1) throw new Error(`父页 ${parentId} 下有多个同名 Wiki：${name}`);
  return matches[0];
}

function assertBranch(wiki, sourceBranch) {
  if (!hasBranchEntry(wiki.markdown_description, sourceBranch)) {
    throw new Error(`Wiki ${wiki.id} 未包含原分支 ${sourceBranch}，不能判定属于本次交付`);
  }
}

function hasBranchEntry(body, sourceBranch) {
  return branchEntryCount(body, sourceBranch) === 1;
}

function branchEntryCount(body, sourceBranch) {
  return String(body || '').split(/\r?\n/).filter(line => {
    const match = line.match(/^\s*-\s*代码分支名\s*[:：]\s*(\S+)\s*$/);
    return match?.[1] === sourceBranch;
  }).length;
}

function wikiUrl(workspaceId, wikiId) {
  return `https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#${wikiId}`;
}

function commentBody(workspaceId, wikiId) {
  const url = wikiUrl(workspaceId, wikiId);
  return `提测wiki：[${url}](${url})`;
}

async function createAndReadWiki(call, workspaceId, options, parentId, onCreated) {
  const created = assertSuccess(await call('create_wiki', {
    workspace_id: workspaceId, options: { ...options, parent_wiki_id: String(parentId) },
  }), 'create_wiki');
  const id = createdId(created, 'Wiki');
  if (!id) throw new Error(`Wiki ${options.name} 创建结果没有 ID；不要盲目重试`);
  onCreated(String(id));
  const wiki = await wikiById(call, workspaceId, id);
  if (wiki.name !== options.name || String(wiki.parent_wiki_id) !== String(parentId) ||
      (options.markdown_description !== undefined &&
        wiki.markdown_description !== options.markdown_description)) {
    throw new Error(`Wiki ${id} 创建后读回不一致`);
  }
  return wiki;
}

export async function ensureTestWiki(call, input, now = new Date()) {
  const { workspaceId, entryType, entryId, sourceBranch, execute } = input;
  const mode = input.mode || 'ensure';
  if (!['ensure', 'link', 'update'].includes(mode)) throw new Error('mode 只能是 ensure、link 或 update');
  if (mode === 'link' && (!input.expectedWikiId || input.bodyFile)) {
    throw new Error('link 模式必须指定 --expected-wiki-id，且不能提供 --body-file');
  }
  if (mode === 'update' && !input.expectedWikiId) throw new Error('update 模式必须指定 --expected-wiki-id');
  const itemTool = entryType === 'bug' ? 'get_bug' : 'get_stories_or_tasks';
  const itemOptions = entryType === 'bug'
    ? { id: entryId, limit: 1, fields: 'id,title,description' }
    : { entity_type: entryType, id: entryId, limit: 1, fields: 'id,name,description' };
  const [itemResult, comments, approvedBody, boundWiki] = await Promise.all([
    mode === 'update' ? undefined : call(itemTool, { workspace_id: workspaceId, options: itemOptions }),
    mode === 'update' ? [] : listAllComments(call, workspaceId, entryType, entryId),
    input.bodyFile ? readFile(input.bodyFile, 'utf8') : undefined,
    input.expectedWikiId ? wikiById(call, workspaceId, input.expectedWikiId) : undefined,
  ]);
  const itemKind = entryType === 'bug' ? 'Bug' : entryType === 'tasks' ? 'Task' : 'Story';
  const item = mode === 'update' ? { id: entryId }
    : checkedRecords(itemResult, itemKind, itemTool).find(row => String(row.id) === String(entryId));
  if (!item) throw new Error(`TAPD ${entryType} ${entryId} 不存在`);
  const commentIds = wikiIdsFromComments(comments, workspaceId);
  const detailIds = wikiIdsFromComments([{ description: item.description }], workspaceId);
  const linkedIds = [...new Set([
    ...detailIds, ...commentIds,
  ])];
  if (linkedIds.length > 1) throw new Error('详情或评论存在多个不同的提测 Wiki 链接，停止自动选择');
  if (input.expectedWikiId && linkedIds.length && linkedIds[0] !== String(input.expectedWikiId)) {
    throw new Error('当前 Wiki ID 与确认计划不一致');
  }
  const date = chinaDate(now);
  const month = input.month || date.month;
  const rootWikiId = input.rootWikiId ||
    (workspaceId === DEFAULT_WORKSPACE_ID ? DEFAULT_ROOT_WIKI_ID : undefined);
  const title = input.wikiTitle || `${date.day}: ${item.name || item.title}`;
  let child = boundWiki || (linkedIds.length ? await wikiById(call, workspaceId, linkedIds[0]) : undefined);
  let monthWiki;
  if (!child) {
    if (!rootWikiId) throw new Error('此 TAPD 空间没有默认提测文档根页；需提供 --root-wiki-id');
    monthWiki = input.expectedMonthId
      ? await wikiById(call, workspaceId, input.expectedMonthId)
      : await wikiByName(call, workspaceId, month, rootWikiId);
    if (monthWiki && (monthWiki.name !== month || String(monthWiki.parent_wiki_id) !== String(rootWikiId))) {
      throw new Error('月份 Wiki 名称或父页与确认计划不一致');
    }
    child = monthWiki && await wikiByName(call, workspaceId, title, monthWiki.id);
  }
  if (child) {
    if (String(child.id) === String(rootWikiId) || /^\d{4}-\d{2}$/.test(child.name)) {
      throw new Error('Wiki 目标是根页或月份目录，不能作为提测子页');
    }
    if (input.wikiTitle && child.name !== input.wikiTitle) throw new Error('Wiki 标题与确认计划不一致');
    if (input.expectedMonthId && String(child.parent_wiki_id) !== String(input.expectedMonthId)) {
      throw new Error('月份 Wiki ID 与确认计划不一致');
    }
    if (branchEntryCount(child.markdown_description, sourceBranch) > 1) {
      throw new Error('已有 Wiki 存在重复的原分支条目，停止自动补充');
    }
    // A linked work item may add a new branch entry to its existing shared Wiki.
    if (!(mode === 'ensure' && approvedBody !== undefined && linkedIds.includes(String(child.id)))) {
      assertBranch(child, sourceBranch);
    }
  }
  if (approvedBody !== undefined && (!approvedBody.trim() || !hasBranchEntry(approvedBody, sourceBranch))) {
    throw new Error('Wiki 正文必须非空并且只有一个准确的“代码分支名：<原分支>”行');
  }
  const target = child ? 'REUSE_EXISTING' : monthWiki ? 'CREATE_CHILD' : 'CREATE_MONTH_AND_CHILD';
  if (input.expectTarget && input.expectTarget !== target) {
    throw new Error(`Wiki 目标动作变为 ${target}，与确认计划不一致`);
  }
  const beforeBody = child?.markdown_description;
  if (child && typeof beforeBody !== 'string') throw new Error('已有 Wiki 缺少可验证的 Markdown 正文');
  const beforeBodySha256 = child ? contentHash(beforeBody) : null;
  const wikiOperation = child ? (approvedBody !== undefined && approvedBody !== beforeBody ? 'UPDATE' : 'NONE') : 'CREATE';
  const commentOperation = mode === 'update' || (child && commentIds.includes(String(child.id))) ? 'NONE' : 'CREATE';
  const noWrite = wikiOperation === 'NONE' && commentOperation === 'NONE';
  if (input.expectedBodySha256 && input.expectedBodySha256.toLowerCase() !== beforeBodySha256 &&
      !(noWrite && approvedBody === beforeBody)) {
    throw new Error('Wiki 原正文已变化，与确认计划的 SHA-256 不一致');
  }
  const plan = {
    workspaceId, entryType, entryId, sourceBranch,
    target, month: child ? input.month || null : month,
    rootWikiId: child ? null : String(rootWikiId),
    monthWikiId: child ? String(child.parent_wiki_id) : monthWiki ? String(monthWiki.id) : null,
    wikiId: child ? String(child.id) : null, wikiUrl: child ? wikiUrl(workspaceId, child.id) : null,
    wikiTitle: child ? child.name : title,
    beforeBody, beforeBodySha256, wikiOperation, commentOperation,
    commentEvidence: { checked: mode !== 'update', checkedCount: comments.length, wikiIds: commentIds, detailWikiIds: detailIds },
    comment: mode === 'update' ? null : child ? commentBody(workspaceId, child.id) : '创建后用实际 Wiki ID 生成链接',
  };
  if (!execute) return {
    ...plan, state: mode === 'update' && wikiOperation === 'NONE' ? 'UNCHANGED'
      : wikiOperation === 'UPDATE' ? 'PLANNED_UPDATE'
      : child ? (noWrite ? 'ALREADY_LINKED' : 'PLANNED_LINK')
        : monthWiki ? 'PLANNED_CREATE_CHILD' : 'PLANNED_CREATE_MONTH_AND_CHILD', writes: 0,
  };
  if (!noWrite) {
    if (!input.expectTarget) throw new Error('写入前必须提供确认计划中的 --expect-target');
    if (child && (!input.expectedWikiId || !input.expectedBodySha256 || !input.expectedMonthId || !input.wikiTitle)) {
      throw new Error('已有 Wiki 写入必须提供 --expected-wiki-id、--expected-body-sha256、--expected-month-id 和 --wiki-title');
    }
    if (!child && (!input.month || !input.wikiTitle || !input.creator || approvedBody === undefined)) {
      throw new Error('创建必须固定计划中的 --month、--wiki-title、--creator 和 --body-file');
    }
    if (!child && monthWiki && !input.expectedMonthId) {
      throw new Error('已有月份必须提供确认计划中的 --expected-month-id');
    }
    if (mode !== 'update' && !input.commentAuthor && !input.creator) throw new Error('写入前必须提供评论人 --comment-author 或 --creator');
  }

  const result = {
    workspaceId, entryType, entryId, sourceBranch,
    target, wikiId: child ? String(child.id) : null, wikiTitle: child ? child.name : title,
    wikiUrl: child ? wikiUrl(workspaceId, child.id) : undefined,
    monthWikiId: plan.monthWikiId, wikiState: child ? 'UNCHANGED' : 'NOT_CREATED',
    commentState: mode === 'update' ? 'SKIPPED' : commentOperation === 'NONE' ? 'ALREADY_LINKED' : 'NOT_LINKED', writes: 0,
  };
  let phase;
  try {
    let parent = monthWiki;
    if (!child && !parent) {
      phase = 'CREATE_MONTH';
      parent = await createAndReadWiki(call, workspaceId,
        { name: month, creator: input.creator }, rootWikiId, id => {
          result.monthWikiId = id;
          result.writes++;
        });
    }
    if (!child) {
      phase = 'CREATE_WIKI';
      result.wikiState = 'UNKNOWN';
      child = await createAndReadWiki(call, workspaceId,
        { name: title, creator: input.creator, markdown_description: approvedBody }, parent.id, id => {
          result.wikiId = id;
          result.wikiUrl = wikiUrl(workspaceId, id);
          result.writes++;
        });
      result.wikiState = 'CREATED';
    } else if (wikiOperation === 'UPDATE') {
      // Comment pagination may outlive the parallel Wiki read. Check the body at the write boundary.
      phase = 'CHECK_WIKI';
      const current = await wikiById(call, workspaceId, child.id);
      if (current.name !== child.name || String(current.parent_wiki_id) !== String(child.parent_wiki_id) ||
          typeof current.markdown_description !== 'string' ||
          contentHash(current.markdown_description) !== input.expectedBodySha256.toLowerCase()) {
        throw new Error('Wiki 在执行期间发生变化，停止补充');
      }
      phase = 'UPDATE_WIKI';
      result.wikiState = 'UNKNOWN';
      assertSuccess(await call('update_wiki', {
        workspace_id: workspaceId, options: { id: String(child.id), markdown_description: approvedBody },
      }), 'update_wiki');
      result.writes++;
      const updated = await wikiById(call, workspaceId, child.id);
      if (updated.name !== child.name || String(updated.parent_wiki_id) !== String(child.parent_wiki_id) ||
          updated.markdown_description !== approvedBody) throw new Error(`Wiki ${child.id} 更新后读回不一致`);
      child = updated;
      result.wikiState = 'UPDATED';
    }
    result.wikiUrl = wikiUrl(workspaceId, child.id);
    result.bodySha256 = contentHash(child.markdown_description);
    if (mode === 'update') return { ...result, state: result.wikiState };
    phase = 'CHECK_COMMENT';
    // The initial parallel reads are fresh for comment-only work. Refresh after Wiki writes.
    const latestComments = wikiOperation === 'NONE' ? comments
      : await listAllComments(call, workspaceId, entryType, entryId);
    const latestIds = wikiIdsFromComments(latestComments, workspaceId);
    result.commentEvidence = { checkedCount: latestComments.length, wikiIds: latestIds, detailWikiIds: detailIds };
    if (latestIds.length > 1 || (latestIds.length === 1 && latestIds[0] !== String(child.id))) {
      throw new Error('发现另一条提测 Wiki 评论；保留已完成的 Wiki 操作，不写冲突评论');
    }
    if (latestIds.length === 1) return { ...result, state: 'ALREADY_LINKED', commentState: 'ALREADY_LINKED' };
    phase = 'LINK_COMMENT';
    const payload = commentBody(workspaceId, child.id);
    result.commentState = 'UNKNOWN';
    assertSuccess(await call('create_comments', {
      workspace_id: workspaceId,
      options: { entry_type: entryType, entry_id: entryId,
        author: input.commentAuthor || input.creator, description: payload },
    }), 'create_comments');
    result.writes++;
    phase = 'READ_COMMENT';
    const readback = await listAllComments(call, workspaceId, entryType, entryId);
    const readbackIds = wikiIdsFromComments(readback, workspaceId);
    result.commentEvidence = { checkedCount: readback.length, wikiIds: readbackIds, detailWikiIds: detailIds };
    if (readbackIds.length !== 1 || readbackIds[0] !== String(child.id)) {
      throw new Error('评论读回缺少目标链接或出现冲突；不要盲目重试');
    }
    return { ...result, state: 'LINKED', commentState: 'LINKED', comment: payload };
  } catch (error) {
    error.result = { ...result, state: 'BLOCKED', phase, error: error.message };
    throw error;
  }
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const client = new StdioMcpClient();
  try {
    await client.initialize();
    let toolCalls = 0;
    const result = await ensureTestWiki((name, args) => {
      toolCalls++;
      return client.call(name, args);
    }, input);
    result.toolCalls = toolCalls;
    if (input.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else process.stdout.write(`${result.wikiState || result.wikiOperation} / ${result.commentState || result.state}: ${result.wikiUrl || result.wikiTitle} (${toolCalls} 次 TAPD 调用，${result.writes} 次写入)\n`);
  } catch (error) {
    if (input.json) process.stdout.write(JSON.stringify(error.result || {
      state: 'BLOCKED', error: error.message, writes: 0,
    }, null, 2) + '\n');
    throw error;
  } finally { client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
