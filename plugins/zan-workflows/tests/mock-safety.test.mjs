import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectMockSource, checkMockSafety, checkMockSafetySet, mockInventoryFingerprint,
  checkDeliveryEnvironment, checkPreDeployMockGate, verifyMockCheckerEvidence, verifyProductionMockArtifact } from '../scripts/mock-safety.mjs';
import { mergeReviewedBranch } from '../scripts/merge-reviewed-branch.mjs';
import { runJenkinsRelease } from '../scripts/run-jenkins-release.mjs';
import { registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { noMockFixture, fixtureMockIo } from './helpers/mock-safety-fixture.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';

const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40);
const originUrl = 'https://git.example.test/team/demo.git';
const jobUrl = 'https://ci.example.test/job/demo-test/';
const canonicalPipeline = (command, { revision = sourceSha, repository = originUrl, clean = true, checkout = true,
  buildCommand, checkerHash = sha256(checkerBody) } = {}) =>
  "<flow-definition><definition class=\"org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition\"><script>pipeline { agent any stages { stage('Guarded deploy') { steps { " +
  (clean ? 'deleteDir(); ' : '') + (checkout ? "checkout([$class: 'GitSCM', branches: [[name: '" + revision + "']], userRemoteConfigs: [[url: '" + repository + "']]]); " : '') +
  "sh '" + [...(buildCommand ? [buildCommand] : []),
    `sha256sum -- scripts/check-mock.mjs | grep -Fx -- "${checkerHash}  scripts/check-mock.mjs"`, command]
    .join(' && ').replaceAll('&', '&amp;') + "' } } } }</script></definition></flow-definition>";
const checkerBody = '// MOCK_PRODUCTION_GATE: fixture of independently reviewed artifact checker\n';
const checkerEvidence = () => ({ repositoryPath: '/fixture/demo', sourceRepository: originUrl, sourceSha,
  scriptPath: 'scripts/check-mock.mjs', contentHash: sha256(checkerBody), evidenceRefs: ['E-checker-source-and-responsibility-review'] });
const productionGate = (xml, checkCommand = 'node scripts/check-mock.mjs') => ({
  state: 'VERIFIED', jobBindingHash: sha256(xml), pipelineContentHash: sha256(xml), sourceSha, jobUrl,
  checkCommand, deployStep: 'deploy-production', evidenceRefs: ['E-current-pipeline'], failClosed: true, beforeDeploy: true,
  checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE',
});
const productionInput = gate => ({ expectedSha: sourceSha, sourceRepository: originUrl, jobUrl, preDeployMockGate: gate });
const context = () => ({ environmentKind: 'test', operation: 'git-delivery', purpose: 'deliver reviewed code', targetEnvironment: 'test', targetBranch: 'develop',
  sourceRepository: originUrl, sourceSha });
const active = () => ({ id: 'MOCK-list', marker: 'MOCK_ONLY', status: 'active', featureRefs: ['F-list'], taskRefs: [],
  paths: ['src/list.mock.ts'], mode: 'function-data', scenarios: ['success', 'empty'], activation: 'dev only',
  realRequestBoundary: 'Only list is mocked; save is disabled', exitCondition: 'formal query integrated',
  verificationLimits: ['real backend not verified'], authorizationEvidenceRefs: ['E-mock'] });
const safety = () => ({ ...noMockFixture({ originUrl, sourceSha }), mockModules: [active()] });
function authorize(input, changes = {}) {
  return { ...input, testAuthorization: { decision: 'ALLOW', purpose: 'deliver reviewed code', source: 'human: approved exact MOCK-list inventory for test',
    sourceSha: input.sourceSha, scopeFingerprint: input.scopeFingerprint, inventoryFingerprint: mockInventoryFingerprint(input),
    targetEnvironment: 'test', targetBranch: 'develop', jobUrl,
    operations: ['git-delivery', 'test-deploy', 'test-wiki', 'test-registration'], ...changes } };
}

test('absence and boolean flags cannot replace explicit complete no-Mock inspection', async () => {
  await assert.rejects(checkMockSafety(undefined, context(), fixtureMockIo), /未声明不能视为无 Mock/);
  await assert.rejects(checkMockSafety({ confirmed: true, mocks: false }, context(), fixtureMockIo), /未声明不能视为无 Mock/);
  const receipt = await checkMockSafety(noMockFixture({ originUrl, sourceSha }), context(), fixtureMockIo);
  assert.equal(receipt.state, 'VERIFIED');
  assert.deepEqual(receipt.mockModuleIds, []);
  assert.equal(receipt.productionArtifactVerified, false);
});

test('Mock test delivery needs explicit exact authorization and rejects denial, drift and generic confirmation', async () => {
  for (const input of [safety(), { ...safety(), confirmed: true }, authorize(safety(), { decision: 'DENY' }),
    authorize(safety(), { source: '' }), authorize(safety(), { targetBranch: 'dev' }),
    authorize(safety(), { sourceSha: targetSha }), authorize(safety(), { operations: ['test-deploy'] }),
    authorize(safety(), { inventoryFingerprint: sha256('other inventory') })]) {
    await assert.rejects(checkMockSafety(input, context(), fixtureMockIo), /尚未针对准确范围/);
  }
  const input = authorize(safety());
  assert.equal((await checkMockSafety(input, context(), fixtureMockIo)).state, 'VERIFIED');
  assert.equal((await checkMockSafety(input, context(), fixtureMockIo)).state, 'VERIFIED');
  input.mockModules[0].scenarios.push('permission-denied');
  await assert.rejects(checkMockSafety(input, context(), fixtureMockIo), /尚未针对准确范围/);
});

test('same HEAD cannot cover changed working files and unresolved marker discovery', async () => {
  const input = authorize(safety());
  await assert.rejects(checkMockSafety(input, context(), { ...fixtureMockIo,
    inspectMockSource: async value => ({ ...await fixtureMockIo.inspectMockSource(value), contentFingerprint: sha256('manual edit') }) }), /已过期/);
  await assert.rejects(checkMockSafety(input, context(), { ...fixtureMockIo,
    inspectMockSource: async value => ({ ...await fixtureMockIo.inspectMockSource(value), markedPaths: ['src/unregistered.mock.ts'] }) }), /未登记|稳定标识/);
});

test('production cannot reuse test permission, disabled flags or retired status as removal proof', async () => {
  const production = { ...context(), environmentKind: 'production', targetEnvironment: 'production', targetBranch: 'master' };
  await assert.rejects(checkMockSafety({ ...authorize(safety()), enabled: false }, production, fixtureMockIo), /生产范围仍有 Mock/);
  const retired = safety(); retired.mockModules[0].status = 'retired'; retired.mockModules[0].exitEvidenceRefs = ['E-real-integration'];
  await assert.rejects(checkMockSafety(retired, production, fixtureMockIo), /缺少本次源码退出/);
});

test('multi-repository gates reject missing or duplicate repository coverage', async () => {
  const first = noMockFixture({ originUrl, sourceSha });
  await assert.rejects(checkMockSafetySet({ mockSafeties: [first], mockRepositories: [
    { sourceRepository: originUrl, sourceSha }, { sourceRepository: 'https://git.example.test/team/other.git', sourceSha } ] }, context(), fixtureMockIo), /全部本轮交付仓库|已核实的交付源码|仓库清单/);
  await assert.rejects(checkMockSafetySet({ mockSafeties: [first, first], mockRepositories: [
    { sourceRepository: originUrl, sourceSha }, { sourceRepository: originUrl, sourceSha } ] }, context(), fixtureMockIo), /全部本轮交付仓库|已核实的交付源码|仓库清单/);
});

test('production needs current Job-bound pre-deploy guard and build-bound final artifact receipt', () => {
  const pipeline = canonicalPipeline('node scripts/check-mock.mjs && deploy after check');
  const jobHash = sha256(pipeline);
  const input = { expectedSha: sourceSha, sourceRepository: originUrl, jobUrl };
  assert.throws(() => checkPreDeployMockGate(input, 'job-hash'), /制品 Mock 检查门禁/);
  input.preDeployMockGate = { state: 'VERIFIED', jobBindingHash: jobHash, pipelineContentHash: jobHash, sourceSha, jobUrl,
    checkCommand: 'node scripts/check-mock.mjs', deployStep: 'deploy after check', evidenceRefs: ['E-current-pipeline'],
    failClosed: true, beforeDeploy: true, checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE' };
  assert.equal(checkPreDeployMockGate(input, jobHash, pipeline), input.preDeployMockGate);
  assert.throws(() => checkPreDeployMockGate(input, jobHash), /实际流水线代码/);
  assert.throws(() => checkPreDeployMockGate(input, 'changed-job-hash'), /制品 Mock 检查门禁/);
  const receipt = { state: 'PASSED', sourceSha, jobUrl, queueId: 9, buildNumber: 3,
    artifactFingerprint: sha256('artifact'), beforeDeploy: true, runtimeEnabled: false, remainingMockPaths: [] };
  assert.equal(verifyProductionMockArtifact('MOCK_PRODUCTION_GATE ' + JSON.stringify(receipt), input, 9, 3).state, 'PASSED');
  for (const change of [{ queueId: 8 }, { sourceSha: targetSha }, { remainingMockPaths: ['fixture.json'] }, { runtimeEnabled: true }, { beforeDeploy: false }]) {
    assert.throws(() => verifyProductionMockArtifact('MOCK_PRODUCTION_GATE ' + JSON.stringify({ ...receipt, ...change }), input, 9, 3), /未通过或回执/);
  }
});

const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
function mergeFake() {
  const calls = [];
  const call = async (name, args) => {
    calls.push(name);
    if (name === 'get_branch') return reply({ commit: { id: args.branch_name === 'feature/a' ? sourceSha : targetSha } });
    if (name === 'get_project') return reply({ default_branch: 'master', http_url_to_repo: originUrl });
    if (name === 'list_merge_requests') return reply([]);
    throw new Error('unexpected write: ' + name);
  };
  const input = { projectId: '1', repositoryPath: '/fixture/demo', originUrl, sourceBranch: 'feature/a', targetBranch: 'develop',
    sourceSha, targetSha, purpose: 'deliver reviewed code', title: 'feature', reviewPassed: true, pipelineRequired: false,
    execute: true, confirmed: true };
  const io = { ...fixtureMockIo, checkRepository: async () => {}, inspectContainment: async () => ({ contained: false, targetSha }) };
  return { call, calls, input, io };
}
test('standalone MR helper blocks before first external write without mock evidence', async () => {
  const f = mergeFake();
  await assert.rejects(mergeReviewedBranch(f.call, f.input, f.io), /全部相关仓库的 Mock 清查集合/);
  assert.equal(f.calls.some(name => /^(create|merge)_/.test(name)), false);
  const withMock = { ...f.input, mockSafety: authorize(safety(), { decision: 'DENY' }) };
  await assert.rejects(mergeReviewedBranch(f.call, withMock, f.io), /尚未针对准确范围/);
});

test('standalone registration refuses missing inventory before any TAPD call', async () => {
  const calls = [];
  await assert.rejects(registerTestSubmission(async name => { calls.push(name); }, {
    workspaceId: 1, entryId: '123', entryType: 'stories', workMode: 'INITIAL', statusAction: 'NONE', versionAction: 'WRITE',
    versionField: 'version', testVersion: 'test', purpose: 'test', execute: true, confirmed: true,
    prerequisites: { git: 'VERIFIED', deployment: 'SKIPPED_BY_INTENT', profile: 'NO_WIKI', wiki: 'SKIPPED_NO_WIKI' },
  }), /全部相关仓库/);
  assert.deepEqual(calls, []);
});

test('session path uses the same gate and blocks later writes after a rejected delivery', async () => {
  const f = mergeFake();
  const session = new WorkflowSession({ allowExecute: true, io: f.io,
    pool: { call: (_server, ...args) => f.call(...args), close() {} } });
  await assert.rejects(session.dispatch({ id: 'one', action: 'merge', phase: 'EXECUTE', input: f.input }), /全部相关仓库/);
  await assert.rejects(session.dispatch({ id: 'two', action: 'merge', phase: 'EXECUTE', input: f.input }), /不允许此写操作/);
  assert.equal(f.calls.some(name => /^(create|merge)_/.test(name)), false);
  session.close();
});

test('real local inspection binds complete diff, untracked content and source-equivalent commits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zan-mock-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'feature/mock'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
    git('remote', 'add', 'origin', originUrl);
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
    await writeFile(join(root, 'src/page.ts'), 'export const page = 1;\n');
    git('add', '.'); git('commit', '-m', 'base');
    const baseSha = git('rev-parse', 'HEAD');
    await writeFile(join(root, 'src/page.ts'), 'export const page = 2;\n');
    await writeFile(join(root, 'src/mock.ts'), '// MOCK_ONLY MOCK-list\nexport const rows = [];\n');
    const input = { repositoryPath: root, sourceRepository: originUrl, baseSha,
      inspectedPaths: ['.'], mockBindingPaths: ['package.json'], runtimePaths: ['src'] };
    const snapshot = await inspectMockSource(input);
    assert.deepEqual(snapshot.markedPaths, ['src/mock.ts']);
    assert.deepEqual(snapshot.changedPaths, ['src/mock.ts', 'src/page.ts']);
    await assert.rejects(inspectMockSource({ ...input, inspectedPaths: ['package.json'] }), /未覆盖完整待交付差异/);
    const module = { ...active(), paths: ['src/mock.ts'] };
    const inspected = authorize({ ...input, ...snapshot, schemaVersion: 1, evidenceRefs: ['E-full-scope'], mockModules: [module] });
    await checkMockSafety(inspected, { ...context(), sourceSha: baseSha });
    await writeFile(join(root, 'src/page.ts'), 'export const page = 3;\n');
    await assert.rejects(checkMockSafety(inspected, { ...context(), sourceSha: baseSha }), /已过期/);
    await writeFile(join(root, 'src/page.ts'), 'export const page = 2;\n');
    git('add', '.'); git('commit', '-m', 'exact inspected content');
    const committed = git('rev-parse', 'HEAD');
    assert.notEqual(committed, baseSha);
    const receipt = await checkMockSafety(inspected, { ...context(), sourceSha: committed, requireCommitted: true });
    assert.equal(receipt.deliveredSha, committed);
    await writeFile(join(root, 'src/other.ts'), 'export const other = 1;\n');
    await assert.rejects(checkMockSafety(inspected, { ...context(), sourceSha: committed, requireCommitted: true }), /已过期/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('authoritative helper SHA cannot be replaced by caller-provided mockRepositories', async () => {
  const different = noMockFixture({ originUrl, sourceSha: targetSha });
  await assert.rejects(checkMockSafetySet({ mockSafety: different,
    mockRepositories: [{ sourceRepository: originUrl, sourceSha: targetSha }] }, context(), fixtureMockIo), /已核实的交付源码/);
  const f = mergeFake();
  await assert.rejects(mergeReviewedBranch(f.call, { ...f.input, mockSafety: different,
    mockRepositories: [{ sourceRepository: originUrl, sourceSha: targetSha }] }, f.io), /已核实的交付源码/);
  assert.equal(f.calls.some(name => /^(create|merge)_/.test(name)), false);
});

test('retired isolated fixtures keep stable markers, but need current content-bound exit evidence', async () => {
  const input = safety(); input.mockModules[0].status = 'retired'; input.mockModules[0].exitEvidenceRefs = ['E-real-integration'];
  const inspect = async value => ({ ...await fixtureMockIo.inspectMockSource(value), markedPaths: ['src/list.mock.ts'],
    markerBindings: [{ path: 'src/list.mock.ts', moduleIds: ['MOCK-list'] }] });
  input.productionSourceEvidence = { scopeFingerprint: input.scopeFingerprint, evidenceRefs: ['E-real-route-imports'],
    configPaths: ['package.json'], configurationFingerprints: { 'package.json': sha256('fixture-config') }, remainingRuntimeMockPaths: [] };
  assert.equal((await checkMockSafety(input, context(), { ...fixtureMockIo, inspectMockSource: inspect })).state, 'VERIFIED');
  input.productionSourceEvidence.remainingRuntimeMockPaths.push('src/list.mock.ts');
  await assert.rejects(checkMockSafety(input, context(), { ...fixtureMockIo, inspectMockSource: inspect }), /源码退出/);
});

test('conditional, commented, parallel or uncalled pipeline checks cannot authorize production trigger', () => {
  const bodies = [
    "pipeline { agent any stages { stage('Mock check') { when { expression { false } } steps { sh 'check' } } stage('Deploy') { steps { sh 'deploy' } } } }",
    "// sh 'check'\npipeline { agent any stages { stage('Deploy') { steps { sh 'deploy' } } } }",
    "def checkMock() { sh 'check' }\npipeline { agent any stages { stage('Deploy') { steps { sh 'deploy' } } } }",
    "pipeline { agent any stages { parallel { stage('Mock') { steps { sh 'check' } } stage('Deploy') { steps { sh 'deploy' } } } } }",
  ];
  for (const body of bodies) {
    const xml = '<flow-definition><definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition"><script>' + body + '</script></definition></flow-definition>';
    const hash = sha256(xml);
    assert.throws(() => checkPreDeployMockGate({ expectedSha: sourceSha, sourceRepository: originUrl, jobUrl, preDeployMockGate: { state: 'VERIFIED',
      sourceSha, jobUrl, jobBindingHash: hash, pipelineContentHash: hash, checkCommand: 'check', deployStep: 'deploy',
      evidenceRefs: ['E-pipeline'], failClosed: true, beforeDeploy: true, checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE' } }, hash, xml), /未完整匹配/);
  }
});

test('the checker must be invoked directly rather than printed, inspected or passed to another program', async () => {
  for (const command of ['echo scripts/check-mock.mjs', 'cat scripts/check-mock.mjs', 'node --check scripts/check-mock.mjs',
    'node --help scripts/check-mock.mjs', 'node scripts/other.mjs scripts/check-mock.mjs',
    'node scripts/check-mock.mjs --help', 'sh -n scripts/check-mock.mjs']) {
    const xml = canonicalPipeline(command + ' && deploy-production'), gate = productionGate(xml, command);
    assert.throws(() => checkPreDeployMockGate(productionInput(gate), sha256(xml), xml), /必须直接执行受审脚本/, command);
    let sourceReads = 0;
    await assert.rejects(verifyMockCheckerEvidence(gate, { readMockCheckerSource: async () => { sourceReads++; return checkerBody; } }), /必须直接执行受审脚本/, command);
    assert.equal(sourceReads, 0, 'reject an ineffective invocation before accepting checker-source evidence');
  }
  for (const interpreter of ['node', 'python3', 'sh', 'bash']) {
    const command = interpreter + ' scripts/check-mock.mjs', xml = canonicalPipeline(command + ' && deploy-production');
    const gate = productionGate(xml, command);
    assert.equal(checkPreDeployMockGate(productionInput(gate), sha256(xml), xml), gate);
    assert.equal((await verifyMockCheckerEvidence(gate, { readMockCheckerSource: async () => checkerBody })).state, 'VERIFIED');
  }
});

test('only the actual inline definition can supply a guarded production Pipeline', () => {
  const inline = canonicalPipeline('node scripts/check-mock.mjs && deploy-production');
  const script = inline.match(/<script>([\s\S]*)<\/script>/)[1];
  const scm = '<definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition"><scm class="hudson.plugins.git.GitSCM"/><scriptPath>Jenkinsfile</scriptPath></definition>';
  const configs = [
    `<flow-definition><!-- <script>${script}</script> -->${scm}</flow-definition>`,
    `<flow-definition><properties><script>${script}</script></properties>${scm}</flow-definition>`,
    `<flow-definition><description><![CDATA[<script>${script}</script>]]></description>${scm}</flow-definition>`,
    inline.replace('class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition"', ''),
    inline.replace('<definition ', '<definition reference="../other" '),
    inline.replace('</definition>', '</definition><definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition"/>'),
    inline.replace('</script>', '</script><script>unguardedDeploy()</script>'),
    inline.replace('</definition>', '</properties>'),
    '<!DOCTYPE flow-definition [<!ENTITY guarded "ignored">]>' + inline,
    inline.replace('<flow-definition>', '<flow-definition xmlns="unsupported">'),
  ];
  for (const xml of configs) {
    const gate = productionGate(xml);
    assert.throws(() => checkPreDeployMockGate(productionInput(gate), sha256(xml), xml), /实际 XML definition/, xml);
  }
  const cdata = inline.replace(/<script>[\s\S]*<\/script>/, `<script><![CDATA[${script.replaceAll('&amp;', '&')}]]></script>`);
  for (const xml of [inline, '<?xml version="1.1" encoding="UTF-8"?>\n' + inline,
    inline.replace('<definition ', '<!-- configuration note --><definition '), cdata,
    inline.replaceAll('&amp;', '&#38;')]) {
    const gate = productionGate(xml);
    assert.equal(checkPreDeployMockGate(productionInput(gate), sha256(xml), xml), gate);
  }
});

test('official standalone Jenkins release checks before trigger and verifies only its exact artifact receipt', async () => {
  const calls = [];
  let pipeline = canonicalPipeline('node scripts/check-mock.mjs && deploy-production');
  const prodJob = 'https://ci.example.test/job/demo-prod/';
  const input = { targetProject: 'demo', releaseTarget: 'demo', targetEnvironment: 'production', releaseKind: 'deployment',
    releaseChannel: 'official', jobName: 'demo-prod', jobUrl: prodJob, releaseRef: sourceSha, expectedSha: sourceSha,
    sourceRepository: originUrl, purpose: 'official deployment', params: { REF: sourceSha }, refParameter: 'REF', version: sourceSha,
    jobBindingMode: 'CONFIG_XML', mockSafety: noMockFixture({ originUrl, sourceSha }) };
  const call = async name => {
    calls.push(name);
    if (name === 'jenkins_get_job_parameters') return reply({ jobName: input.jobName, parameters: [{ name: 'REF' }] });
    if (name === 'jenkins_get_job_config') return reply({ jobName: input.jobName, config: pipeline });
    if (name === 'jenkins_list_instances') return reply([{ name: 'default', url: 'https://ci.example.test' }]);
    if (name === 'jenkins_trigger_build') return reply({ jobName: input.jobName, queueUrl: 'https://ci.example.test/queue/item/9/' });
    throw new Error(name);
  };
  const reader = { instanceUrl: 'https://ci.example.test', jobUrl: prodJob, queueIdentity: () => ({ id: 9 }),
    queue: async () => ({ executable: { number: 3 } }),
    build: async () => ({ queueId: 9, building: false, result: 'SUCCESS', url: prodJob + '3/', actions: [
      { parameters: [{ name: 'REF', value: sourceSha }] }, { remoteUrls: [originUrl], lastBuiltRevision: { SHA1: sourceSha } } ] }),
    console: async () => 'MOCK_PRODUCTION_GATE ' + JSON.stringify({ state: 'PASSED', sourceSha, jobUrl: prodJob,
      queueId: 9, buildNumber: 3, artifactFingerprint: sha256('actual-production-artifact'), beforeDeploy: true,
      runtimeEnabled: false, remainingMockPaths: [] }) };
  const io = { ...fixtureMockIo, checkSource: async () => {}, readMockCheckerSource: async () => checkerBody };
  const plan = await runJenkinsRelease(call, reader, input, io);
  const mappingText = JSON.stringify({ jobUrl: prodJob, targetEnvironment: 'production', releaseChannel: 'official', environmentKind: 'production' });
  const environmentBinding = { kind: 'project-policy', ...JSON.parse(mappingText), sourcePath: '/fixture/AGENTS.md', sourceHash: sha256(mappingText),
    jobBindingHash: plan.jobBindingHash, parameterDefinitionsHash: plan.parameterDefinitionsHash, mappingText, evidenceRefs: ['E-project-environment-map'] };
  await assert.rejects(runJenkinsRelease(call, reader, { ...plan, environmentBinding, execute: true, confirmed: true }, io), /制品 Mock 检查门禁/);
  assert.equal(calls.includes('jenkins_trigger_build'), false);
  const preDeployMockGate = { state: 'VERIFIED', jobBindingHash: plan.jobBindingHash, pipelineContentHash: sha256(pipeline),
    sourceSha, jobUrl: prodJob, checkCommand: 'node scripts/check-mock.mjs', deployStep: 'deploy-production', evidenceRefs: ['E-real-config'],
    failClosed: true, beforeDeploy: true, checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE' };
  const acceptedPipeline = pipeline;
  const guardedScript = pipeline.match(/<script>([\s\S]*)<\/script>/)[1];
  for (const scenario of [
    { config: canonicalPipeline('echo scripts/check-mock.mjs && deploy-production'), command: 'echo scripts/check-mock.mjs', error: /必须直接执行受审脚本/ },
    { config: canonicalPipeline('node --check scripts/check-mock.mjs && deploy-production'), command: 'node --check scripts/check-mock.mjs', error: /必须直接执行受审脚本/ },
    { config: `<flow-definition><!-- <script>${guardedScript}</script> --><definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition"><scriptPath>Jenkinsfile</scriptPath></definition></flow-definition>`,
      command: 'node scripts/check-mock.mjs', error: /实际 XML definition/ },
  ]) {
    pipeline = scenario.config;
    const rejectedPlan = await runJenkinsRelease(call, reader, input, io);
    await assert.rejects(runJenkinsRelease(call, reader, { ...rejectedPlan, execute: true, confirmed: true,
      environmentBinding: { ...environmentBinding, jobBindingHash: rejectedPlan.jobBindingHash, parameterDefinitionsHash: rejectedPlan.parameterDefinitionsHash },
      preDeployMockGate: { ...preDeployMockGate, checkCommand: scenario.command,
        jobBindingHash: rejectedPlan.jobBindingHash, pipelineContentHash: sha256(pipeline) } }, io), scenario.error);
    assert.equal(calls.includes('jenkins_trigger_build'), false, 'unsafe configuration must be refused before any production trigger');
  }
  pipeline = acceptedPipeline;
  const result = await runJenkinsRelease(call, reader, { ...plan, environmentBinding, preDeployMockGate, execute: true, confirmed: true }, io);
  assert.equal(result.state, 'DEPLOYED');
  assert.equal(result.mockArtifactReceipt.state, 'PASSED');
  assert.equal(calls.filter(name => name === 'jenkins_trigger_build').length, 1);
});

test('legitimate feature-to-dev merge can inspect target tree without changing the fixed branch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zan-mock-target-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'feature/mock'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
    git('remote', 'add', 'origin', originUrl); await mkdir(join(root, 'src'));
    await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
    await writeFile(join(root, 'src/page.ts'), 'export const page = 1;\n');
    git('add', '.'); git('commit', '-m', 'base'); const baseSha = git('rev-parse', 'HEAD');
    git('branch', 'develop');
    await writeFile(join(root, 'src/page.ts'), 'export const page = 2;\n');
    await writeFile(join(root, 'src/mock.ts'), '// @mock-module MOCK-list MOCK_ONLY\nexport const rows = [];\n');
    git('add', '.'); git('commit', '-m', 'feature'); const featureSha = git('rev-parse', 'HEAD');
    const request = { repositoryPath: root, sourceRepository: originUrl, baseSha, inspectedPaths: ['.'], mockBindingPaths: ['package.json'], runtimePaths: ['src'] };
    const feature = await inspectMockSource(request);
    const inspected = authorize({ ...request, ...feature, schemaVersion: 1, evidenceRefs: ['E-feature-imports'],
      mockModules: [{ ...active(), paths: ['src/mock.ts'] }] });
    // Create independent dev history and merge entirely inside this disposable
    // fixture. The gate itself never switches or modifies the business branch.
    git('switch', 'develop'); await writeFile(join(root, 'src/other.ts'), 'export const other = 1;\n');
    git('add', '.'); git('commit', '-m', 'independent dev change'); git('merge', '--no-ff', 'feature/mock', '-m', 'merge');
    const delivered = git('rev-parse', 'HEAD'); git('switch', 'feature/mock');
    await assert.rejects(checkMockSafety(inspected, { ...context(), operation: 'test-deploy', jobUrl, sourceSha: delivered, requireCommitted: true }), /目标分支包含额外内容/);
    const target = await inspectMockSource({ ...request, revisionSha: delivered });
    assert.equal(git('branch', '--show-current'), 'feature/mock');
    inspected.deliverySourceEvidence = { deliveredSha: delivered, scopeFingerprint: target.scopeFingerprint,
      contentFingerprint: target.contentFingerprint, evidenceRefs: ['E-target-dependency-review'] };
    const receipt = await checkMockSafety(inspected, { ...context(), operation: 'test-deploy', jobUrl, sourceSha: delivered, requireCommitted: true });
    assert.equal(receipt.deliveredSha, delivered); assert.equal(inspected.sourceSha, featureSha);
    assert.equal((await checkMockSafetySet({ mockSafety: inspected, requiredRepositories: [originUrl],
      gitDeliveryReceipts: [{ state: 'MERGED', containment: true, originUrl, sourceSha: featureSha, deliveredSha: delivered, targetBranch: 'develop' }] },
      { ...context(), sourceRepository: undefined, sourceSha: undefined, operation: 'test-wiki', requireCommitted: true })).length, 1);
    git('switch', '-c', 'target-mock-drift', 'develop');
    await writeFile(join(root, 'src/mock.ts'), '// @mock-module MOCK-list MOCK_ONLY\nexport const rows = [999];\n');
    git('add', '.'); git('commit', '-m', 'same ID changed Mock data'); const changedMock = git('rev-parse', 'HEAD'); git('switch', 'feature/mock');
    const driftTarget = await inspectMockSource({ ...request, revisionSha: changedMock });
    inspected.deliverySourceEvidence = { deliveredSha: changedMock, scopeFingerprint: driftTarget.scopeFingerprint,
      contentFingerprint: driftTarget.contentFingerprint, evidenceRefs: ['E-target-review'] };
    await assert.rejects(checkMockSafety(inspected, { ...context(), operation: 'test-deploy', jobUrl, sourceSha: changedMock, requireCommitted: true }), /改变了已批准源码/);
    git('switch', 'develop'); await writeFile(join(root, 'src/new.mock.ts'), '// @mock-module MOCK-new MOCK_ONLY\nexport const x = 1;\n');
    git('add', '.'); git('commit', '-m', 'new target mock'); const bad = git('rev-parse', 'HEAD'); git('switch', 'feature/mock');
    const badTarget = await inspectMockSource({ ...request, revisionSha: bad });
    inspected.deliverySourceEvidence = { deliveredSha: bad, scopeFingerprint: badTarget.scopeFingerprint,
      contentFingerprint: badTarget.contentFingerprint, evidenceRefs: ['E-target-review'] };
    await assert.rejects(checkMockSafety(inspected, { ...context(), operation: 'test-deploy', jobUrl, sourceSha: bad, requireCommitted: true }), /标识未关联|未登记/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('actual environment mapping is independent of canary/test labels and stays bound to current Job and policy source', async () => {
  const input = { jobUrl, targetEnvironment: 'test', releaseChannel: 'canary' };
  const actual = { jobBindingHash: sha256('actual job identity'), parameterDefinitionsHash: sha256('actual params') };
  await assert.rejects(checkDeliveryEnvironment(input, actual, fixtureMockIo), /目标环境证据/);
  const mappingText = JSON.stringify({ ...input, environmentKind: 'production' });
  const binding = { kind: 'project-policy', ...JSON.parse(mappingText), sourcePath: '/fixture/AGENTS.md', sourceHash: sha256(mappingText), mappingText,
    ...actual, evidenceRefs: ['E-project-policy'] };
  assert.equal(await checkDeliveryEnvironment({ ...input, environmentBinding: binding }, actual, fixtureMockIo), 'production');
  await assert.rejects(checkDeliveryEnvironment({ ...input, environmentBinding: binding }, { ...actual, jobBindingHash: sha256('different job') }, fixtureMockIo), /目标环境证据/);
  await assert.rejects(checkDeliveryEnvironment({ ...input, environmentBinding: binding }, actual, { readMockEnvironmentSource: async () => 'changed' }), /来源内容已变化/);
});

test('production checker command cannot swallow failures or use a different unreviewed checker', () => {
  for (const command of ['check || true', 'check; true', '! check', 'check\ndeploy', '$(check)', 'check | cat']) {
    const xml = canonicalPipeline(command + ' && deploy');
    const hash = sha256(xml);
    assert.throws(() => checkPreDeployMockGate({ expectedSha: sourceSha, sourceRepository: originUrl, jobUrl, preDeployMockGate: { state: 'VERIFIED',
      sourceSha, jobUrl, jobBindingHash: hash, pipelineContentHash: hash, checkCommand: command, deployStep: 'deploy',
      evidenceRefs: ['E-config'], checkerEvidence: checkerEvidence(), failClosed: true, beforeDeploy: true, artifactMarker: 'MOCK_PRODUCTION_GATE' } }, hash, xml));
  }
});

test('production checker evidence must describe the exact script revision in the actual release checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zan-mock-checker-revision-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'feature/checker'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
    git('remote', 'add', 'origin', originUrl); await mkdir(join(root, 'scripts'));
    const scriptPath = 'scripts/check-mock.mjs';
    const checkedBody = '// MOCK_PRODUCTION_GATE: reviewed artifact inspection and fail-closed behavior\nexport const inspect = artifact => artifact.remainingMockPaths.length === 0;\n';
    await writeFile(join(root, scriptPath), checkedBody); git('add', '.'); git('commit', '-m', 'reviewed checker');
    const reviewedSha = git('rev-parse', 'HEAD');
    const pipeline = canonicalPipeline('node scripts/check-mock.mjs && deploy-production', { revision: reviewedSha, checkerHash: sha256(checkedBody) });
    const hash = sha256(pipeline);
    const gate = { state: 'VERIFIED', jobBindingHash: hash, pipelineContentHash: hash, sourceSha: reviewedSha, jobUrl,
      checkCommand: 'node scripts/check-mock.mjs', deployStep: 'deploy-production', evidenceRefs: ['E-current-config'],
      failClosed: true, beforeDeploy: true, artifactMarker: 'MOCK_PRODUCTION_GATE', checkerEvidence: { repositoryPath: root,
        sourceRepository: originUrl, sourceSha: reviewedSha, scriptPath, contentHash: sha256(checkedBody), evidenceRefs: ['E-reviewer-checked-exact-checker-code'] } };
    const input = { sourceRepository: originUrl, expectedSha: reviewedSha, jobUrl, preDeployMockGate: gate };
    assert.equal(checkPreDeployMockGate(input, hash, pipeline), gate);
    assert.equal((await verifyMockCheckerEvidence(gate)).sourceSha, reviewedSha);
    await writeFile(join(root, scriptPath), '// MOCK_PRODUCTION_GATE: now always accepts\nexport const inspect = () => true;\n');
    git('add', '.'); git('commit', '-m', 'changed checker at same path'); const changedSha = git('rev-parse', 'HEAD');
    const stale = { ...input, expectedSha: changedSha, preDeployMockGate: { ...gate, sourceSha: changedSha } };
    assert.throws(() => checkPreDeployMockGate(stale, hash, pipeline), /本次实际发布仓库和源码 SHA/);
    const wrongRepository = { ...input, preDeployMockGate: { ...gate, checkerEvidence: { ...gate.checkerEvidence,
      sourceRepository: 'https://git.example.test/team/other-checker.git' } } };
    assert.throws(() => checkPreDeployMockGate(wrongRepository, hash, pipeline), /本次实际发布仓库和源码 SHA/);
    await assert.rejects(verifyMockCheckerEvidence({ ...gate, checkerEvidence: { ...gate.checkerEvidence, sourceSha: changedSha } }), /源码已变化/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('production pipeline cannot run a checker from an implicit, stale or dirty CI workspace', () => {
  const command = 'node scripts/check-mock.mjs && deploy-production';
  for (const options of [{ checkout: false }, { clean: false }, { revision: targetSha },
    { revision: 'master' }, { repository: 'https://git.example.test/team/other.git' }]) {
    const xml = canonicalPipeline(command, options), hash = sha256(xml);
    const gate = { state: 'VERIFIED', jobBindingHash: hash, pipelineContentHash: hash, sourceSha, jobUrl,
      checkCommand: 'node scripts/check-mock.mjs', deployStep: 'deploy-production', evidenceRefs: ['E-pipeline'],
      failClosed: true, beforeDeploy: true, checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE' };
    assert.throws(() => checkPreDeployMockGate({ sourceRepository: originUrl, expectedSha: sourceSha, jobUrl, preDeployMockGate: gate }, hash, xml), /清空 CI 工作区/);
  }
  const xml = canonicalPipeline(command, { buildCommand: 'npm run build' }), hash = sha256(xml);
  const gate = { state: 'VERIFIED', jobBindingHash: hash, pipelineContentHash: hash, sourceSha, jobUrl,
    buildCommand: 'npm run build', checkCommand: 'node scripts/check-mock.mjs', deployStep: 'deploy-production', evidenceRefs: ['E-pipeline'],
    failClosed: true, beforeDeploy: true, checkerEvidence: checkerEvidence(), artifactMarker: 'MOCK_PRODUCTION_GATE' };
  assert.equal(checkPreDeployMockGate({ sourceRepository: originUrl, expectedSha: sourceSha, jobUrl, preDeployMockGate: gate }, hash, xml), gate);
});

test('runtime checker integrity stops deployment when a build replaces the reviewed script', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zan-mock-checker-integrity-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const scriptPath = 'scripts/check-mock.mjs';
  const checkedBody = '// MOCK_PRODUCTION_GATE\nthrow new Error("unsafe artifact");\n';
  const replacement = '// MOCK_PRODUCTION_GATE\nprocess.exit(0);\n';
  try {
    git('init', '-b', 'feature/checker-integrity'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
    git('remote', 'add', 'origin', originUrl); await mkdir(join(root, 'scripts'));
    await writeFile(join(root, scriptPath), checkedBody);
    await writeFile(join(root, 'scripts/always-pass.mjs'), replacement);
    git('add', '.'); git('commit', '-m', 'reviewed artifact checker');
    const revision = git('rev-parse', 'HEAD'), contentHash = sha256(checkedBody);
    const buildCommand = 'cp scripts/always-pass.mjs scripts/check-mock.mjs';
    const xml = canonicalPipeline('node scripts/check-mock.mjs && touch deployed', { revision, buildCommand, checkerHash: contentHash });
    const gate = { ...productionGate(xml), sourceSha: revision, buildCommand, deployStep: 'touch deployed',
      checkerEvidence: { ...checkerEvidence(), repositoryPath: root, sourceSha: revision, contentHash } };
    const input = { ...productionInput(gate), expectedSha: revision };
    assert.equal(checkPreDeployMockGate(input, sha256(xml), xml), gate);
    assert.equal((await verifyMockCheckerEvidence(gate)).contentHash, contentHash);
    const integrity = `sha256sum -- ${scriptPath} | grep -Fx -- "${contentHash}  ${scriptPath}"`;
    const unguarded = xml.replace(integrity.replaceAll('&', '&amp;') + ' &amp;&amp; ', '');
    const staleHash = xml.replace(contentHash, 'e'.repeat(64));
    for (const config of [unguarded, staleHash]) {
      const changedGate = { ...gate, jobBindingHash: sha256(config), pipelineContentHash: sha256(config) };
      assert.throws(() => checkPreDeployMockGate({ ...input, preDeployMockGate: changedGate }, sha256(config), config), /实际 SHA-256 内容/);
    }
    // Run only the disposable local shell, never Jenkins or a real deploy.
    // The build really overwrites the checked file; the next hash check must
    // fail before the now-always-successful replacement and deploy marker run.
    const shell = [buildCommand, integrity, gate.checkCommand, gate.deployStep].join(' && ');
    assert.throws(() => execFileSync('sh', ['-c', shell], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }), error => error.status === 1);
    assert.equal(await readFile(join(root, scriptPath), 'utf8'), replacement);
    await assert.rejects(readFile(join(root, 'deployed')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
