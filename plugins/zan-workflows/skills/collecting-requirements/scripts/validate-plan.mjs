#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryKey, stableJson } from '../../../scripts/workflow-runtime.mjs';

const indexPattern = /^P[1-9]\d*(?:-D[1-9]\d*|-M[1-9]\d*(?:-F[1-9]\d*(?:-(?:UI|TC)[1-9]\d*)?)?)?$/;
const depth = { P: 2, D: 3, M: 3, F: 4, UI: 5, TC: 5 };
const statuses = ['待执行', '开发中', '已上线'];
const apiColumns = ['编号', '接口', '前端传 / 读', '对齐', '就绪与验证', '本轮接入及缺口', '依据'];

function requireFact(test, message) {
  if (!test) throw new Error(message);
}

// Offsets refer to the original text, including CRLF. A code sample can
// illustrate another Plan without contributing fields, headings or bindings.
export function planLines(markdown) {
  const lines = [];
  let fence, offset = 0;
  for (const row of markdown.split('\n')) {
    const text = row.endsWith('\r') ? row.slice(0, -1) : row;
    if (fence) {
      if (fence.test(text)) fence = undefined;
    } else {
      const opening = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
        fence = new RegExp('^ {0,3}' + opening[1][0] + '{' + opening[1].length + ',}[ \\t]*$');
      } else {
        lines.push({ text, offset });
      }
    }
    offset += row.length + 1;
  }
  requireFact(!fence, 'Markdown 代码围栏未闭合');
  return lines;
}

function apiTableCells(line) {
  const row = line.trim();
  // An escaped pipe belongs to the cell, including inside an inline code span.
  const matches = [...row.matchAll(/\|((?:\\.|[^\\|])*)(?=\|)/gu)];
  if (matches.map(match => match[0]).join('') + '|' !== row) return [];
  return matches.map(([, cell]) => cell.trim());
}

function addApiDependencies(project, lines, nodes, apiOperations) {
  const [headers, separator, ...rows] = lines.join('\n').trim().split('\n').map(apiTableCells);
  requireFact(headers.length === apiColumns.length && apiColumns.every((column, index) => headers[index] === column),
    project.id + ' 接口清单表头无效');
  requireFact(separator?.length === apiColumns.length && separator.every(cell => /^:?-+:?$/.test(cell)) && rows.length,
    project.id + ' 接口清单须包含表格分隔行及至少一条接口');
  for (const row of rows) {
    requireFact(row.length === apiColumns.length && row.every(Boolean), project.id + ' 接口清单行须填齐七列');
    const [number, operation, usage, alignment, verification, action, source] = row;
    const id = number.match(/^`([^`]+)`$/)?.[1] ?? number;
    requireFact(/^P[1-9]\d*-D[1-9]\d*$/.test(id) && id.startsWith(project.id + '-'),
      project.id + ' 接口编号须属于当前项目：' + id);
    requireFact(!nodes.has(id), id + ' 重复索引');

    const api = operation.match(/^([^·]+)·([^·]+)·\s*(?:`([A-Z]+) (\/[^\s`]+)`|待确认)$/u);
    requireFact(api && api[1].trim() && api[2].trim(), id + ' 接口须填写提供方、用途及方法与路径，或标记待确认');
    const [, provider, , method, path] = api;
    if (method) {
      const key = JSON.stringify([provider.trim(), method, path]);
      requireFact(!apiOperations.has(key), id + ' 重复登记接口，请引用 ' + apiOperations.get(key));
      apiOperations.set(key, id);
    } else {
      requireFact(['待核实', '未对齐'].includes(alignment), id + ' 未确认的方法与路径只能标为待核实或未对齐');
    }
    const fields = new Map([
      ['来源', source], ['契约', operation + '\n' + usage], ['对齐', alignment],
      ['就绪及验证', verification], ['影响及补齐条件', action],
    ]);
    const node = { id, type: 'D', parentId: project.id, project: project.id, lines: [], children: [], fields, fromApiTable: true };
    nodes.set(id, node);
    project.children.push(node);
  }
}

function sectionTree(markdown, isBug) {
  const infoNames = isBug ? ['缺陷信息', 'Bug 信息'] : ['需求信息'];
  const nodes = new Map(), parents = [], apiOperations = new Map();
  let title, info, history, current;
  for (const { text } of planLines(markdown)) {
    const heading = text.match(/^(#{1,6})[ \t]+(.+?)\s*$/);
    if (!heading) {
      if (current) current.lines.push(text);
      continue;
    }
    const level = heading[1].length, label = heading[2];
    requireFact(!history, '执行记录须为最后一节');
    if (current?.apiProject) addApiDependencies(current.apiProject, current.lines, nodes, apiOperations);
    if (level === 1) {
      requireFact(!title && !info && !nodes.size, '正文需要唯一的一级标题');
      title = label;
    } else if (level === 2 && infoNames.includes(label)) {
      requireFact(title && !info && !nodes.size, '工作项信息须在标题后且只出现一次');
      current = info = { label, lines: [] };
    } else if (level === 2 && label === '执行记录') {
      current = history = { lines: [] };
    } else if (level === 3 && label === '接口清单') {
      const project = parents[2];
      requireFact(project?.type === 'P', '接口清单须位于项目标题下');
      requireFact(!project.hasApiTable && !project.children.some(child => child.type === 'M'),
        project.id + ' 接口清单须在业务模块之前且只出现一次');
      project.hasApiTable = true;
      current = { apiProject: project, lines: [] };
      parents.length = level;
    } else {
      requireFact(info, '缺少与工作项类型一致的基本信息');
      const [id, ...name] = label.split(/\s+/);
      requireFact(name.length && indexPattern.test(id), '无效索引标题：' + label);
      const parts = id.split('-'), type = parts.at(-1).replace(/\d+$/, '');
      requireFact(depth[type] === level, id + ' 标题层级错误');
      requireFact(!nodes.has(id), id + ' 重复索引');
      const parentId = parts.slice(0, -1).join('-');
      requireFact(!parentId || parents[level - 1]?.id === parentId, id + ' 父级与当前标题不一致');
      current = { id, type, parentId, project: parts[0], lines: [], children: [] };
      nodes.set(id, current);
      if (parentId) nodes.get(parentId).children.push(current);
      parents.length = level;
      parents[level] = current;
    }
  }
  requireFact(title && info && history && nodes.size, '需要完整的工作项信息、项目及文末执行记录');
  return { info, history, nodes };
}

export function itemLinkMatches(href, scope) {
  const isBug = Object.hasOwn(scope, 'bugId');
  const itemId = isBug ? scope.bugId : scope.storyId;
  const modern = `https://www.tapd.cn/tapd_fe/${scope.workspaceId}/${isBug ? 'bug' : 'story'}/detail/${itemId}`;
  const classic = `https://www.tapd.cn/${scope.workspaceId}/${isBug ? 'bugtrace/bugs' : 'prong/stories'}/view/${itemId}`;
  return href === modern || href === classic;
}

function checkInfo(info, scope, isBug, schema) {
  const noun = isBug ? (info.label === '缺陷信息' ? '缺陷' : 'Bug') : '需求';
  const labelPrefix = noun === 'Bug' ? 'Bug ' : noun;
  const linkLabel = labelPrefix + '链接', idLabel = noun + ' ID';
  const identity = [linkLabel, idLabel, '创建时间'];
  const legacyLabels = ['TAPD ' + labelPrefix + '状态', '执行状态', '是否提测', '是否构建'];
  const parallelLabel = '是否开启子智能体开发模式';
  const fields = new Map();
  for (const text of info.lines) {
    if (!text.startsWith('|')) continue;
    const row = text.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
    requireFact(row, '工作项信息须使用两列表格');
    const [, key, value] = row;
    if (key === '字段' && value === '内容' || /^:?-+:?$/.test(key) && /^:?-+:?$/.test(value)) continue;
    requireFact((identity.includes(key) || legacyLabels.includes(key) || key === parallelLabel) && value.trim() && !fields.has(key),
      '未知、空或重复的工作项字段：' + key);
    fields.set(key, value);
  }
  schema ??= [...legacyLabels, parallelLabel].some(label => fields.has(label)) ? 3 : 4;
  for (const label of identity) requireFact(fields.has(label), '缺少工作项字段：' + label);
  const itemId = isBug ? scope.bugId : scope.storyId;
  requireFact(fields.get(idLabel) === itemId, '工作项 ID 与目标不一致');
  const raw = fields.get(linkLabel);
  const href = raw.match(/^\[[^\]]+\]\(([^\s)]+)\)$/)?.[1] ?? raw;
  requireFact(itemLinkMatches(href, scope), '工作项链接须指向准确的 TAPD 类型、空间及完整 ID');
  if (schema < 4) {
    for (const label of legacyLabels) requireFact(fields.has(label), '缺少工作项字段：' + label);
    requireFact(statuses.includes(fields.get('执行状态')), '执行状态无效');
    for (const key of [...legacyLabels.slice(2), parallelLabel]) {
      requireFact(['是', '否'].includes(fields.get(key) ?? '否'), key + ' 须为是或否');
    }
  } else {
    requireFact([...legacyLabels, parallelLabel].every(label => !fields.has(label)), '新版执行文档的状态及交付选择在启动时处理');
  }
  return { fields, schema };
}

function fieldsOf(node) {
  const fields = new Map();
  let active;
  for (const line of node.lines) {
    const field = line.match(/^- \*\*([^*]+)\*\*(?:[ \t]+(.*))?$/);
    if (field) {
      requireFact(!fields.has(field[1]), node.id + ' 重复字段 ' + field[1]);
      active = [field[2] ?? ''];
      fields.set(field[1], active);
    } else if (active) {
      active.push(line);
    }
  }
  return new Map([...fields].map(([key, lines]) => [key, lines.join('\n').trim()]));
}

function valueOf(node, key, options) {
  const value = node.fields.get(key);
  requireFact(value && (!options || options.includes(value)), node.id + ' 缺少或无效的' + key);
  return value;
}

function references(node, key, type, nodes) {
  const text = valueOf(node, key);
  if (text === '无') return [];
  const ids = text.split(/[、,，\s]+/).filter(Boolean);
  requireFact(ids.length > 0, node.id + ' 请填写' + key + '或无');
  for (const id of ids) requireFact(nodes.get(id)?.type === type, node.id + ' 的' + key + '引用不存在或类型错误：' + id);
  return [...new Set(ids)];
}

function alignmentStatus(states, inventoryComplete) {
  if (states.has('未对齐')) return '未全部对齐';
  if (!inventoryComplete || states.has('待核实')) return '待核实';
  return states.has('已对齐') ? '全部对齐' : '本轮无适用项';
}

function checkNodes(nodes, schema) {
  const features = [], projects = [];
  for (const n of nodes.values()) {
    n.fields ??= fieldsOf(n);
    if (n.type === 'P') {
      if (schema >= 2) {
        requireFact(n.children.some(child => child.type === 'M'), n.id + ' 缺少模块及功能');
        valueOf(n, '实施范围');
      }
      for (const key of ['仓库', '开发分支', '基准', '项目规范', '真实联调']) valueOf(n, key);
      n.inventory = valueOf(n, '依赖审查', ['已核对', '待核实']);
      projects.push(n);
    } else if (n.type === 'D') {
      for (const key of ['来源', '契约', '就绪及验证', '影响及补齐条件']) valueOf(n, key);
      n.alignment = valueOf(n, '对齐', ['已对齐', '未对齐', '待核实', '不适用']);
    } else if (n.type === 'M') {
      requireFact(n.children.length, n.id + ' 缺少功能索引');
      if (schema >= 2) valueOf(n, '职责与依赖');
    } else if (n.type === 'F') {
      n.inScope = valueOf(n, '本轮', ['纳入', '后续']) === '纳入';
      n.data = n.inScope || n.fields.has('数据依赖') ? references(n, '数据依赖', 'D', nodes) : [];
      n.prerequisites = n.inScope || n.fields.has('前置功能') ? references(n, '前置功能', 'F', nodes) : [];
      if (n.inScope) {
        for (const key of ['范围与依据', '输入与输出', '修改位置']) valueOf(n, key);
        requireFact(/^\s*1[.)]\s+\S/m.test(valueOf(n, '实施步骤')), n.id + ' 缺少有序实施步骤');
        requireFact(n.children.some(child => child.type === 'TC'), n.id + ' 缺少对应 TC 测试');
      }
      features.push(n);
    } else {
      requireFact(n.lines.some(line => line.trim()), n.id + ' 缺少交互或测试正文');
    }
  }
  requireFact(features.some(n => n.inScope), '计划至少需要一个本轮纳入的功能');
  const referencedData = new Set(features.flatMap(feature => feature.data));
  for (const node of nodes.values()) {
    requireFact(!node.fromApiTable || referencedData.has(node.id), node.id + ' 须由消费功能引用');
  }

  const visiting = new Set(), visited = new Set();
  function visit(node) {
    if (visited.has(node.id)) return;
    requireFact(!visiting.has(node.id), node.id + ' 前置功能存在循环');
    visiting.add(node.id);
    for (const id of node.prerequisites) visit(nodes.get(id));
    visiting.delete(node.id);
    visited.add(node.id);
  }
  for (const feature of features) visit(feature);

  const consumers = new Map(), projectSummaries = [];
  let inventoryComplete = true;
  for (const project of projects) {
    const selected = features.filter(n => n.project === project.id && n.inScope);
    const dependencyIds = new Set();
    for (const feature of selected) {
      for (const id of feature.data) {
        dependencyIds.add(id);
        if (!consumers.has(id)) consumers.set(id, []);
        consumers.get(id).push(feature.id);
      }
    }
    const reviewed = project.inventory === '已核对';
    if (selected.length && !reviewed) inventoryComplete = false;
    const states = new Set([...dependencyIds].map(id => nodes.get(id).alignment));
    const expected = alignmentStatus(states, reviewed);
    requireFact(valueOf(project, '外部数据对齐') === expected, project.id + ' 外部数据对齐应为「' + expected + '」');
    projectSummaries.push({ id: project.id, status: expected, dependencyIds: [...dependencyIds] });
  }
  const dependencies = [...consumers].map(([id, features]) => ({ id, status: nodes.get(id).alignment, features }));
  const status = alignmentStatus(new Set(dependencies.map(d => d.status)), inventoryComplete);
  return { status, dependencies, projects: projectSummaries };
}

function checkHistory(lines, status) {
  const receipts = new Set();
  let lastStatus = statuses[0];
  for (const line of lines.filter(line => line.trim())) {
    const entry = line.match(/^- \[([A-Za-z0-9][A-Za-z0-9_.:/-]{0,127})\] (.+?)｜依据 (.+)$/);
    requireFact(entry && entry[2].trim() && entry[3].trim(), '执行记录缺少回执编号、进度或依据');
    requireFact(!receipts.has(entry[1]), '执行记录回执编号重复：' + entry[1]);
    receipts.add(entry[1]);
    const state = entry[3].match(/｜执行状态 (\S+)$/);
    if (state) {
      const next = statuses.indexOf(state[1]), previous = statuses.indexOf(lastStatus);
      requireFact(next >= previous && next <= previous + 1, '执行记录的状态顺序无效');
      lastStatus = state[1];
    }
  }
  requireFact(status === undefined || status === lastStatus, '顶部执行状态与执行记录不一致');
}

function deliveryContext(projectNodes, infoFields, submit, build, schema) {
  const projects = [];
  if (schema < 3) return { submit, build, legacy: true, projects };
  if (!submit && !build) return { submit, build, projects };

  const gaps = { submit: [], build: [] };
  const pending = infoFields.get('交付待核实');
  function fact(node, key, missing) {
    const value = node.fields.get(key)?.split('\n', 1)[0].trim();
    if (!value || ['待核实', '待确认'].includes(value)) {
      missing.push(node.id + ' ' + key);
      return null;
    }
    return value;
  }
  const testWiki = submit ? fact({ id: '工作项', fields: infoFields }, '提测 Wiki', gaps.submit) : '跳过';
  requireFact(!testWiki || ['需要', '跳过'].includes(testWiki), '选择提测时须明确提测 Wiki');
  for (const node of projectNodes) {
    const git = submit ? fact(node, '提测合并', gaps.submit) : '跳过';
    const job = build ? fact(node, '测试构建 Job', gaps.build) : '跳过';
    if (git === '跳过' && job === '跳过') continue;
    requireFact(!git || ['提交推送并合并 MR', '仅推送并合并 MR', '创建或复用并合并 MR', '仅合并已有 MR', '仅核验已交付', '跳过'].includes(git), node.id + ' 提测合并无效');
    const repository = valueOf(node, '仓库');
    repositoryKey(repository);
    const common = [];
    const source = fact(node, '开发分支', common);
    requireFact(!source || /^(feature|fixbug)\/[^\s`，、]+$/u.test(source), node.id + ' 开发分支应为准确的原分支名称');
    const purpose = fact(node, '交付目的', common);
    if (git !== '跳过') gaps.submit.push(...common);
    if (job !== '跳过') gaps.build.push(...common);
    const target = git === '跳过' ? null : fact(node, '提测目标分支', gaps.submit);
    requireFact(!target || ['dev', 'develop'].includes(target), node.id + ' 须使用真实测试目标分支');
    let conflict = null;
    if (target && git !== '仅核验已交付') {
      const branch = node.fields.get('冲突中转分支');
      if (branch && branch !== '未授权') {
        requireFact(/^merge\/[^\s.][^\s]*$/.test(branch) && !branch.includes('..') && branch.endsWith('-to-' + target), node.id + ' 冲突中转分支须对应实际测试目标');
        const worktree = valueOf(node, '冲突工作树');
        requireFact(/^\.worktrees\/[A-Za-z0-9_\-\p{L}][^\s/]*$/u.test(worktree) && !worktree.includes('..') && !worktree.includes('\\'), node.id + ' 冲突工作树须位于本仓库 .worktrees 下');
        conflict = { branch, worktree };
      }
    }
    let release = null;
    if (job && job !== '跳过') {
      const url = new URL(job);
      requireFact(['http:', 'https:'].includes(url.protocol) && url.pathname.includes('/job/') && !url.search && !url.hash && !url.username && !url.password, node.id + ' 须指定准确测试 Job URL');
      const kind = node.fields.get('构建类型') || '应用部署';
      requireFact(['应用部署', '金丝雀发包'].includes(kind), node.id + ' 构建类型须为测试部署或明确的金丝雀发包');
      const ref = fact(node, '构建来源', gaps.build);
      if (kind === '应用部署') {
        requireFact(!ref || (target ? ref === target : [source, 'dev', 'develop'].includes(ref)), node.id + ' 构建来源与测试交付范围不符');
      } else {
        // A verified canary job can read a separately selected tag/default
        // branch. Its run never grants an MR to that ref.
        requireFact(!ref || /^[^\s-][^\s]*$/.test(ref) && !ref.includes('..'), node.id + ' 金丝雀构建须给出准确源码 ref');
      }
      release = { kind: kind === '应用部署' ? 'deployment' : 'package', jobUrl: job.replace(/\/$/, ''),
        project: fact(node, '构建项目', gaps.build), target: fact(node, '构建对象', gaps.build), ref,
        parametersHash: fact(node, '构建参数指纹', gaps.build) };
      requireFact(!release.parametersHash || /^[0-9a-f]{64}$/.test(release.parametersHash), node.id + ' 须使用已解析测试参数的完整指纹');
    }
    projects.push({ id: node.id, repository, source, purpose, git, target, conflict, release });
  }
  const missing = [...gaps.submit, ...gaps.build];
  requireFact(!missing.length || pending, '请补充交付约定或写明交付待核实事项：' + missing.join('、'));
  requireFact(!submit || gaps.submit.length || projects.some(project => project.target), '选择提测时须有项目的测试交付目标');
  requireFact(!build || gaps.build.length || projects.some(project => project.release), '选择构建时须有项目的测试构建目标');
  return { submit, build, testWiki, testVersion: infoFields.get('登记测试版本')?.split('\n', 1)[0] || null, projects, gaps };

}

const startProjectFields = ['交付目的', '提测合并', '提测目标分支', '冲突中转分支', '冲突工作树',
  '测试构建 Job', '构建类型', '构建来源', '构建项目', '构建对象', '构建参数指纹'];

// Targets are confirmed for this run. Repository and source stay bound to the saved plan.
export function startupDelivery(featureProjects, selectedProjects, startup, limit) {
  requireFact(startup && typeof startup.submit === 'boolean' && typeof startup.build === 'boolean' &&
    Object.keys(startup).every(key => ['submit', 'build', 'projects', 'testWiki', 'testVersion', 'parallelDevelopment'].includes(key)) &&
    (startup.parallelDevelopment === undefined || typeof startup.parallelDevelopment === 'boolean'),
  '启动前须明确本轮是否提测、是否构建及其范围');
  const submit = startup.submit && !['IMPLEMENT_ONLY', 'BUILD_ONLY'].includes(limit);
  const build = startup.build && !['IMPLEMENT_ONLY', 'NO_BUILD'].includes(limit);
  const projectFields = startup.projects ?? {};
  requireFact(projectFields && typeof projectFields === 'object' && !Array.isArray(projectFields) &&
    Object.keys(projectFields).every(id => selectedProjects.includes(id)), '启动交付项目须属于本轮所选范围');
  const infoFields = new Map();
  for (const [key, label] of [['testWiki', '提测 Wiki'], ['testVersion', '登记测试版本']]) {
    if (startup[key] === undefined) continue;
    requireFact(typeof startup[key] === 'string' && startup[key].trim() && !/[\r\n]/.test(startup[key]), '启动字段无效：' + label);
    infoFields.set(label, startup[key]);
  }
  const projects = featureProjects.filter(project => selectedProjects.includes(project.id)).map(project => {
    const values = Object.hasOwn(projectFields, project.id) ? projectFields[project.id] : {};
    requireFact(values && typeof values === 'object' && !Array.isArray(values) &&
      Object.entries(values).every(([key, value]) => startProjectFields.includes(key) && typeof value === 'string' && value.trim() && !/[\r\n]/.test(value)),
    project.id + ' 启动交付字段无效');
    return { id: project.id, fields: new Map([
      ['提测合并', '跳过'], ['测试构建 Job', '跳过'], ...Object.entries(values),
      ['仓库', project.repository], ['开发分支', project.branch],
    ]) };
  });
  return deliveryContext(projects, infoFields, submit, build, 4);
}

// The continuous submission helper has one Git row and at most one app Job
// per repository, with a common purpose. Other shapes use the existing
// individual delivery helpers; each reviewed Git operation and Job runs once.
export function deliveryRoute(delivery, submit, build) {
  const merges = new Map(), builds = new Map(), repositories = new Set(), purposes = new Set();
  let separate = false;
  for (const p of delivery.projects) {
    const repo = repositoryKey(p.repository);
    if (submit && p.target) {
      const key = stableJson([repo, p.source, p.target, p.git, p.purpose, p.conflict]);
      if (!merges.has(key)) {
        if (repositories.has(repo)) separate = true;
        repositories.add(repo);
        merges.set(key, p.id);
        purposes.add(p.purpose);
      }
    }
    if (build && p.release) {
      const key = stableJson([repo, p.purpose, p.release]);
      if (!builds.has(key)) builds.set(key, { repo, id: p.id });
      if (!p.target || p.release.kind !== 'deployment') separate = true;
    }
  }
  const jobs = [...builds.values()];
  if (new Set(jobs.map(job => job.repo)).size !== jobs.length || purposes.size > 1) separate = true;
  let workflow = 'IMPLEMENT_ONLY';
  if (submit) workflow = separate ? 'DELIVERY_STEPS' : 'CONTINUOUS_SUBMIT';
  else if (build) workflow = 'RELEASE_ONLY';
  const missing = [...(submit ? delivery.gaps?.submit || [] : []), ...(build ? delivery.gaps?.build || [] : [])];
  if ((submit || build) && (delivery.legacy || missing.length)) workflow = 'MATCH_CHECKLIST';
  return { workflow, missing, gitProjects: [...merges.values()], buildProjects: jobs.map(job => job.id),
    separateBuilds: ['DELIVERY_STEPS', 'RELEASE_ONLY'].includes(workflow) ? jobs.map(job => job.id) : [] };
}

export function validatePlan(markdown, scope = {}, schema) {
  requireFact(schema === undefined || [1, 2, 3, 4].includes(schema), '无法识别执行计划格式版本');
  const ids = ['storyId', 'bugId'].filter(key => Object.hasOwn(scope, key));
  requireFact(ids.length === 1, 'storyId 和 bugId 必须且只能指定一项');
  for (const id of [scope.workspaceId, scope[ids[0]]]) {
    requireFact(typeof id === 'string' && /^[1-9]\d*$/.test(id), '空间和工作项 ID 应为数字字符串');
  }
  requireFact(typeof markdown === 'string', '缺少 Markdown 正文');
  const isBug = ids[0] === 'bugId';
  const { info, history, nodes } = sectionTree(markdown, isBug);
  const { fields, schema: version } = checkInfo(info, scope, isBug, schema);
  schema = version;
  const alignment = checkNodes(nodes, schema);
  if (isBug && schema >= 2) {
    const bug = { ...info, id: 'Bug', fields: fieldsOf(info) };
    for (const field of ['复现与实际结果', '预期结果', '定位依据或调查步骤', '修复方向']) valueOf(bug, field);
    const regression = references(bug, '回归验收', 'TC', nodes);
    requireFact(regression.length, 'Bug 回归验收须绑定本轮纳入功能的具体 TC');
    for (const id of regression) {
      const test = nodes.get(id);
      requireFact(nodes.get(test.parentId).inScope, test.id + ' 的所属功能须纳入本轮回归验收');
    }
  }
  const executionStatus = fields.get('执行状态');
  checkHistory(history.lines, executionStatus);
  const selectedProjects = [...nodes.values()].filter(node => node.type === 'P' && node.children.some(mod => mod.children.some(feature => feature.inScope)));
  const delivery = schema === 4 ? null : deliveryContext(selectedProjects, fieldsOf(info), fields.get('是否提测') === '是', fields.get('是否构建') === '是', schema);
  const featureIds = [...nodes.values()].filter(node => node.type === 'F' && node.inScope).map(node => node.id);
  const featureProjects = [...nodes.values()].filter(node => node.type === 'P').map(node => ({
    id: node.id, repository: node.fields.get('仓库'), branch: node.fields.get('开发分支'),
  }));
  return { valid: true, schema, ...(executionStatus === undefined ? {} : { executionStatus }), indexes: [...nodes.keys()], featureIds, featureProjects, alignment, delivery };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(validatePlan(input.markdown, input)) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
