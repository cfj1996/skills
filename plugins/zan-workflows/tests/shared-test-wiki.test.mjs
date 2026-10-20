import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureTestWiki, contentHash, parseArgs } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';

const workspaceId = 50372234, story = '100', taskA = '101', taskB = '102', bug = '200';
const monthId = '300', wikiId = '400', branchA = 'feature/alice.story', branchB = 'feature/bob.story';
const repoA = 'https://git.example.com/team/h5.git', repoB = 'https://git.example.com/team/mini.git';
const title = '10-20: 直播间按钮调整', month = '2026-10';
const url = id => `https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#${id}`;
const response = (kind, rows) => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1,
  data: rows.map(row => ({ [kind]: row })) }) }] });
const entry = (n, repo, branch) => `${n}. Job：[live](https://jenkins.example.com/job/live/)\n- 项目名称：[live](${repo})\n- 代码分支名：${branch}\n- 影响范围：\n  1. 保留当前项目范围\n- 是否上线：未合并\n`;
const bodyA = `# 前端\n\n${entry(1, repoA, branchA)}`;

function fixture() {
  const items = new Map([
    [`stories:${story}`, { id: story, name: '直播间按钮调整', description: '' }],
    [`tasks:${taskA}`, { id: taskA, name: '【H5】直播间按钮调整', story_id: story, description: '' }],
    [`tasks:${taskB}`, { id: taskB, name: '【小程序】直播间按钮调整', story_id: story, description: '' }],
    [`bug:${bug}`, { id: bug, title: '直播间按钮调整', story_id: story, description: '' }],
  ]);
  const comments = new Map(), wikis = new Map([[monthId, { id: monthId, name: month, parent_wiki_id: '1150372234001008260' }]]);
  const calls = [];
  let hook;
  const key = (type, id) => `${type}:${id}`;
  const link = (type, id, page = wikiId) => comments.set(key(type, id), [{ id: `c-${id}`, description: `提测wiki：${url(page)}` }]);
  const call = async (name, args) => {
    calls.push({ name, args });
    const override = await hook?.(name, args);
    if (override !== undefined) return override;
    const o = args.options;
    if (name === 'get_stories_or_tasks' || name === 'get_bug') {
      if (o.story_id) return response('Task', [...items.values()].filter(item => item.story_id === o.story_id && items.get(`tasks:${item.id}`)).slice((o.page - 1) * o.limit, o.page * o.limit));
      const kind = name === 'get_bug' ? 'bug' : o.entity_type;
      return response(kind === 'bug' ? 'Bug' : kind === 'tasks' ? 'Task' : 'Story', [items.get(key(kind, o.id))].filter(Boolean));
    }
    if (name === 'get_comments') return response('Comment', (comments.get(key(o.entry_type, o.entry_id)) || []).slice((o.page - 1) * o.limit, o.page * o.limit));
    if (name === 'get_wiki') return response('Wiki', [...wikis.values()].filter(w => o.id ? w.id === o.id : w.name === o.name));
    if (name === 'create_wiki') {
      assert.equal([...wikis.values()].filter(w => w.name === o.name).length, 0, '不得重复创建同名 Wiki');
      const wiki = { id: wikiId, ...o }; wikis.set(wikiId, wiki); return response('Wiki', [wiki]);
    }
    if (name === 'update_wiki') { Object.assign(wikis.get(o.id), o); return response('Wiki', [wikis.get(o.id)]); }
    if (name === 'create_comments') {
      const rows = comments.get(key(o.entry_type, o.entry_id)) || [];
      rows.push({ id: `c-${calls.length}`, description: o.description }); comments.set(key(o.entry_type, o.entry_id), rows);
      return response('Comment', [rows.at(-1)]);
    }
    throw Error(`unexpected ${name}`);
  };
  return { items, comments, wikis, calls, call, link, setHook: fn => { hook = fn; },
    putWiki: (body = bodyA) => wikis.set(wikiId, { id: wikiId, name: title, parent_wiki_id: monthId, markdown_description: body }),
    writes: () => calls.filter(c => /^(create|update)_/.test(c.name)) };
}
const input = (entryId = taskA, sourceBranch = branchA, entryRepoUrl = repoA) => ({
  workspaceId, entryType: 'tasks', entryId, sourceBranch, entryRepoUrl, month,
});
const binding = plan => ({ expectedOwnerType: plan.wikiOwner.entryType, expectedOwnerId: plan.wikiOwner.entryId,
  expectTarget: plan.target, expectedWikiId: plan.wikiId || undefined,
  expectedMonthId: plan.monthWikiId, expectedBodySha256: plan.beforeBodySha256 || undefined,
  wikiTitle: plan.wikiTitle, creator: 'Alice', commentAuthor: 'Alice', execute: true });
async function withBody(body, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'shared-test-wiki-'));
  try { const bodyFile = join(dir, 'body.md'); await writeFile(bodyFile, body); return await fn(bodyFile); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('two sibling Tasks create one Story Wiki, append per project and link the same page idempotently', async () => {
  const f = fixture();
  const first = await ensureTestWiki(f.call, input());
  assert.equal(first.wikiTitle.replace(/^\d\d-\d\d: /, ''), '直播间按钮调整');
  assert.deepEqual(first.wikiOwner, { entryType: 'stories', entryId: story });
  assert.equal(first.commentOperations.length, 2);
  await withBody(bodyA, bodyFile => ensureTestWiki(f.call, { ...input(), ...binding(first), bodyFile }));
  const second = await ensureTestWiki(f.call, input(taskB, branchB, repoB));
  assert.equal(second.target, 'REUSE_EXISTING');
  assert.equal(second.entryOperation, 'APPEND_ENTRY');
  assert.equal(second.state, 'PLANNED_APPEND_ENTRY');
  assert.equal(second.beforeBody, bodyA);
  await assert.rejects(ensureTestWiki(f.call, { ...input(taskB, branchB, repoB), ...binding(second) }), /完整正文/);
  const combined = `${bodyA}\n${entry(2, repoB, branchB)}`;
  await withBody(combined, async bodyFile => {
    const result = await ensureTestWiki(f.call, { ...input(taskB, branchB, repoB), ...binding(second), bodyFile });
    assert.equal(result.wikiId, wikiId);
    const repeated = await ensureTestWiki(f.call, { ...input(taskB, branchB, repoB), ...binding(second), bodyFile });
    assert.equal(repeated.writes, 0);
  });
  assert.equal(f.wikis.get(wikiId).markdown_description, combined);
  assert.equal(f.writes().filter(c => c.name === 'create_wiki').length, 1);
  for (const key of [`stories:${story}`, `tasks:${taskA}`, `tasks:${taskB}`]) {
    assert.equal(f.comments.get(key).length, 1);
    assert.ok(f.comments.get(key)[0].description.includes(url(wikiId)));
  }
});

test('a sibling-only old Wiki is found across months without a parent or current Task link', async () => {
  const f = fixture(); f.putWiki(); f.link('tasks', taskA);
  const plan = await ensureTestWiki(f.call, { ...input(taskB, branchB, repoB), month: '2026-11' });
  assert.equal(plan.wikiId, wikiId); assert.equal(plan.target, 'REUSE_EXISTING');
  assert.equal(plan.state, 'PLANNED_APPEND_ENTRY');
  assert.equal(f.writes().length, 0);
  assert.ok(f.calls.filter(c => c.name === 'get_wiki').every(c => c.args.options.id === wikiId));
});

test('Story entry also finds legacy links on child Tasks', async () => {
  const f = fixture(); f.putWiki(); f.link('tasks', taskA);
  const plan = await ensureTestWiki(f.call, { ...input(story), entryType: 'stories' });
  assert.equal(plan.wikiId, wikiId); assert.equal(f.writes().length, 0);
});

test('two repositories may share a branch name without merging or rejecting project entries', async () => {
  const f = fixture(), combined = `${bodyA}\n${entry(2, repoB, branchA)}`;
  f.putWiki(combined); f.link('stories', story); f.link('tasks', taskB);
  const result = await ensureTestWiki(f.call, { ...input(taskB, branchA, repoB), execute: true });
  assert.equal(result.writes, 0); assert.equal(result.entryOperation, 'REUSE_ENTRY');
  const missingRepo = 'https://git.example.com/team/third.git';
  const append = await ensureTestWiki(f.call, input(taskB, branchA, missingRepo));
  assert.equal(append.entryOperation, 'APPEND_ENTRY');
  f.putWiki(`${combined}\n${entry(3, repoB, branchA)}`);
  await assert.rejects(ensureTestWiki(f.call, input(taskB, branchA, repoB)), /重复的原分支/);
});

test('one Bug across projects and branches appends to one Wiki, without grouping it by related Story', async () => {
  const f = fixture(); f.putWiki(); f.link('bug', bug);
  const runInput = { ...input(bug, 'fixbug/bob.other', repoB), entryType: 'bug' };
  const plan = await ensureTestWiki(f.call, runInput);
  assert.deepEqual(plan.wikiOwner, { entryType: 'bug', entryId: bug });
  assert.equal(plan.state, 'PLANNED_APPEND_ENTRY');
  const after = `${bodyA}\n${entry(2, repoB, runInput.sourceBranch)}`;
  await withBody(after, bodyFile => ensureTestWiki(f.call, { ...runInput, ...binding(plan), bodyFile }));
  assert.equal(f.wikis.get(wikiId).markdown_description, after);
  assert.equal(f.writes().filter(c => c.name === 'create_wiki').length, 0);
  assert.ok(!f.calls.some(c => c.name === 'get_stories_or_tasks'));
});

test('parent/current and historical sibling Wiki conflicts block without creating a third page', async () => {
  for (const parentLinked of [false, true]) {
    const f = fixture(); f.putWiki(); f.link('tasks', taskA); f.link('tasks', taskB, '999');
    if (parentLinked) f.link('stories', story);
    await assert.rejects(ensureTestWiki(f.call, input(taskB, branchB, repoB)), /多个不同的提测 Wiki/);
    assert.equal(f.writes().length, 0);
  }
});

test('Task-specific creation titles and changed parent bindings cannot split an approved group', async () => {
  const f = fixture();
  await assert.rejects(ensureTestWiki(f.call, { ...input(), wikiTitle: '10-20: 【H5】直播间按钮调整' }), /父 Story 标题/);
  const plan = await ensureTestWiki(f.call, input());
  f.items.get(`tasks:${taskA}`).story_id = '999';
  f.items.set('stories:999', { id: '999', name: '另一需求' });
  await assert.rejects(ensureTestWiki(f.call, { ...input(), ...binding(plan) }), /归属与确认计划不一致/);
  assert.equal(f.writes().length, 0);
});

test('separately planned creates cannot silently create a second page after first project delivers', async () => {
  const f = fixture();
  const a = await ensureTestWiki(f.call, input());
  const b = await ensureTestWiki(f.call, input(taskB, branchB, repoB));
  await withBody(bodyA, bodyFile => ensureTestWiki(f.call, { ...input(), ...binding(a), bodyFile }));
  await withBody(`${bodyA}\n${entry(2, repoB, branchB)}`, async bodyFile => {
    await assert.rejects(ensureTestWiki(f.call, { ...input(taskB, branchB, repoB), ...binding(b), bodyFile }), /目标动作变为 REUSE_EXISTING/);
  });
  assert.equal(f.writes().filter(c => c.name === 'create_wiki').length, 1);
});

test('owner comment readback failure stops before Task comment and exposes completed effects', async () => {
  const f = fixture(), plan = await ensureTestWiki(f.call, input());
  f.setHook((name, args) => {
    if (name === 'create_comments' && args.options.entry_type === 'stories') return response('Comment', [{ id: 'lost' }]);
  });
  await withBody(bodyA, async bodyFile => {
    await assert.rejects(ensureTestWiki(f.call, { ...input(), ...binding(plan), bodyFile }), error => {
      assert.equal(error.result.phase, 'READ_COMMENT'); assert.equal(error.result.wikiState, 'CREATED');
      assert.equal(error.result.state, 'BLOCKED'); return /评论读回/.test(error.message);
    });
  });
  assert.ok(!f.calls.some(c => c.name === 'create_comments' && c.args.options.entry_type === 'tasks'));
});

test('sibling pagination must be complete and parent identity must be available', async () => {
  const f = fixture();
  delete f.items.get(`tasks:${taskA}`).story_id;
  await assert.rejects(ensureTestWiki(f.call, input()), /story_id/);
  f.items.get(`tasks:${taskA}`).story_id = story;
  f.setHook((name, args) => {
    if (name === 'get_stories_or_tasks' && args.options.story_id) return response('Task', [{ id: taskB, story_id: '999' }]);
  });
  await assert.rejects(ensureTestWiki(f.call, input()), /父需求不一致/);
  assert.equal(f.writes().length, 0);
});

test('workflow session previews a second project without body and keeps owner and repository selectors', async () => {
  const f = fixture(); f.putWiki(); f.link('stories', story);
  const session = new WorkflowSession({ pool: { call: (_server, name, args) => f.call(name, args), close() {} } });
  try {
    const plan = await session.dispatch({ id: 'second-project', action: 'wiki', phase: 'PLAN', input: input(taskB, branchB, repoB) });
    assert.equal(plan.wikiId, wikiId); assert.equal(plan.entryOperation, 'APPEND_ENTRY');
    assert.equal(f.writes().length, 0);
  } finally { session.close(); }
  const parsed = parseArgs(['--workspace-id', String(workspaceId), '--entry-type', 'tasks', '--entry-id', taskB,
    '--source-branch', branchB, '--entry-repo-url', repoB, '--expected-owner-type', 'stories', '--expected-owner-id', story]);
  assert.equal(parsed.entryRepoUrl, repoB); assert.equal(parsed.expectedOwnerId, story);
  assert.throws(() => parseArgs(['--workspace-id', String(workspaceId), '--entry-type', 'tasks', '--entry-id', taskB,
    '--source-branch', branchB, '--expected-owner-id', story]), /归属必须成对/);
});

test('a multi-project batch creates the combined page once and only links the next delivered Task', async () => {
  const f = fixture(), combined = `${bodyA}\n${entry(2, repoB, branchA)}`;
  const plan = await ensureTestWiki(f.call, input());
  await withBody(combined, bodyFile => ensureTestWiki(f.call, { ...input(), ...binding(plan), bodyFile }));
  const linkInput = { ...input(taskB, branchA, repoB), mode: 'link', expectedWikiId: wikiId };
  const linkPlan = await ensureTestWiki(f.call, linkInput);
  assert.equal(linkPlan.commentOperations.length, 1);
  const result = await ensureTestWiki(f.call, { ...linkInput, ...binding(linkPlan) });
  assert.equal(result.wikiState, 'UNCHANGED'); assert.equal(result.commentState, 'LINKED');
  assert.equal(f.writes().filter(c => /wiki$/.test(c.name)).length, 1);
  assert.equal(f.wikis.get(wikiId).markdown_description, combined);
  assert.ok(f.comments.get(`tasks:${taskB}`)[0].description.includes(url(wikiId)));
});

test('two original branches in the same repository occupy separate entries on one Bug Wiki', async () => {
  const f = fixture(); f.putWiki(); f.link('bug', bug);
  const runInput = { ...input(bug, 'fixbug/bob.second', repoA), entryType: 'bug' };
  const plan = await ensureTestWiki(f.call, runInput);
  assert.equal(plan.entryOperation, 'APPEND_ENTRY');
  const combined = `${bodyA}\n${entry(2, repoA, runInput.sourceBranch)}`;
  await withBody(combined, bodyFile => ensureTestWiki(f.call, { ...runInput, ...binding(plan), bodyFile }));
  assert.equal(f.wikis.get(wikiId).markdown_description, combined);
  assert.equal(f.writes().filter(c => c.name === 'create_wiki').length, 0);
});

test('Task link-only mode does not add an unrequested parent comment', async () => {
  const f = fixture(); f.putWiki();
  const linkInput = { ...input(), mode: 'link', expectedWikiId: wikiId };
  const plan = await ensureTestWiki(f.call, linkInput);
  const result = await ensureTestWiki(f.call, { ...linkInput, ...binding(plan) });
  assert.equal(result.commentState, 'LINKED');
  assert.equal(f.comments.has(`stories:${story}`), false);
  assert.deepEqual(f.writes().map(c => [c.name, c.args.options.entry_type]), [['create_comments', 'tasks']]);
});

test('missing owner binding or unreadable parent prevents a Task write', async () => {
  const f = fixture(), plan = await ensureTestWiki(f.call, input());
  await withBody(bodyA, async bodyFile => {
    await assert.rejects(ensureTestWiki(f.call, { ...input(), ...binding(plan), expectedOwnerId: undefined,
      expectedOwnerType: undefined, bodyFile }), /固定确认计划/);
  });
  f.items.delete(`stories:${story}`);
  await assert.rejects(ensureTestWiki(f.call, input()), /stories 100 不存在/);
  assert.equal(f.writes().length, 0);
});

test('sibling list pagination without count finds an older linked Task and rejects repeated pages', async () => {
  const f = fixture(); f.putWiki(); f.link('tasks', taskB);
  const filler = Array.from({ length: 100 }, (_, i) => ({ id: String(1000 + i), story_id: story }));
  f.setHook((name, args) => {
    if (name === 'get_stories_or_tasks' && args.options.story_id) return response('Task',
      args.options.page === 1 ? filler : [f.items.get(`tasks:${taskB}`)]);
  });
  const plan = await ensureTestWiki(f.call, input());
  assert.equal(plan.wikiId, wikiId);
  assert.deepEqual(f.calls.filter(c => c.name === 'get_stories_or_tasks' && c.args.options.story_id).map(c => c.args.options.page), [1, 2]);
  f.setHook((name, args) => name === 'get_stories_or_tasks' && args.options.story_id ? response('Task', filler) : undefined);
  await assert.rejects(ensureTestWiki(f.call, input()), /分页重复/);
  assert.equal(f.writes().length, 0);
});

test('the shared-entry selector ignores fenced examples and normalizes repository protocols', async () => {
  const f = fixture();
  f.putWiki(`${bodyA}\n\`\`\`md\n${entry(2, repoA, branchA)}\`\`\`\n`);
  f.link('bug', bug);
  const plan = await ensureTestWiki(f.call, { ...input(bug, branchA, 'git@git.example.com:team/h5.git'), entryType: 'bug' });
  assert.equal(plan.entryOperation, 'REUSE_ENTRY');
  assert.equal(plan.wikiId, wikiId); assert.equal(f.writes().length, 0);
});

test('appending another project cannot replace the page with only its own entry', async () => {
  const f = fixture(); f.putWiki(); f.link('bug', bug);
  const runInput = { ...input(bug, branchB, repoB), entryType: 'bug' };
  const plan = await ensureTestWiki(f.call, runInput);
  await withBody(`# 前端\n\n${entry(1, repoB, branchB)}`, async bodyFile => {
    await assert.rejects(ensureTestWiki(f.call, { ...runInput, ...binding(plan), bodyFile }), /保留已有 Wiki 全部正文/);
  });
  assert.equal(f.writes().length, 0); assert.equal(f.wikis.get(wikiId).markdown_description, bodyA);
});
