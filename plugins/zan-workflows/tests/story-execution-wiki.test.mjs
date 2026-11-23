import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runStoryWiki } from '../skills/collecting-requirements/scripts/story-execution-wiki.mjs';

const markdown = await readFile(new URL('../skills/collecting-requirements/assets/example-plan.md', import.meta.url), 'utf8');
const scope = { workspaceId: '123', storyId: '111230010000101', parentWikiId: '111230010000201' };
const input = { ...scope, actor: '示例用户', markdown, schema: 3 };
const proposal = markdown.replace('门店候选查询和活动表单下拉选择', '支持授权区域内的门店候选查询与活动表单选择');
const wrap = (data) => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1, data }) }] });

function fixture({ bugId } = {}) {
  const pages = new Map([[scope.parentWikiId, { id: scope.parentWikiId, name: '执行文件', workspace_id: '123' }]]);
  const comments = [], calls = [], writes = [], claimed = new Set();
  let nextId = 900, hooks = {};
  const run = async (tool, { workspace_id, options: opts }) => {
    assert.equal(workspace_id, 123);
    calls.push(tool);
    if (hooks.before) await hooks.before(tool, opts);
    if (tool === 'get_stories_or_tasks') {
      assert.equal(opts.entity_type, 'stories');
      return wrap(opts.id === scope.storyId ? [{ Story: { workspace_id, id: scope.storyId, name: hooks.storyName || '选择门店' } }] : []);
    }
    if (tool === 'get_bug') {
      return wrap(opts.id === bugId ? [{ Bug: { workspace_id, id: bugId, title: '修复门店选择' } }] : []);
    }
    if (tool === 'get_comments') {
      assert.ok(['stories', 'bug'].includes(opts.entry_type));
      assert.equal(opts.entry_id, opts.entry_type === 'bug' ? bugId : scope.storyId);
      return wrap(comments.filter(comment => !comment.entry_type || comment.entry_type === opts.entry_type)
        .map(Comment => ({ Comment })));
    }
    if (tool === 'get_wiki') {
      assert.ok(opts.id || opts.name);
      return wrap([...pages.values()].filter(w => opts.id ? w.id === opts.id : w.name === opts.name).map(Wiki => ({ Wiki })));
    }
    writes.push(tool);
    if (tool === 'create_wiki' && hooks.refusal) return hooks.refusal;
    if (hooks.deny === tool) return { content: [{ type: 'text', text: JSON.stringify({ status: 0, data: null, info: '缺少本目录写权限' }) }] };
    if (hooks.noApply === tool) throw new Error('transport lost before readback');
    if (tool === 'create_wiki') {
      const id = String(++nextId);
      pages.set(id, { ...opts, id, workspace_id });
    } else if (tool === 'update_wiki') {
      Object.assign(pages.get(opts.id), opts);
    } else if (tool === 'create_comments') {
      comments.push({ id: String(++nextId), ...opts, workspace_id });
    } else assert.fail(tool);
    if (hooks.after) await hooks.after(tool, opts);
    if (hooks.lostAck === tool) throw new Error('ack lost');
    return wrap({});
  };
  const claim = async key => {
    const encoded = JSON.stringify(key);
    if (claimed.has(encoded)) return false;
    claimed.add(encoded);
    return () => claimed.delete(encoded);
  };
  const exec = (mode, params) => runStoryWiki(mode, params, run, claim);
  const confirmed = async (params = input) => {
    const { approval, fingerprint } = await exec('PLAN', params);
    return { ...params, approval, confirmedFingerprint: fingerprint };
  };
  return { pages, comments, writes, calls, hooks, exec, confirmed };
}

test('只读 PLAN，确认固定目标和精确原文；SAVE 读回且只回链一次', async () => {
  const f = fixture();
  f.comments.push({ id: '700', description: '提测wiki：https://www.tapd.cn/123/markdown_wikis/show/#700' });
  const request = await f.confirmed();
  assert.deepEqual(f.writes, []);
  await assert.rejects(f.exec('SAVE', { ...request, markdown: proposal }), /确认/);
  await assert.rejects(f.exec('SAVE', { ...request, confirmedFingerprint: '0'.repeat(64) }), /确认/);
  await assert.rejects(f.exec('SAVE', { ...request, approval: { ...request.approval, actor: '其他人' } }), /确认/);
  assert.equal((await f.exec('CHECK', request)).state, 'UNVERIFIED');
  assert.deepEqual(f.writes, []);
  f.hooks.lostAck = 'create_wiki';
  const completed = await f.exec('SAVE', request);
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments']);
  assert.equal(completed.markdown, markdown);
  assert.equal(completed.revision, 1);
  assert.deepEqual(await f.exec('READ', scope), completed);
  assert.equal((await f.exec('SAVE', request)).wikiId, completed.wikiId);
  assert.equal((await f.exec('CHECK', request)).state, 'CONFIRMED');
  assert.equal(f.writes.length, 2);
});

test('正文写入且回读一时失败，只读 CHECK 识别缺失回链并补写', async () => {
  const f = fixture(), request = await f.confirmed();
  let interrupted = false;
  f.hooks.before = (tool, opts) => {
    if (!interrupted && f.writes.length && tool === 'get_wiki' && opts.name) {
      interrupted = true; throw new Error('temporary outage');
    }
  };
  await assert.rejects(f.exec('SAVE', request), { code: 'UNKNOWN_WRITE' });
  assert.deepEqual(f.writes, ['create_wiki']);
  assert.equal((await f.exec('CHECK', request)).state, 'WIKI_VERIFIED_LINK_PENDING');
  f.hooks.lostAck = 'create_comments';
  assert.equal((await f.exec('SAVE', request)).state, 'CONFIRMED');
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments']);
});

test('未能证明结果的写操作保留已发标记，复跑不能盲目重发', async () => {
  const f = fixture(), request = await f.confirmed();
  f.hooks.noApply = 'create_wiki';
  await assert.rejects(f.exec('SAVE', request), { code: 'UNKNOWN_WRITE' });
  delete f.hooks.noApply;
  assert.equal((await f.exec('CHECK', request)).state, 'UNVERIFIED');
  await assert.rejects(f.exec('SAVE', request), { code: 'UNKNOWN_WRITE' });
  assert.deepEqual(f.writes, ['create_wiki']);
});

test('更版保留原完整快照和回链，归档后发生的人工修改阻止覆盖', async () => {
  const f = fixture(), previous = await f.exec('SAVE', await f.confirmed());
  const old = f.pages.get(previous.wikiId).markdown_description;
  const next = await f.confirmed({ ...input, markdown: proposal });
  f.hooks.after = tool => {
    if (tool === 'create_wiki') f.pages.get(previous.wikiId).markdown_description += '\n人工补充';
  };
  await assert.rejects(f.exec('SAVE', next), /归档后 Wiki 已变化/);
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments', 'create_wiki']);
  assert.equal([...f.pages.values()].find(p => p.parent_wiki_id === previous.wikiId).markdown_description, old);
  await assert.rejects(f.exec('READ', scope), /指纹或正文/);
  f.pages.get(previous.wikiId).markdown_description = old;
  delete f.hooks.after;
  const result = await f.exec('SAVE', next);
  assert.equal(result.wikiId, previous.wikiId);
  assert.equal(result.revision, 2);
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments', 'create_wiki', 'update_wiki', 'create_comments']);
  assert.equal(result.markdown, proposal);
  assert.equal((await f.exec('CHECK', next)).state, 'CONFIRMED');
});

test('进度只按授权和证据追加，幂等，顶部执行状态顺序流转，计划指纹稳定', async () => {
  const f = fixture(), request = await f.confirmed(), initial = await f.exec('SAVE', request);
  assert.equal(initial.executionStatus, '待执行');
  const started = await f.exec('START', { wikiUrl: initial.wikiUrl, startMode: 'MANUAL', limit: 'IMPLEMENT_ONLY' });
  assert.equal(started.executionStatus, '待执行');
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments']);
  const event = { ...scope, progressAuthorized: true, expectedApprovalFingerprint: initial.approvalFingerprint,
    expectedPageSha256: initial.pageSha256, receiptId: 'P1.start.01', entry: 'P1 开工', evidence: '首项功能实际差异记录 01', executionStatus: '开发中' };
  await assert.rejects(f.exec('PROGRESS', { ...event, progressAuthorized: false }), /需要授权/);
  await assert.rejects(f.exec('PROGRESS', { ...event, executionStatus: '已上线' }), /顺序/);
  f.hooks.lostAck = 'update_wiki';
  const result = await f.exec('PROGRESS', event);
  assert.equal(result.revision, 1);
  assert.equal(result.planSha256, initial.planSha256);
  assert.equal(result.approvalFingerprint, initial.approvalFingerprint);
  assert.equal(result.executionStatus, '开发中');
  assert.equal((await f.exec('READ', { wikiUrl: initial.wikiUrl })).executionStatus, '开发中');
  assert.deepEqual(result.delivery, initial.delivery);
  assert.match(result.markdown, /\| 执行状态 \| 开发中 \|/);
  assert.deepEqual(await f.exec('PROGRESS', event), result);
  await assert.rejects(f.exec('PROGRESS', { ...event, entry: '另一个事实' }), /已有不同记录/);
  await assert.rejects(f.exec('PROGRESS', { ...event, receiptId: 'P1.check.01' }), /基版已变化/);
  await assert.rejects(f.exec('PROGRESS', { ...event, expectedPageSha256: result.pageSha256, receiptId: 'P1.down', executionStatus: '待执行' }), /顺序/);
  assert.equal((await f.exec('CHECK', request)).state, 'CONFIRMED');
  await assert.rejects(f.confirmed({ ...input, markdown: proposal }), /保留完整现有执行记录/);
  const next = await f.confirmed({ ...input, markdown: result.markdown.replace('本轮交付门店', '本轮实现门店') });
  assert.equal((await f.exec('SAVE', next)).revision, 2);
  assert.match([...f.pages.values()].find(p => p.parent_wiki_id === initial.wikiId).markdown_description, /P1.start.01/);
  assert.equal(f.comments.filter(c => c.description.startsWith('需求开发执行文档：')).length, 1);
  assert.equal(f.comments.filter(c => c.description.includes('执行计划版本确认：')).length, 2);
});

test('拒绝无效正文、错空间标记、同名人工页和无正文读回', async () => {
  const f = fixture();
  await assert.rejects(f.exec('PLAN', { ...input, markdown: '# 草稿' }));
  assert.deepEqual(f.calls, []);
  f.comments.push({ id: '605', workspace_id: '123', entry_type: 'stories', entry_id: scope.storyId, description: '需求开发执行文档：https://www.tapd.cn/999/markdown_wikis/show/#123' });
  await assert.rejects(f.confirmed(), /无效或冲突/);
  f.comments.length = 0;
  f.pages.set('302', { id: '302', workspace_id: '123', name: '需求执行计划 · ' + scope.storyId, parent_wiki_id: scope.parentWikiId, markdown_description: 'manual' });
  await assert.rejects(f.confirmed(), /缺少执行计划身份/);
  delete f.pages.get('302').markdown_description;
  await assert.rejects(f.confirmed(), /正文不可读/);
  assert.deepEqual(f.writes, []);
});

test('Bug 与相同编号的 Story 使用独立目标、审批及回链，不能串用', async () => {
  const example = await readFile(new URL('fixtures/legacy-bug-plan.md', import.meta.url), 'utf8');
  // Deliberately give the Bug and Story the same numeric ID. Type is part of
  // the remote owner, page identity, approval fingerprint and write journal.
  const found = example.match(/https:\/\/www\.tapd\.cn\/tapd_fe\/(\d+)\/bug\/detail\/(\d+)/);
  assert.ok(found, 'Bug 正例应有完整的 TAPD Bug URL');
  const body = example.replaceAll(found[2], scope.storyId).replaceAll('/tapd_fe/' + found[1] + '/', '/tapd_fe/123/');
  const bug = { workspaceId: scope.workspaceId, bugId: scope.storyId, parentWikiId: scope.parentWikiId };
  const f = fixture({ bugId: bug.bugId });
  const storyRequest = await f.confirmed();
  const storyResult = await f.exec('SAVE', storyRequest);
  const params = { ...bug, actor: input.actor, markdown: body, schema: 3 };
  const bugRequest = await f.confirmed(params);
  await assert.rejects(f.exec('SAVE', { ...params, approval: storyRequest.approval, confirmedFingerprint: storyRequest.confirmedFingerprint }), /已确认/);
  await assert.rejects(f.exec('READ', { ...scope, bugId: scope.storyId }), /只能指定一项/);
  const bugResult = await f.exec('SAVE', bugRequest);
  assert.equal(bugResult.state, 'CONFIRMED');
  assert.equal(bugResult.bugId, bug.bugId);
  assert.notEqual(bugResult.wikiId, storyResult.wikiId);
  assert.equal(f.pages.get(bugResult.wikiId).name, 'Bug 修复计划 · ' + bug.bugId);
  assert.deepEqual(f.comments.map(c => [c.entry_type, c.description.split(' ｜ ')[0]]), [
    ['stories', '需求开发执行文档：' + storyResult.wikiUrl], ['bug', 'Bug 修复执行文档：' + bugResult.wikiUrl],
  ]);
  assert.ok(bugResult.approvalCommentId);
  assert.equal((await f.exec('READ', bug)).markdown, body);
  assert.equal((await f.exec('SAVE', bugRequest)).wikiId, bugResult.wikiId);
  f.pages.get(bugResult.wikiId).markdown_description = f.pages.get(storyResult.wikiId).markdown_description;
  await assert.rejects(f.exec('READ', bug), /Wiki 归属/);
  assert.equal((await f.exec('READ', scope)).wikiId, storyResult.wikiId);
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments', 'create_wiki', 'create_comments']);
});

test('独立版本确认须绑定实际作者和指纹，旧版回滚不能重新开工', async () => {
  const f = fixture(), request = await f.confirmed(), initial = await f.exec('SAVE', request);
  const original = f.pages.get(initial.wikiId).markdown_description;
  const receipt = f.comments.find(c => c.id === initial.approvalCommentId);
  receipt.author = '另一个账号';
  await assert.rejects(f.exec('READ', scope), /独立确认记录/);
  receipt.author = input.actor;
  const description = receipt.description;
  receipt.description = description.replace(request.confirmedFingerprint, '0'.repeat(64));
  await assert.rejects(f.exec('READ', scope), /独立确认记录/);
  receipt.description = description;
  const next = await f.confirmed({ ...input, markdown: proposal });
  const revised = await f.exec('SAVE', next);
  assert.notEqual(revised.approvalCommentId, initial.approvalCommentId);
  f.pages.get(initial.wikiId).markdown_description = original;
  await assert.rejects(f.exec('READ', scope), /较新版本/);
});

test('会话稿无需工作项或 Wiki 配置，转存后可在新会话仅凭链接恢复', async () => {
  const first = fixture();
  const draft = '# 评审稿\n范围待确认';
  assert.deepEqual(await first.exec('SESSION', { markdown: draft }), { state: 'SESSION', markdown: draft });
  assert.deepEqual(first.calls, []);
  const frontend = await readFile(new URL('../skills/collecting-requirements/assets/example-frontend-plan.md', import.meta.url), 'utf8');
  const reviewed = await first.exec('SESSION', { markdown: frontend });
  const saved = await first.exec('SAVE', await first.confirmed({ ...input, schema: 4, markdown: reviewed.markdown }));
  const fresh = fixture();
  fresh.pages.set(saved.wikiId, structuredClone(first.pages.get(saved.wikiId)));
  fresh.comments.push(...structuredClone(first.comments));
  assert.deepEqual(await fresh.exec('READ', { wikiUrl: saved.wikiUrl }), saved);
  assert.equal(saved.markdown, frontend);
  const started = await fresh.exec('START', { wikiUrl: saved.wikiUrl, startMode: 'MANUAL', selectedFeatures: ['P1-M1-F1'],
    startup: { submit: false, build: false } });
  assert.deepEqual(started.selectedFeatures, ['P1-M1-F1']);
  assert.equal(started.workflow, 'IMPLEMENT_ONLY');
  await assert.rejects(fresh.exec('READ', { wikiUrl: saved.wikiUrl, bugId: scope.storyId }), /工作项/);
  const copied = '707';
  fresh.pages.set(copied, { ...fresh.pages.get(saved.wikiId), id: copied, name: '历史 r1' });
  await assert.rejects(fresh.exec('READ', { wikiUrl: saved.wikiUrl.replace(/#\d+$/, '#' + copied) }), /正式页/);
  assert.deepEqual(fresh.writes, []);
});

test('跨页用例贯穿预览、保存和局部开工，维持正式页与交付授权的原有绑定', async () => {
  const f = fixture();
  const body = await readFile(new URL('../skills/collecting-requirements/assets/example-report-flow.md', import.meta.url), 'utf8');
  const request = { ...input, schema: 4, markdown: body, checkAcceptancePaths: true };
  await assert.rejects(f.exec('PLAN', { ...request, markdown: body.replace('| P1-M2-F1-UI1 |', '| P1-M2-F9-UI1 |') }), /引用不存在/);
  assert.deepEqual(f.calls, []);

  const preview = await f.exec('PLAN', request);
  assert.equal(preview.acceptanceReview.paths[0].steps.length, 5);
  assert.deepEqual(preview.acceptanceReview.standaloneTestIds, ['P1-M2-F1-TC1']);
  const saved = await f.exec('SAVE', { ...request, approval: preview.approval, confirmedFingerprint: preview.fingerprint });
  assert.equal(saved.markdown, body);
  const reused = await f.exec('PLAN', request);
  assert.equal(reused.action, 'REUSE');
  assert.deepEqual(reused.acceptanceReview, preview.acceptanceReview);
  const launch = { wikiUrl: saved.wikiUrl, startMode: 'MANUAL', selectedFeatures: ['P1-M1-F1'], startup: { submit: false, build: false } };
  const ordinary = await f.exec('START', launch);
  const checked = await f.exec('START', { ...launch, checkAcceptancePaths: true });
  assert.deepEqual(checked.selectedFeatures, launch.selectedFeatures);
  assert.deepEqual(checked.acceptanceReview.paths[0].outsideSelection, ['P1-M2-F1']);
  assert.equal(ordinary.acceptanceReview, undefined);
  assert.deepEqual(ordinary.tapdPlan, checked.tapdPlan);
  const downstream = await f.exec('START', { ...launch, selectedFeatures: ['P1-M2-F1'], checkAcceptancePaths: true });
  assert.deepEqual(downstream.selectedFeatures, ['P1-M2-F1']);
  assert.deepEqual(downstream.acceptanceReview.paths[0].outsideSelection, ['P1-M1-F1']);
  assert.deepEqual(downstream.acceptanceReview.standaloneTestIds, ['P1-M2-F1-TC1']);
  assert.deepEqual(await f.exec('READ', { wikiUrl: saved.wikiUrl }), saved);
  assert.deepEqual(f.writes, ['create_wiki', 'create_comments']);
});

test('新版执行页同页同步需求与实现变化，保留旧回执并重新绑定启动版本', async () => {
  const f = fixture();
  const frontend = await readFile(new URL('../skills/collecting-requirements/assets/example-frontend-plan.md', import.meta.url), 'utf8');
  const draft = { ...input, schema: 4, markdown: frontend };
  const initial = await f.exec('SAVE', await f.confirmed(draft));
  const current = await f.exec('PROGRESS', { ...scope, progressAuthorized: true, receiptId: 'P1.settings.verified',
    expectedPageSha256: initial.pageSha256, expectedApprovalFingerprint: initial.approvalFingerprint,
    entry: 'P1-M2-F1 已完成本地保存验证', evidence: '本地回归回执 01' });
  const previousPage = f.pages.get(initial.wikiId).markdown_description;
  const markdown = current.markdown
    .replace('需求增加区域筛选和清空后的第一页刷新。', '需求改为支持多选区域，清空后回到第一页。')
    .replace('选中的区域 ID 更新列表条件', '选中的区域 ID 数组更新列表条件')
    .replace('`GET /api/stores`', '`POST /api/stores/query`')
    .replace('`pageNo/regionId`', '`pageNo/regionIds`')
    .replace('调用 P1-D2 并用其返回行与总数刷新列表', '通过 P1-D2 提交区域 ID 数组并刷新列表')
    .replace('用账号 A 选择区域 R，验证请求带 R', '用账号 A 选择 R1、R2，验证请求体包含这两个区域 ID');
  const revision = { ...draft, markdown };
  const before = f.writes.length;
  await assert.rejects(f.exec('PLAN', revision), /最新 READ/);
  await assert.rejects(f.exec('PLAN', { ...revision, expectedPageSha256: initial.pageSha256 }), /最新 READ/);
  assert.equal(f.writes.length, before);

  const request = await f.confirmed({ ...revision, expectedPageSha256: current.pageSha256 });
  const saved = await f.exec('SAVE', request);
  assert.equal(saved.wikiUrl, initial.wikiUrl);
  assert.equal(saved.revision, 2);
  assert.equal(saved.markdown, markdown);
  assert.match(saved.markdown, /支持多选区域/);
  assert.match(saved.markdown, /POST \/api\/stores\/query/);
  assert.match(saved.markdown, /P1.settings.verified/);
  assert.equal([...f.pages.values()].find(page => page.parent_wiki_id === saved.wikiId)?.markdown_description, previousPage);
  assert.equal(f.comments.filter(comment => comment.description.startsWith('需求开发执行文档：')).length, 1);
  const competing = { ...draft, markdown: current.markdown.replace('显示营业状态', '显示门店营业状态') };
  await assert.rejects(f.exec('PLAN', { ...competing, expectedPageSha256: current.pageSha256 }), /最新 READ/);

  const launch = { wikiUrl: saved.wikiUrl, startMode: 'MANUAL', selectedFeatures: ['P1-M1-F1'],
    startup: { submit: false, build: false } };
  await assert.rejects(f.exec('START', { ...launch, expectedRevision: initial.revision }), /版本已变化/);
  const started = await f.exec('START', { ...launch, expectedRevision: saved.revision,
    expectedApprovalFingerprint: saved.approvalFingerprint });
  assert.deepEqual(started.selectedFeatures, ['P1-M1-F1']);
  assert.equal(started.tapdPlan.expectedRevision, 2);
  assert.equal(started.markdown, saved.markdown);
});

test('执行 Bug Plan 的新会话仅凭链接读回 Bug 的范围与既有进度', async () => {
  const bugId = '111230010000102';
  const f = fixture({ bugId });
  const bug = { workspaceId: scope.workspaceId, parentWikiId: scope.parentWikiId, bugId };
  const body = await readFile(new URL('../skills/collecting-requirements/assets/example-bug-plan.md', import.meta.url), 'utf8');
  const saved = await f.exec('SAVE', await f.confirmed({ ...bug, markdown: body, actor: input.actor }));
  const event = { ...bug, receiptId: 'p1.start', entry: '按确认分支开工',
    evidence: '已核对分支及开工授权', expectedPageSha256: saved.pageSha256,
    expectedApprovalFingerprint: saved.approvalFingerprint, progressAuthorized: true };
  await assert.rejects(f.exec('PROGRESS', { ...event, executionStatus: '开发中' }), /实际回执/);
  const started = await f.exec('PROGRESS', event);
  assert.equal(started.markdown, body + '- [p1.start] 按确认分支开工｜依据 已核对分支及开工授权\n');
  assert.equal(started.planSha256, saved.planSha256);
  assert.equal(started.delivery, null);
  assert.deepEqual(await f.exec('READ', { wikiUrl: saved.wikiUrl }), started);
  assert.equal(started.bugId, bugId);
  assert.equal(started.storyId, undefined);
});

test('已有旧式同条目草稿在确认后归档原文，原 Wiki 链接继续用于新会话', async () => {
  const f = fixture();
  const id = '325';
  const draft = { id, workspace_id: '123', name: '选择门店｜需求执行文档', parent_wiki_id: scope.parentWikiId,
    markdown_description: markdown.replace(/(需求 ID \| )(\d+)/, '$1`$2`') + '\n先核对来源。' };
  f.pages.set(id, { ...draft });
  const preview = await f.exec('PLAN', input);
  assert.equal(preview.action, 'ADOPT');
  assert.deepEqual(preview.operations, ['ARCHIVE_DRAFT', 'ADOPT_WIKI', 'ADD_LINK_AND_APPROVAL_RECEIPT']);
  assert.equal(preview.wikiId, id);
  assert.deepEqual(f.writes, []);
  const request = { ...input, approval: preview.approval, confirmedFingerprint: preview.fingerprint };
  f.pages.get(id).markdown_description += '用户补充';
  await assert.rejects(f.exec('SAVE', request), /原正文已变化/);
  assert.deepEqual(f.writes, []);
  const original = f.pages.get(id).markdown_description;
  const saved = await f.exec('SAVE', await f.confirmed());
  assert.equal(saved.wikiId, id);
  assert.deepEqual(await f.exec('READ', { wikiUrl: saved.wikiUrl }), saved);
  assert.equal([...f.pages.values()].find(page => page.parent_wiki_id === id)?.markdown_description, original);
  assert.deepEqual(f.writes, ['create_wiki', 'update_wiki', 'create_comments']);
  const other = fixture();
  other.pages.set(id, { ...draft, markdown_description: draft.markdown_description.replace('/story/detail/', '/bug/detail/') });
  await assert.rejects(other.exec('PLAN', input), /选定工作项不符/);
  assert.deepEqual(other.writes, []);
});

test('已上线范围修订后开启新的状态周期，归档保留完整旧版且保存可重放', async () => {
  const f = fixture();
  let page = await f.exec('SAVE', await f.confirmed());
  for (const [receiptId, executionStatus] of [['start', '开发中'], ['live', '已上线']]) {
    page = await f.exec('PROGRESS', { ...scope, expectedApprovalFingerprint: page.approvalFingerprint,
      expectedPageSha256: page.pageSha256, progressAuthorized: true, receiptId, executionStatus, entry: '进度回读', evidence: '已核实回执 ' + receiptId });
  }
  const infoOnly = await f.exec('PLAN', { ...input, markdown: page.markdown.replace('TAPD 需求状态 | 待开发', 'TAPD 需求状态 | 已验收') });
  assert.match(infoOnly.markdown, /执行状态 \| 已上线/);
  assert.ok(infoOnly.markdown.includes('- [live]'));
  const compact = await f.exec('PLAN', { ...input, markdown: page.markdown.replace('| 是否开启子智能体开发模式 | 否 |\n', '') });
  assert.equal(compact.approval.restartsExecution, undefined);
  assert.match(compact.markdown, /执行状态 \| 已上线/);
  assert.ok(compact.markdown.includes('- [live]'));
  const update = { ...input, markdown: page.markdown.replace('门店候选查询', '新的门店候选查询') };
  const preview = await f.exec('PLAN', update);
  assert.match(preview.markdown, /执行状态 \| 待执行/);
  assert.ok(!preview.markdown.includes('- [live]'));
  const request = { ...update, approval: preview.approval, confirmedFingerprint: preview.fingerprint };
  const revised = await f.exec('SAVE', request);
  assert.equal(revised.revision, 2);
  assert.equal(revised.markdown, preview.markdown);
  assert.equal((await f.exec('SAVE', request)).approvalFingerprint, revised.approvalFingerprint);
  assert.ok([...f.pages.values()].some(w => w.name.startsWith('历史 r1') && w.markdown_description.includes('- [live]')));
  const active = await f.exec('PROGRESS', { ...scope, expectedApprovalFingerprint: revised.approvalFingerprint, expectedPageSha256: revised.pageSha256,
    progressAuthorized: true, executionStatus: '开发中', receiptId: 'start', entry: '新版开工', evidence: 'r2 分支回执' });
  assert.match(active.markdown, /执行状态 \| 开发中/);
});

test('有唯一回链的旧稿在 Story 改名后按 ID 复用，并核验目录及正文归属', async () => {
  const f = fixture(), id = '325';
  const page = { id, workspace_id: scope.workspaceId, parent_wiki_id: scope.parentWikiId,
    name: '旧需求标题｜需求执行文档', markdown_description: markdown };
  f.pages.set(id, page);
  f.hooks.storyName = '现在的新标题';
  f.comments.push({ id: '300', workspace_id: scope.workspaceId, entry_type: 'stories', entry_id: scope.storyId,
    author: input.actor, description: '需求开发执行文档：https://www.tapd.cn/123/markdown_wikis/show/#325' });
  assert.equal((await f.exec('PLAN', input)).action, 'ADOPT');
  page.parent_wiki_id = '555';
  await assert.rejects(f.exec('PLAN', input), /目录/);
  page.parent_wiki_id = scope.parentWikiId;
  const saved = await f.exec('SAVE', await f.confirmed());
  assert.equal(saved.wikiId, id);
  assert.equal(f.writes.filter(name => name === 'create_wiki').length, 1); // the archive
});

test('TAPD 明确拒绝首次建页时可恢复权限后重试，未知派发继续防重', async () => {
  const f = fixture(), request = await f.confirmed();
  f.hooks.deny = 'create_wiki';
  await assert.rejects(f.exec('SAVE', request), { code: 'WRITE_REJECTED' });
  delete f.hooks.deny;
  assert.equal((await f.exec('SAVE', request)).state, 'CONFIRMED');
  assert.deepEqual(f.writes, ['create_wiki', 'create_wiki', 'create_comments']);
});

test('START 绑定项目、模块、功能交集；只构建但无获准 Job 时结束', async () => {
  const f = fixture(), page = await f.exec('SAVE', await f.confirmed());
  const start = opts => f.exec('START', { wikiUrl: page.wikiUrl, startMode: 'MANUAL', ...opts });
  const selected = await start({ selectedProjects: ['P2'], selectedModules: ['P2-M1'] });
  assert.deepEqual(selected.selectedFeatures, ['P2-M1-F1']);
  assert.deepEqual(selected.tapdPlan.selectedFeatures, selected.selectedFeatures);
  assert.equal(selected.partial, true);
  await assert.rejects(start({ selectedProjects: ['P2'], selectedFeatures: ['P1-M1-F1'] }), /范围/);
  await assert.rejects(start({ selectedModules: [] }), /范围/);
  const build = await start({ limit: 'BUILD_ONLY' });
  assert.equal(build.next, 'NO_ACTION');
  assert.equal(build.workflow, 'NO_ACTION');
  assert.deepEqual(build.gitProjects, []);
});

test('an explicit MCP HTTP denial is retryable; an inconclusive permission timeout keeps its claim', async () => {
  for (const [response, code] of [
    [{ isError: true, content: [{ type: 'text', text: 'HTTP 403 Forbidden' }] }, 'WRITE_REJECTED'],
    [{ content: [{ type: 'text', text: JSON.stringify({ status: 0, info: '权限验证请求超时，请稍后核实写入结果' }) }] }, 'UNKNOWN_WRITE'],
  ]) {
    const f = fixture(), request = await f.confirmed();
    f.hooks.refusal = response;
    await assert.rejects(f.exec('SAVE', request), { code });
    delete f.hooks.refusal;
    if (code === 'WRITE_REJECTED') assert.equal((await f.exec('SAVE', request)).state, 'CONFIRMED');
    else {
      await assert.rejects(f.exec('SAVE', request), { code });
      assert.deepEqual(f.writes, ['create_wiki']);
    }
  }
});
