#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const launcher = fileURLToPath(new URL('../../../scripts/start-mcp.mjs', import.meta.url));
const DEFAULT_ROOT_WIKI_ID = '1150372234001008260';
const DEFAULT_WORKSPACE_ID = 50372234;
const PAGE_SIZE = 100;

export function parseArgs(argv) {
  const values = {};
  const allowed = new Set([
    '--tapd-url', '--workspace-id', '--entry-type', '--entry-id', '--source-branch',
    '--creator', '--comment-author', '--body-file', '--wiki-title',
    '--month', '--root-wiki-id', '--expect-target', '--expected-month-id',
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
  if (values['--expected-month-id'] && !/^\d+$/.test(values['--expected-month-id'])) {
    throw new Error('expected-month-id 必须是数字');
  }
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
    if (value && typeof value === 'object' && !Array.isArray(value) && value.status === 0) failed = true;
  });
  if (failed) throw new Error(`${tool} 返回失败状态`);
  return result;
}

export function wikiIdsFromComments(comments, workspaceId) {
  const ids = new Set();
  const otherWorkspace = new Set();
  for (const comment of comments) {
    const body = String(comment.description || '');
    if (!/提测\s*wiki/i.test(body)) continue;
    const pattern = /https?:\/\/[^\s"<>\]]+\/(\d+)\/markdown_wikis\/show\/(?:#|%23)(\d+)/gi;
    for (const match of body.matchAll(pattern)) {
      if (match[1] === String(workspaceId)) ids.add(match[2]);
      else otherWorkspace.add(match[1]);
    }
  }
  if (otherWorkspace.size) throw new Error('评论含其他 TAPD 空间的提测 Wiki 链接');
  return [...ids];
}

async function listAllComments(call, workspaceId, entryType, entryId) {
  const all = [];
  const pageSignatures = new Set();
  for (let page = 1; page <= 20; page++) {
    const result = assertSuccess(await call('get_comments', {
      workspace_id: workspaceId,
      options: { entry_type: entryType, entry_id: entryId, limit: PAGE_SIZE, page,
        fields: 'id,description,created' },
    }), 'get_comments');
    const rows = records(result, 'Comment');
    const signature = rows.map(row => row.id).join(',');
    if (pageSignatures.has(signature)) throw new Error('评论分页重复，停止查询以避免循环');
    pageSignatures.add(signature);
    all.push(...rows);
    const count = totalCount(result);
    if (count !== undefined ? all.length >= count : rows.length < PAGE_SIZE) return all;
  }
  throw new Error('评论超过 20 页，停止自动创建 Wiki');
}

async function wikiById(call, workspaceId, id) {
  const result = assertSuccess(await call('get_wiki', {
    workspace_id: workspaceId, options: { id, limit: 1 },
  }), 'get_wiki');
  const matches = records(result, 'Wiki').filter(wiki => String(wiki.id) === String(id));
  if (matches.length !== 1) throw new Error(`Wiki ${id} 不存在或结果不唯一`);
  return matches[0];
}

async function wikiByName(call, workspaceId, name, parentId) {
  const result = assertSuccess(await call('get_wiki', {
    workspace_id: workspaceId,
    options: { name, limit: PAGE_SIZE, fields: 'id,name,parent_wiki_id,markdown_description,creator' },
  }), 'get_wiki');
  const count = totalCount(result);
  if (count !== undefined && count > PAGE_SIZE) throw new Error(`Wiki 标题 ${name} 命中超过 ${PAGE_SIZE} 条，请人工核对`);
  const matches = records(result, 'Wiki').filter(wiki =>
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
  return String(body || '').split(/\r?\n/).some(line => {
    const match = line.match(/^\s*-\s*代码分支名\s*[:：]\s*(\S+)\s*$/);
    return match?.[1] === sourceBranch;
  });
}

async function assertApprovedBody(wiki, bodyFile) {
  if (!bodyFile) return;
  const approved = (await readFile(bodyFile, 'utf8')).trimEnd();
  if (String(wiki.markdown_description || '').trimEnd() !== approved) {
    throw new Error(`Wiki ${wiki.id} 正文与已批准文件不一致`);
  }
}

function wikiUrl(workspaceId, wikiId) {
  return `https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#${wikiId}`;
}

function commentBody(workspaceId, wikiId) {
  const url = wikiUrl(workspaceId, wikiId);
  return `提测wiki：[${url}](${url})`;
}

async function createAndReadWiki(call, workspaceId, options, parentId) {
  const created = assertSuccess(await call('create_wiki', {
    workspace_id: workspaceId, options: { ...options, parent_wiki_id: String(parentId) },
  }), 'create_wiki');
  const id = createdId(created, 'Wiki');
  if (!id) throw new Error(`Wiki ${options.name} 创建结果没有 ID；不要盲目重试`);
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
  const itemTool = entryType === 'bug' ? 'get_bug' : 'get_stories_or_tasks';
  const itemOptions = entryType === 'bug'
    ? { id: entryId, limit: 1, fields: 'id,title,description' }
    : { entity_type: entryType, id: entryId, limit: 1, fields: 'id,name,description' };
  const itemResult = assertSuccess(await call(itemTool, {
    workspace_id: workspaceId, options: itemOptions,
  }), itemTool);
  const itemKind = entryType === 'bug' ? 'Bug' : entryType === 'tasks' ? 'Task' : 'Story';
  const item = records(itemResult, itemKind).find(row => String(row.id) === String(entryId));
  if (!item) throw new Error(`TAPD ${entryType} ${entryId} 不存在`);

  const comments = await listAllComments(call, workspaceId, entryType, entryId);
  const linkedIds = wikiIdsFromComments(comments, workspaceId);
  if (linkedIds.length > 1) throw new Error('评论存在多个不同的提测 Wiki 链接，停止自动选择');
  if (linkedIds.length === 1) {
    if (input.expectTarget && input.expectTarget !== 'REUSE_EXISTING') {
      throw new Error('评论已有 Wiki，目标动作与确认计划不一致');
    }
    const wiki = await wikiById(call, workspaceId, linkedIds[0]);
    assertBranch(wiki, sourceBranch);
    await assertApprovedBody(wiki, input.bodyFile);
    return { state: 'ALREADY_LINKED', target: 'REUSE_EXISTING',
      wikiId: String(wiki.id), wikiUrl: wikiUrl(workspaceId, wiki.id),
      wikiTitle: wiki.name, writes: 0 };
  }

  if (execute && !input.expectTarget) {
    throw new Error('写入 Wiki 前必须提供确认计划中的 --expect-target');
  }

  const date = chinaDate(now);
  const month = input.month || date.month;
  const rootWikiId = input.rootWikiId ||
    (workspaceId === DEFAULT_WORKSPACE_ID ? DEFAULT_ROOT_WIKI_ID : undefined);
  if (!rootWikiId) throw new Error('此 TAPD 空间没有默认提测文档根页；需提供 --root-wiki-id');
  const title = input.wikiTitle || `${date.day}: ${item.name || item.title}`;
  if (!input.creator || !input.bodyFile) {
    throw new Error('评论没有 Wiki 链接；创建时必须提供 --creator 和 --body-file');
  }
  const body = (await readFile(input.bodyFile, 'utf8')).trimEnd();
  if (!body || !hasBranchEntry(body, sourceBranch)) {
    throw new Error('Wiki 正文必须非空并含有准确的“代码分支名：<原分支>”行');
  }
  const monthWiki = await wikiByName(call, workspaceId, month, rootWikiId);
  if (input.expectedMonthId && String(monthWiki?.id || '') !== String(input.expectedMonthId)) {
    throw new Error('月份 Wiki ID 与确认计划不一致');
  }
  let child = monthWiki && await wikiByName(call, workspaceId, title, monthWiki.id);
  if (child) {
    assertBranch(child, sourceBranch);
    await assertApprovedBody(child, input.bodyFile);
  }
  const target = child ? 'REUSE_EXISTING' : monthWiki ? 'CREATE_CHILD' : 'CREATE_MONTH_AND_CHILD';
  if (input.expectTarget && input.expectTarget !== target) {
    throw new Error(`Wiki 目标动作变为 ${target}，与确认计划不一致`);
  }
  if (!execute) return {
    state: child ? 'PLANNED_LINK' : monthWiki ? 'PLANNED_CREATE_CHILD' : 'PLANNED_CREATE_MONTH_AND_CHILD',
    target,
    month, monthWikiId: monthWiki ? String(monthWiki.id) : null,
    wikiId: child ? String(child.id) : null, wikiTitle: title,
    comment: child ? commentBody(workspaceId, child.id) : '创建后用实际 Wiki ID 生成链接', writes: 0,
  };

  let writes = 0;
  let parent = monthWiki;
  if (!parent) {
    parent = await createAndReadWiki(call, workspaceId,
      { name: month, creator: input.creator }, rootWikiId);
    writes++;
  }
  if (!child) {
    child = await createAndReadWiki(call, workspaceId,
      { name: title, creator: input.creator, markdown_description: body }, parent.id);
    writes++;
  }
  const latestComments = await listAllComments(call, workspaceId, entryType, entryId);
  const latestIds = wikiIdsFromComments(latestComments, workspaceId);
  if (latestIds.length > 1 || (latestIds.length === 1 && latestIds[0] !== String(child.id))) {
    throw new Error('创建后发现另一条提测 Wiki 评论；保留已创建 Wiki，不写冲突评论');
  }
  if (latestIds.length === 1) return {
    state: 'ALREADY_LINKED', target, wikiId: String(child.id), wikiUrl: wikiUrl(workspaceId, child.id),
    wikiTitle: child.name, writes,
  };
  const payload = commentBody(workspaceId, child.id);
  assertSuccess(await call('create_comments', {
    workspace_id: workspaceId,
    options: { entry_type: entryType, entry_id: entryId,
      author: input.commentAuthor || input.creator, description: payload },
  }), 'create_comments');
  const readback = await listAllComments(call, workspaceId, entryType, entryId);
  if (!wikiIdsFromComments(readback, workspaceId).includes(String(child.id))) {
    throw new Error('评论写入后未读回 Wiki 链接；不要盲目重试');
  }
  return { state: 'LINKED', target, wikiId: String(child.id), wikiUrl: wikiUrl(workspaceId, child.id),
    wikiTitle: child.name, comment: payload, writes: writes + 1 };
}

export class StdioMcpClient {
  constructor(command = process.execPath, args = [launcher, 'tapd-mcp']) {
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = new Map();
    this.nextId = 1;
    const rejectAll = message => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      this.pending.clear();
    };
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method === 'ping' && message.id !== undefined) {
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n');
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`MCP ${pending.method} 失败：${message.error.code}`));
      else pending.resolve(message.result);
    });
    this.child.on('exit', () => rejectAll('TAPD MCP 已退出'));
    this.child.on('error', () => rejectAll('无法启动 TAPD MCP'));
    this.child.stdin.on('error', () => rejectAll('TAPD MCP 输入已关闭'));
  }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async initialize() {
    await this.request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'zan-ensure-test-wiki', version: '1.0.0' },
    }, 120000);
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await this.request('tools/list');
    this.toolNames = new Set((list.tools || []).map(tool => tool.name));
  }

  async call(name, args) {
    if (!this.toolNames?.has(name)) throw new Error(`TAPD MCP 未提供 ${name}`);
    return this.request('tools/call', { name, arguments: args });
  }

  close() {
    this.child.stdin.end();
    this.lines.close();
    this.child.kill();
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
    else process.stdout.write(`${result.state}: ${result.wikiUrl || result.wikiTitle} (${toolCalls} 次 TAPD 调用，${result.writes} 次写入)\n`);
  } finally { client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
