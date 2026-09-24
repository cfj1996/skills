import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  chinaDate, ensureTestWiki, parseArgs, records, totalCount,
  wikiIdsFromComments,
} from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';

const workspaceId = 50372234;
const entryId = '1150372234001080829';
const branch = 'feature/alice.0924.1080829.store-delivery';
const rootId = '1150372234001008260';
const monthId = '1150372234001015192';
const childId = '1150372234001015611';
const month = '2026-09';
const title = '09-24: 门店发货单前端适配';
const url = `https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#${childId}`;

function response(kind, rows, count = rows.length) {
  return { content: [{ type: 'text', text: JSON.stringify({
    data: JSON.stringify({ status: 1, data: rows.map(row => ({ [kind]: row })) }),
    count: JSON.stringify({ status: 1, data: { count } }),
  }) }] };
}

function makeFake({ linked = false, monthExists = true, childExists = false } = {}) {
  const calls = [];
  const wikis = new Map();
  if (monthExists) wikis.set(monthId, { id: monthId, name: month, parent_wiki_id: rootId });
  if (childExists || linked) wikis.set(childId, {
    id: childId, name: title, parent_wiki_id: monthId,
    markdown_description: `# 前端\n- 代码分支名：${branch}`,
  });
  const comments = linked ? [{ id: '1', description: `提测wiki：[${url}](${url})` }] : [];
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_stories_or_tasks') return response(
      args.options.entity_type === 'tasks' ? 'Task' : 'Story',
      [{ id: entryId, name: '门店发货单前端适配' }],
    );
    if (name === 'get_bug') return response('Bug', [{ id: entryId, title: '门店发货单前端适配' }]);
    if (name === 'get_comments') return response('Comment', comments);
    if (name === 'get_wiki') {
      const { id, name: queryName } = args.options;
      if (id) return response('Wiki', [wikis.get(String(id))].filter(Boolean));
      const rows = [...wikis.values()].filter(wiki => wiki.name === queryName);
      if (queryName === month) rows.unshift({ id: 'decoy', name: month, parent_wiki_id: 'other-root' });
      return response('Wiki', rows);
    }
    if (name === 'create_wiki') {
      const id = args.options.name === month ? monthId : childId;
      const wiki = { id, ...args.options };
      wikis.set(id, wiki);
      return { content: [{ type: 'text', text: JSON.stringify({ data: JSON.stringify({
        status: 1, data: args.options.name === month ? { Wiki: wiki } : { id },
      }) }) }] };
    }
    if (name === 'create_comments') {
      comments.push({ id: 'new', description: args.options.description });
      return response('Comment', [comments.at(-1)]);
    }
    throw new Error(`unexpected ${name}`);
  };
  return { call, calls };
}

function input(bodyFile, execute = false) {
  return {
    workspaceId, entryType: 'stories', entryId, sourceBranch: branch,
    creator: 'Alice', commentAuthor: 'Alice', bodyFile, wikiTitle: title,
    month, execute,
  };
}

test('parses the TAPD wrapper and recognizes Wiki links in comments', () => {
  const wrapped = response('Wiki', [{ id: childId }]);
  assert.equal(records(wrapped, 'Wiki')[0].id, childId);
  assert.equal(records({ content: [{ type: 'text', text: JSON.stringify({
    data: JSON.stringify({ status: 1, data: { Wiki: { id: childId } } }),
  }) }] }, 'Wiki')[0].id, childId);
  assert.equal(totalCount(wrapped), 1);
  assert.deepEqual(wikiIdsFromComments([{ description: `<p>提测wiki：<a href="${url}">${url}</a></p>` }], workspaceId), [childId]);
  assert.deepEqual(chinaDate(new Date('2026-09-23T16:30:00Z')), { month, day: '09-24' });
  assert.equal(parseArgs(['--workspace-id', String(workspaceId), '--entry-type', 'stories',
    '--entry-id', entryId, '--source-branch', branch]).entryId, entryId);
  assert.deepEqual(
    (({ workspaceId, entryType, entryId }) => ({ workspaceId, entryType, entryId }))(
      parseArgs(['--tapd-url', `https://www.tapd.cn/tapd_fe/${workspaceId}/story/detail/${entryId}`,
        '--source-branch', branch])),
    { workspaceId, entryType: 'stories', entryId },
  );
});

test('uses a linked Wiki in three reads without listing or writing', async () => {
  const fake = makeFake({ linked: true });
  const result = await ensureTestWiki(fake.call, input(undefined, true));
  assert.equal(result.state, 'ALREADY_LINKED');
  assert.deepEqual(fake.calls.map(call => call.name), [
    'get_stories_or_tasks', 'get_comments', 'get_wiki',
  ]);
});

test('uses the same linked-Wiki path for Task and Bug identities', async () => {
  for (const entryType of ['tasks', 'bug']) {
    const fake = makeFake({ linked: true });
    const result = await ensureTestWiki(fake.call, { ...input(undefined, true), entryType });
    assert.equal(result.state, 'ALREADY_LINKED');
    assert.equal(fake.calls.filter(call => call.name.startsWith('create_')).length, 0);
  }
});

test('previews a missing child with one month lookup and one title lookup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zan-wiki-'));
  try {
    const bodyFile = join(dir, 'wiki.md');
    await writeFile(bodyFile, `# 前端\n- 代码分支名：${branch}`);
    const fake = makeFake();
    const result = await ensureTestWiki(fake.call, input(bodyFile));
    assert.equal(result.state, 'PLANNED_CREATE_CHILD');
    assert.equal(result.monthWikiId, monthId);
    assert.equal(fake.calls.filter(call => call.name === 'get_wiki').length, 2);
    assert.ok(fake.calls.every(call => !Object.hasOwn(call.args.options || {}, 'parent_wiki_id')));
    assert.equal(fake.calls.filter(call => call.name.startsWith('create_')).length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('creates month, child and comment once, then reads back each write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zan-wiki-'));
  try {
    const bodyFile = join(dir, 'wiki.md');
    await writeFile(bodyFile, `# 前端\n- 代码分支名：${branch}`);
    const fake = makeFake({ monthExists: false });
    const result = await ensureTestWiki(fake.call, {
      ...input(bodyFile, true), expectTarget: 'CREATE_MONTH_AND_CHILD',
    });
    assert.equal(result.state, 'LINKED');
    assert.equal(result.writes, 3);
    assert.deepEqual(fake.calls.filter(call => call.name.startsWith('create_')).map(call => call.name),
      ['create_wiki', 'create_wiki', 'create_comments']);
    assert.ok(fake.calls.every(call => call.name !== 'get_wiki' || !Object.hasOwn(call.args.options, 'parent_wiki_id')));
    const repeated = await ensureTestWiki(fake.call, input(undefined, true));
    assert.equal(repeated.state, 'ALREADY_LINKED');
    assert.equal(fake.calls.filter(call => call.name.startsWith('create_')).length, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reuses an existing matching child and blocks a conflicting linked Wiki', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zan-wiki-'));
  try {
    const bodyFile = join(dir, 'wiki.md');
    await writeFile(bodyFile, `# 前端\n- 代码分支名：${branch}`);
    const fake = makeFake({ childExists: true });
    const result = await ensureTestWiki(fake.call, {
      ...input(bodyFile, true), expectTarget: 'REUSE_EXISTING',
    });
    assert.equal(result.state, 'LINKED');
    assert.equal(result.writes, 1);
    assert.deepEqual(fake.calls.filter(call => call.name.startsWith('create_')).map(call => call.name),
      ['create_comments']);
    assert.throws(() => wikiIdsFromComments([{ description:
      '提测wiki：https://www.tapd.cn/999/markdown_wikis/show/#123' }], workspaceId));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('requires an evidenced root Wiki for another workspace before creating', async () => {
  const fake = makeFake();
  await assert.rejects(
    ensureTestWiki(fake.call, { ...input('/unused/wiki.md', true), workspaceId: 999,
      expectTarget: 'CREATE_MONTH_AND_CHILD' }),
    /--root-wiki-id/,
  );
  assert.equal(fake.calls.filter(call => call.name.startsWith('create_')).length, 0);
});

test('stops before writes when the approved Wiki target action has changed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zan-wiki-'));
  try {
    const bodyFile = join(dir, 'wiki.md');
    await writeFile(bodyFile, `# 前端\n- 代码分支名：${branch}`);
    const fake = makeFake({ monthExists: true });
    await assert.rejects(ensureTestWiki(fake.call, input(bodyFile, true)), /--expect-target/);
    await assert.rejects(
      ensureTestWiki(fake.call, { ...input(bodyFile, true), expectTarget: 'CREATE_MONTH_AND_CHILD' }),
      /与确认计划不一致/,
    );
    assert.equal(fake.calls.filter(call => call.name.startsWith('create_')).length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
