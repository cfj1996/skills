import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectMockSource, checkMockSafety, checkMockSafetySet, mockInventoryFingerprint,
  verifyProductionMockArtifact } from '../scripts/mock-safety.mjs';
import { mergeReviewedBranch } from '../scripts/merge-reviewed-branch.mjs';
import { registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { noMockFixture, fixtureMockIo, projectMockFixture, projectSourceReceipt } from './helpers/mock-safety-fixture.mjs';
import { sha256 } from '../scripts/workflow-runtime.mjs';

const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40);
const originUrl = 'https://git.example.test/team/demo.git';
const jobUrl = 'https://ci.example.test/job/demo-test/';
const context = () => ({ environmentKind: 'test', operation: 'git-delivery', purpose: 'deliver reviewed code', targetEnvironment: 'test', targetBranch: 'develop',
  sourceRepository: originUrl, sourceSha });
const active = () => ({ id: 'MOCK-list', marker: 'MOCK_ONLY', status: 'active', featureRefs: ['F-list'], taskRefs: [],
  paths: ['src/list.mock.ts'], mode: 'function-data', scenarios: ['success'], activation: 'development data-source config; restart resets data',
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

test('production artifact receipts bind the executed project checker and exact resulting build', () => {
  const projectMockGate = projectMockFixture({ sourceRepository: originUrl, expectedSha: sourceSha });
  const projectMockSourceReceipt = projectSourceReceipt(projectMockGate);
  const input = { expectedSha: sourceSha, sourceRepository: originUrl, jobUrl, projectMockGate, projectMockSourceReceipt };
  const receipt = { ...projectMockSourceReceipt, phase: 'artifact', jobUrl, queueId: 9, buildNumber: 3,
    artifactFingerprint: sha256('artifact'), beforeDeploy: true };
  assert.equal(verifyProductionMockArtifact('MOCK_PRODUCTION_GATE ' + JSON.stringify(receipt), input, 9, 3).state, 'PASSED');
  for (const change of [{ queueId: 8 }, { sourceSha: targetSha }, { remainingMockPaths: ['fixture.json'] },
    { runtimeEnabled: true }, { beforeDeploy: false }, { checkerHash: sha256('other checker') },
    { configHash: sha256('other policy') }, { sourceFingerprint: sha256('different source') }]) {
    assert.throws(() => verifyProductionMockArtifact('MOCK_PRODUCTION_GATE ' + JSON.stringify({ ...receipt, ...change }), input, 9, 3), /未通过|回执/);
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
