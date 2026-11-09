import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { noMockFixture, fixtureMockIo } from './helpers/mock-safety-fixture.mjs';
import { frozenJenkinsFixture } from './helpers/frozen-jenkins-fixture.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { repairRecordBody } from './helpers/bug-repair-record-fixture.mjs';

const source = 'a'.repeat(40), target = 'b'.repeat(40), delivered = 'c'.repeat(40);
const branch = 'feature/test.disclaimer', repo = 'https://git.example.test/team/factory.git';
const ci = 'https://ci.example.test/jenkins', jobUrl = ci + '/job/factory-test/';
const wikiUrl = id => 'https://www.tapd.cn/123/markdown_wikis/show/#' + id;
const entry = '1. Job：[factory](' + jobUrl + ')\n- 项目名称：[factory](' + repo + ')\n- 代码分支名：' + branch + '\n- 是否上线：未合并\n';
const tapd = (key, values) => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1, data: values.map(row => ({ [key]: row })) }) }] });

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'continuous-submission-')), calls = [], sourceChecks = [];
  const bodyFile = join(dir, 'approved.md');
  let mr, merged = false, wikiId = '20', oldBody = '# 后端\n保留已有条目\n\n# 前端\n';
  const pages = new Map(), comments = new Map();
  function replaceWiki(id, body) {
    wikiId = id; oldBody = body;
    pages.set(id, { id, parent_wiki_id: '10', name: '11-02: 展示设置', markdown_description: body });
    comments.set('1', [{ id: '11', description: '提测wiki：' + wikiUrl(id) }]);
  }
  replaceWiki(wikiId, oldBody);
  await writeFile(bodyFile, oldBody + entry);
  const merge = { projectId: '9', repositoryPath: dir, originUrl: repo, purpose: '单页字段提测', title: '展示设置',
    sourceBranch: branch, targetBranch: 'develop', sourceSha: source, targetSha: target, reviewPassed: true, pipelineRequired: false };
  merge.mockSafety = noMockFixture(merge);
  const release = { targetProject: 'factory', releaseTarget: 'factory', jobName: 'factory-test', jobUrl, sourceRepository: repo,
    releaseRef: 'develop', releaseChannel: 'canary', releaseKind: 'deployment', targetEnvironment: 'test',
    refParameter: 'branch', params: { branch: 'develop' }, jobAdapter: 'explicit-v1', jenkinsProfile: 'fixture' };
  const wiki = { workspaceId: 123, entryType: 'stories', entryId: '1', sourceBranch: branch, entryRepoUrl: repo,
    creator: 'developer', bodyFile };
  const input = { merge, release, wiki, linkTaskIds: ['2', '3'], decisions: ['查询和保存均使用 maxvalue'],
    registration: { workspaceId: 123, entryType: 'stories', entryId: '1', workMode: 'INITIAL', statusAction: 'NONE', versionAction: 'NONE' } };
  const bug = { id: '1', title: '样式间距', status: options.waiting ? 'testing' : 'fixing',
    current_owner: options.waiting ? 'tester' : 'developer', te: 'tester', reporter: 'reporter', workitem_type_id: 'bugs' };
  if (options.bug) {
    input.linkTaskIds = []; wiki.entryType = 'bug';
    Object.assign(input.registration, { entryType: 'bug', statusAction: 'WAITING_TEST',
      workMode: options.waiting ? 'CONTINUE' : 'INITIAL', workitemTypeId: 'bugs' });
    input.repairRecord = { workspaceId: 123, entryId: '1', author: 'developer', body: repairRecordBody, previousRecord: null,
      requiredRepositories: [repo], reviewedSourceSha: source, contentFingerprint: merge.mockSafety.contentFingerprint };
  }
  const pool = { close: async () => ({ cleanupComplete: true }), call: async (server, name, args) => {
    calls.push(name);
    if (name === 'get_branch') return { commit: { id: args.branch_name === branch ? source : merged ? delivered : target } };
    if (name === 'get_project') return { id: 9, default_branch: 'main', http_url_to_repo: repo };
    if (name === 'list_merge_requests') return mr && !merged ? [mr] : [];
    if (name === 'create_merge_request') return mr = { iid: 5, source_project_id: 9, target_project_id: 9, sha: source,
      source_branch: branch, target_branch: 'develop', state: 'opened', detailed_merge_status: 'mergeable',
      blocking_discussions_resolved: true, web_url: 'https://git.example.test/team/factory/-/merge_requests/5' };
    if (name === 'get_merge_request') return mr;
    if (name === 'get_merge_request_approval_state') return { rules: [] };
    if (name === 'merge_merge_request') { merged = true; return Object.assign(mr, { state: 'merged', merge_commit_sha: delivered }); }
    if (name === 'jenkins_list_instances') return [{ name: 'default', url: ci }];
    if (name === 'jenkins_trigger_build') {
      if (options.unknown) throw new Error('lost trigger response');
      if (options.replace) replaceWiki('21', '# 后端\n新版替代文档\n\n# 前端\n');
      if (options.editBody) pages.get(wikiId).markdown_description += '后端并发补充\n';
      return { jobName: release.jobName, queueUrl: ci + '/queue/item/42/' };
    }
    const o = args.options;
    if (name === 'get_bug') return tapd('Bug', [bug]);
    if (name === 'get_workflows_status_map') return { status: 1, data: { fixing: '修复中', testing: '待测试' } };
    if (name === 'get_workflows_all_transitions') return { status: 1, data: { fixing: ['testing'] } };
    if (name === 'update_bug') { Object.assign(bug, o); return { status: 1, data: true }; }
    if (name === 'get_stories_or_tasks') {
      const story = o.entity_type === 'stories';
      return tapd(story ? 'Story' : 'Task', [{ id: o.id, ...(story ? {} : { story_id: '1' }), name: '展示设置', status: 'open', description: '' }]);
    }
    if (name === 'get_comments') return tapd('Comment', (comments.get(o.entry_id) || []).filter(row => !o.id || row.id === o.id)
      .map(row => ({ workspace_id: '123', entry_id: o.entry_id, entry_type: o.entry_type, author: 'developer', ...row })));
    if (name === 'get_wiki') return tapd('Wiki', [pages.get(o.id)].filter(Boolean));
    if (name === 'update_wiki') { Object.assign(pages.get(o.id), o); return tapd('Wiki', [pages.get(o.id)]); }
    if (name === 'create_comments') {
      const rows = comments.get(o.entry_id) || [];
      rows.push({ id: String(9000 + calls.length), description: options.bug ? o.description.replace(/></g, '>\n<') : o.description });
      comments.set(o.entry_id, rows);
      if (options.loseRecord && o.description.includes('【Bug 溯源与修复记录】')) throw new Error('lost comment acknowledgement');
      return tapd('Comment', rows.slice(-1));
    }
    throw new Error('unexpected ' + name);
  } };
  const session = new WorkflowSession({ allowExecute: true, pool, reader: () => ({ instanceUrl: ci, jobUrl,
    job: async () => ({ name: release.jobName, url: jobUrl }), queueIdentity: url => ({ id: 42, url }) }),
    io: { ...fixtureMockIo, checkRepository: async () => {}, inspectContainment: async () => ({ contained: merged, targetSha: merged ? delivered : target }),
      containsSource: async () => ({ contained: true, targetSha: delivered }), checkSource: async request => {
        if (options.requireTargetReview && !request.mockSafety.deliverySourceEvidence) throw new Error('目标分支包含额外内容，需要增量评审');
        sourceChecks.push(request.expectedSha); return { kind: 'branch', ref: 'refs/heads/develop',
          branch: 'develop', sourceRepository: repo, sourceSha: request.expectedSha };
      }, readFrozenJenkinsContracts: async () => frozenJenkinsFixture(release, { parameters: [{ name: 'branch' }] }, ci) } });
  let i = 0;
  const request = (phase, data) => session.dispatch({ id: 'request-' + ++i, action: 'submit', phase, input: data });
  const run = plan => request('EXECUTE', { confirmed: true, planId: plan.planId, reviewedPlanHash: plan.planId });
  t.after(async () => { await session.close(); await rm(dir, { recursive: true, force: true }); });
  return { input, request, run, calls, sourceChecks, pages, comments, bodyFile, get oldBody() { return oldBody; } };
}

test('one authorized request carries the merged SHA, accepted queue and verified Wiki into exactly the selected Task links', async t => {
  const f = await fixture(t);
  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.state, 'AWAITING_CONFIRMATION');
  assert.equal(f.calls.some(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), false);
  const result = await f.run(plan);
  assert.equal(result.state, 'SUBMITTED');
  assert.deepEqual(f.sourceChecks, [delivered]);
  assert.equal(result.receipts.release.queueId, 42);
  assert.deepEqual(result.receipts.links.map(r => r.entryId), ['2', '3']);
  assert.equal(result.receipts.registration.state, 'NOT_APPLICABLE');
  assert.equal(f.pages.get('20').markdown_description, f.oldBody + entry);
  assert.deepEqual(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)),
    ['create_merge_request', 'merge_merge_request', 'jenkins_trigger_build', 'update_wiki', 'create_comments', 'create_comments']);
  const count = f.calls.length;
  assert.equal((await f.run(plan)).state, 'SUBMITTED');
  assert.equal(f.calls.length, count);
});

test('STANDARD with no Jenkins binding writes the Wiki and Task links without calling Jenkins', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('PLAN', {
    ...f.input, release: { ...f.input.release, jobName: '', jobUrl: '' },
  }), /准确 Job/);
  assert.deepEqual(f.calls, []);

  f.input.release = null;
  const heading = '1. **!!#ff0000 更新服务!!**';
  const body = f.oldBody + heading + entry.slice(entry.indexOf('\n'));
  await writeFile(f.bodyFile, body);

  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.state, 'AWAITING_CONFIRMATION');
  const result = await f.run(plan);

  assert.equal(result.state, 'SUBMITTED');
  assert.deepEqual(result.receipts.release, { state: 'SKIPPED_BY_INTENT', writes: 0 });
  assert.equal(f.pages.get('20').markdown_description, body);
  assert.deepEqual(result.receipts.links.map(r => r.entryId), ['2', '3']);
  assert.equal(f.calls.some(name => name.startsWith('jenkins_')), false);
});

test('a replaced Wiki pauses only the document and resumes on a newly reviewed patch without another merge or build', async t => {
  const f = await fixture(t, { replace: true });
  const plan = await f.request('PLAN', f.input), paused = await f.run(plan);
  assert.equal(paused.state, 'NEEDS_WIKI_REVIEW');
  assert.equal(paused.receipts.git.deliveredSha, delivered);
  assert.equal(paused.receipts.release.queueId, 42);
  assert.equal(f.calls.includes('update_wiki'), false);
  await f.request('PLAN', { resumePlanId: plan.planId, wiki: { ...f.input.wiki, workspaceId: 456 } })
    .then(() => assert.fail('wrong owner accepted'), error => assert.match(error.message, /Wiki/));
  await writeFile(f.bodyFile, f.oldBody + entry);
  const revised = await f.request('PLAN', { resumePlanId: plan.planId, wiki: { ...f.input.wiki, expectedWikiId: '21' },
    decisions: ['后端已确认替代页 21，复用原配置项'] });
  assert.notEqual(revised.planId, plan.planId);
  const result = await f.run(revised);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.wiki.wikiId, '21');
  assert.equal(f.pages.get('20').markdown_description.includes(entry), false);
  assert.deepEqual(f.calls.filter(name => ['merge_merge_request', 'jenkins_trigger_build'].includes(name)),
    ['merge_merge_request', 'jenkins_trigger_build']);
});

test('a lost trigger response preserves Git evidence, stops dependent writes and cannot replay the trigger', async t => {
  const f = await fixture(t, { unknown: true });
  const plan = await f.request('PLAN', f.input);
  await assert.rejects(f.run(plan), error => error.result?.state === 'UNKNOWN' &&
    error.result.receipts.git.deliveredSha === delivered && error.result.writes === null);
  await assert.rejects(f.run(plan), /不允许/);
  assert.equal(f.calls.filter(n => n === 'jenkins_trigger_build').length, 1);
  assert.equal(f.calls.includes('update_wiki'), false);
});

test('retained links to an obsolete page require a pinned same-Story notice identifying both IDs', async t => {
  const f = await fixture(t, { replace: true });
  const plan = await f.request('PLAN', f.input);
  assert.equal((await f.run(plan)).state, 'NEEDS_WIKI_REVIEW');
  const notice = '提测wiki（新）：' + wikiUrl('21') + '（作废旧页 #20）';
  const historic = { id: 'old-link', description: '提测wiki：' + wikiUrl('20') };
  f.comments.set('1', [historic, { id: 'notice', description: notice }]);
  f.comments.set('3', [historic]);
  await writeFile(f.bodyFile, f.oldBody + entry);
  const wiki = { ...f.input.wiki, expectedWikiId: '21' };
  await assert.rejects(f.request('PLAN', { resumePlanId: plan.planId, wiki }), /多个不同/);
  const proof = { wikiId: '20', noticeCommentId: 'notice', noticeBodySha256: sha256(notice) };
  await assert.rejects(f.request('PLAN', { resumePlanId: plan.planId, wiki: { ...wiki,
    supersededWiki: { ...proof, noticeBodySha256: '0'.repeat(64) } } }), /作废旧页/);
  const revised = await f.request('PLAN', { resumePlanId: plan.planId, wiki: { ...wiki, supersededWiki: proof } });
  const result = await f.run(revised);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(f.comments.get('3').length, 2);
  assert.equal(f.comments.get('3')[0], historic);
  assert.equal(f.calls.filter(n => n === 'jenkins_trigger_build').length, 1);
});

test('new decisions supersede the prior reviewed plan and an invalid deployment cannot get as far as a Git write', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('PLAN', { ...f.input, release: { ...f.input.release, releaseTarget: null } }), /releaseTarget/);
  const old = await f.request('PLAN', f.input);
  const next = await f.request('PLAN', { ...f.input, decisions: ['改用已核实的单配置查询'] });
  assert.notEqual(old.planId, next.planId);
  await assert.rejects(f.run(old), /替换/);
  assert.equal(f.calls.includes('create_merge_request'), false);
  await assert.rejects(f.request('EXECUTE', { planId: next.planId, reviewedPlanHash: old.planId, confirmed: true }), /已审/);
  assert.equal((await f.run(next)).state, 'SUBMITTED');
});

test('a conflicting selected Task is rejected during preview or before the first Git write, independent of Task order', async t => {
  const f = await fixture(t), old = [{ id: 'previous', description: '提测wiki：' + wikiUrl('19') }];
  f.comments.set('3', old);
  await assert.rejects(f.request('PLAN', f.input), /其他提测 Wiki/);
  f.comments.delete('3');
  const prepared = await f.request('PLAN', f.input);
  f.comments.set('3', old);
  assert.equal((await f.run(prepared)).state, 'NEEDS_WIKI_REVIEW');
  assert.equal(f.calls.includes('create_merge_request'), false);
  assert.equal(f.calls.includes('jenkins_trigger_build'), false);
});

test('Wiki body drift before its write is a scoped pause even if the queue was already accepted', async t => {
  const f = await fixture(t, { editBody: true }), plan = await f.request('PLAN', f.input);
  const first = await f.run(plan);
  assert.equal(first.state, 'NEEDS_WIKI_REVIEW'); assert.equal(first.receipts.release.queueId, 42);
  assert.equal(f.calls.includes('update_wiki'), false);
  await writeFile(f.bodyFile, f.pages.get('20').markdown_description + entry);
  const refreshed = await f.request('PLAN', { resumePlanId: plan.planId, wiki: f.input.wiki });
  await assert.rejects(f.request('EXECUTE', { planId: refreshed.planId, reviewedPlanHash: plan.planId, confirmed: true }), /已审/);
  const done = await f.run(refreshed);
  assert.equal(done.state, 'SUBMITTED');
  assert.match(f.pages.get('20').markdown_description, /后端并发补充/);
  assert.equal(f.calls.filter(n => n === 'jenkins_trigger_build').length, 1);
});

test('additional target work requires review of the exact live delivered SHA and never repeats the source merge', async t => {
  const f = await fixture(t, { requireTargetReview: true }), plan = await f.request('PLAN', f.input);
  const waiting = await f.run(plan);
  assert.equal(waiting.state, 'NEEDS_TARGET_REVIEW'); assert.equal(waiting.receipts.git.deliveredSha, delivered);
  assert.equal(f.calls.includes('jenkins_trigger_build'), false);
  const evidence = { deliveredSha: delivered, scopeFingerprint: 'a'.repeat(64),
    contentFingerprint: 'b'.repeat(64), evidenceRefs: ['independent review of delivered tree'] };
  await assert.rejects(f.request('PLAN', { resumePlanId: plan.planId, targetEvidence: { ...evidence, deliveredSha: target } }), /已变化/);
  const revised = await f.request('PLAN', { resumePlanId: plan.planId, targetEvidence: evidence });
  const done = await f.run(revised);
  assert.equal(done.state, 'SUBMITTED');
  assert.equal(done.receipts.target.operation, 'VERIFY_CONTAINMENT_ONLY');
  assert.deepEqual(f.calls.filter(n => ['merge_merge_request', 'jenkins_trigger_build'].includes(n)), ['merge_merge_request', 'jenkins_trigger_build']);
});

test('one Bug writes one final record after Wiki and build; live HTML readback gates assignment to the tester', async t => {
  const f = await fixture(t, { bug: true }), plan = await f.request('PLAN', f.input);
  assert.equal(f.calls.includes('create_comments'), false);
  const done = await f.run(plan);
  assert.equal(done.state, 'SUBMITTED');
  const writes = f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name));
  assert.deepEqual(writes, ['create_merge_request', 'merge_merge_request', 'jenkins_trigger_build', 'update_wiki', 'create_comments', 'update_bug']);
  assert.equal(done.receipts.repairRecord.bodySha256, sha256(repairRecordBody.replace(/></g, '>\n<')));
  assert.equal(done.receipts.registration.actualOwner, 'tester');
  assert.equal(done.receipts.registration.actualStatus, 'testing');
  assert.equal(f.comments.get('1').filter(row => row.description.includes('【Bug 溯源与修复记录】')).length, 1);
});

test('an already-waiting Bug with NO_WIKI and SKIP reuses the matching record without rewriting it or its owner', async t => {
  const f = await fixture(t, { bug: true, waiting: true });
  f.input.wiki = null; f.input.release = null;
  f.comments.set('1', [{ id: '29', description: repairRecordBody }]);
  const done = await f.run(await f.request('PLAN', f.input));
  assert.equal(done.state, 'SUBMITTED');
  assert.equal(done.receipts.repairRecord.commentId, '29'); assert.equal(done.receipts.repairRecord.writes, 0);
  assert.equal(done.receipts.registration.state, 'SKIPPED_ALREADY_WAITING_TEST');
  for (const tool of ['create_comments', 'update_bug', 'get_wiki', 'jenkins_trigger_build']) assert.equal(f.calls.includes(tool), false);
});

test('an unknown repair comment blocks registration and cannot be published twice', async t => {
  const f = await fixture(t, { bug: true, loseRecord: true });
  const plan = await f.request('PLAN', f.input);
  await assert.rejects(f.run(plan), error => error.result.state === 'UNKNOWN' && error.result.phase === 'repairRecord' &&
    error.result.receipts.release.queueId === 42 && error.result.receipts.wiki.wikiId === '20');
  await assert.rejects(f.run(plan), /不允许/);
  assert.equal(f.calls.filter(tool => tool === 'create_comments').length, 1);
  assert.equal(f.calls.includes('update_bug'), false);
});

test('a missing draft, stale review, or additional required Bug repository blocks before any delivery write', async t => {
  const f = await fixture(t, { bug: true });
  for (const draft of [null, { ...f.input.repairRecord, contentFingerprint: '0'.repeat(64) },
    { ...f.input.repairRecord, requiredRepositories: [repo, 'https://git.example.test/team/other.git'] }]) {
    await assert.rejects(f.request('PLAN', { ...f.input, repairRecord: draft }), /修复记录/);
  }
  assert.deepEqual(f.calls, []);
});

test('later submission of a finished implementation binds the exact previous comment and equivalent rich HTML', async t => {
  const f = await fixture(t, { bug: true, waiting: true });
  const body = repairRecordBody.replace('模拟组件', 'A &amp; B 模拟组件').replace('显式声明', '<a href="https://example.test/a?x=1&amp;y=2">依据</a> 显式声明');
  const actual = body.replace(/&amp;/g, '&#38;').replace('Bug ', 'Bug&#32;').replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>');
  f.input.wiki = null; f.input.release = null; f.input.repairRecord.body = body;
  delete f.input.repairRecord.previousRecord;
  f.input.registration.prerequisites = { repairRecord: { commentId: '77', author: 'developer', bodySha256: sha256(actual) } };
  f.comments.set('1', [{ id: '77', description: actual }]);
  const done = await f.run(await f.request('PLAN', f.input));
  assert.equal(done.state, 'SUBMITTED'); assert.equal(done.receipts.repairRecord.commentId, '77');
  assert.equal(done.receipts.repairRecord.bodySha256, sha256(actual));
  assert.equal(f.calls.includes('create_comments'), false);
});

test('an entity-encoded title in an existing record is found before any CREATE even without an earlier receipt', async t => {
  const f = await fixture(t, { bug: true });
  const actual = repairRecordBody.replace('Bug ', 'Bug&#32;');
  f.comments.set('1', [{ id: '29', description: actual }]);
  f.input.wiki = null; f.input.release = null;
  const done = await f.run(await f.request('PLAN', f.input));
  assert.equal(done.state, 'SUBMITTED');
  assert.equal(done.receipts.repairRecord.commentId, '29'); assert.equal(done.receipts.repairRecord.bodySha256, sha256(actual));
  assert.equal(f.calls.includes('create_comments'), false);
});

test('a missing, rewritten or differently linked prior Bug record can never become a fresh CREATE', async t => {
  const f = await fixture(t, { bug: true });
  f.input.wiki = null; f.input.release = null;
  f.input.repairRecord.body = repairRecordBody.replace('显式声明', '<a href="https://example.test/reviewed">依据</a> 显式声明');
  const current = f.input.repairRecord.body.replace('example.test/reviewed', 'example.test/other');
  f.input.repairRecord.previousRecord = { commentId: '77', author: 'developer', bodySha256: sha256(current) };
  f.comments.set('1', [{ id: '77', description: current }]);
  const plan = await f.request('PLAN', f.input);
  const paused = await f.run(plan);
  assert.equal(paused.state, 'NEEDS_REPAIR_REVIEW'); assert.match(paused.detail, /精确读回不一致/);
  assert.equal(f.calls.includes('create_comments'), false); assert.equal(f.calls.includes('update_bug'), false);
  await assert.rejects(f.request('PLAN', { resumePlanId: plan.planId, repairRecord: { ...f.input.repairRecord, previousRecord: null } }), /评论 ID/);
  const revised = await f.request('PLAN', { resumePlanId: plan.planId, repairRecord: { ...f.input.repairRecord, body: current } });
  assert.equal((await f.run(revised)).state, 'SUBMITTED'); assert.equal(f.calls.includes('create_comments'), false);
  assert.equal(f.calls.filter(name => name === 'merge_merge_request').length, 1);
});
