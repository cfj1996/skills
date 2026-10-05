import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { mergeReviewedBranch } from '../scripts/merge-reviewed-branch.mjs';
import { checkReleaseSource, runJenkinsRelease } from '../scripts/run-jenkins-release.mjs';
import { createJenkinsReader } from '../scripts/jenkins-readonly.mjs';
import { pollState, readCliPlan, repositoryKey, toolData } from '../scripts/workflow-runtime.mjs';

const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40), otherSha = 'c'.repeat(40);
const sourceBranch = 'feature/alice.delivery';
const originUrl = 'git@git.example.test:team/demo.git';
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const mergeInput = () => ({ projectId: '1', repositoryPath: '/fixture/demo', originUrl,
  sourceBranch, targetBranch: 'develop', sourceSha, targetSha, title: 'feat: 交付示例',
  purpose: '交付已评审变更', reviewPassed: true, pipelineRequired: true, execute: true, confirmed: true });

function clock() {
  let time = 0;
  const delays = [], events = [];
  return { now: () => time, sleep: async ms => { delays.push(ms); time += ms; },
    maxWaitMs: 100000, onProgress: event => events.push(event), delays, events };
}

function mergeFake({ existing = false, pipeline = ['success'], approvals = [], onCall, contained = true } = {}) {
  const calls = [];
  let created = existing, merged = false, reads = 0;
  const mr = () => ({ iid: 7, source_branch: sourceBranch, target_branch: 'develop', sha: sourceSha,
    source_project_id: 1, target_project_id: 1, state: merged ? 'merged' : 'opened',
    detailed_merge_status: 'mergeable', merge_status: 'can_be_merged', has_conflicts: false,
    blocking_discussions_resolved: true, web_url: 'https://git.example.test/team/demo/-/merge_requests/7',
    merge_commit_sha: merged ? otherSha : null,
    head_pipeline: { id: 10, status: pipeline[Math.min(reads++, pipeline.length - 1)] } });
  const call = async (name, args) => {
    calls.push({ name, args });
    const override = await onCall?.(name, args, { calls });
    if (override !== undefined) return override;
    if (name === 'get_branch') return reply({ commit: { id: args.branch_name === sourceBranch ? sourceSha : targetSha } });
    if (name === 'get_project') return reply({ id: 1, default_branch: 'master', ssh_url_to_repo: originUrl });
    if (name === 'list_merge_requests') return reply(created && !merged ? [mr()] : []);
    if (name === 'create_merge_request') { created = true; return reply(mr()); }
    if (name === 'get_merge_request') return reply(mr());
    if (name === 'get_merge_request_approval_state') return reply({ rules: approvals });
    if (name === 'merge_merge_request') { merged = true; return reply(mr()); }
    throw new Error(name);
  };
  return { call, calls, io: { ...clock(), checkRepository: async () => {},
    containsSource: async () => ({ contained, targetSha: otherSha }) } };
}

test('merge preview is read-only and fixes source, target and MR identity', async () => {
  const fake = mergeFake();
  const result = await mergeReviewedBranch(fake.call, { ...mergeInput(), execute: false, confirmed: false }, fake.io);
  assert.equal(result.state, 'AWAITING_CONFIRMATION');
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.operation, 'CREATE_AND_MERGE');
  assert.equal(fake.calls.some(call => /^(create|merge)_/.test(call.name)), false);
});

test('create/wait/merge is one guarded bundle and never deletes or squashes', async () => {
  const fake = mergeFake({ pipeline: ['running', 'running', 'running', 'success'] });
  const result = await mergeReviewedBranch(fake.call, mergeInput(), fake.io);
  assert.equal(result.state, 'MERGED');
  assert.equal(result.mergeReadback, true);
  assert.equal(result.containment, true);
  assert.equal(result.deliveredSha, otherSha);
  assert.notEqual(result.deliveredSha, result.sourceSha);
  assert.equal(fake.calls.filter(call => call.name === 'create_merge_request').length, 1);
  const merge = fake.calls.filter(call => call.name === 'merge_merge_request');
  assert.equal(merge.length, 1);
  assert.equal(merge[0].args.sha, sourceSha);
  assert.equal(merge[0].args.auto_merge, false);
  assert.equal(merge[0].args.should_remove_source_branch, false);
  assert.equal(merge[0].args.squash, false);
  assert.deepEqual(fake.io.delays, [5000, 10000]);
});

test('reuses an exact existing MR without creating another', async () => {
  const fake = mergeFake({ existing: true });
  const result = await mergeReviewedBranch(fake.call, { ...mergeInput(), mrIid: '7' }, fake.io);
  assert.equal(result.writes, 1);
  assert.equal(fake.calls.some(call => call.name === 'list_merge_requests' || call.name === 'create_merge_request'), false);
});

test('forbidden sources, missing review and missing authorization fail before remote calls', async () => {
  for (const change of [{ sourceBranch: 'develop', targetBranch: 'master' }, { reviewPassed: false },
    { confirmed: false }, { sourceSha: undefined }]) {
    const fake = mergeFake();
    await assert.rejects(mergeReviewedBranch(fake.call, { ...mergeInput(), ...change }, fake.io));
    assert.equal(fake.calls.length, 0);
  }
});

test('does not merge if refs change while waiting', async () => {
  const fake = mergeFake({ onCall(name, args, { calls }) {
    if (name === 'get_branch' && args.branch_name === 'develop' &&
        calls.filter(call => call.name === 'get_branch' && call.args.branch_name === 'develop').length > 1) {
      return reply({ commit: { id: otherSha } });
    }
  } });
  await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), fake.io), /SHA 已变化/);
  assert.equal(fake.calls.some(call => call.name === 'merge_merge_request'), false);
});

test('pending approvals, conflicts and failed CI block the merge', async () => {
  for (const options of [
    { approvals: [{ approvals_required: 1, approved: false }] },
    { pipeline: ['failed'] },
    { onCall: name => name === 'get_merge_request' ? reply({ iid: 7, source_branch: sourceBranch,
      target_branch: 'develop', sha: sourceSha, state: 'opened', has_conflicts: true }) : undefined },
  ]) {
    const fake = mergeFake(options);
    await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), fake.io));
    assert.equal(fake.calls.some(call => call.name === 'merge_merge_request'), false);
  }
});

test('new MR diff preparation is waited for instead of treated as a failed merge', async () => {
  let count = 0;
  const fake = mergeFake({ onCall(name) {
    if ((name === 'create_merge_request' || name === 'get_merge_request') && count++ < 2) {
      return reply({ iid: 7, source_branch: sourceBranch, target_branch: 'develop', sha: null,
        state: 'opened', detailed_merge_status: 'checking' });
    }
  } });
  const result = await mergeReviewedBranch(fake.call, mergeInput(), fake.io);
  assert.equal(result.state, 'MERGED');
  assert.equal(fake.calls.filter(call => call.name === 'create_merge_request').length, 1);
});

test('unknown merge outcome is never retried', async () => {
  const fake = mergeFake({ onCall(name) { if (name === 'merge_merge_request') throw new Error('timeout'); } });
  await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), fake.io), error => {
    assert.equal(error.result.phase, 'MERGE_MR');
    assert.equal(error.result.mergeReadback, false);
    return true;
  });
  assert.equal(fake.calls.filter(call => call.name === 'merge_merge_request').length, 1);
});

test('merge readback without source containment cannot claim delivery', async () => {
  const fake = mergeFake({ contained: false });
  await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), fake.io), error => {
    assert.equal(error.result.mergeReadback, true);
    assert.equal(error.result.containment, false);
    return true;
  });
});

const jobUrl = 'https://ci.example.test/jenkins/job/demo-test/';
const releaseInput = () => ({ targetProject: 'demo', releaseTarget: 'demo-web', targetEnvironment: 'test',
  jobName: 'demo-test', jobUrl, releaseRef: sourceSha, refParameter: 'REF', version: '1.0.0-canary.1',
  versionParameter: 'VERSION', releaseChannel: 'canary', releaseKind: 'deployment', purpose: '部署确认过的源码',
  sourceRepository: originUrl, expectedSha: sourceSha,
  params: { REF: sourceSha, VERSION: '1.0.0-canary.1' }, execute: false });

function releaseFake({ status = 'SUCCESS', sha = sourceSha, queueId = 8, onCall, onBuild, queuePending = 0 } = {}) {
  const calls = [], reads = [];
  let pending = queuePending;
  const call = async (name, args) => {
    calls.push({ name, args });
    const override = await onCall?.(name, args, { calls });
    if (override !== undefined) return override;
    if (name === 'jenkins_list_instances') return reply([{ name: 'default', url: 'https://ci.example.test/jenkins' }]);
    if (name === 'jenkins_get_job_parameters') return reply({ jobName: 'demo-test', parameters: [
      { name: 'REF', type: 'string' }, { name: 'VERSION', type: 'string' },
    ] });
    if (name === 'jenkins_get_job_config') return reply({ jobName: 'demo-test', config: '<flow-definition>approved</flow-definition>' });
    if (name === 'jenkins_trigger_build') return reply({ jobName: 'demo-test', queueUrl: 'https://ci.example.test/jenkins/queue/item/8/' });
    throw new Error(name);
  };
  const reader = { instanceUrl: 'https://ci.example.test/jenkins', jobUrl, queueIdentity: () => ({ id: 8 }),
    queue: async () => { reads.push('queue'); return pending-- > 0 ? { id: 8 } : { id: 8, executable: { number: 12 } }; },
    build: async number => {
      reads.push(number);
      const build = { number, queueId, building: false, result: status, url: `${jobUrl}${number}/`, actions: [
        { parameters: [{ name: 'REF', value: sourceSha }, { name: 'VERSION', value: '1.0.0-canary.1' }] },
        { remoteUrls: ['https://git.example.test/team/demo.git'], lastBuiltRevision: { SHA1: sha } },
      ] };
      return onBuild ? onBuild(build) : build;
    },
  };
  return { call, reader, calls, reads, io: clock() };
}

async function executeRelease(fake, changes = {}) {
  const plan = await runJenkinsRelease(fake.call, fake.reader, releaseInput(), fake.io);
  return runJenkinsRelease(fake.call, fake.reader, { ...plan, ...changes, execute: true, confirmed: true }, fake.io);
}

test('release preview is read-only and fingerprints the actual Job config', async () => {
  const fake = releaseFake();
  const plan = await runJenkinsRelease(fake.call, fake.reader, releaseInput(), fake.io);
  assert.equal(plan.state, 'AWAITING_CONFIRMATION');
  assert.match(plan.jobConfigHash, /^[a-f\d]{64}$/);
  assert.equal(fake.calls.some(call => call.name === 'jenkins_trigger_build'), false);
});

test('release triggers once, follows its exact queue/build and verifies target repository SHA', async () => {
  const fake = releaseFake({ queuePending: 2 });
  const result = await executeRelease(fake);
  assert.equal(result.state, 'DEPLOYED');
  assert.equal(result.sourceVerified, true);
  assert.equal(result.queueId, 8);
  assert.equal(result.buildNumber, 12);
  assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
  assert.ok(fake.reads.every(value => value === 'queue' || value === 12));
});

test('changed Job config and invalid parameters stop before trigger', async () => {
  const fake = releaseFake();
  const plan = await runJenkinsRelease(fake.call, fake.reader, releaseInput(), fake.io);
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true,
    jobConfigHash: 'changed' }, fake.io), /配置或参数定义已变化/);
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...releaseInput(), params: { UNKNOWN: 1 } }, fake.io), /未确认/);
  assert.equal(fake.calls.some(call => call.name === 'jenkins_trigger_build'), false);
});

test('a successful other queue, wrong source SHA or different repository cannot count as release success', async () => {
  for (const options of [{ queueId: 9 }, { sha: otherSha }, { onBuild(build) {
    build.actions[1].remoteUrls = ['https://git.example.test/team/jenkinsfile.git']; return build;
  } }]) {
    const fake = releaseFake(options);
    await assert.rejects(executeRelease(fake), error => {
      assert.equal(error.result.sourceVerified, false);
      return true;
    });
    assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
  }
});

test('terminal failure and mismatched build parameters stop later flow', async () => {
  for (const options of [{ status: 'FAILURE' }, { onBuild(build) {
    build.actions[0].parameters[0].value = otherSha; return build;
  } }]) {
    const fake = releaseFake(options);
    await assert.rejects(executeRelease(fake));
    assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
  }
});

test('unknown trigger result never causes a second build', async () => {
  const fake = releaseFake({ onCall(name) { if (name === 'jenkins_trigger_build') throw new Error('timeout'); } });
  await assert.rejects(executeRelease(fake), error => {
    assert.equal(error.result.state, 'UNKNOWN');
    assert.equal(error.result.phase, 'TRIGGER');
    return true;
  });
  assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
});

test('package canary cannot silently use a stable channel', async () => {
  const fake = releaseFake();
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, {
    ...releaseInput(), releaseKind: 'package', version: '1.0.0', params: { REF: sourceSha, VERSION: '1.0.0' },
  }, fake.io), /金丝雀包发布/);
  assert.equal(fake.calls.some(call => call.name === 'jenkins_trigger_build'), false);
});

test('polling backs off, reports changes only and never exceeds a bounded sleep', async () => {
  const io = clock();
  let reads = 0;
  await pollState(async () => ++reads, value => ({ state: value < 6 ? 'BUILDING' : 'SUCCESS', done: value === 6 }), {
    ...io, maxWaitMs: 100000,
  });
  assert.deepEqual(io.events.map(event => event.state), ['BUILDING', 'SUCCESS']);
  assert.deepEqual(io.delays, [5000, 10000, 20000, 30000, 30000]);
});

test('poll timeout stops without retrying any write', async () => {
  const io = clock();
  await assert.rejects(pollState(async () => 1, () => ({ state: 'PENDING' }), { ...io, maxWaitMs: 6000 }), /超时/);
  assert.deepEqual(io.delays, [5000, 1000]);
});

const env = { MCP_JENKINS_URL: 'https://ci.example.test/jenkins', MCP_JENKINS_USER: 'fixture', MCP_JENKINS_API_TOKEN: 'fake-token' };

test('the API fallback is GET-only, exact-host/exact-Job and never follows redirects', async () => {
  const requests = [];
  const reader = createJenkinsReader(env, 'demo-test', jobUrl, async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url.includes('/queue/')
      ? { id: 8, task: { url: jobUrl }, executable: { number: 12 } }
      : { number: 12, queueId: 8, url: `${jobUrl}12/` } };
  });
  await reader.queue('https://ci.example.test/jenkins/queue/item/8/');
  await reader.build(12);
  assert.ok(requests.every(request => request.options.method === 'GET' && request.options.redirect === 'error'));
  await assert.rejects(reader.queue('https://outside.example.test/queue/item/8/'), /超出/);
  assert.equal(requests.length, 2);
  assert.throws(() => createJenkinsReader(env, 'demo-test', 'https://outside.example.test/job/demo-test/'), /不一致/);
});

test('read-only API rejects a queue or build belonging to another Job', async () => {
  const reader = createJenkinsReader(env, 'demo-test', jobUrl, async () => ({ ok: true, json: async () => ({
    id: 8, task: { url: 'https://ci.example.test/jenkins/job/other/' }, number: 12,
    url: 'https://ci.example.test/jenkins/job/other/12/',
  }) }));
  await assert.rejects(reader.queue('https://ci.example.test/jenkins/queue/item/8/'), /归属不一致/);
  await assert.rejects(reader.build(12), /归属不一致/);
});

test('CLI stdin preserves Chinese across chunks and cannot enable execution inside JSON', async () => {
  const body = Buffer.from(JSON.stringify({ purpose: '发布测试环境', execute: true }));
  const input = Readable.from([body.subarray(0, 15), body.subarray(15, 17), body.subarray(17)]);
  const plan = await readCliPlan([], input);
  assert.equal(plan.purpose, '发布测试环境');
  assert.equal(plan.execute, false);
});

test('unknown MCP text is not mistaken for success and repository aliases keep port identity', () => {
  assert.throws(() => toolData({ content: [{ type: 'text', text: 'error' }] }, 'probe'), /JSON/);
  assert.equal(repositoryKey(originUrl), repositoryKey('https://git.example.test/team/demo.git'));
  assert.notEqual(repositoryKey('https://git.example.test:8443/team/demo.git'), repositoryKey('https://git.example.test/team/demo.git'));
});

test('annotated tags verify the peeled commit and ambiguous branch/tag names block', async () => {
  const input = { ...releaseInput(), releaseRef: 'v1.0.0' };
  await checkReleaseSource(input, async () => `${otherSha}\trefs/tags/v1.0.0\n${sourceSha}\trefs/tags/v1.0.0^{}\n`);
  await assert.rejects(checkReleaseSource(input, async () => `${sourceSha}\trefs/heads/v1.0.0\n${sourceSha}\trefs/tags/v1.0.0\n`), /歧义/);
  assert.throws(() => repositoryKey('ext::sh -c unsafe'), /协议或地址/);
});

test('a changed symbolic source or mismatched Jenkins instance stops before trigger', async () => {
  const fake = releaseFake();
  const plan = await runJenkinsRelease(fake.call, fake.reader, releaseInput(), fake.io);
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true }, {
    ...fake.io, checkSource: async () => { throw new Error('源码 SHA 已变化'); },
  }), /SHA 已变化/);
  const mismatch = releaseFake();
  mismatch.reader.instanceUrl = 'https://another.example.test/jenkins';
  await assert.rejects(executeRelease(mismatch), /同一 Jenkins 实例/);
  assert.equal(fake.calls.some(call => call.name === 'jenkins_trigger_build'), false);
  assert.equal(mismatch.calls.some(call => call.name === 'jenkins_trigger_build'), false);
});

test('invalid wait budgets are rejected before any remote write', async () => {
  const fake = mergeFake();
  await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), { ...fake.io, maxWaitMs: -1 }), /期限无效/);
  const release = releaseFake();
  await assert.rejects(executeRelease({ ...release, io: { ...release.io, maxWaitMs: '30000' } }), /期限无效/);
  assert.equal(fake.calls.length, 0);
  assert.equal(release.calls.length, 0);
});

test('queue and build waiting share one deadline', async () => {
  const fake = releaseFake({ queuePending: 2, onBuild(build) { return { ...build, building: true, result: null }; } });
  fake.io.maxWaitMs = 6000;
  await assert.rejects(executeRelease(fake), /超时/);
  assert.deepEqual(fake.io.delays, [5000, 1000]);
  assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
});

test('source changes during MR creation retain the actual created MR identity', async () => {
  const fake = mergeFake({ onCall(name) {
    if (name === 'create_merge_request') return reply({ iid: 7, web_url: 'https://git.example.test/mr/7',
      source_branch: sourceBranch, target_branch: 'develop', sha: otherSha });
  } });
  await assert.rejects(mergeReviewedBranch(fake.call, mergeInput(), fake.io), error => {
    assert.equal(error.result.mrIid, '7');
    assert.equal(error.result.writes, 1);
    return /SHA 已变化/.test(error.message);
  });
  assert.equal(fake.calls.some(call => call.name === 'merge_merge_request'), false);
});

test('server-required CI cannot be disabled by a stale caller policy', async () => {
  const fake = mergeFake({ onCall(name) {
    if (name === 'get_project') return reply({ ssh_url_to_repo: originUrl, default_branch: 'master',
      only_allow_merge_if_pipeline_succeeds: true });
    if (name === 'get_merge_request') return reply({ iid: 7, source_branch: sourceBranch,
      target_branch: 'develop', sha: sourceSha, state: 'opened', detailed_merge_status: 'mergeable' });
  } });
  await assert.rejects(mergeReviewedBranch(fake.call, { ...mergeInput(), pipelineRequired: false }, fake.io), /没有成功/);
  assert.equal(fake.calls.some(call => call.name === 'merge_merge_request'), false);
});

test('an actual canary package release reports its kind and cannot switch to latest', async () => {
  const fake = releaseFake({ onCall(name) {
    if (name === 'jenkins_get_job_parameters') return reply({ jobName: 'demo-test', parameters: [
      { name: 'REF', type: 'string' }, { name: 'VERSION', type: 'string' },
      { name: 'CHANNEL', type: 'choice', choices: ['canary', 'latest'] },
    ] });
  }, onBuild(build) { build.actions[0].parameters.push({ name: 'CHANNEL', value: 'canary' }); return build; } });
  const input = { ...releaseInput(), releaseKind: 'package', releaseTarget: '@example/demo',
    channelParameter: 'CHANNEL', params: { ...releaseInput().params, CHANNEL: 'canary' } };
  const plan = await runJenkinsRelease(fake.call, fake.reader, input, fake.io);
  const result = await runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true }, fake.io);
  assert.equal(result.state, 'RELEASED');
  assert.equal(result.releaseKind, 'package');
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...input, params: { ...input.params, CHANNEL: 'latest' } }, fake.io), /不能使用 latest/);
  assert.equal(fake.calls.filter(call => call.name === 'jenkins_trigger_build').length, 1);
});
