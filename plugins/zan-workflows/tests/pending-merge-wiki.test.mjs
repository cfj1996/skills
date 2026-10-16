import assert from 'node:assert/strict';
import test from 'node:test';
import { markPendingMergeWiki, pendingWikiPatch } from '../scripts/pending-merge-wiki.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { ensureTestWiki } from '../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sourceBranch = 'feature/alice.delivery', sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40);
const originUrl = 'https://git.example.test/team/demo.git';
const heading = '1. Job：[front-demo](https://ci.example.test/demo) **更新服务**';
const otherHeading = '2. Job：[front-other](https://ci.example.test/other) **更新服务**';
const entry = (title, repo, status = '未合并') => `${title}\n- 项目名称：[demo](${repo})\n- 代码分支名：${sourceBranch}\n- 是否上线：${status}\n`;
const original = '# 前端\n\n' + entry(heading, originUrl) + '\n' + entry(otherHeading, 'https://git.example.test/team/other');
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const api = value => reply({ status: 1, data: value, info: 'success' });

function fixture({ body = original } = {}) {
  const state = { body, merged: false, mrCreated: false, canMerge: false, failWiki: false, corruptReadback: false };
  const calls = [];
  const mr = () => ({ iid: 7, web_url: 'https://git.example.test/team/demo/-/merge_requests/7', state: state.merged ? 'merged' : 'opened',
    source_branch: sourceBranch, target_branch: 'master', sha: sourceSha, source_project_id: 1, target_project_id: 1,
    detailed_merge_status: 'mergeable', head_pipeline: { status: 'success' }, user: { can_merge: state.canMerge } });
  const project = () => ({ id: 1, default_branch: 'master', http_url_to_repo: originUrl });
  const merge = () => ({ state: 'AWAITING_MERGE', projectId: '1', mrIid: '7', sourceBranch, sourceSha,
    targetBranch: 'master', targetSha, originUrl, repositoryPath: '/fixture/demo', mrUrl: mr().web_url, reason: 'MERGE_PERMISSION_DENIED' });
  const plan = () => ({ profile: 'STANDARD', serviceType: 'BUSINESS', workspaceId: 12345, wikiId: '1001', parentWikiId: '1000',
    wikiTitle: '提测示例', entryHeading: heading, beforeBodySha256: sha256(body),
    afterBodySha256: sha256(pendingWikiPatch(body, { entryHeading: heading, sourceBranch, originUrl }).body) });
  const gitlab = async (name, args) => {
    calls.push({ server: 'gitlab', name, args });
    if (name === 'get_project') return reply(project());
    if (name === 'get_merge_request') return reply(mr());
    if (name === 'get_branch') return reply({ commit: { id: args.branch_name === sourceBranch ? sourceSha : targetSha } });
    if (name === 'list_merge_requests') return reply(state.mrCreated ? [mr()] : []);
    if (name === 'create_merge_request') { state.mrCreated = true; return reply(mr()); }
    if (name === 'get_merge_request_approval_state') return reply({ rules: [] });
    if (name === 'merge_merge_request') return { isError: true, content: [{ type: 'text', text: 'HTTP 403 Forbidden' }] };
    throw new Error('Unexpected GitLab tool: ' + name);
  };
  const tapd = async (name, args) => {
    calls.push({ server: 'tapd', name, args });
    if (name === 'get_wiki') return api([{ Wiki: { id: '1001', workspace_id: '12345', parent_wiki_id: '1000', name: '提测示例',
      markdown_description: state.corruptReadback && state.body !== body ? state.body + 'changed' : state.body } }]);
    if (name === 'update_wiki') {
      if (state.failWiki) throw new Error('unknown write');
      state.body = args.options.markdown_description;
      return api({ id: '1001' });
    }
    throw new Error('Unexpected TAPD tool: ' + name);
  };
  return { state, calls, gitlab, tapd, merge, plan, mr, project };
}
const execution = { execute: true, confirmed: true };
const writes = fake => fake.calls.filter(row => /^(create|update|merge)_/.test(row.name));

test('pending patch targets the exact project entry even when another entry shares its branch', () => {
  const result = pendingWikiPatch(original, { entryHeading: heading, sourceBranch, originUrl });
  assert.equal(result.body, original.replace('- 是否上线：未合并', '- 是否上线：待合并'));
  assert.equal(result.body.includes(entry(otherHeading, 'https://git.example.test/team/other')), true);
  const crlf = original.replaceAll('\n', '\r\n');
  assert.equal(pendingWikiPatch(crlf, { entryHeading: heading, sourceBranch, originUrl }).body,
    crlf.replace('- 是否上线：未合并', '- 是否上线：待合并'));
});

test('preview is read-only and confirmed execution reads back the exact pending Wiki body', async () => {
  const fake = fixture();
  const planned = await markPendingMergeWiki(fake.gitlab, fake.tapd, fake.plan(), fake.merge());
  assert.equal(planned.state, 'PLANNED_PENDING_MERGE'); assert.equal(writes(fake).length, 0);
  const done = await markPendingMergeWiki(fake.gitlab, fake.tapd, fake.plan(), fake.merge(), execution);
  assert.equal(done.state, 'UPDATED_PENDING_MERGE'); assert.equal(done.writes, 1);
  assert.deepEqual(writes(fake).map(row => row.name), ['update_wiki']);
  assert.deepEqual(Object.keys(writes(fake)[0].args.options).sort(), ['id', 'markdown_description']);
  assert.equal(done.afterBodySha256, sha256(fake.state.body));
});

test('already pending with the exact approved body is idempotent after a successful previous update', async () => {
  const fake = fixture(), plan = fake.plan();
  await markPendingMergeWiki(fake.gitlab, fake.tapd, plan, fake.merge(), execution);
  const again = await markPendingMergeWiki(fake.gitlab, fake.tapd, plan, fake.merge(), execution);
  assert.equal(again.state, 'ALREADY_PENDING_MERGE'); assert.equal(again.writes, 0);
  assert.equal(writes(fake).length, 1);
});

test('NO_WIKI and tooling preserve their policy without any Wiki or MR calls', async () => {
  for (const patch of [{ profile: 'NO_WIKI' }, { serviceType: 'TOOLING' }]) {
    const fake = fixture();
    const result = await markPendingMergeWiki(fake.gitlab, fake.tapd, { ...fake.plan(), ...patch }, fake.merge(), execution);
    assert.equal(result.writes, 0); assert.equal(fake.calls.length, 0);
  }
});

test('missing confirmation, invalid page identity and non-default target cannot write', async () => {
  const fake = fixture();
  await assert.rejects(markPendingMergeWiki(fake.gitlab, fake.tapd, fake.plan(), fake.merge(), { execute: true }), /授权/);
  for (const patch of [{ wikiId: '9999' }, { workspaceId: 9999 }, { parentWikiId: '9999' }, { wikiTitle: 'other' },
    { entryHeading: '3. other' }, { beforeBodySha256: 'c'.repeat(64) }, { afterBodySha256: 'd'.repeat(64) }]) {
    await assert.rejects(markPendingMergeWiki(fake.gitlab, fake.tapd, { ...fake.plan(), ...patch }, fake.merge(), execution));
  }
  await assert.rejects(markPendingMergeWiki(fake.gitlab, fake.tapd, fake.plan(), { ...fake.merge(), targetBranch: 'develop' }, execution));
  assert.equal(writes(fake).length, 0);
});

test('changed MR identity, source, state, repo or failed CI prevents the pending patch', async () => {
  for (const patch of [{ state: 'merged' }, { state: 'closed' }, { iid: 8 }, { sha: 'c'.repeat(40) },
    { source_branch: 'feature/other' }, { target_branch: 'develop' }, { source_project_id: 2 },
    { head_pipeline: { status: 'failed' } }, { has_conflicts: true }, { draft: true }]) {
    const fake = fixture();
    const gitlab = (name, args) => name === 'get_merge_request' ? Promise.resolve(reply({ ...fake.mr(), ...patch })) : fake.gitlab(name, args);
    await assert.rejects(markPendingMergeWiki(gitlab, fake.tapd, fake.plan(), fake.merge(), execution));
    assert.equal(writes(fake).length, 0);
  }
  const fake = fixture();
  await assert.rejects(markPendingMergeWiki((name, args) => name === 'get_project'
    ? Promise.resolve(reply({ ...fake.project(), default_branch: 'main' })) : fake.gitlab(name, args), fake.tapd, fake.plan(), fake.merge(), execution));
  assert.equal(writes(fake).length, 0);
});

test('concurrent Wiki changes, duplicate status/entries, tooling and already merged entries cannot be overwritten', async () => {
  const fake = fixture(), plan = fake.plan(); fake.state.body += '\nTeammate change';
  await assert.rejects(markPendingMergeWiki(fake.gitlab, fake.tapd, plan, fake.merge(), execution), /变化/);
  assert.equal(writes(fake).length, 0);
  for (const body of [original.replace('未合并', '已合并'), original.replace('未合并', '未知'),
    original.replace('- 是否上线：未合并', '- 是否上线：未合并\n- 是否上线：未合并'),
    original + '\n' + entry(heading, originUrl), original.replace('- 是否上线：未合并', '- 当前版本：canary'),
    original.replace(originUrl, 'https://git.example.test/team/other'), original.replace(sourceBranch, 'feature/other')]) {
    assert.throws(() => pendingWikiPatch(body, { entryHeading: heading, sourceBranch, originUrl }));
  }
});

test('fenced example status lines are preserved and cannot impersonate a real entry', () => {
  const body = original.replace('- 是否上线：未合并', '```text\n- 是否上线：已合并\n```\n- 是否上线：未合并');
  assert.equal(pendingWikiPatch(body, { entryHeading: heading, sourceBranch, originUrl }).body,
    body.replace('```\n- 是否上线：未合并', '```\n- 是否上线：待合并'));
  assert.throws(() => pendingWikiPatch('```\n' + original + '```', { entryHeading: heading, sourceBranch, originUrl }));
});

test('failed reads and nested failure acknowledgements never become successful Wiki updates', async () => {
  for (const tool of ['get_wiki', 'update_wiki']) {
    const fake = fixture();
    const tapd = (name, args) => name === tool ? Promise.resolve(reply({ data: JSON.stringify({ status: 0, data: [] }) })) : fake.tapd(name, args);
    await assert.rejects(markPendingMergeWiki(fake.gitlab, tapd, fake.plan(), fake.merge(), execution));
  }
  const fake = fixture(); fake.state.corruptReadback = true;
  await assert.rejects(markPendingMergeWiki(fake.gitlab, fake.tapd, fake.plan(), fake.merge(), execution), error => {
    assert.equal(error.result.state, 'BLOCKED'); assert.equal(error.result.writes, 1); return true;
  });
});

function mergeInput(fake) {
  return { ...fake.merge(), mergeMode: 'MANUAL', mrIid: undefined, purpose: '上线', title: 'feat: delivery',
    reviewPassed: true, pipelineRequired: true, confirmed: true, pendingWiki: fake.plan() };
}
function sessionFor(fake) {
  return new WorkflowSession({ allowExecute: true,
    pool: { call: (server, ...args) => (server === 'gitlab-mcp' ? fake.gitlab : fake.tapd)(...args), close() {} },
    io: { checkRepository: async () => {}, containsSource: async () => ({ contained: true, targetSha }) } });
}

test('session creates MR, updates pending Wiki, and still blocks releases, generic Wiki writes and cleanup', async () => {
  const fake = fixture(), session = sessionFor(fake);
  const result = await session.dispatch({ id: 'go-live', action: 'merge', phase: 'EXECUTE', input: mergeInput(fake) });
  assert.equal(result.state, 'AWAITING_MERGE'); assert.equal(result.pendingWiki.state, 'UPDATED_PENDING_MERGE');
  assert.deepEqual(writes(fake).map(row => row.name), ['create_merge_request', 'update_wiki']);
  assert.equal(session.pendingMerges.size, 1);
  for (const action of ['release', 'wiki', 'registration', 'merge']) {
    await assert.rejects(session.dispatch({ id: 'blocked-' + action, action, phase: 'EXECUTE', input: { confirmed: true } }), /待人工合并/);
  }
  fake.state.merged = true;
  const verified = await session.dispatch({ id: 'verify', action: 'merge', phase: 'PLAN', input: result.resumePlan });
  assert.equal(verified.state, 'MERGED'); assert.equal(session.pendingMerges.size, 0);
  assert.equal(writes(fake).length, 2);
  session.close();
});

test('session retains the waiting MR and reports a separate Wiki blocker without retrying an unknown write', async () => {
  const fake = fixture(); fake.state.failWiki = true;
  const session = sessionFor(fake);
  const result = await session.dispatch({ id: 'go-live', action: 'merge', phase: 'EXECUTE', input: mergeInput(fake) });
  assert.equal(result.state, 'AWAITING_MERGE'); assert.equal(result.pendingWiki.state, 'BLOCKED');
  assert.equal(result.pendingWiki.writeOutcome, 'UNKNOWN'); assert.equal(session.executionBlocked, true);
  assert.equal(session.pendingMerges.size, 1);
  await assert.rejects(session.dispatch({ id: 'retry', action: 'merge', phase: 'EXECUTE', input: mergeInput(fake) }), /不允许/);
  assert.equal(fake.calls.filter(row => row.name === 'update_wiki').length, 1);
  session.close();
});

test('invalid conditional Wiki plans block before MR creation; omitted plans preserve legacy Git-only behavior', async () => {
  const fake = fixture(), session = sessionFor(fake);
  const bad = mergeInput(fake); bad.pendingWiki.afterBodySha256 = 'invalid';
  await assert.rejects(session.dispatch({ id: 'invalid', action: 'merge', phase: 'EXECUTE', input: bad }));
  assert.equal(fake.calls.length, 0);
  const legacy = mergeInput(fake); delete legacy.pendingWiki;
  const result = await session.dispatch({ id: 'legacy', action: 'merge', phase: 'EXECUTE', input: legacy });
  assert.equal(result.state, 'AWAITING_MERGE'); assert.equal(result.pendingWiki, undefined);
  assert.deepEqual(writes(fake).map(row => row.name), ['create_merge_request']);
  session.close();
});

test('AUTO handoff from can_merge=false and merge-only 403 both update the pending Wiki', async () => {
  for (const canMerge of [false, true]) {
    const fake = fixture(); fake.state.canMerge = canMerge;
    const session = sessionFor(fake);
    const result = await session.dispatch({ id: 'auto', action: 'merge', phase: 'EXECUTE',
      input: { ...mergeInput(fake), mergeMode: 'AUTO' } });
    assert.equal(result.reason, 'MERGE_PERMISSION_DENIED');
    assert.equal(result.pendingWiki.state, 'UPDATED_PENDING_MERGE');
    assert.equal(fake.calls.filter(row => row.name === 'merge_merge_request').length, canMerge ? 1 : 0);
    assert.equal(fake.calls.filter(row => row.name === 'update_wiki').length, 1);
    session.close();
  }
});

test('after manual merge proof the shared-page update-only helper can finish pending to merged for just this entry', async () => {
  const fake = fixture(), session = sessionFor(fake);
  const pending = await session.dispatch({ id: 'start', action: 'merge', phase: 'EXECUTE', input: mergeInput(fake) });
  const before = fake.state.body, finalBody = before.replace('- 是否上线：待合并', '- 是否上线：已合并');
  const dir = await mkdtemp(join(tmpdir(), 'zan-pending-wiki-'));
  try {
    const bodyFile = join(dir, 'body.md'); await writeFile(bodyFile, finalBody);
    const wikiInput = { workspaceId: 12345, entryType: 'stories', entryId: '123450001', sourceBranch,
      mode: 'update', expectedWikiId: '1001', expectedMonthId: '1000', wikiTitle: '提测示例',
      expectTarget: 'REUSE_EXISTING', expectedBodySha256: pending.pendingWiki.afterBodySha256,
      bodyFile, entryHeading: heading, entryRepoUrl: originUrl, confirmed: true };
    await assert.rejects(session.dispatch({ id: 'too-early', action: 'wiki', phase: 'EXECUTE', input: wikiInput }), /待人工合并/);
    fake.state.merged = true;
    await session.dispatch({ id: 'verify', action: 'merge', phase: 'PLAN', input: pending.resumePlan });
    const done = await session.dispatch({ id: 'finish', action: 'wiki', phase: 'EXECUTE', input: wikiInput });
    assert.equal(done.wikiState, 'UPDATED'); assert.equal(done.commentState, 'SKIPPED');
    assert.equal(fake.state.body, finalBody);
    assert.equal(fake.state.body.includes(entry(otherHeading, 'https://git.example.test/team/other')), true);
    await assert.rejects(ensureTestWiki(fake.tapd, { ...wikiInput, execute: true, entryRepoUrl: 'https://git.example.test/other/repo' }));
  } finally { session.close(); await rm(dir, { recursive: true, force: true }); }
});
