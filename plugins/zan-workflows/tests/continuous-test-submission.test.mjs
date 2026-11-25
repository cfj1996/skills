import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStoryWiki } from '../skills/collecting-requirements/scripts/story-execution-wiki.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { noMockFixture, fixtureMockIo } from './helpers/mock-safety-fixture.mjs';
import { frozenJenkinsFixture } from './helpers/frozen-jenkins-fixture.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { repairRecordBody } from './helpers/bug-repair-record-fixture.mjs';

const source = 'a'.repeat(40), target = 'b'.repeat(40), delivered = 'c'.repeat(40);
const branch = 'feature/test.disclaimer', repo = 'https://git.example.test/team/factory.git';
const ci = 'https://ci.example.test/jenkins', jobUrl = ci + '/job/factory-test/';
const secondRepo = 'https://git.example.test/team/mobile.git', secondDelivered = 'f'.repeat(40);
const wikiUrl = id => 'https://www.tapd.cn/123/markdown_wikis/show/#' + id;
const entry = '1. Job：[factory](' + jobUrl + ')\n- 项目名称：[factory](' + repo + ')\n- 代码分支名：' + branch + '\n- 是否上线：未合并\n';
const tapd = (key, values) => ({ content: [{ type: 'text', text: JSON.stringify({ status: 1, data: values.map(row => ({ [key]: row })) }) }] });

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'continuous-submission-')), calls = [], sourceChecks = [];
  const bodyFile = join(dir, 'approved.md');
  let wikiId = '20', oldBody = '# 后端\n保留已有条目\n\n# 前端\n';
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
  const parameters = [{ name: 'branch' }];
  if (options.environmentParameter) parameters.push({ name: 'RELEASE_TYPE', choices: ['release:canary', 'release:prod'] });
  const readback = targetBranch => [{ parameters: [
    { name: 'branch', value: options.readbackBranch || targetBranch },
    ...(options.environmentParameter ? [{ name: 'RELEASE_TYPE', value: 'release:canary' }] : []),
  ] }];
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
  const first = { merge, release, delivered, queueId: 42, mrIid: 5, merged: options.alreadyContained };
  if (options.alreadyContained) {
    merge.mergeMode = 'CONTAINMENT_ONLY';
    merge.targetSha = delivered;
  }
  const models = [first];
  let second;
  if (options.batch) {
    const secondMerge = { ...merge, projectId: options.sameRepo ? merge.projectId : '10', originUrl: options.sameRepo ? repo : secondRepo,
      sourceBranch: options.sameRepo ? 'fixbug/test.mobile' : branch, targetBranch: 'dev',
      sourceSha: 'd'.repeat(40), targetSha: 'e'.repeat(40) };
    secondMerge.mockSafety = noMockFixture(secondMerge);
    const secondRelease = { ...release, targetProject: 'mobile', releaseTarget: 'mobile', jobName: 'mobile-test',
      jobUrl: ci + '/job/mobile-test/', sourceRepository: secondMerge.originUrl, releaseRef: 'dev', params: { branch: 'dev' } };
    second = { merge: secondMerge, release: secondRelease, delivered: secondDelivered, queueId: 43, mrIid: 6 };
    models.push(second);
    input.repositories = [{ merge, release }, { merge: secondMerge, release: options.skipSecond ? null : secondRelease }];
    delete input.merge;
    delete input.release;
    delete wiki.bodyFile;
    wiki.entryMarkdown = [
      { entryRepoUrl: repo, sourceBranch: branch, markdown: entry },
      { entryRepoUrl: secondRepo, sourceBranch: branch, markdown: entry.replaceAll(repo, secondRepo).replaceAll('factory', 'mobile') },
    ];
    if (options.bug) {
      input.repairRecord.requiredRepositories = [repo, secondMerge.originUrl];
      input.repairRecord.reviewedSources = models.map(({ merge: row }) => ({
        originUrl: row.originUrl, sourceBranch: row.sourceBranch, targetBranch: row.targetBranch, sourceSha: row.sourceSha, contentFingerprint: row.mockSafety.contentFingerprint,
      }));
    }
  }
  const byProject = projectId => models.find(model => model.merge.projectId === String(projectId));
  const byRepo = (originUrl, targetBranch) => models.find(model => model.merge.originUrl === originUrl && (!targetBranch || model.merge.targetBranch === targetBranch));
  const jobModels = [...models];
  if (options.extraJob) jobModels.push({ ...first, queueId: 44, release: { ...release, jobName: 'store-test',
    jobUrl: ci + '/job/store-test/', targetProject: 'store', releaseTarget: 'store' } });
  const byJob = jobName => jobModels.find(model => model.release.jobName === jobName);
  const liveTarget = model => model.advancedTarget ?? (model.merged ? model.delivered : model.merge.targetSha);
  const markMerged = model => {
    model.merged = true;
    return Object.assign(model.mr, { state: 'merged', merge_commit_sha: model.delivered });
  };
  const pool = { close: async () => ({ cleanupComplete: true }), call: async (server, name, args) => {
    calls.push(name);
    if (server === 'gitlab-mcp') {
      if (name === 'whoami') return { id: 100 };
      const otherBranch = options.sameRepo && (args.source_branch === second.merge.sourceBranch ||
        [second.merge.sourceBranch, second.merge.targetBranch].includes(args.branch_name) || Number(args.merge_request_iid) === second.mrIid);
      const model = otherBranch ? second : byProject(args.project_id), row = model.merge, id = Number(row.projectId);
      if (name === 'get_branch') return { commit: { id: args.branch_name === row.sourceBranch ? row.sourceSha
        : liveTarget(model) } };
      if (name === 'get_project') return { id, default_branch: 'main', http_url_to_repo: row.originUrl };
      if (name === 'list_merge_requests') return model.mr && !model.merged ? [model.mr] : [];
      if (name === 'create_merge_request') return model.mr = { iid: model.mrIid, source_project_id: id, target_project_id: id,
        sha: row.sourceSha, source_branch: row.sourceBranch, target_branch: row.targetBranch, state: 'opened',
        detailed_merge_status: 'mergeable', blocking_discussions_resolved: true,
        ...(options.conflict && model === first ? { has_conflicts: true } : {}),
        ...(options.manual && model === second ? { user: { can_merge: false } } : {}),
        web_url: row.originUrl.replace(/\.git$/, '/-/merge_requests/') + model.mrIid };
      if (name === 'get_merge_request') return String(args.merge_request_iid) === '88' ? options.replacement : model.mr;
      if (name === 'get_merge_request_approval_state') return { rules: [] };
      if (name === 'merge_merge_request') {
        const result = markMerged(model);
        await options.afterMerge?.();
        return result;
      }
    }
    if (name === 'jenkins_list_instances') return [{ name: 'default', url: ci }];
    if (name === 'jenkins_trigger_build') {
      const model = byJob(args.jobName);
      model.acceptedRef = args.params?.branch;
      if (options.unknown && (!second || model === second)) throw new Error('lost trigger response');
      if (options.replace) replaceWiki('21', '# 后端\n新版替代文档\n\n# 前端\n');
      if (options.editBody && model === first) pages.get(wikiId).markdown_description += '后端并发补充\n';
      return { jobName: args.jobName, queueUrl: ci + '/queue/item/' + model.queueId + '/' };
    }
    const o = args.options;
    if (name === 'get_bug') return tapd('Bug', [{ workspace_id: '123', ...bug }]);
    if (name === 'get_workflows_status_map') return { status: 1, data: { fixing: '修复中', testing: '待测试' } };
    if (name === 'get_workflows_all_transitions') return { status: 1, data: { fixing: ['testing'] } };
    if (name === 'update_bug') { Object.assign(bug, o); return { status: 1, data: true }; }
    if (name === 'get_stories_or_tasks') {
      const story = o.entity_type === 'stories';
      return tapd(story ? 'Story' : 'Task', [{ id: o.id, workspace_id: '123', ...(story ? {} : { story_id: '1' }), name: '展示设置', status: 'open', description: '' }]);
    }
    if (name === 'get_comments') return tapd('Comment', (comments.get(o.entry_id) || []).filter(row => !o.id || row.id === o.id)
      .map(row => ({ workspace_id: '123', entry_id: o.entry_id, entry_type: o.entry_type, author: 'developer', ...row })));
    if (name === 'get_wiki') return tapd('Wiki', (o.id ? [pages.get(o.id)] : [...pages.values()]
      .filter(page => o.note ? page.note === o.note : page.name === o.name))
      .filter(Boolean).map(page => ({ workspace_id: '123', ...page })));
    if (name === 'create_wiki') {
      const page = { id: String(700 + pages.size), workspace_id: '123', ...o };
      pages.set(page.id, page);
      return tapd('Wiki', [page]);
    }
    if (name === 'update_wiki') { Object.assign(pages.get(o.id), o); return tapd('Wiki', [pages.get(o.id)]); }
    if (name === 'create_comments') {
      const rows = comments.get(o.entry_id) || [];
      rows.push({ id: String(9000 + calls.length), description: options.bug ? o.description.replace(/></g, '>\n<') : o.description });
      comments.set(o.entry_id, rows);
      if (o.description.includes('【Bug 溯源与修复记录】')) await options.afterRecord?.();
      if (options.loseRecord && o.description.includes('【Bug 溯源与修复记录】')) throw new Error('lost comment acknowledgement');
      return tapd('Comment', rows.slice(-1));
    }
    throw new Error('unexpected ' + name);
  } };
  const newSession = () => new WorkflowSession({ allowExecute: true, pool, reader: request => {
    const model = byJob(request.jobName);
    return { instanceUrl: ci, jobUrl: model.release.jobUrl,
      job: async () => ({ name: model.release.jobName, url: model.release.jobUrl }),
      queueIdentity: url => ({ id: Number(new URL(url).pathname.match(/\d+(?=\/$|$)/)?.[0]), url }),
      queue: async () => {
        calls.push('read_queue');
        if (options.expiredQueue) throw Object.assign(new Error('queue expired'), { httpStatus: 404 });
        return { id: model.queueId, actions: readback(model.acceptedRef || model.merge.targetBranch) };
      },
      buildForQueue: async () => {
        calls.push('read_historical_queue');
        return { number: 7, queueId: model.queueId, actions: readback(model.acceptedRef || model.merge.targetBranch) };
      },
    };
  },
    io: { ...fixtureMockIo, planBuildStateDir: join(dir, 'build-receipts'), checkRepository: async () => {}, inspectContainment: async request => {
      const model = byRepo(request.originUrl, request.targetBranch);
      return { contained: Boolean(model.merged) && request.sourceSha !== options.missingAncestor, targetSha: liveTarget(model) };
    },
    containsSource: async request => {
      const model = byRepo(request.originUrl, request.targetBranch);
      return { contained: !request.expectedDeliveredSha || !options.deliveryRemoved,
        targetSha: request.expectedDeliveredSha && options.targetAdvanced ? model.merge.targetSha : liveTarget(model) };
    }, checkSource: async request => {
        if (options.requireTargetReview && !request.mockSafety.deliverySourceEvidence) throw new Error('目标分支包含额外内容，需要增量评审');
        sourceChecks.push(request.expectedSha);
        return { kind: 'branch', ref: 'refs/heads/' + request.releaseRef,
          branch: request.releaseRef, sourceRepository: request.sourceRepository, sourceSha: request.expectedSha };
      }, readFrozenJenkinsContracts: async (_, __, request) => {
        const model = request.jobName ? byJob(request.jobName)
          : models.find(row => row.release.targetProject === request.jenkinsProjectKey);
        return frozenJenkinsFixture(model.release, { parameters }, ci);
      } } });
  let i = 0, session = newSession();
  const request = (phase, data) => session.dispatch({ id: 'request-' + ++i, action: 'submit', phase, input: data });
  const run = plan => request('EXECUTE', { confirmed: true, planId: plan.planId });
  t.after(async () => { await session.close(); await rm(dir, { recursive: true, force: true }); });
  return { input, request, run, calls, sourceChecks, pages, comments, bodyFile,
    planWiki: (mode, data) => runStoryWiki(mode, data, (name, args) => pool.call('tapd-mcp', name, args), async () => true),
    step: (action, phase, data) => session.dispatch({ id: 'step-' + ++i, action, phase, input: data }),
    standaloneBuild: (phase, data) => session.dispatch({ id: 'build-' + ++i, action: 'release', phase, input: data }),
    seedConflictedMr: owner => {
      first.mr = { iid: first.mrIid, source_project_id: Number(merge.projectId), target_project_id: Number(merge.projectId),
        source_branch: branch, target_branch: merge.targetBranch, sha: source, state: 'opened', has_conflicts: true,
        author: { id: owner }, web_url: repo + '/-/merge_requests/5' };
    },
    markReplacementMerged: () => { first.merged = true; },
    advanceFirstTarget: sha => { first.advancedTarget = sha; },
    mergeSecondOutsideSession: () => markMerged(second),
    restart: async () => { await session.close(); session = newSession(); }, get oldBody() { return oldBody; } };
}

test('one authorized request carries the merged SHA, accepted queue and verified Wiki into exactly the selected Task links', async t => {
  const f = await fixture(t);
  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.state, 'PREPARED');
  await assert.rejects(f.request('EXECUTE', { planId: plan.planId, reviewedPlanHash: plan.planId }), /明确确认/);
  await assert.rejects(f.request('EXECUTE', { planId: plan.planId, confirmed: true, reviewedPlanHash: 'other' }), /已审/);
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

test('before delivery a Wiki correction and an accepted limitation reuse the prepared repository checks', async t => {
  const f = await fixture(t, { batch: true });
  const incomplete = structuredClone(f.input);
  incomplete.repositories[1].merge.reviewPassed = false;
  await assert.rejects(f.request('PLAN', incomplete), /已评审/);
  assert.deepEqual(f.calls, []);
  const first = await f.request('PLAN', f.input);
  const reads = f.calls.length;
  assert.deepEqual(await f.request('PLAN', { resumePlanId: first.planId }), first);
  assert.equal(f.calls.length, reads);
  const changedBody = first.review.approvedWikiBody + '- 验证结果：已核对移动端入口分流\n';
  await writeFile(f.bodyFile, changedBody);
  const before = f.calls.length;
  await assert.rejects(f.request('PLAN', { resumePlanId: first.planId, release: null }), /预检修订/);
  await assert.rejects(f.request('PLAN', { resumePlanId: first.planId, wiki: { bodyFile: f.bodyFile, creator: 'other' } }), /归属/);
  const revised = await f.request('PLAN', { resumePlanId: first.planId, wiki: { bodyFile: f.bodyFile }, decisions: ['保留已知问题'] });
  assert.equal(revised.state, 'PREPARED');
  assert.notEqual(revised.planId, first.planId);
  assert.deepEqual(revised.review.repositories, first.review.repositories);
  assert.deepEqual(revised.review.decisions, [...first.review.decisions, '保留已知问题']);
  assert.equal(revised.review.approvedWikiBody, changedBody);
  assert.ok(f.calls.length > before);
  assert.ok(f.calls.slice(before).every(name => ['get_wiki', 'get_comments', 'get_stories_or_tasks'].includes(name)));
  const stable = await f.request('PLAN', { resumePlanId: revised.planId, decisions: ['保留已知问题'] });
  assert.equal(stable.planId, revised.planId);
  await assert.rejects(f.run(first), /已被.*替换/);
  await assert.rejects(f.request('EXECUTE', { planId: revised.planId, reviewedPlanHash: first.planId, confirmed: true }), /已审/);
  const result = await f.run(revised);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(f.pages.get('20').markdown_description, changedBody);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 2);
});

test('Story-only delivery updates the test Wiki while preserving the separate execution page and its backlink', async t => {
  const f = await fixture(t, { batch: true, skipSecond: true });
  f.input.linkTaskIds = [];
  const executionPage = { id: '80', parent_wiki_id: '70', name: '需求执行计划 · 1', markdown_description: '# 需求执行计划' };
  const executionLink = { id: '90', description: '需求开发执行文档：' + wikiUrl(executionPage.id)
    + ' ｜ 执行计划版本确认：80:r1:' + sha256(executionPage.markdown_description) };
  f.pages.set(executionPage.id, { ...executionPage });
  const originalComments = [...f.comments.get('1'), executionLink];
  f.comments.set('1', structuredClone(originalComments));

  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.state, 'PREPARED');
  const result = await f.run(plan);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.wiki.wikiId, '20');
  assert.equal(f.pages.get('20').markdown_description, plan.review.approvedWikiBody);
  assert.deepEqual(f.pages.get(executionPage.id), executionPage);
  assert.deepEqual(f.comments.get('1'), originalComments);
  assert.deepEqual(result.receipts.links, []);
  assert.equal(result.receipts.registration.state, 'NOT_APPLICABLE');
});

test('one batch preview binds both test Jobs and renders the selected entries into one shared Wiki', async t => {
  const f = await fixture(t, { batch: true });
  const secondary = f.input.repositories[1];
  secondary.release = { jenkinsProjectKey: 'mobile', jobAdapter: 'explicit-v1' };
  const annex = '\n# 附录\n保持原文\n';
  const unrelated = entry.replace('1. Job', '2. Job').replaceAll(repo, 'https://git.example.test/team/other.git');
  f.pages.get('20').markdown_description = f.oldBody + entry + unrelated + annex;
  f.input.wiki.entryMarkdown[0].markdown = entry + '- 内容：更新展示设置\n';

  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.review.repositories[1].release.jobUrl, ci + '/job/mobile-test/');
  assert.deepEqual(plan.review.repositories.map(row => row.release.params), [{ branch: 'develop' }, { branch: 'dev' }]);
  assert.equal(f.calls.filter(name => name === 'jenkins_list_instances').length, 1);
  assert.equal(f.calls.filter(name => name === 'get_stories_or_tasks').length, 3);
  assert.match(plan.review.approvedWikiBody, /3\. Job：\[mobile\]/);
  assert.ok(plan.review.approvedWikiBody.includes(unrelated));
  assert.ok(plan.review.approvedWikiBody.endsWith(annex.trimStart()));
  assert.equal(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)).length, 0);

  const result = await f.run(plan);
  assert.equal(result.state, 'SUBMITTED');
  assert.deepEqual(result.receipts.repositories.map(row => [row.git.deliveredSha, row.release.queueId]),
    [[delivered, 42], [secondDelivered, 43]]);
  assert.equal(f.pages.get('20').markdown_description, plan.review.approvedWikiBody);
  assert.deepEqual(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)),
    ['create_merge_request', 'merge_merge_request', 'jenkins_trigger_build', 'create_merge_request', 'merge_merge_request',
      'jenkins_trigger_build', 'update_wiki', 'create_comments', 'create_comments']);
});

test('a batch reports independent preflight failures before any merge or build', async t => {
  const f = await fixture(t, { batch: true });
  f.input.repositories[1].release.params = { branch: 'develop' };
  f.input.wiki.entryMarkdown[0].markdown = '无项目条目的正文';
  await assert.rejects(f.request('PLAN', f.input), error => {
    assert.equal(error.result.writes, 0);
    assert.deepEqual(error.result.checks.map(check => check.phase), ['repository', 'wiki']);
    assert.match(error.result.checks[0].error, /参数.*不一致/);
    return true;
  });
  assert.equal(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)).length, 0);
});

test('a second repository awaiting manual merge continues the exact batch plan without replaying the first delivery', async t => {
  const f = await fixture(t, { batch: true, manual: true, bug: true, skipSecond: true });
  const plan = await f.request('PLAN', f.input);
  const paused = await f.run(plan);
  assert.equal(paused.state, 'AWAITING_MERGE');
  assert.equal(paused.repository, secondRepo);
  assert.equal(paused.receipts.repositories[0].release.queueId, 42);
  assert.equal(f.calls.includes('update_wiki'), false);
  assert.equal((await f.request('PLAN', { resumePlanId: plan.planId })).state, 'AWAITING_MERGE');

  f.mergeSecondOutsideSession();
  const ready = await f.request('PLAN', { resumePlanId: plan.planId });
  assert.equal(ready.planId, plan.planId);
  const result = await f.run(ready);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.repositories[1].release.state, 'SKIPPED_BY_INTENT');
  assert.equal(result.receipts.registration.state, 'REGISTERED');
  assert.deepEqual(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)),
    ['create_merge_request', 'merge_merge_request', 'jenkins_trigger_build', 'create_merge_request',
      'update_wiki', 'create_comments', 'update_bug']);
});

test('a fresh session resumes the shared Wiki after only rechecking both original MRs and Jenkins queues', async t => {
  const f = await fixture(t, { batch: true, editBody: true });
  const blocked = await f.run(await f.request('PLAN', f.input));
  assert.equal(blocked.state, 'NEEDS_WIKI_REVIEW');
  assert.equal(blocked.receipts.repositories[1].release.queueId, 43);
  await f.restart();
  const recoverDelivery = structuredClone(blocked.receipts);
  delete recoverDelivery.repositories[1].release;
  await assert.rejects(f.request('PLAN', { ...f.input, recoverDelivery }), /确切回执/);
  const plan = await f.request('PLAN', { ...f.input, recoverDelivery: blocked.receipts });
  assert.deepEqual(plan.review.repositories.map(row => row.recoveredDelivery.queueId), [42, 43]);
  const before = f.calls.length;
  const result = await f.run(plan);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(f.calls.slice(before).filter(name => name === 'read_queue').length, 2);
  assert.equal(f.calls.filter(name => name === 'merge_merge_request').length, 2);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 2);
  assert.equal(f.calls.filter(name => name === 'update_wiki').length, 1);
  assert.ok(f.pages.get('20').markdown_description.includes('后端并发补充'));
});

test('an already contained delivery resumes without an MR or a rebuild after the test branch advances', async t => {
  const f = await fixture(t, { alreadyContained: true, editBody: true });
  const paused = await f.run(await f.request('PLAN', f.input));
  assert.equal(paused.state, 'NEEDS_WIKI_REVIEW');
  assert.equal(paused.receipts.git.mrIid, null);
  assert.equal(paused.receipts.git.deliveredSha, delivered);
  const latest = 'd'.repeat(40);
  f.advanceFirstTarget(latest);
  await f.restart();
  await writeFile(f.bodyFile, f.pages.get('20').markdown_description + entry);
  const resumed = await f.request('PLAN', { ...f.input, recoverDelivery: paused.receipts });
  const result = await f.run(resumed);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.git.observedTargetSha, latest);
  assert.equal(result.receipts.git.deliveredSha, delivered);
  assert.equal(result.receipts.release.expectedSha, delivered);
  assert.equal(result.receipts.release.queueId, 42);
  assert.equal(f.calls.includes('get_merge_request'), false);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 1);
});

test('a later test tip preserves a previously reviewed and built target increment during recovery', async t => {
  const f = await fixture(t, { requireTargetReview: true, editBody: true });
  const waiting = await f.run(await f.request('PLAN', f.input));
  assert.equal(waiting.state, 'NEEDS_TARGET_REVIEW');
  const increment = 'd'.repeat(40), latest = 'e'.repeat(40);
  const targetEvidence = { deliveredSha: increment, scopeFingerprint: 'a'.repeat(64), contentFingerprint: 'b'.repeat(64),
    evidenceRefs: ['independent review of delivered tree'] };
  f.advanceFirstTarget(increment);
  const reviewed = await f.request('PLAN', { resumePlanId: waiting.planId, targetEvidence });
  const paused = await f.run(reviewed);
  assert.equal(paused.state, 'NEEDS_WIKI_REVIEW');
  assert.equal(paused.receipts.release.expectedSha, increment);
  f.advanceFirstTarget(latest);
  await f.restart();
  await writeFile(f.bodyFile, f.pages.get('20').markdown_description + entry);
  const merge = { ...f.input.merge, mockSafety: { ...f.input.merge.mockSafety, deliverySourceEvidence: targetEvidence } };
  const resumed = await f.request('PLAN', { ...f.input, merge, recoverDelivery: paused.receipts });
  const result = await f.run(resumed);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.git.deliveredSha, delivered);
  assert.equal(result.receipts.target.observedTargetSha, latest);
  assert.equal(result.receipts.target.deliveredSha, increment);
  assert.equal(result.receipts.release.expectedSha, increment);
  assert.deepEqual(f.calls.filter(name => ['merge_merge_request', 'jenkins_trigger_build'].includes(name)),
    ['merge_merge_request', 'jenkins_trigger_build']);
});

test('a lost second build response preserves the first queue and blocks dependent writes in the same or a fresh session', async t => {
  const f = await fixture(t, { batch: true, unknown: true });
  const plan = await f.request('PLAN', f.input);
  let uncertain;
  await assert.rejects(f.run(plan), error => {
    uncertain = error.result;
    return uncertain.state === 'UNKNOWN' && uncertain.receipts.repositories[0].release.queueId === 42;
  });
  await assert.rejects(f.run(plan), /不允许/);
  await f.restart();
  await assert.rejects(f.request('PLAN', { ...f.input, recoverDelivery: uncertain.receipts }), /确切回执/);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 2);
  assert.equal(f.calls.includes('update_wiki'), false);
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
  assert.equal(plan.state, 'PREPARED');
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

test('a regenerated carrier with identical Wiki bytes retains the approval across and within sessions', async t => {
  const f = await fixture(t);
  const first = await f.request('PLAN', f.input);
  await f.restart();
  const makeCarrier = async name => {
    const bodyFile = join(f.input.merge.repositoryPath, name);
    await writeFile(bodyFile, f.oldBody + entry);
    return f.request('PLAN', { ...f.input, wiki: { ...f.input.wiki, bodyFile } });
  };
  assert.equal((await makeCarrier('regenerated.md')).planId, first.planId);
  assert.equal((await makeCarrier('latest.md')).planId, first.planId);
  await Promise.all([rm(f.bodyFile), rm(join(f.input.merge.repositoryPath, 'regenerated.md'))]);
  assert.equal((await f.run(first)).state, 'SUBMITTED');
});

async function closedWikiFixture(t, options) {
  const f = await fixture(t, options);
  const previous = await f.request('PLAN', f.input);
  const paused = await f.run(previous);
  assert.equal(paused.state, 'NEEDS_WIKI_REVIEW');
  const notice = '提测wiki（新）：' + wikiUrl('21') + '（作废旧页 #20）';
  const old = { id: 'old-link', description: '提测wiki：' + wikiUrl('20') };
  f.comments.set('1', [old, { id: 'replacement', description: notice }]);
  f.comments.set('3', [old]);
  await writeFile(f.bodyFile, f.oldBody + entry);
  await f.restart();
  const { merge, wiki, registration, linkTaskIds } = f.input;
  const recovery = { merge: { ...merge, mrIid: paused.receipts.git.mrIid }, registration, linkTaskIds,
    recoverWiki: { previousWikiId: '20', releaseReceipt: paused.receipts.release },
    wiki: { ...wiki, expectedWikiId: '21', expectedOwnerType: 'stories', expectedOwnerId: '1',
      supersededWiki: { wikiId: '20', noticeCommentId: 'replacement', noticeBodySha256: sha256(notice) } } };
  return { f, recovery, old };
}

test('a new session verifies the old MR and expired queue then updates only the exact replacement and selected Task links', async t => {
  const { f, recovery, old } = await closedWikiFixture(t, { replace: true, expiredQueue: true, targetAdvanced: true });
  const count = f.calls.length;
  const plan = await f.request('PLAN', recovery);
  assert.equal(plan.state, 'PREPARED');
  assert.equal(plan.receipts.git.deliveredSha, delivered);
  assert.equal(plan.receipts.release.verification.matchedBy, 'BUILD_QUEUE_ID');
  assert.equal(plan.receipts.release.verification.writes, 0);
  assert.equal(f.calls.slice(count).some(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), false);
  const result = await f.run(plan);
  assert.equal(result.state, 'SUBMITTED');
  assert.equal(result.receipts.wiki.wikiId, '21');
  assert.deepEqual(result.receipts.links.map(link => link.entryId), ['2', '3']);
  assert.equal(result.receipts.registration.state, 'NOT_APPLICABLE');
  assert.equal(f.pages.get('20').markdown_description.includes(entry), false);
  assert.equal(f.comments.get('3')[0], old);
  assert.deepEqual(f.calls.slice(count).filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)),
    ['update_wiki', 'create_comments', 'create_comments']);
  assert.equal(f.calls.slice(count).filter(name => name === 'read_historical_queue').length, 2);
});

test('cross-session recovery blocks an unrelated delivery or changed queue parameters before a Wiki write', async t => {
  const options = { replace: true, deliveryRemoved: true };
  const { f, recovery } = await closedWikiFixture(t, options);
  const count = f.calls.length;
  await assert.rejects(f.request('PLAN', recovery), /未验证包含/);
  options.deliveryRemoved = false;
  const plan = await f.request('PLAN', recovery);
  options.readbackBranch = 'other';
  await assert.rejects(f.run(plan), error => error.result?.state === 'BLOCKED' && error.result.writes === 0 &&
    /原测试构建参数未读回或不一致/.test(error.message));
  assert.equal(f.calls.slice(count).some(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), false);
});

test('a replacement Wiki cannot recover a partial, artificially masked or production-parameter receipt', async t => {
  const { f, recovery } = await closedWikiFixture(t, { replace: true, environmentParameter: true });
  const count = f.calls.length;
  for (const [submittedParams, reason] of [
    [{ branch: 'develop' }, /缺少完整/],
    [{ branch: 'develop', RELEASE_TYPE: '[REDACTED]' }, /脱敏状态/],
    [{ branch: 'develop', RELEASE_TYPE: 'release:prod' }, /固定测试环境/],
  ]) {
    const recoverWiki = { ...recovery.recoverWiki, releaseReceipt: { ...recovery.recoverWiki.releaseReceipt, submittedParams } };
    await assert.rejects(f.request('PLAN', { ...recovery, recoverWiki }), reason);
  }
  assert.equal(f.calls.slice(count).includes('read_queue'), false);
  assert.equal(f.calls.slice(count).some(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), false);
  assert.equal((await f.request('PLAN', recovery)).state, 'PREPARED');
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

test('a two-repository Bug keeps its execution page and records one repair and registration after both deliveries', async t => {
  const f = await fixture(t, { bug: true, batch: true });
  const executionPage = { id: '80', parent_wiki_id: '70', name: 'Bug 修复计划 · 1', markdown_description: '# Bug 修复计划' };
  const executionLink = { id: '90', description: 'Bug 修复执行文档：' + wikiUrl(executionPage.id)
    + ' ｜ 执行计划版本确认：80:r1:' + sha256(executionPage.markdown_description) };
  f.pages.set(executionPage.id, { ...executionPage });
  f.comments.get('1').push(executionLink);

  const plan = await f.request('PLAN', f.input);
  assert.equal(plan.state, 'PREPARED');
  const done = await f.run(plan);
  assert.equal(done.state, 'SUBMITTED');
  assert.deepEqual(done.receipts.repositories.map(row => row.git.deliveredSha), [delivered, secondDelivered]);
  assert.deepEqual(f.calls.filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), [
    'create_merge_request', 'merge_merge_request', 'jenkins_trigger_build',
    'create_merge_request', 'merge_merge_request', 'jenkins_trigger_build',
    'update_wiki', 'create_comments', 'update_bug',
  ]);
  assert.equal(done.receipts.wiki.wikiId, '20');
  assert.deepEqual(f.pages.get(executionPage.id), executionPage);
  assert.deepEqual(f.comments.get('1').filter(row => row.id === executionLink.id), [executionLink]);
  assert.equal(f.comments.get('1').filter(row => row.description.includes('【Bug 溯源与修复记录】')).length, 1);
  const count = f.calls.length;
  assert.equal((await f.run(plan)).state, 'SUBMITTED');
  assert.equal(f.calls.length, count);
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

async function startBoundPlan(f, startMode, change = m => m, limit) {
  const example = await readFile(new URL('fixtures/legacy-bug-plan.md', import.meta.url), 'utf8');
  const firstMerge = f.input.merge || f.input.repositories[0].merge;
  const bug = f.input.registration.entryType === 'bug';
  const template = bug ? example : example.replaceAll('缺陷', '需求').replace('/bug/detail/', '/story/detail/');
  const body = change(template.replaceAll('111230010000102', '1')
    .replace('https://git.example.test/team/merchant-admin.git', repo)
    .replace('fixbug/demo.1120.1000102.修复门店筛选', branch)
    .replace('https://ci.example.test/job/merchant-admin-test/', jobUrl)
    .replaceAll('merchant-admin', 'factory')
    .replace('将门店筛选修复提交测试环境验证', firstMerge.purpose));
  f.pages.set('70', { id: '70', name: '需求执行文档', parent_wiki_id: '0' });
  const raw = { workspaceId: '123', [bug ? 'bugId' : 'storyId']: '1', parentWikiId: '70', actor: 'developer', markdown: body, schema: 3 };
  const preview = await f.planWiki('PLAN', raw);
  const saved = await f.planWiki('SAVE', { ...raw, approval: preview.approval, confirmedFingerprint: preview.fingerprint });
  if (startMode === 'MANUAL') await f.restart();
  const start = await f.planWiki('START', { wikiUrl: saved.wikiUrl, startMode,
    expectedRevision: saved.revision, expectedApprovalFingerprint: saved.approvalFingerprint, limit });
  f.input.tapdPlan = start.tapdPlan;
  return { start, saved, raw };
}

function secondProjectWithSharedApis(markdown) {
  const start = markdown.indexOf('## P1 '), end = markdown.indexOf('## 执行记录');
  return markdown.slice(start, end).replace(/^### 接口清单\n[\s\S]*?(?=^### )/m, '')
    .replace('## P1 ', '## P2 ').replaceAll('P1-M', 'P2-M');
}

test('stateless Wiki selects delivery at startup and binds that choice through submission', async t => {
  const f = await fixture(t, { bug: true });
  const example = await readFile(new URL('../skills/collecting-requirements/assets/example-bug-plan.md', import.meta.url), 'utf8');
  const markdown = example.replaceAll('111230010000102', '1')
    .replace('https://git.example.test/team/merchant-admin.git', repo)
    .replace('fixbug/demo.1120.1000102.修复门店筛选', branch);
  f.pages.set('70', { id: '70', name: '需求执行文档', parent_wiki_id: '0' });
  const raw = { workspaceId: '123', bugId: '1', parentWikiId: '70', actor: 'developer', markdown };
  await assert.rejects(f.planWiki('PLAN', { ...raw,
    markdown: markdown.replace('## P1 ', '| 是否提测 | 否 |\n\n## P1 ') }), /在启动时处理/);
  const preview = await f.planWiki('PLAN', raw);
  assert.equal(preview.approval.schema, 4);
  const saved = await f.planWiki('SAVE', { ...raw, approval: preview.approval, confirmedFingerprint: preview.fingerprint });
  assert.equal(saved.delivery, null);
  const open = { wikiUrl: saved.wikiUrl, startMode: 'MANUAL' };
  await assert.rejects(f.planWiki('START', open), /启动前须明确/);
  const local = await f.planWiki('START', { ...open, startup: { submit: false, build: false } });
  assert.equal(local.workflow, 'IMPLEMENT_ONLY');
  const project = {
    交付目的: f.input.merge.purpose, 提测合并: '提交推送并合并 MR', 提测目标分支: 'develop',
    '测试构建 Job': jobUrl, 构建项目: 'factory', 构建对象: 'factory', 构建来源: 'develop',
    构建参数指纹: sha256(JSON.stringify({ branch: 'develop' })),
  };
  const startup = { submit: true, build: true, testWiki: '需要', projects: { P1: project } };
  const noBuild = await f.planWiki('START', { ...open, startup, limit: 'NO_BUILD' });
  assert.equal(noBuild.submit, true);
  assert.deepEqual(noBuild.buildProjects, []);
  const buildOnly = await f.planWiki('START', { ...open, startup, limit: 'BUILD_ONLY' });
  assert.equal(buildOnly.workflow, 'RELEASE_ONLY');
  assert.deepEqual(buildOnly.gitProjects, []);
  const both = await f.planWiki('START', { ...open, startup });
  assert.equal(both.workflow, 'CONTINUOUS_SUBMIT');
  f.input.tapdPlan = both.tapdPlan;
  const swapped = { ...startup, projects: { P1: { ...project, 交付目的: '更换了交付目的' } } };
  await assert.rejects(f.request('PLAN', { ...f.input, tapdPlan: { ...both.tapdPlan, startup: swapped } }), /启动选择已变化/);
  const completed = await f.run(await f.request('PLAN', f.input));
  assert.equal(completed.state, 'SUBMITTED');
  assert.equal(completed.receipts.release.queueId, 42);
  assert.deepEqual(await f.planWiki('READ', { wikiUrl: saved.wikiUrl }), saved);
});

for (const mode of ['IMMEDIATE', 'MANUAL']) {
  test(mode + ' uses the same confirmed Plan through Git, Jenkins, Wiki and Bug registration', async t => {
    const f = await fixture(t, { bug: true });
    const { start } = await startBoundPlan(f, mode);
    assert.equal(start.next, 'SUBMIT');
    assert.equal(start.build, true);
    assert.ok(!f.calls.includes('create_merge_request'));
    const preview = await f.request('PLAN', f.input);
    const done = await f.run(preview);
    assert.equal(done.state, 'SUBMITTED');
    assert.equal(done.receipts.release.queueId, 42);
    assert.equal(done.receipts.registration.state, 'REGISTERED');
    const count = f.calls.length;
    assert.equal((await f.run(preview)).state, 'SUBMITTED');
    assert.equal(f.calls.length, count);
  });
}

test('manual narrowing excludes Jenkins, and mismatched scope or a newer Wiki is caught before delivery writes', async t => {
  const f = await fixture(t, { bug: true });
  const { raw, start } = await startBoundPlan(f, 'MANUAL', m => m, 'NO_BUILD');
  assert.equal(start.build, false);
  await assert.rejects(f.request('PLAN', f.input), /Job|环境/);
  f.input.release = null;
  await assert.rejects(f.request('PLAN', { ...f.input, merge: { ...f.input.merge, purpose: '其它目的' } }), /Plan 不一致/);
  const plan = await f.request('PLAN', f.input);
  const update = { ...raw, markdown: raw.markdown.replace('清除区域筛选后门店列表仍显示旧区域', '修订后的门店筛选范围') };
  const next = await f.planWiki('PLAN', update);
  await f.planWiki('SAVE', { ...update, approval: next.approval, confirmedFingerprint: next.fingerprint });
  const before = f.calls.length;
  await assert.rejects(f.run(plan), /版本已变化/);
  assert.ok(!f.calls.slice(before).some(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)));
});

test('a known conflict preserves the original MR and resumes through reviewed A and C containment without replay', async t => {
  const c = 'merge/修复门店筛选-to-develop', cSha = 'd'.repeat(40);
  const options = { bug: true, conflict: true, replacement: { iid: 88, state: 'opened', source_branch: c,
    target_branch: 'develop', sha: cSha, source_project_id: 9, target_project_id: 9, merge_commit_sha: delivered,
    head_pipeline: { status: 'success' } } };
  const f = await fixture(t, options);
  await startBoundPlan(f, 'IMMEDIATE');
  const plan = await f.request('PLAN', f.input), paused = await f.run(plan);
  assert.equal(paused.state, 'NEEDS_CONFLICT_RESOLUTION');
  assert.equal(paused.receipts.conflict.expectedBranch, c);
  assert.ok(!f.calls.includes('jenkins_trigger_build'));
  const resume = { resumePlanId: plan.planId, conflictResolution: { branch: c, mrIid: '88', reviewedSha: cSha, reviewEvidence: '独立评审与测试回执 72' } };
  await assert.rejects(f.request('PLAN', { ...resume, conflictResolution: { ...resume.conflictResolution, branch: 'merge/other' } }), /不符/);
  assert.equal((await f.request('PLAN', resume)).state, 'NEEDS_CONFLICT_RESOLUTION');
  options.replacement.state = 'merged';
  f.markReplacementMerged();
  options.missingAncestor = cSha;
  await assert.rejects(f.request('PLAN', resume), /包含证据/);
  delete options.missingAncestor;
  const continued = await f.request('PLAN', resume);
  assert.equal(continued.planId, plan.planId);
  assert.equal((await f.run(continued)).state, 'SUBMITTED');
  assert.equal(f.calls.filter(name => name === 'create_merge_request').length, 1);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 1);
});

test('explicit build-only start triggers only its exact test Job and no Git or TAPD delivery actions', async t => {
  const f = await fixture(t, { bug: true });
  const { start } = await startBoundPlan(f, 'MANUAL',
    body => body.replace('| 是否提测 | 是 |', '| 是否提测 | 否 |')
      .replace('**构建来源** develop', '**构建来源** ' + branch)
      .replace(sha256(JSON.stringify({ branch: 'develop' })), sha256(JSON.stringify({ branch }))));
  assert.equal(start.next, 'BUILD_ONLY');
  assert.deepEqual(start.separateBuilds, ['P1']);
  const before = f.calls.length;
  const request = { ...f.input.release, releaseRef: branch, expectedSha: source, params: { branch },
    purpose: f.input.merge.purpose, repositoryPath: f.input.merge.repositoryPath, mockSafety: f.input.merge.mockSafety,
    targetBranch: branch, completionMode: 'TRIGGER_ACCEPTED', tapdPlan: start.tapdPlan };
  const preview = await f.standaloneBuild('PLAN', request);
  assert.equal(preview.state, 'PREPARED');
  const result = await f.standaloneBuild('EXECUTE', { ...preview, confirmed: true });
  assert.equal(result.state, 'BUILD_SUBMITTED');
  assert.deepEqual(f.calls.slice(before).filter(name => /^(create_|merge_merge_|jenkins_trigger|update_)/.test(name)), ['jenkins_trigger_build']);
});

test('implementation-only and bare Wiki links do not activate a saved delivery', async t => {
  const f = await fixture(t, { bug: true });
  const { start, saved } = await startBoundPlan(f, 'MANUAL', m => m, 'IMPLEMENT_ONLY');
  const inspected = await f.planWiki('READ', { wikiUrl: saved.wikiUrl });
  assert.equal(inspected.next, undefined);
  assert.equal(start.next, 'IMPLEMENT_ONLY');
  assert.equal(start.submit, false);
  assert.equal(start.build, false);
  await assert.rejects(f.request('PLAN', f.input), /本轮执行范围/);
  await assert.rejects(f.planWiki('START', { startMode: 'IMMEDIATE', wikiUrl: saved.wikiUrl }), /刚确认的版本/);
  assert.ok(!f.calls.includes('create_merge_request') && !f.calls.includes('jenkins_trigger_build'));
});

test('an unresolved Jenkins parameter does not hold up an explicitly narrowed no-build submission', async t => {
  const f = await fixture(t, { bug: true });
  const { start, saved } = await startBoundPlan(f, 'MANUAL', text => text
    .replace('- **复现与实际结果**', '- **交付待核实** P1 测试 Job 的参数指纹待核实。\n- **复现与实际结果**')
    .replace(/^- \*\*构建参数指纹\*\* .+$/m, '- **构建参数指纹** 待核实'), 'NO_BUILD');
  const full = await f.planWiki('START', { startMode: 'MANUAL', wikiUrl: saved.wikiUrl });
  assert.equal(full.workflow, 'MATCH_CHECKLIST');
  assert.deepEqual(full.missing, ['P1 构建参数指纹']);
  assert.equal(start.workflow, 'CONTINUOUS_SUBMIT');
  f.input.release = null;
  assert.equal((await f.run(await f.request('PLAN', f.input))).state, 'SUBMITTED');
  assert.ok(!f.calls.includes('jenkins_trigger_build'));
});

test('distinct project purposes route the same start to the selected Git and Jenkins operations', async t => {
  const f = await fixture(t, { bug: true, batch: true });
  const [one, two] = f.input.repositories;
  two.merge.purpose = '验证移动端展示';
  const { start } = await startBoundPlan(f, 'MANUAL', text => {
    const end = text.indexOf('## 执行记录');
    const second = secondProjectWithSharedApis(text).replaceAll(repo, secondRepo)
      .replaceAll(jobUrl, two.release.jobUrl).replaceAll('factory', 'mobile').replaceAll('develop', 'dev')
      .replaceAll(one.merge.purpose, two.merge.purpose)
      .replace(sha256(JSON.stringify({ branch: 'develop' })), sha256(JSON.stringify({ branch: 'dev' })));
    return text.slice(0, end) + second + text.slice(end);
  });
  assert.equal(start.workflow, 'DELIVERY_STEPS');
  assert.deepEqual(start.gitProjects, ['P1', 'P2']);
  assert.deepEqual(start.buildProjects, ['P1', 'P2']);
  const preview = await f.step('merge', 'PLAN', { ...two.merge, tapdPlan: start.tapdPlan });
  assert.equal((await f.step('merge', 'EXECUTE', { ...preview, confirmed: true })).state, 'MERGED');
  const release = { ...two.release, purpose: two.merge.purpose, repositoryPath: two.merge.repositoryPath,
    targetBranch: 'dev', mockSafety: two.merge.mockSafety, expectedSha: secondDelivered, completionMode: 'TRIGGER_ACCEPTED',
    tapdPlan: start.tapdPlan };
  assert.equal((await f.standaloneBuild('PLAN', release)).state, 'PREPARED');
  await assert.rejects(f.step('merge', 'PLAN', { ...two.merge, targetBranch: 'main', tapdPlan: start.tapdPlan }), /Plan 不一致/);
});

test('preauthorized conflict work does not replace another operator’s MR', async t => {
  const f = await fixture(t, { bug: true });
  f.seedConflictedMr(200);
  await startBoundPlan(f, 'MANUAL');
  const result = await f.run(await f.request('PLAN', f.input));
  assert.equal(result.state, 'NEEDS_CONFLICT_RESOLUTION');
  assert.equal(result.receipts.conflict.next, 'HANDOFF_TO_MR_OWNER');
  assert.ok(!f.calls.includes('create_merge_request') && !f.calls.includes('jenkins_trigger_build'));
});

test('two Jobs for one Git scope and a separately scoped canary use the individual delivery path', async t => {
  const f = await fixture(t, { bug: true });
  const { start } = await startBoundPlan(f, 'IMMEDIATE', text => {
    const end = text.indexOf('## 执行记录');
    const second = secondProjectWithSharedApis(text)
      .replace(jobUrl, ci + '/job/ui-tools/').replace('**构建对象** factory', '**构建对象** ui-tools')
      .replace('**构建来源** develop', '**构建类型** 金丝雀发包\n- **构建来源** master');
    return text.slice(0, end) + second + text.slice(end);
  });
  assert.equal(start.workflow, 'DELIVERY_STEPS');
  assert.deepEqual(start.gitProjects, ['P1']);
  assert.deepEqual(start.buildProjects, ['P1', 'P2']);
  assert.equal(start.delivery.projects[1].release.kind, 'package');
  assert.equal(start.delivery.projects[1].release.ref, 'master');
  assert.ok(!f.calls.includes('merge_merge_request') && !f.calls.includes('jenkins_trigger_build'));
});

test('two app Jobs share one merge and both queue receipts before the Story Wiki and registration', async t => {
  const f = await fixture(t, { extraJob: true });
  const { start } = await startBoundPlan(f, 'MANUAL', text => {
    const end = text.indexOf('## 执行记录');
    const second = secondProjectWithSharedApis(text).replace(jobUrl, ci + '/job/store-test/')
      .replace('**构建项目** factory', '**构建项目** store').replace('**构建对象** factory', '**构建对象** store');
    return text.slice(0, end) + second + text.slice(end);
  });
  const { tapdPlan } = start;
  const merge = await f.step('merge', 'PLAN', { ...f.input.merge, tapdPlan });
  const git = await f.step('merge', 'EXECUTE', { ...merge, confirmed: true });
  const common = { tapdPlan, purpose: merge.purpose, targetEnvironment: 'test', targetBranch: 'develop',
    gitDeliveryReceipts: [git], requiredRepositories: [repo], mockSafety: f.input.merge.mockSafety };
  const expectedApprovedBodySha256 = sha256(await readFile(f.bodyFile));
  const draft = { ...f.input.wiki, ...common, expectedApprovedBodySha256 };
  const w = await f.step('wiki', 'PLAN', draft);
  const writeWiki = { ...draft, expectedOwnerId: w.wikiOwner.entryId, expectedOwnerType: w.wikiOwner.entryType,
    expectedWikiId: w.wikiId, expectedMonthId: w.monthWikiId, expectedBodySha256: w.beforeBodySha256,
    wikiTitle: w.wikiTitle, expectTarget: w.target, confirmed: true };
  const jobs = [f.input.release, { ...f.input.release, jobUrl: ci + '/job/store-test/', jobName: 'store-test', targetProject: 'store', releaseTarget: 'store' }];
  for (const [i, job] of jobs.entries()) {
    assert.deepEqual((await f.step('wiki', 'EXECUTE', writeWiki)).missing, i ? ['P2'] : ['P1', 'P2']);
    const r = await f.standaloneBuild('PLAN', { ...job, ...common, expectedSha: git.deliveredSha,
      repositoryPath: merge.repositoryPath, completionMode: 'TRIGGER_ACCEPTED' });
    const receipt = await f.standaloneBuild('EXECUTE', { ...r, confirmed: true });
    assert.equal(receipt.queueId, i ? 44 : 42);
    assert.deepEqual(await f.standaloneBuild('EXECUTE', { ...r, confirmed: true }), receipt);
  }
  assert.equal((await f.step('wiki', 'EXECUTE', writeWiki)).wikiId, '20');
  const registration = await f.step('registration', 'EXECUTE', { ...f.input.registration, ...common, confirmed: true });
  assert.equal(registration.state, 'NOT_APPLICABLE');
  assert.equal(f.calls.filter(name => name === 'create_merge_request').length, 1);
  assert.equal(f.calls.filter(name => name === 'jenkins_trigger_build').length, 2);
});

test('a revision confirmed after the actual MR merge stops r1 before the Jenkins trigger', async t => {
  const options = { bug: true }, f = await fixture(t, options);
  const { raw } = await startBoundPlan(f, 'IMMEDIATE');
  const preview = await f.request('PLAN', f.input);
  options.afterMerge = async () => {
    const edit = { ...raw, markdown: raw.markdown.replace('| 是否构建 | 是 |', '| 是否构建 | 否 |') };
    const next = await f.planWiki('PLAN', edit);
    assert.equal((await f.planWiki('SAVE', { ...edit, approval: next.approval, confirmedFingerprint: next.fingerprint })).revision, 2);
  };
  await assert.rejects(f.run(preview), err => err.code === 'PLAN_RECHECK_REQUIRED' && err.result.receipts.git?.state === 'MERGED');
  assert.equal(f.calls.filter(n => n === 'merge_merge_request').length, 1);
  assert.ok(!f.calls.includes('jenkins_trigger_build') && !f.calls.includes('update_bug'));
});

async function startTwoProjects(f, { noBuild = false, buildOnlySecond = false } = {}) {
  const [one, two] = f.input.repositories;
  return startBoundPlan(f, 'MANUAL', body => {
    const end = body.indexOf('## 执行记录');
    let first = body.slice(0, end);
    let second = secondProjectWithSharedApis(body).replaceAll(repo, two.merge.originUrl)
      .replaceAll(one.merge.sourceBranch, two.merge.sourceBranch).replaceAll(jobUrl, two.release.jobUrl)
      .replace('**构建项目** factory', '**构建项目** mobile').replace('**构建对象** factory', '**构建对象** mobile').replaceAll('develop', 'dev')
      .replace(sha256(JSON.stringify({ branch: 'develop' })), sha256(JSON.stringify({ branch: 'dev' })))
      .replace(one.merge.purpose, two.merge.purpose);
    if (buildOnlySecond) {
      first = first.replace('**测试构建 Job** ' + jobUrl, '**测试构建 Job** 跳过');
      second = second.replace('**提测合并** 提交推送并合并 MR', '**提测合并** 跳过');
    }
    if (noBuild) first = first.replace('| 是否构建 | 是 |','| 是否构建 | 否 |');
    return first + second + body.slice(end);
  });
}

test('a P2-only start can deliver P2 but cannot mutate P1 or finalize the whole Bug', async t => {
  const f = await fixture(t, { batch: true, bug: true });
  const { saved } = await startTwoProjects(f);
  const selected = await f.planWiki('START', { startMode: 'MANUAL', wikiUrl: saved.wikiUrl, selectedProjects: ['P2'] });
  assert.deepEqual(selected.gitProjects, ['P2']);
  assert.deepEqual(selected.buildProjects, ['P2']);
  const [one, two] = f.input.repositories;
  await assert.rejects(f.step('merge', 'PLAN', { ...one.merge, tapdPlan: selected.tapdPlan }), /Plan 不一致/);
  const preview = await f.step('merge', 'PLAN', { ...two.merge, tapdPlan: selected.tapdPlan });
  assert.equal((await f.step('merge', 'EXECUTE', { ...preview, confirmed: true })).state, 'MERGED');
  await assert.rejects(f.step('registration', 'PLAN', { ...f.input.registration, tapdPlan: selected.tapdPlan }), /局部功能/);
});

for (const sameRepo of [false, true]) {
  test('Git receipts cover both branch tuples before Wiki, Bug record and registration, sameRepo=' + sameRepo, async t => {
    const f = await fixture(t, { batch: true, bug: true, sameRepo });
    const [one, two] = f.input.repositories;
    two.merge.purpose = '验证第二个范围';
    const { start } = await startTwoProjects(f, { noBuild: true });
    const { tapdPlan } = start;
    assert.equal(start.workflow, 'DELIVERY_STEPS');
    const runMerge = async merge => f.step('merge', 'EXECUTE', { ...await f.step('merge', 'PLAN', { ...merge, tapdPlan }), confirmed: true });
    const first = await runMerge(one.merge);
    const shared = { tapdPlan, purpose: one.merge.purpose, targetEnvironment: 'test', gitDeliveryReceipts: [first],
      mockSafeties: [one.merge.mockSafety, two.merge.mockSafety], confirmed: true };
    const draft = { ...f.input.wiki, ...shared, entryMarkdown: undefined, bodyFile: f.bodyFile,
      expectedApprovedBodySha256: sha256(await readFile(f.bodyFile)) };
    const w = await f.step('wiki', 'PLAN', draft);
    const writeWiki = { ...draft, expectedOwnerId: w.wikiOwner.entryId, expectedOwnerType: w.wikiOwner.entryType,
      expectedWikiId: w.wikiId, expectedMonthId: w.monthWikiId, expectedBodySha256: w.beforeBodySha256, wikiTitle: w.wikiTitle, expectTarget: w.target };
    const reg = await f.step('registration','PLAN',{ ...f.input.registration, ...shared });
    const record = { ...shared, registration: reg, repairRecord: f.input.repairRecord, reviewedSources: f.input.repairRecord.reviewedSources };
    for (const [action, data] of [['wiki', writeWiki], ['registration', { ...reg, ...shared }], ['repair-record', record]]) {
      const wait = await f.step(action, 'EXECUTE', data);
      assert.equal(wait.state, 'AWAITING_PLAN_GIT');
      assert.deepEqual(wait.missing, ['P2']);
      assert.equal(wait.writes, 0);
    }
    const second = await runMerge(two.merge);
    const gitDeliveryReceipts = [second, first];
    const wikiReceipt = await f.step('wiki','EXECUTE',{ ...writeWiki, gitDeliveryReceipts });
    const prerequisites = { git: 'VERIFIED', deployment: 'SKIPPED_BY_INTENT', profile: 'STANDARD', wiki: 'VERIFIED',
      deploymentReceipts: gitDeliveryReceipts.map(g => ({ state: 'SKIPPED_BY_INTENT', writes: 0, sourceRepository: g.originUrl,
        sourceBranch: g.sourceBranch, targetBranch: g.targetBranch, expectedSha: g.deliveredSha })) };
    await f.restart();
    const stalePrerequisites = { ...prerequisites, profile:'NO_WIKI', wiki:'SKIPPED_NO_WIKI' };
    await assert.rejects(f.step('repair-record','EXECUTE',{ ...record, gitDeliveryReceipts, prerequisites:stalePrerequisites }), /Wiki 选择/);
    await f.restart();
    const obsolete = record.reviewedSources.map((row, index) => index ? row : { ...row, sourceSha:'9'.repeat(40) });
    await assert.rejects(f.step('repair-record','EXECUTE',{ ...record, gitDeliveryReceipts, prerequisites, wikiReceipt,
      reviewedSources:obsolete, repairRecord:{ ...record.repairRecord, reviewedSources:obsolete } }), /评审不一致/);
    await f.restart();
    const repairRecord = await f.step('repair-record','EXECUTE',{ ...record, gitDeliveryReceipts, prerequisites, wikiReceipt });
    assert.equal(repairRecord.state, 'VERIFIED');
    const result = await f.step('registration','EXECUTE',{ ...reg,...shared, gitDeliveryReceipts, wikiReceipt,
      prerequisites: { ...prerequisites, repairRecord } });
    assert.equal(result.state, 'REGISTERED');
    assert.equal(f.calls.filter(n => n === 'update_bug').length, 1);
  });
}

test('restart verifies an already accepted standalone queue, with or without the caller receipt', async t => {
  const f = await fixture(t, { bug:true });
  const { start } = await startBoundPlan(f, 'MANUAL', text => text.replace('| 是否提测 | 是 |', '| 是否提测 | 否 |'));
  const request = { ...f.input.release, tapdPlan: start.tapdPlan, expectedSha: source, purpose: f.input.merge.purpose,
    repositoryPath: f.input.merge.repositoryPath, mockSafety: f.input.merge.mockSafety, targetBranch:'develop', completionMode:'TRIGGER_ACCEPTED' };
  const preview = await f.standaloneBuild('PLAN', request);
  const receipt = await f.standaloneBuild('EXECUTE', { ...preview, confirmed:true });
  for (const supplied of [false,true]) {
    await f.restart();
    const prepared = await f.standaloneBuild('PLAN',{ ...request, ...(supplied ? {planBuildReceipts:[receipt]} : {}) });
    const restored = await f.standaloneBuild('EXECUTE',{ ...prepared, confirmed:true });
    assert.equal(restored.queueId, receipt.queueId);
    assert.equal(restored.verification.writes, 0);
  }
  assert.equal(f.calls.filter(n => n === 'jenkins_trigger_build').length, 1);
});

test('independent Job needs the current reviewed SHA in addition to an existing Jenkins queue', async t => {
  const f = await fixture(t, { batch:true, bug:true });
  const [one,two] = f.input.repositories;
  const old = { ...two.release, expectedSha: two.merge.sourceSha, purpose: two.merge.purpose, repositoryPath: two.merge.repositoryPath,
    targetBranch: two.merge.targetBranch, mockSafety: two.merge.mockSafety, completionMode:'TRIGGER_ACCEPTED' };
  const receipt = await f.standaloneBuild('EXECUTE',{ ...await f.standaloneBuild('PLAN',old), confirmed:true });
  const { start } = await startTwoProjects(f,{buildOnlySecond:true});
  const tapdPlan = start.tapdPlan;
  const git = await f.step('merge','EXECUTE',{ ...await f.step('merge','PLAN',{ ...one.merge,tapdPlan }), confirmed:true });
  const args = { ...f.input.wiki, entryMarkdown:undefined, bodyFile:f.bodyFile, expectedApprovedBodySha256:sha256(await readFile(f.bodyFile)),
    tapdPlan, purpose:one.merge.purpose, gitDeliveryReceipts:[git], mockSafety:one.merge.mockSafety, planBuildReceipts:[receipt] };
  const preview = await f.step('wiki','PLAN',args);
  const write = { ...args, expectedOwnerType:preview.wikiOwner.entryType,expectedOwnerId:preview.wikiOwner.entryId,expectedWikiId:preview.wikiId,
    expectedMonthId:preview.monthWikiId,expectedBodySha256:preview.beforeBodySha256,wikiTitle:preview.wikiTitle,expectTarget:preview.target,confirmed:true };
  for (const reviewedBuildSources of [{},{P2:two.merge.targetSha}]) {
    const wait = await f.step('wiki','EXECUTE',{...write,reviewedBuildSources});
    assert.equal(wait.state,'AWAITING_PLAN_BUILDS');
    assert.deepEqual(wait.missing,['P2']);
  }
  assert.equal((await f.step('wiki','EXECUTE',{...write,reviewedBuildSources:{P2:receipt.expectedSha}})).wikiId,'20');
});

test('partial branch delivery binds the reviewed F set even for a skipped sibling or equivalent Git URL', async t => {
  for (const skipSibling of [false,true]) {
    const f = await fixture(t, { bug:true });
    const { saved } = await startBoundPlan(f,'MANUAL', text => {
      const end = text.indexOf('## 执行记录');
      let second = secondProjectWithSharedApis(text).replace(repo, 'git@git.example.test:team/factory.git');
      if (skipSibling) second = second.replace('**提测合并** 提交推送并合并 MR','**提测合并** 跳过')
        .replace('**测试构建 Job** ' + jobUrl, '**测试构建 Job** 跳过');
      return text.slice(0,end) + second + text.slice(end);
    });
    const { tapdPlan } = await f.planWiki('START',{ wikiUrl:saved.wikiUrl,startMode:'MANUAL',selectedFeatures:['P1-M1-F1'] });
    await assert.rejects(f.step('merge','PLAN',{ ...f.input.merge,tapdPlan }), /已审差异/);
    await assert.rejects(f.step('merge','PLAN',{ ...f.input.merge,tapdPlan,reviewedFeatures:['P1-M1-F1','P2-M1-F1'] }), /已审差异/);
    const allowed = await f.step('merge','PLAN',{ ...f.input.merge,tapdPlan,reviewedFeatures:['P1-M1-F1'] });
    assert.equal(allowed.state,'PREPARED');
  }
});

for (const drift of ['backlink', 'body']) {
  test('continuous registration rechecks the current test Wiki after the Bug record, drift=' + drift, async t => {
    const options = { bug: true };
    const f = await fixture(t, options);
    await startBoundPlan(f, 'MANUAL');
    options.afterRecord = async () => {
      if (drift === 'body') f.pages.get('20').markdown_description += '其他编辑者修改了提测内容';
      else f.comments.set('1', f.comments.get('1').filter(row => !row.description.startsWith('提测wiki：')));
    };
    const result = await f.run(await f.request('PLAN', f.input));
    assert.equal(result.state, 'NEEDS_WIKI_REVIEW');
    assert.equal(result.receipts.repairRecord.state, 'VERIFIED');
    assert.equal(result.receipts.release.queueId, 42);
    assert.ok(!f.calls.includes('update_bug'));
    assert.equal(f.comments.get('1').filter(row => row.description.includes('【Bug 溯源与修复记录】')).length, 1);
  });
}
