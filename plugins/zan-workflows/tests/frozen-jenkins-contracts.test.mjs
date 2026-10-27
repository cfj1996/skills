import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrozenJenkinsContract, prepareFrozenJenkinsBuild } from '../scripts/frozen-jenkins-contracts.mjs';
import { runJenkinsRelease, releaseRequiredTools } from '../scripts/run-jenkins-release.mjs';
import { sha256, stableJson } from '../scripts/workflow-runtime.mjs';
import { noMockFixture, fixtureMockIo } from './helpers/mock-safety-fixture.mjs';

const jobName = 'demo-deploy', jobUrl = 'https://ci.example.test/job/demo-deploy/';
const origin = 'https://git.example.test/team/demo.git', sourceSha = 'a'.repeat(40);
const parameter = (name, type, defaultValue, extra = {}) => ({ name, type, description: '', ...(defaultValue !== undefined ? { defaultValue } : {}), ...extra });
function fixture() {
  const input = { targetProject: 'demo', releaseTarget: 'demo', jobName, jobUrl, releaseRef: 'develop', expectedSha: sourceSha,
    sourceRepository: origin, targetEnvironment: 'test', releaseChannel: 'canary', releaseKind: 'deployment',
    purpose: 'test', params: { REF: 'develop' }, refParameter: 'REF', version: sourceSha,
    jobBindingMode: 'READABLE_METADATA', completionMode: 'TRIGGER_ACCEPTED',
    jenkinsContractsPath: '/fixture/project-knowledge/data/workspace/jenkins-build-contracts.json',
    mockSafety: noMockFixture({ sourceRepository: origin, sourceSha }) };
  const registry = { schemaVersion: 1, instance: { name: 'default', url: 'https://ci.example.test' },
    projectJobs: { demo: jobName }, jobs: { [jobName]: { status: 'ready', jobName, jobUrl,
      parameters: [parameter('REF', 'string', 'old-ref'), parameter('ENV', 'choice', 'production', { choices: ['test', 'production'] }),
        parameter('DRY_RUN', 'boolean', false)],
      profiles: { test: { targetEnvironment: 'test', releaseChannel: 'canary', environmentKind: 'test',
        fixedParams: { ENV: 'test' }, refParameter: 'REF', allowedProjects: ['demo'] } } } } };
  const calls = [];
  const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'jenkins_get_job_parameters') throw new Error('ONLINE PARAMETER QUERY FORBIDDEN');
    if (name === 'jenkins_list_instances') return reply([{ name: 'default', url: 'https://ci.example.test' }]);
    if (name === 'jenkins_trigger_build') return reply({ jobName, queueUrl: 'https://ci.example.test/queue/item/8/' });
    throw new Error(name);
  };
  const reader = { jobUrl, instanceUrl: 'https://ci.example.test',
    job: async () => ({ fullName: jobName, url: jobUrl, buildable: true, type: 'pipeline' }), queueIdentity: () => ({ id: 8 }) };
  const io = { ...fixtureMockIo, checkSource: async () => {}, readFrozenJenkinsContracts: async () => JSON.stringify(registry) };
  const rehash = () => {
    const job = registry.jobs[jobName];
    job.parameterDefinitionsHash = sha256(stableJson({ jobName, parameters: job.parameters }));
  };
  return { input, registry, job: registry.jobs[jobName], calls, call, reader, io, rehash };
}

test('offline preparation resolves every frozen default and overrides a production default only through the explicit test policy', async () => {
  const f = fixture(); f.rehash();
  const result = await prepareFrozenJenkinsBuild(f.input, f.io);
  assert.deepEqual(result.params, { REF: 'develop', ENV: 'test', DRY_RUN: false });
  assert.equal(result.environmentKind, 'test');
  assert.equal(result.source, 'PROJECT_KNOWLEDGE');
  assert.equal(result.writes, 0);
});

test('a test profile rejects production parameter values even though Jenkins permits the choice', async () => {
  const f = fixture();
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, params: { REF: 'develop', ENV: 'production' } }, f.io), /固定环境参数/);
  assert.equal(f.calls.length, 0);
});

test('dynamic ref binding cannot overwrite a fixed environment branch after defaults are filled', async () => {
  const f = fixture();
  f.job.profiles.test.fixedParams.REF = 'develop';
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, releaseRef: 'master', params: {} }, f.io), /覆盖固定环境参数/);
});

test('PLAN and EXECUTE use frozen definitions without any Jenkins parameter request', async () => {
  const f = fixture(); f.rehash();
  assert.equal(releaseRequiredTools({ execute: true }).includes('jenkins_get_job_parameters'), false);
  const plan = await runJenkinsRelease(f.call, f.reader, f.input, f.io);
  assert.deepEqual(plan.params, { REF: 'develop', ENV: 'test', DRY_RUN: false });
  const result = await runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, f.io);
  assert.equal(result.state, 'BUILD_SUBMITTED');
  assert.equal(f.calls.some(row => row.name === 'jenkins_get_job_parameters'), false);
  assert.deepEqual(f.calls.find(row => row.name === 'jenkins_trigger_build').args.params, plan.params);
});

test('missing registry, unknown Job, unavailable Job and unknown parameter types never fall back online', async () => {
  const f = fixture();
  await assert.rejects(runJenkinsRelease(f.call, f.reader, f.input, { ...f.io, readFrozenJenkinsContracts: async () => { throw new Error('missing'); } }), /不会查询 Jenkins 参数/);
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, jobName: 'new-job' }, f.io), /尚未接入/);
  f.job.status = 'unavailable';
  await assert.rejects(prepareFrozenJenkinsBuild(f.input, f.io), /尚未接入/);
  f.job.status = 'ready'; f.job.parameters[0].type = 'custom-plugin-type';
  await assert.rejects(prepareFrozenJenkinsBuild(f.input, f.io), /未知类型/);
  assert.equal(f.calls.length, 0);
});

test('unknown parameters and changed registry/profile/value bindings block before trigger', async () => {
  const f = fixture();
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, params: { UNKNOWN: 'value' } }, f.io), /未确认/);
  const plan = await runJenkinsRelease(f.call, f.reader, f.input, f.io);
  f.job.parameters[2].defaultValue = true;
  await assert.rejects(runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, f.io), /固定参数或环境策略已变化/);
  f.job.parameters[2].defaultValue = false;
  await assert.rejects(runJenkinsRelease(f.call, f.reader, { ...plan, params: { ...plan.params, DRY_RUN: true }, execute: true, confirmed: true }, f.io), /实际参数值已变化/);
  assert.equal(f.calls.some(row => row.name === 'jenkins_trigger_build'), false);
});

test('unrelated Job refreshes and collection timestamps do not invalidate the selected contract', async () => {
  const f = fixture();
  const plan = await loadFrozenJenkinsContract(f.input, f.io);
  f.registry.syncedAt = '2099-01-01T00:00:00Z'; f.job.collectedAt = '2099-01-01T00:00:00Z';
  f.registry.projectJobs.other = 'other-job'; f.registry.jobs['other-job'] = { parameters: [] };
  const next = await loadFrozenJenkinsContract({ ...f.input, jenkinsContractHash: plan.contractHash, jenkinsProfileHash: plan.profileHash }, f.io);
  assert.equal(next.contractHash, plan.contractHash);
});

test('shared Job platform profiles require a unique project match or explicit jenkinsProfile', async () => {
  const f = fixture();
  f.job.profiles.second = { ...f.job.profiles.test };
  await assert.rejects(prepareFrozenJenkinsBuild(f.input, f.io), /不唯一/);
  assert.equal((await prepareFrozenJenkinsBuild({ ...f.input, jenkinsProfile: 'second' }, f.io)).jenkinsProfile, 'second');
});

test('standalone package preparation binds PROJECT_NAME without relying on the release adapter or its default', async () => {
  const f = fixture();
  f.input.targetProject = 'zan-lib';
  f.job.parameters = [parameter('PROJECT_NAME', 'choice', 'sim-ui', { choices: ['sim-ui', 'zan-lib'] }),
    parameter('RELEASE_TYPE', 'choice', 'release:canary', { choices: ['release:canary', 'release:prod'] })];
  f.job.profiles.test = { targetEnvironment: 'test', releaseChannel: 'canary', environmentKind: 'test',
    fixedParams: { RELEASE_TYPE: 'release:canary' }, allowedProjects: ['sim-ui', 'zan-lib'], projectParameter: 'PROJECT_NAME' };
  delete f.input.refParameter; f.input.params = {};
  const result = await prepareFrozenJenkinsBuild(f.input, f.io);
  assert.deepEqual(result.params, { PROJECT_NAME: 'zan-lib', RELEASE_TYPE: 'release:canary' });
  f.registry.projectJobs.public_libraries = jobName;
  assert.equal((await prepareFrozenJenkinsBuild({ ...f.input, jenkinsProjectKey: 'public_libraries' }, f.io)).params.PROJECT_NAME, 'zan-lib');
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, params: { PROJECT_NAME: 'sim-ui' } }, f.io), /发布项目.*实际参数不一致/);
});

test('the historical business version spelling and trailing choice spaces are preserved', async () => {
  const f = fixture(); delete f.input.version;
  f.job.parameters.push(parameter('vesion', 'string', '6.4.3.0'), parameter('flag', 'choice', 'LIVE.STORE   ', { choices: ['SHOP', 'LIVE.STORE   '] }));
  f.job.profiles.test.versionParameter = 'vesion';
  const plan = await prepareFrozenJenkinsBuild(f.input, f.io);
  assert.equal(plan.version, '6.4.3.0'); assert.equal(plan.versionParameter, 'vesion');
  assert.equal(plan.params.vesion, '6.4.3.0'); assert.equal(plan.params.flag, 'LIVE.STORE   ');
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, version: '6.5.0.0', params: { ...f.input.params, vesion: '6.4.3.0' } }, f.io), /发布版本.*实际参数不一致/);
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, params: { ...f.input.params, flag: 'LIVE.STORE' } }, f.io), /参数选项/);
});

test('sensitive defaults are forbidden; explicit environment injection is redacted in plans and queue receipts', async () => {
  const f = fixture();
  await assert.rejects(prepareFrozenJenkinsBuild({ ...f.input, secretParameterEnv: { ENV: 'FAKE_SECRET' } }, f.io), /只能引用.*敏感参数/);
  f.job.parameters.push(parameter('API_TOKEN', 'password', undefined, { sensitive: true, requiresValue: true }));
  await assert.rejects(prepareFrozenJenkinsBuild(f.input, f.io), /显式注入/);
  const secret = 'fixture-only-secret';
  const io = { ...f.io, env: { RELEASE_TOKEN: secret } };
  const plan = await runJenkinsRelease(f.call, f.reader, { ...f.input, secretParameterEnv: { API_TOKEN: 'RELEASE_TOKEN' } }, io);
  assert.equal(plan.params.API_TOKEN, '[REDACTED]'); assert.equal(JSON.stringify(plan).includes(secret), false);
  const result = await runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, io);
  assert.equal(result.submittedParams.API_TOKEN, '[REDACTED]'); assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(f.calls.find(row => row.name === 'jenkins_trigger_build').args.params.API_TOKEN, secret);
  f.job.parameters.at(-1).defaultValue = secret;
  await assert.rejects(prepareFrozenJenkinsBuild(f.input, io), /不得.*保存默认值/);
});
