import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  chinaDate, contentHash, ensureTestWiki, parseArgs, records, StdioMcpClient, totalCount,
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
const originalBody = `# 前端\n- 代码分支名：${branch}`;

function plainResponse(kind, rows) {
  return { content: [{ type: 'text', text: JSON.stringify({
    status: 1, data: rows.map(row => ({ [kind]: row })),
  }) }] };
}

function response(kind, rows, count = rows.length) {
  return { content: [{ type: 'text', text: JSON.stringify({
    data: JSON.stringify({ status: 1, data: rows.map(row => ({ [kind]: row })) }),
    count: JSON.stringify({ status: 1, data: { count } }),
  }) }] };
}

function makeFake({ linked = false, monthExists = true, childExists = false, description = '', onCall } = {}) {
  const calls = [];
  const wikis = new Map();
  if (monthExists) wikis.set(monthId, { id: monthId, name: month, parent_wiki_id: rootId });
  if (childExists || linked) wikis.set(childId, {
    id: childId, name: title, parent_wiki_id: monthId,
    markdown_description: originalBody,
  });
  const comments = linked ? [{ id: '1', description: `提测wiki：[${url}](${url})` }] : [];
  const call = async (name, args) => {
    calls.push({ name, args });
    const override = await onCall?.(name, args, { wikis, comments, calls });
    if (override !== undefined) return override;
    if (name === 'get_stories_or_tasks') return response(
      args.options.entity_type === 'tasks' ? 'Task' : 'Story',
      [{ id: entryId, name: '门店发货单前端适配', description }],
    );
    if (name === 'get_bug') return response('Bug', [{ id: entryId, title: '门店发货单前端适配', description }]);
    if (name === 'get_comments') {
      const { page, limit } = args.options;
      return plainResponse('Comment', comments.slice((page - 1) * limit, page * limit));
    }
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
    if (name === 'update_wiki') {
      const wiki = wikis.get(String(args.options.id));
      Object.assign(wiki, args.options);
      return response('Wiki', [wiki]);
    }
    throw new Error(`unexpected ${name}`);
  };
  return { call, calls, wikis, comments };
}

function existingInput(bodyFile) {
  return {
    ...input(bodyFile, true), expectTarget: 'REUSE_EXISTING', expectedWikiId: childId,
    expectedMonthId: monthId, expectedBodySha256: contentHash(originalBody),
  };
}

async function withBody(body, run) {
  const dir = await mkdtemp(join(tmpdir(), 'zan-wiki-'));
  try {
    const bodyFile = join(dir, 'wiki.md');
    await writeFile(bodyFile, body);
    return await run(bodyFile);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function writes(fake) {
  return fake.calls.filter(call => /^(create_|update_)/.test(call.name));
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
      ...existingInput(bodyFile),
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
    ensureTestWiki(fake.call, { ...input(undefined, true), workspaceId: 999,
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

test('parses fixed Wiki identity, body hash and comment-only mode', () => {
  const argv = ['--workspace-id', String(workspaceId), '--entry-type', 'stories',
    '--entry-id', entryId, '--source-branch', branch];
  const parsed = parseArgs([...argv, '--mode', 'link', '--expected-wiki-id', childId,
    '--expected-body-sha256', contentHash(originalBody)]);
  assert.equal(parsed.mode, 'link');
  assert.equal(parsed.expectedWikiId, childId);
  assert.equal(parsed.expectedBodySha256, contentHash(originalBody));
  assert.throws(() => parseArgs([...argv, '--expected-wiki-id', 'invalid']), /必须是数字/);
  assert.throws(() => parseArgs([...argv, '--expected-body-sha256', 'invalid']), /SHA-256/);
  assert.throws(() => parseArgs([...argv, '--mode', 'link']), /expected-wiki-id/);
  assert.throws(() => parseArgs([...argv, '--mode', 'link', '--expected-wiki-id', childId,
    '--body-file', 'wiki.md']), /不能提供/);
});

test('discovers an existing Wiki without creation inputs', async () => {
  const fake = makeFake({ childExists: true });
  const plan = await ensureTestWiki(fake.call, {
    ...input(undefined), creator: undefined, commentAuthor: undefined,
  });
  assert.equal(plan.target, 'REUSE_EXISTING');
  assert.equal(plan.wikiUrl, url);
  assert.equal(plan.beforeBody, originalBody);
  assert.equal(plan.beforeBodySha256, contentHash(originalBody));
  assert.equal(plan.wikiOperation, 'NONE');
  assert.equal(plan.commentOperation, 'CREATE');
  assert.equal(writes(fake).length, 0);
});

test('reuses a detail-only Wiki from a prior month and writes only its comment', async () => {
  const fake = makeFake({ childExists: true, description: `提测wiki：[${url}](${url})` });
  fake.wikis.get(childId).name = '08-24: 门店发货单前端适配';
  const runInput = { ...existingInput(undefined), wikiTitle: fake.wikis.get(childId).name, month: '2026-10' };
  const result = await ensureTestWiki(fake.call, runInput);
  assert.equal(result.wikiId, childId);
  assert.equal(result.wikiState, 'UNCHANGED');
  assert.equal(result.commentState, 'LINKED');
  assert.deepEqual(writes(fake).map(call => call.name), ['create_comments']);
  assert.ok(fake.calls.filter(call => call.name === 'get_wiki').every(call => call.args.options.id === childId));
});

test('blocks conflicting targets between item details and comments', async () => {
  const fake = makeFake({ linked: true, description:
    `提测wiki：https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#123` });
  await assert.rejects(ensureTestWiki(fake.call, existingInput(undefined)), /多个不同/);
  assert.equal(writes(fake).length, 0);
});

test('does not switch the approved Wiki ID to a same-title replacement', async () => {
  const fake = makeFake({ childExists: true });
  const plan = await ensureTestWiki(fake.call, input(undefined));
  const old = fake.wikis.get(childId);
  fake.wikis.delete(childId);
  fake.wikis.set('2002', { ...old, id: '2002' });
  await assert.rejects(ensureTestWiki(fake.call, {
    ...existingInput(undefined), expectedWikiId: plan.wikiId,
  }), /不存在/);
  assert.equal(writes(fake).length, 0);
});

test('blocks a changed linked Wiki ID even when branch and body still match', async () => {
  const fake = makeFake({ childExists: true });
  fake.comments.push({ id: 'other', description:
    `提测wiki：https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#2002` });
  await assert.rejects(ensureTestWiki(fake.call, existingInput(undefined)), /Wiki ID.*不一致/);
  assert.equal(writes(fake).length, 0);
});

test('requires the exact existing target and before-body hash before writes', async () => {
  const fake = makeFake({ childExists: true });
  await assert.rejects(ensureTestWiki(fake.call, {
    ...input(undefined, true), expectTarget: 'REUSE_EXISTING',
  }), /expected-wiki-id.*expected-body-sha256/);
  await assert.rejects(ensureTestWiki(fake.call, {
    ...existingInput(undefined), expectedMonthId: undefined,
  }), /expected-month-id/);
  fake.wikis.get(childId).markdown_description += '\n别人的补充';
  await assert.rejects(ensureTestWiki(fake.call, existingInput(undefined)), /原正文已变化/);
  assert.equal(writes(fake).length, 0);
});

test('previews supplementation without changing Wiki or comments', async () => {
  const body = `${originalBody}\n- 影响范围：新增订单校验`;
  await withBody(body, async bodyFile => {
    const fake = makeFake({ linked: true });
    const result = await ensureTestWiki(fake.call, { ...existingInput(bodyFile), execute: false });
    assert.equal(result.state, 'PLANNED_UPDATE');
    assert.equal(result.wikiOperation, 'UPDATE');
    assert.equal(result.commentOperation, 'NONE');
    assert.equal(result.beforeBodySha256, contentHash(originalBody));
    assert.equal(writes(fake).length, 0);
    assert.equal(fake.wikis.get(childId).markdown_description, originalBody);
  });
});

test('supplements the approved body, preserves other sections and links in one invocation', async () => {
  const before = `# 后端\n保留历史说明\n\n${originalBody}\n- 影响范围：\n  1. 门店发货\n\n# 备注\n保留备注\n`;
  const after = before.replace('  1. 门店发货', '  1. 门店发货\n  2. 订单校验');
  await withBody(after, async bodyFile => {
    const fake = makeFake({ childExists: true });
    fake.wikis.get(childId).markdown_description = before;
    const runInput = { ...existingInput(bodyFile), expectedBodySha256: contentHash(before) };
    const result = await ensureTestWiki(fake.call, runInput);
    assert.equal(result.wikiState, 'UPDATED');
    assert.equal(result.commentState, 'LINKED');
    assert.equal(result.writes, 2);
    assert.equal(fake.wikis.get(childId).markdown_description, after);
    assert.deepEqual(writes(fake).map(call => call.name), ['update_wiki', 'create_comments']);
    assert.deepEqual(Object.keys(writes(fake)[0].args.options).sort(), ['id', 'markdown_description']);
    assert.ok(fake.calls.filter(call => call.name === 'get_wiki').every(call => call.args.options.id === childId));
    const repeated = await ensureTestWiki(fake.call, runInput);
    assert.equal(repeated.writes, 0);
    assert.equal(repeated.commentState, 'ALREADY_LINKED');
    assert.equal(writes(fake).length, 2);
  });
});

test('updates a linked Wiki without duplicating its comment', async () => {
  await withBody(`${originalBody}\n- 影响范围：订单校验`, async bodyFile => {
    const fake = makeFake({ linked: true });
    const result = await ensureTestWiki(fake.call, existingInput(bodyFile));
    assert.equal(result.wikiState, 'UPDATED');
    assert.equal(result.commentState, 'ALREADY_LINKED');
    assert.equal(result.writes, 1);
    assert.deepEqual(writes(fake).map(call => call.name), ['update_wiki']);
    assert.equal(fake.comments.length, 1);
  });
});

test('a shared item Wiki may append a new approved branch entry', async () => {
  const before = '# 前端\n- 代码分支名：feature/bob.0924.other';
  const after = `${before}\n\n${originalBody}`;
  await withBody(after, async bodyFile => {
    const fake = makeFake({ linked: true });
    fake.wikis.get(childId).markdown_description = before;
    const result = await ensureTestWiki(fake.call, {
      ...existingInput(bodyFile), expectedBodySha256: contentHash(before),
    });
    assert.equal(result.wikiState, 'UPDATED');
    assert.equal(fake.wikis.get(childId).markdown_description, after);
  });
});

test('comment-only mode does not create, update or rediscover Wiki pages', async () => {
  const fake = makeFake({ childExists: true });
  const result = await ensureTestWiki(fake.call, { ...existingInput(undefined), mode: 'link' });
  assert.equal(result.wikiState, 'UNCHANGED');
  assert.equal(result.commentState, 'LINKED');
  assert.deepEqual(fake.calls.map(call => call.name), [
    'get_stories_or_tasks', 'get_comments', 'get_wiki', 'create_comments', 'get_comments',
  ]);
  assert.deepEqual(writes(fake).map(call => call.name), ['create_comments']);
  await assert.rejects(ensureTestWiki(fake.call, {
    ...existingInput('/unused/wiki.md'), mode: 'link',
  }), /不能提供/);
});

test('reads bound item, Wiki and comments in parallel', async () => {
  const fake = makeFake({ linked: true });
  const starts = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const call = async (name, args) => {
    starts.push(name);
    if (starts.length === 3) release();
    await barrier;
    return fake.call(name, args);
  };
  const result = await ensureTestWiki(call, existingInput(undefined));
  assert.equal(result.writes, 0);
  assert.deepEqual(starts, ['get_stories_or_tasks', 'get_comments', 'get_wiki']);
});

test('paginates real MCP comments without count and finds an older Wiki link', async () => {
  const fake = makeFake({ childExists: true });
  fake.comments.push(...Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), description: '普通评论' })),
    { id: '101', description: `提测wiki：${url}` });
  const result = await ensureTestWiki(fake.call, input(undefined, true));
  assert.equal(result.commentState, 'ALREADY_LINKED');
  assert.deepEqual(fake.calls.filter(call => call.name === 'get_comments').map(call => call.args.options.page), [1, 2]);
  assert.equal(writes(fake).length, 0);
});

test('stops on repeated comment pages without looping or writing', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), description: '普通评论' }));
  const fake = makeFake({ onCall: name => name === 'get_comments' ? plainResponse('Comment', rows) : undefined });
  await assert.rejects(ensureTestWiki(fake.call, input(undefined)), /分页重复/);
  assert.equal(fake.calls.filter(call => call.name === 'get_comments').length, 2);
  assert.equal(writes(fake).length, 0);
});

test('holds the approved creation month across midnight and preserves exact bytes', async () => {
  const body = `${originalBody}\r\n\r\n`;
  await withBody(body, async bodyFile => {
    const fake = makeFake({ monthExists: false });
    const plan = await ensureTestWiki(fake.call, {
      ...input(undefined), month: undefined,
    }, new Date('2026-09-30T15:50:00Z'));
    const result = await ensureTestWiki(fake.call, {
      ...input(bodyFile, true), month: plan.month, expectTarget: plan.target,
    }, new Date('2026-09-30T16:10:00Z'));
    assert.equal(fake.wikis.get(monthId).name, '2026-09');
    assert.equal(fake.wikis.get(childId).markdown_description, body);
    assert.equal(result.wikiState, 'CREATED');
  });
});

test('requires fixed creation month, title and existing month ID', async () => {
  await withBody(originalBody, async bodyFile => {
    const missingMonth = makeFake({ monthExists: false });
    await assert.rejects(ensureTestWiki(missingMonth.call, {
      ...input(bodyFile, true), month: undefined, expectTarget: 'CREATE_MONTH_AND_CHILD',
    }, new Date('2026-09-24T00:00:00Z')), /固定计划中的/);
    assert.equal(writes(missingMonth).length, 0);
    const existingMonth = makeFake();
    await assert.rejects(ensureTestWiki(existingMonth.call, {
      ...input(bodyFile, true), expectTarget: 'CREATE_CHILD',
    }), /expected-month-id/);
    assert.equal(writes(existingMonth).length, 0);
  });
});

test('creates a child under the exact approved existing month', async () => {
  await withBody(originalBody, async bodyFile => {
    const fake = makeFake();
    const result = await ensureTestWiki(fake.call, {
      ...input(bodyFile, true), expectTarget: 'CREATE_CHILD', expectedMonthId: monthId,
    });
    assert.equal(result.wikiState, 'CREATED');
    assert.equal(result.writes, 2);
    assert.equal(fake.wikis.get(childId).parent_wiki_id, monthId);
  });
});

test('stops before creation when the approved month parent changed', async () => {
  await withBody(originalBody, async bodyFile => {
    const fake = makeFake();
    fake.wikis.get(monthId).parent_wiki_id = '999';
    await assert.rejects(ensureTestWiki(fake.call, {
      ...input(bodyFile, true), expectTarget: 'CREATE_CHILD', expectedMonthId: monthId,
    }), /月份 Wiki 名称或父页/);
    assert.equal(writes(fake).length, 0);
  });
});

test('reports a completed update and stops if a conflicting comment appears', async () => {
  await withBody(`${originalBody}\n补充范围`, async bodyFile => {
    let reads = 0;
    const fake = makeFake({ childExists: true, onCall(name, args, { comments }) {
      if (name === 'get_comments' && ++reads === 2) comments.push({ id: 'other', description:
        `提测wiki：https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#2002` });
    } });
    await assert.rejects(ensureTestWiki(fake.call, existingInput(bodyFile)), error => {
      assert.equal(error.result.state, 'BLOCKED');
      assert.equal(error.result.wikiState, 'UPDATED');
      assert.equal(error.result.writes, 1);
      assert.equal(error.result.wikiId, childId);
      return /冲突评论/.test(error.message);
    });
    assert.deepEqual(writes(fake).map(call => call.name), ['update_wiki']);
  });
});

test('does not link after an update readback mismatch', async () => {
  await withBody(`${originalBody}\n补充范围`, async bodyFile => {
    const fake = makeFake({ childExists: true, onCall(name, args, { wikis, calls }) {
      if (name === 'get_wiki' && calls.some(call => call.name === 'update_wiki')) {
        return response('Wiki', [{ ...wikis.get(childId), markdown_description: originalBody }]);
      }
    } });
    await assert.rejects(ensureTestWiki(fake.call, existingInput(bodyFile)), error => {
      assert.equal(error.result.wikiState, 'UNKNOWN');
      assert.equal(error.result.writes, 1);
      return /更新后读回不一致/.test(error.message);
    });
    assert.deepEqual(writes(fake).map(call => call.name), ['update_wiki']);
  });
});

test('never retries an unknown comment write', async () => {
  const fake = makeFake({ childExists: true, onCall: name => {
    if (name === 'create_comments') throw new Error('模拟超时');
  } });
  await assert.rejects(ensureTestWiki(fake.call, { ...existingInput(undefined), mode: 'link' }), error => {
    assert.equal(error.result.commentState, 'UNKNOWN');
    assert.equal(error.result.phase, 'LINK_COMMENT');
    return /模拟超时/.test(error.message);
  });
  assert.equal(fake.calls.filter(call => call.name === 'create_comments').length, 1);
});

test('requires a conflict-free comment readback before reporting success', async () => {
  const fake = makeFake({ childExists: true, onCall(name, args, { comments, calls }) {
    if (name === 'get_comments' && calls.some(call => call.name === 'create_comments')) {
      return plainResponse('Comment', [...comments, { id: 'other', description:
        `提测wiki：https://www.tapd.cn/${workspaceId}/markdown_wikis/show/#2002` }]);
    }
  } });
  await assert.rejects(ensureTestWiki(fake.call, existingInput(undefined)), /评论读回.*冲突/);
  assert.equal(fake.calls.filter(call => call.name === 'create_comments').length, 1);
});

test('does not interpret malformed Wiki responses as proof of absence', async () => {
  for (const result of [
    { content: [{ type: 'text', text: 'unexpected response' }] },
    { content: [{ type: 'text', text: JSON.stringify({ status: 1, data: null }) }] },
    { content: [{ type: 'text', text: JSON.stringify({ status: 0, data: null }) }] },
  ]) {
    const fake = makeFake({ onCall: name => name === 'get_wiki' ? result : undefined });
    await assert.rejects(ensureTestWiki(fake.call, input(undefined)), /不能判定|失败状态/);
    assert.equal(writes(fake).length, 0);
  }
  assert.equal(totalCount({ status: 1, data: null, count: null }), undefined);
});

test('rechecks the Wiki before update if another editor changes it during the parallel reads', async () => {
  await withBody(`${originalBody}\n批准的补充`, async bodyFile => {
    let wikiReads = 0;
    const fake = makeFake({ childExists: true, onCall(name, args, { wikis }) {
      if (name === 'get_wiki' && ++wikiReads === 2) {
        wikis.get(childId).markdown_description += '\n其他人刚写入的内容';
      }
    } });
    await assert.rejects(ensureTestWiki(fake.call, existingInput(bodyFile)), /执行期间发生变化/);
    assert.equal(writes(fake).length, 0);
    assert.ok(fake.wikis.get(childId).markdown_description.endsWith('其他人刚写入的内容'));
  });
});

test('blocks ambiguous duplicated branch entries instead of rewriting history', async () => {
  await withBody(originalBody, async bodyFile => {
    const fake = makeFake({ linked: true });
    fake.wikis.get(childId).markdown_description = `${originalBody}\n${originalBody}`;
    await assert.rejects(ensureTestWiki(fake.call, existingInput(bodyFile)), /重复的原分支条目/);
    assert.equal(writes(fake).length, 0);
  });
});

test('does not create on a full name-query page without a completeness count', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1), name: month, parent_wiki_id: 'another-root',
  }));
  const fake = makeFake({ onCall: name => name === 'get_wiki' ? plainResponse('Wiki', rows) : undefined });
  await assert.rejects(ensureTestWiki(fake.call, input(undefined)), /查询结果不完整/);
  assert.equal(writes(fake).length, 0);
});

test('an MCP server ping cannot consume a pending request with the same ID', async () => {
  const server = `
    const { createInterface } = require('node:readline');
    const lines = createInterface({ input: process.stdin });
    const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
    lines.on('line', line => {
      const request = JSON.parse(line);
      if (request.method === 'probe') send({ jsonrpc: '2.0', id: request.id, method: 'ping' });
      else if (request.result) send({ jsonrpc: '2.0', id: request.id, result: { ok: true } });
    });
  `;
  const client = new StdioMcpClient(process.execPath, ['-e', server]);
  try {
    assert.deepEqual(await client.request('probe', {}, 2000), { ok: true });
  } finally { client.close(); }
});

test('distinguishes a marked test Wiki from unrelated requirement links', () => {
  const description = `<p>需求文档：<a href="https://www.tapd.cn/999/markdown_wikis/show/#123">PRD</a></p>
    <p><a href="${url}"><strong>提测wiki</strong></a></p>`;
  assert.deepEqual(wikiIdsFromComments([{ description }], workspaceId), [childId]);
  assert.deepEqual(wikiIdsFromComments([{ description: `提测wiki：\n<${url}>` }], workspaceId), [childId]);
});

test('does not treat a monthly structural page as a writable child', async () => {
  const fake = makeFake({ linked: true });
  fake.wikis.get(childId).name = month;
  await assert.rejects(ensureTestWiki(fake.call, existingInput(undefined)), /根页或月份目录/);
  assert.equal(writes(fake).length, 0);
});

test('update-only mode changes the approved Wiki without touching TAPD item or comments', async () => {
  await withBody(`${originalBody}\n- 是否上线：已合并`, async bodyFile => {
    const fake = makeFake({ childExists: true });
    const result = await ensureTestWiki(fake.call, { ...existingInput(bodyFile), mode: 'update',
      creator: undefined, commentAuthor: undefined });
    assert.equal(result.state, 'UPDATED');
    assert.equal(result.commentState, 'SKIPPED');
    assert.deepEqual(fake.calls.map(call => call.name), ['get_wiki', 'get_wiki', 'update_wiki', 'get_wiki']);
    assert.equal(fake.comments.length, 0);
  });
});

test('update-only discovery never claims a comment link it did not read', async () => {
  const fake = makeFake({ childExists: true });
  const result = await ensureTestWiki(fake.call, { ...existingInput(undefined), execute: false, mode: 'update' });
  assert.equal(result.state, 'UNCHANGED');
  assert.equal(result.commentEvidence.checked, false);
  assert.equal(result.comment, null);
  assert.deepEqual(fake.calls.map(call => call.name), ['get_wiki']);
});
