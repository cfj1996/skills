import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256 } from '../scripts/workflow-runtime.mjs';
import { prepareProjectMockGate, projectMockIntegrationFingerprint, runProjectMockSource,
  verifyProjectMockArtifact } from '../scripts/project-mock-gate.mjs';
import { runJenkinsRelease, releaseRequiredTools, checkReleaseSource } from '../scripts/run-jenkins-release.mjs';
import { mockInventoryFingerprint } from '../scripts/mock-safety.mjs';
import { frozenJenkinsFixture } from './helpers/frozen-jenkins-fixture.mjs';
import { noMockFixture, fixtureMockIo } from './helpers/mock-safety-fixture.mjs';

const exec = promisify(execFile);
const origin = 'https://git.example.test/team/project.git';
const jobUrl = 'https://ci.example.test/job/project/';
const invocation = 'node scripts/check-mock.mjs --phase artifact --config mock.config.json';
const release = '#!/bin/sh\nset -eu\n' + invocation + '\nnpm publish\n';
const checker = `import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).reduce((rows,v,i,a)=>i%2?rows:[...rows,[v,a[i+1]]],[]));
const config=readFileSync(args['--config']);
const input=JSON.parse(config);
if(input.block) { console.error('blocked by actual project check'); process.exit(7); }
const source=readFileSync('src/main.js');
if(source.includes('MOCK_ONLY')) {console.error('production mock');process.exit(8);}
console.log('MOCK_SOURCE_GATE '+JSON.stringify({schemaVersion:1,phase:'source',state:'PASSED',sourceSha:args['--source-sha'],checkerHash:hash(readFileSync(process.argv[1])),configHash:hash(config),sourceFingerprint:hash(source),remainingMockPaths:[],runtimeEnabled:false}));
`;

async function fixture(t, configuration = {}) {
  const root = await mkdtemp(join(tmpdir(), 'project-mock-gate-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', args, { cwd: root })).stdout.trim();
  await git('init', '-b', 'main'); await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.test');
  await git('remote', 'add', 'origin', origin);
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'src'));
  await writeFile(join(root, 'scripts/check-mock.mjs'), checker);
  await writeFile(join(root, 'scripts/release.sh'), release);
  await writeFile(join(root, 'src/main.js'), 'export const real = true;\n');
  const config = JSON.stringify({ schemaVersion: 1, sourcePaths: ['src'], ...configuration });
  await writeFile(join(root, 'mock.config.json'), config);
  await git('add', '.'); await git('commit', '-m', 'fixture project gate');
  const sourceSha = await git('rev-parse', 'HEAD');
  const files = [{ path: 'scripts/release.sh', contentHash: sha256(release) }];
  const gate = { schemaVersion: 1, repositoryPath: root, sourceRepository: origin, sourceSha,
    checker: { scriptPath: 'scripts/check-mock.mjs', contentHash: sha256(checker), configPath: 'mock.config.json', configHash: sha256(config) },
    integration: { repositoryPath: root, sourceRepository: origin, sourceSha, files,
      entrypoint: 'scripts/release.sh', checkerInvocation: invocation, publishInvocation: 'npm publish', evidenceRefs: ['review: real project publishing entry'],
      review: { state: 'VERIFIED', sourceSha, filesFingerprint: projectMockIntegrationFingerprint(files),
        checkedBeforePublish: true, failClosed: true, noBypass: true, evidenceRefs: ['review: all publication paths stop on checker failure'] } } };
  const input = { expectedSha: sourceSha, sourceRepository: origin, jobUrl, projectMockGate: gate };
  return { root, git, gate, input, sourceSha };
}

test('executes the committed project source script from an isolated snapshot, with no XML', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'scripts/check-mock.mjs'), 'throw new Error("uncommitted script must not run");');
  await writeFile(join(f.root, 'src/main.js'), 'MOCK_ONLY uncommitted data');
  const prepared = await prepareProjectMockGate(f.input);
  const receipt = await runProjectMockSource(prepared);
  assert.equal(receipt.sourceSha, f.sourceSha);
  assert.equal(receipt.sourceFingerprint, sha256('export const real = true;\n'));
  assert.equal(receipt.checkerHash, sha256(checker));
  assert.equal(receipt.runtimeEnabled, false);
});

test('requires actual current script, config, entry files and a file-bound integration review', async t => {
  const f = await fixture(t);
  for (const altered of [
    { ...f.gate, checker: { ...f.gate.checker, contentHash: '1'.repeat(64) } },
    { ...f.gate, checker: { ...f.gate.checker, configHash: '2'.repeat(64) } },
    { ...f.gate, checker: { ...f.gate.checker, scriptPath: '../escape.mjs' } },
    { ...f.gate, integration: { ...f.gate.integration, entrypoint: 'missing.sh' } },
    { ...f.gate, integration: { ...f.gate.integration, review: { ...f.gate.integration.review, filesFingerprint: '3'.repeat(64) } } },
    { ...f.gate, integration: { ...f.gate.integration, review: { state: 'VERIFIED' } } },
    { ...f.gate, integration: { ...f.gate.integration, checkerInvocation: 'echo ' + invocation } },
    { ...f.gate, integration: { ...f.gate.integration, checkerInvocation: invocation + ' || true' } },
  ]) await assert.rejects(prepareProjectMockGate({ ...f.input, projectMockGate: altered }));
  await assert.rejects(prepareProjectMockGate({ ...f.input, projectMockGateHash: '4'.repeat(64) }), /绑定已变化/);
  await assert.rejects(prepareProjectMockGate({ ...f.input, execute: true }), /绑定指纹/);
});

test('rejects a source script failure and forged or stale output receipts', async t => {
  const f = await fixture(t, { block: true });
  const prepared = await prepareProjectMockGate(f.input);
  await assert.rejects(runProjectMockSource(prepared), /脚本执行失败/);
  for (const output of ['', 'MOCK_SOURCE_GATE {}', 'MOCK_SOURCE_GATE {}\nMOCK_SOURCE_GATE {}']) {
    await assert.rejects(runProjectMockSource(prepared, { executeProjectMockSource: async () => output }));
  }
});

test('rejects symlinks and unexpanded submodules in the source snapshot', async t => {
  const f = await fixture(t);
  await symlink('/etc/passwd', join(f.root, 'source-link'));
  await f.git('add', 'source-link'); await f.git('commit', '-m', 'unsafe symlink');
  const sha = await f.git('rev-parse', 'HEAD');
  const gate = { ...f.gate, sourceSha: sha, integration: { ...f.gate.integration, sourceSha: sha,
    review: { ...f.gate.integration.review, sourceSha: sha } } };
  await assert.rejects(runProjectMockSource(await prepareProjectMockGate({ ...f.input, expectedSha: sha, projectMockGate: gate })), /符号链接、子模块/);
  await f.git('rm', 'source-link');
  await f.git('update-index', '--add', '--cacheinfo', `160000,${f.sourceSha},vendor`);
  await f.git('commit', '-m', 'unexpanded submodule');
  const submoduleSha = await f.git('rev-parse', 'HEAD');
  const submoduleGate = { ...gate, sourceSha: submoduleSha, integration: { ...gate.integration, sourceSha: submoduleSha,
    review: { ...gate.integration.review, sourceSha: submoduleSha } } };
  await assert.rejects(runProjectMockSource(await prepareProjectMockGate({ ...f.input, expectedSha: submoduleSha, projectMockGate: submoduleGate })), /符号链接、子模块/);
});

test('allows an exact separately versioned pipeline entry but rejects an unrelated repository or SHA', async t => {
  const f = await fixture(t);
  const pipeline = await fixture(t);
  const pipelineOrigin = 'https://git.example.test/infra/pipelines.git';
  await pipeline.git('remote', 'set-url', 'origin', pipelineOrigin);
  const integration = { ...pipeline.gate.integration, sourceRepository: pipelineOrigin };
  const input = { ...f.input, projectMockGate: { ...f.gate, integration } };
  await assert.rejects(prepareProjectMockGate(input), /实际发布入口/);
  const pipelineSource = { repositoryPath: pipeline.root, repositoryUrl: pipelineOrigin, expectedSha: pipeline.sourceSha, ref: 'main', scriptPath: 'scripts/release.sh' };
  assert.equal((await prepareProjectMockGate({ ...input, pipelineSource })).gate.integration.sourceRepository, pipelineOrigin);
  await assert.rejects(prepareProjectMockGate({ ...input, pipelineSource: { ...pipelineSource, expectedSha: 'f'.repeat(40) } }), /实际发布入口/);
});

test('the npm lifecycle adapter verifies the real prepublishOnly hook and rejects ignored scripts', async t => {
  const f = await fixture(t);
  const manifest = JSON.stringify({ name: 'fixture', scripts: { prepublishOnly: invocation, release: 'npm publish' } });
  await writeFile(join(f.root, 'package.json'), manifest);
  await f.git('add', 'package.json'); await f.git('commit', '-m', 'npm hook');
  const sourceSha = await f.git('rev-parse', 'HEAD');
  const files = [{ path: 'package.json', contentHash: sha256(manifest) }];
  const gate = { ...f.gate, sourceSha, integration: { ...f.gate.integration, sourceSha, files,
    kind: 'npm-prepublishOnly', entrypoint: 'package.json', review: { ...f.gate.integration.review, sourceSha,
      filesFingerprint: projectMockIntegrationFingerprint(files) } } };
  const input = { ...f.input, expectedSha: sourceSha, projectMockGate: gate };
  assert.equal((await prepareProjectMockGate(input)).gate.integration.kind, 'npm-prepublishOnly');
  const disabled = { ...gate, integration: { ...gate.integration, publishInvocation: 'npm publish --ignore-scripts' } };
  await assert.rejects(prepareProjectMockGate({ ...input, projectMockGate: disabled }));
});

test('binds the artifact receipt to actual source, checker/configuration, artifact and exact build', async t => {
  const f = await fixture(t);
  const source = await runProjectMockSource(await prepareProjectMockGate(f.input));
  const input = { ...f.input, projectMockSourceReceipt: source };
  const receipt = { schemaVersion: 1, phase: 'artifact', state: 'PASSED', sourceSha: f.sourceSha,
    checkerHash: f.gate.checker.contentHash, configHash: f.gate.checker.configHash,
    sourceFingerprint: source.sourceFingerprint, artifactFingerprint: sha256('actual final artifact'),
    jobUrl, buildNumber: 12, beforeDeploy: true, runtimeEnabled: false, remainingMockPaths: [] };
  const line = row => 'MOCK_PRODUCTION_GATE ' + JSON.stringify(row);
  assert.equal(verifyProjectMockArtifact(line(receipt), input, 9, 12).queueBinding, 'VERIFIED_BUILD_QUEUE_ID');
  assert.equal(verifyProjectMockArtifact(line({ ...receipt, queueId: 9 }), input, 9, 12).queueBinding, 'CHECKER_AND_BUILD_QUEUE_ID');
  for (const change of [{ sourceSha: 'a'.repeat(40) }, { checkerHash: 'b'.repeat(64) }, { configHash: 'c'.repeat(64) },
    { sourceFingerprint: 'd'.repeat(64) }, { jobUrl: jobUrl + 'other/' }, { buildNumber: 13 }, { queueId: 10 },
    { artifactFingerprint: '' }, { remainingMockPaths: ['fixture.json'] }, { runtimeEnabled: true }, { beforeDeploy: false }]) {
    assert.throws(() => verifyProjectMockArtifact(line({ ...receipt, ...change }), input, 9, 12), /未通过/);
  }
  assert.equal(verifyProjectMockArtifact(line(receipt) + '\n' + line(receipt), input, 9, 12).state, 'PASSED');
});

function artifactLogFixture() {
  const checkerHash = sha256('reviewed checker'), configHash = sha256('reviewed configuration');
  const sourceFingerprint = sha256('exact checked source'), sourceSha = 'a'.repeat(40);
  return { input: { expectedSha: sourceSha, jobUrl, projectMockGate: { checker: { contentHash: checkerHash, configHash } },
    projectMockSourceReceipt: { sourceFingerprint } }, receipt: { schemaVersion: 1, phase: 'artifact', state: 'PASSED',
    sourceSha, checkerHash, configHash, sourceFingerprint, artifactFingerprint: sha256('final artifact'),
    jobUrl, buildNumber: 12, beforeDeploy: true, runtimeEnabled: false, remainingMockPaths: [] } };
}

test('Jenkins summary and post-success echoes of the identical normalized artifact receipt remain one logical receipt', () => {
  const { input, receipt } = artifactLogFixture();
  const line = 'MOCK_PRODUCTION_GATE ' + JSON.stringify(receipt);
  const log = ['[Pipeline] sh', '[2026-10-27T11:00:00.000Z] ' + line,
    '[Pipeline] echo', '================ 发布成功 ================', line,
    '[Pipeline] echo', '[2026-10-27T11:00:01.000Z] \u001b[32m' + line + '\u001b[0m'].join('\r\n');
  const result = verifyProjectMockArtifact(log, input, 9, 12);
  assert.equal(result.state, 'PASSED');
  assert.equal(result.artifactFingerprint, receipt.artifactFingerprint);
  assert.equal(result.queueId, 9);
});

test('replayed Jenkins logs still reject conflicting, failed, malformed or absent artifact receipts', () => {
  const { input, receipt } = artifactLogFixture();
  const line = row => 'MOCK_PRODUCTION_GATE ' + JSON.stringify(row);
  const repeated = line(receipt) + '\n' + line(receipt);
  for (const conflicting of [{ ...receipt, artifactFingerprint: sha256('different artifact') },
    { ...receipt, checkerHash: sha256('different checker') }, { ...receipt, state: 'FAILED' }]) {
    assert.throws(() => verifyProjectMockArtifact(repeated + '\n' + line(conflicting), input, 9, 12), /唯一/);
  }
  for (const invalid of ['', 'MOCK_PRODUCTION_GATE invalid-json', repeated + '\nMOCK_PRODUCTION_GATE invalid-json']) {
    assert.throws(() => verifyProjectMockArtifact(invalid, input, 9, 12), /唯一可识别/);
  }
});

test('an official Jenkins release uses project scripts without XML and stops before trigger on a failed source check', async t => {
  const f = await fixture(t);
  const base = { ...f.input, targetProject: 'project', releaseTarget: 'project', releaseKind: 'deployment',
    releaseChannel: 'official', targetEnvironment: 'production', releaseRef: 'master', expectedSha: f.sourceSha,
    version: f.sourceSha, jobName: 'project', params: { branch: 'master' }, purpose: 'test real project Mock gate',
    jenkinsContractsPath: '/fixture/contracts.json', mockSafety: noMockFixture({ sourceRepository: origin, expectedSha: f.sourceSha }) };
  const definitions = { jobName: 'project', parameters: [{ name: 'branch', choices: ['master'] }] };
  const registry = frozenJenkinsFixture(base, definitions, 'https://ci.example.test');
  let triggers = 0, xmlCalls = 0;
  const reader = { jobUrl, instanceUrl: 'https://ci.example.test', job: async () => ({ name: 'project', url: jobUrl }),
    queueIdentity: url => ({ id: 9, url }),
    queue: async () => ({ executable: { number: 12, url: jobUrl + '12/' } }),
    build: async () => ({ queueId: 9, building: false, result: 'SUCCESS', url: jobUrl + '12/', actions: [
      { parameters: [{ name: 'branch', value: 'master' }] }, { remoteUrls: [origin], lastBuiltRevision: { SHA1: f.sourceSha } },
    ] }),
    console: async () => 'MOCK_PRODUCTION_GATE ' + JSON.stringify({ schemaVersion: 1, phase: 'artifact', state: 'PASSED', sourceSha: f.sourceSha,
      checkerHash: f.gate.checker.contentHash, configHash: f.gate.checker.configHash,
      sourceFingerprint: sha256('export const real = true;\n'), artifactFingerprint: sha256('real artifact'),
      jobUrl, buildNumber: 12, beforeDeploy: true, runtimeEnabled: false, remainingMockPaths: [] }),
  };
  const call = async name => {
    if (name === 'jenkins_get_job_config') { xmlCalls++; throw new Error('HTTP 403: XML unavailable'); }
    if (name === 'jenkins_list_instances') return [{ name: 'default', url: reader.instanceUrl }];
    if (name === 'jenkins_trigger_build') { triggers++; return { jobName: 'project', queueUrl: 'https://ci.example.test/queue/item/9/' }; }
    throw new Error('Unexpected remote tool ' + name);
  };
  const io = { readFrozenJenkinsContracts: async () => registry, checkSource: async () => {},
    inspectMockSource: fixtureMockIo.inspectMockSource, verifyMockCommittedContent: fixtureMockIo.verifyMockCommittedContent,
    maxWaitMs: 1000, initialDelayMs: 1, maxDelayMs: 1 };
  const plan = await runJenkinsRelease(call, reader, base, io);
  assert.equal(releaseRequiredTools(plan).includes('jenkins_get_job_config'), false);
  const result = await runJenkinsRelease(call, reader, { ...plan, execute: true, confirmed: true }, io);
  assert.equal(result.state, 'DEPLOYED'); assert.equal(triggers, 1); assert.equal(xmlCalls, 0);
  const failed = await fixture(t, { block: true });
  const failedInput = { ...base, expectedSha: failed.sourceSha, version: failed.sourceSha, projectMockGate: failed.gate,
    mockSafety: noMockFixture({ sourceRepository: origin, expectedSha: failed.sourceSha }) };
  const failedPlan = await runJenkinsRelease(call, reader, failedInput, io);
  await assert.rejects(runJenkinsRelease(call, reader, { ...failedPlan, execute: true, confirmed: true }, io), /脚本执行失败/);
  assert.equal(triggers, 1); assert.equal(xmlCalls, 0);
});

test('an old official plan inferred from jobConfigHash stops for refresh before any XML read or trigger', async () => {
  let calls = 0;
  await assert.rejects(runJenkinsRelease(async () => { calls++; throw new Error('must not call Jenkins'); }, {}, {
    execute: true, confirmed: true, releaseChannel: 'official', targetEnvironment: 'production',
    jobConfigHash: 'a'.repeat(64),
  }), /旧正式发布清单.*刷新为项目脚本检查清单/);
  assert.equal(calls, 0);
});

function testReleaseHarness(releaseRef, remoteRef, { activeMock = true, authorizedBranch = releaseRef, inferredBindings = false } = {}) {
  const sourceSha = 'a'.repeat(40);
  const purpose = 'verify branch-bound Mock test publication';
  const safety = noMockFixture({ sourceRepository: origin, expectedSha: sourceSha });
  if (activeMock) {
    safety.mockModules = [{ id: 'MOCK-list', marker: 'MOCK_ONLY', status: 'active', featureRefs: ['F-list'], paths: ['src/list.mock.ts'],
      mode: 'function-data', scenarios: ['success'], activation: 'test explicit only', realRequestBoundary: 'list only; saving unavailable',
      exitCondition: 'replace list API', verificationLimits: ['backend not verified'] }];
    safety.testAuthorization = { decision: 'ALLOW', purpose, source: 'human: exact inventory/branch/test Job approved',
      sourceSha, scopeFingerprint: safety.scopeFingerprint, inventoryFingerprint: mockInventoryFingerprint(safety),
      targetEnvironment: 'test', targetBranch: authorizedBranch, jobUrl, operations: ['test-deploy'] };
  }
  const input = { targetProject: 'project', releaseTarget: 'project', releaseKind: 'deployment', releaseChannel: 'canary',
    targetEnvironment: 'test', releaseRef, expectedSha: sourceSha, version: sourceSha, jobName: 'project', jobUrl,
    sourceRepository: origin, purpose, completionMode: 'TRIGGER_ACCEPTED', jenkinsContractsPath: '/fixture/contracts.json',
    params: inferredBindings ? { REF: releaseRef, CHANNEL: 'canary' } : { branch: releaseRef }, mockSafety: safety };
  const definitions = { jobName: 'project', parameters: inferredBindings
    ? [{ name: 'REF', choices: [releaseRef] }, { name: 'CHANNEL', choices: ['canary', 'latest'] }]
    : [{ name: 'branch', choices: [releaseRef] }] };
  const registry = frozenJenkinsFixture(input, definitions, 'https://ci.example.test');
  let triggers = 0;
  const reader = { jobUrl, instanceUrl: 'https://ci.example.test', job: async () => ({ name: 'project', url: jobUrl }),
    queueIdentity: url => ({ id: 9, url }) };
  const call = async name => {
    if (name === 'jenkins_list_instances') return [{ name: 'default', url: reader.instanceUrl }];
    if (name === 'jenkins_trigger_build') { triggers++; return { jobName: 'project', queueUrl: 'https://ci.example.test/queue/item/9/' }; }
    throw new Error('Unexpected remote tool ' + name);
  };
  const io = { readFrozenJenkinsContracts: async () => registry,
    inspectMockSource: fixtureMockIo.inspectMockSource, verifyMockCommittedContent: fixtureMockIo.verifyMockCommittedContent,
    checkSource: value => checkReleaseSource(value, async () => sourceSha + '\t' + remoteRef + '\n') };
  return { input, reader, call, io, triggers: () => triggers };
}

test('a verified bare feature branch supports its exact Mock authorization', async () => {
  const f = testReleaseHarness('feature/cfj.mock', 'refs/heads/feature/cfj.mock');
  const plan = await runJenkinsRelease(f.call, f.reader, f.input, f.io);
  assert.equal((await runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, f.io)).state, 'BUILD_SUBMITTED');
  assert.equal(f.triggers(), 1);
});

test('a tag named develop or feature, and an immutable SHA with a self-reported branch, cannot supply Mock branch authorization', async () => {
  for (const [ref, remote, branch] of [['develop', 'refs/tags/develop', 'develop'],
    ['feature/cfj.mock', 'refs/tags/feature/cfj.mock', 'feature/cfj.mock'],
    ['a'.repeat(40), null, 'develop']]) {
    const f = testReleaseHarness(ref, remote, { authorizedBranch: branch });
    const plan = await runJenkinsRelease(f.call, f.reader, { ...f.input, targetBranch: branch }, f.io);
    await assert.rejects(runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, f.io), /实际目标分支证据/);
    assert.equal(f.triggers(), 0);
  }
});

test('a PLAN with profile-inferred REF and CHANNEL bindings executes unchanged and still rejects an altered adapter hash', async () => {
  const f = testReleaseHarness('develop', 'refs/heads/develop', { activeMock: false, inferredBindings: true });
  assert.equal(f.input.refParameter, undefined); assert.equal(f.input.channelParameter, undefined);
  const plan = await runJenkinsRelease(f.call, f.reader, f.input, f.io);
  assert.equal(plan.refParameter, 'REF'); assert.equal(plan.channelParameter, 'CHANNEL');
  await assert.rejects(runJenkinsRelease(f.call, f.reader, { ...plan, adapterHash: 'f'.repeat(64), execute: true, confirmed: true }, f.io), /适配规则已变化/);
  assert.equal(f.triggers(), 0);
  assert.equal((await runJenkinsRelease(f.call, f.reader, { ...plan, execute: true, confirmed: true }, f.io)).state, 'BUILD_SUBMITTED');
  assert.equal(f.triggers(), 1);
});
