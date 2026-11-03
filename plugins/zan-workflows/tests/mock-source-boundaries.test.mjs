import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectMockSource, checkMockSafety, checkMockSafetySet, mockInventoryFingerprint } from '../scripts/mock-safety.mjs';

const sourceRepository = 'https://git.example.test/team/mock-boundaries.git';
const purpose = 'deliver the explicitly approved Mock scope';
const module = (id = 'MOCK-list', paths = ['src/mocks']) => ({ id, marker: 'MOCK_ONLY', status: 'active',
  featureRefs: ['F-list'], paths, mode: 'function-data', scenarios: ['success'], activation: 'local development only',
  realRequestBoundary: 'Only list reads use fixtures; mutations remain disabled', exitCondition: 'Replace with confirmed API',
  verificationLimits: ['Real backend behavior remains unverified'] });

async function fixture(body = '// @mock-module MOCK-list MOCK_ONLY\nexport const rows = [1];\n') {
  const root = await mkdtemp(join(tmpdir(), 'zan-mock-boundaries-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'feature/mock'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.test');
  git('remote', 'add', 'origin', sourceRepository);
  await mkdir(join(root, 'src/mocks'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"mock-boundary-fixture"}\n');
  await writeFile(join(root, 'src/page.ts'), 'export const page = 1;\n');
  git('add', '.'); git('commit', '-m', 'base'); const baseSha = git('rev-parse', 'HEAD');
  await writeFile(join(root, 'src/mocks/list.ts'), body);
  git('add', '.'); git('commit', '-m', 'approved Mock'); const sourceSha = git('rev-parse', 'HEAD');
  const request = { repositoryPath: root, sourceRepository, revisionSha: sourceSha, baseSha,
    inspectedPaths: ['.'], runtimePaths: ['src'], mockBindingPaths: ['package.json'] };
  const snapshot = await inspectMockSource(request);
  const safety = { ...request, schemaVersion: 1, sourceSha, scopeFingerprint: snapshot.scopeFingerprint,
    contentFingerprint: snapshot.contentFingerprint, mockModules: [module()], evidenceRefs: ['E-reviewed-project-activation-and-imports'] };
  safety.testAuthorization = { decision: 'ALLOW', source: 'human: approve the exact current inventory for develop', purpose,
    sourceSha, scopeFingerprint: safety.scopeFingerprint, inventoryFingerprint: mockInventoryFingerprint(safety),
    targetEnvironment: 'test', targetBranch: 'develop', operations: ['test-deploy', 'test-wiki'] };
  const context = { environmentKind: 'test', targetEnvironment: 'test', targetBranch: 'develop', purpose,
    operation: 'test-deploy', sourceRepository, sourceSha, requireCommitted: true };
  return { root, git, sourceSha, request, safety, context, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('every stable Mock ID in one source file must be registered for that file', async () => {
  const f = await fixture('// @mock-module MOCK-list MOCK_ONLY\n// @mock-module MOCK-hidden MOCK_ONLY\nexport const rows = [1];\n');
  try {
    await assert.rejects(checkMockSafety(f.safety, f.context), /标识未关联登记/);
    // Registering the second ID against a different path cannot authorize it here.
    f.safety.mockModules.push(module('MOCK-hidden', ['src/page.ts']));
    await assert.rejects(checkMockSafety(f.safety, f.context), /明确稳定标识|标识未关联登记/);
  } finally { await f.cleanup(); }
});

test('a target commit cannot add new files inside an approved Mock directory using an approved ID', async () => {
  const f = await fixture();
  try {
    f.git('switch', '-c', 'develop');
    await writeFile(join(f.root, 'src/mocks/extra.ts'), '// @mock-module MOCK-list MOCK_ONLY\nexport const rows = [999];\n');
    f.git('add', '.'); f.git('commit', '-m', 'target expands existing Mock directory');
    const deliveredSha = f.git('rev-parse', 'HEAD'); f.git('switch', 'feature/mock');
    const target = await inspectMockSource({ ...f.request, revisionSha: deliveredSha });
    f.safety.deliverySourceEvidence = { deliveredSha, scopeFingerprint: target.scopeFingerprint,
      contentFingerprint: target.contentFingerprint, evidenceRefs: ['E-reviewed-target-tree'] };
    await assert.rejects(checkMockSafety(f.safety, { ...f.context, sourceSha: deliveredSha }), /改变了已批准源码或 Mock/);
  } finally { await f.cleanup(); }
});

test('unrelated target source additions do not invalidate unchanged explicitly approved Mock contents', async () => {
  const f = await fixture();
  try {
    f.git('switch', '-c', 'develop');
    await writeFile(join(f.root, 'src/other-feature.ts'), 'export const otherFeature = true;\n');
    f.git('add', '.'); f.git('commit', '-m', 'unrelated target source');
    const deliveredSha = f.git('rev-parse', 'HEAD'); f.git('switch', 'feature/mock');
    const target = await inspectMockSource({ ...f.request, revisionSha: deliveredSha });
    f.safety.deliverySourceEvidence = { deliveredSha, scopeFingerprint: target.scopeFingerprint,
      contentFingerprint: target.contentFingerprint, evidenceRefs: ['E-reviewed-target-dependencies-and-Mock-impact'] };
    const receipt = await checkMockSafety(f.safety, { ...f.context, sourceSha: deliveredSha });
    assert.equal(receipt.state, 'VERIFIED'); assert.equal(receipt.deliveredSha, deliveredSha);
    assert.equal(f.git('branch', '--show-current'), 'feature/mock');
  } finally { await f.cleanup(); }
});

test('each actual Git delivery target branch must match its Mock test authorization', async () => {
  const f = await fixture();
  try {
    const input = { mockSafety: f.safety, requiredRepositories: [sourceRepository], gitDeliveryReceipts: [
      { state: 'VERIFIED', containment: true, sourceRepository, sourceSha: f.sourceSha, deliveredSha: f.sourceSha, targetBranch: 'dev' } ] };
    const context = { ...f.context, sourceRepository: undefined, sourceSha: undefined, targetBranch: undefined, operation: 'test-wiki' };
    await assert.rejects(checkMockSafetySet(input, context), /尚未针对准确范围/);
    input.gitDeliveryReceipts[0].targetBranch = 'develop';
    const receipts = await checkMockSafetySet(input, context);
    assert.equal(receipts.length, 1); assert.equal(receipts[0].state, 'VERIFIED');
  } finally { await f.cleanup(); }
});

async function scopedRelease() {
  const f = await fixture();
  const baseSha = f.sourceSha;
  const inventoryPath = 'dev/mock-inventory.json';
  await mkdir(join(f.root, 'dev'));
  await writeFile(join(f.root, inventoryPath), JSON.stringify({ modules: [
    { id: 'MOCK-list', marker: 'MOCK_ONLY', sourcePaths: ['src/mocks'], activation: 'legacy page demo data' },
  ] }));
  await writeFile(join(f.root, 'src/page.ts'), 'export const disclaimer = "field added";\n');
  f.git('add', '.'); f.git('commit', '-m', 'add field and document existing inventory');
  const sourceSha = f.git('rev-parse', 'HEAD');
  const request = { ...f.request, baseSha, revisionSha: sourceSha,
    runtimePaths: ['src/page.ts'], nonRuntimeInventoryPath: inventoryPath,
    nonRuntimeInventoryEvidenceRefs: ['Reviewed imports and build entry do not consume the inventory JSON'] };
  const safety = async (input = request, mockModules = []) => ({
    ...input, ...await inspectMockSource(input), schemaVersion: 1, mockModules,
    evidenceRefs: ['Reviewed complete feature diff, existing data binding and affected runtime imports'],
  });
  const context = { ...f.context, environmentKind: 'production', targetEnvironment: 'production',
    targetBranch: 'master', sourceSha };
  return { ...f, request, safety, context, inventoryPath };
}

test('an unrelated unchanged legacy Mock and a new non-runtime inventory do not block the field release', async () => {
  const f = await scopedRelease();
  try {
    // Broad audit fingerprints may be retained without treating every legacy
    // declaration in the repository as part of this feature's runtime.
    const safety = await f.safety();
    assert.deepEqual(safety.changedPaths, [f.inventoryPath, 'src/page.ts']);
    assert.deepEqual(safety.markedPaths, []);
    assert.ok(safety.fileFingerprints['src/mocks/list.ts']);
    const receipt = await checkMockSafety(safety, f.context);
    assert.equal(receipt.state, 'VERIFIED');
    assert.deepEqual(receipt.mockModuleIds, []);
    assert.equal(receipt.productionArtifactVerified, false);
    await writeFile(join(f.root, 'src/concurrent.mock.ts'), '// @mock-module MOCK-other MOCK_ONLY\n');
    assert.equal((await checkMockSafety(safety, f.context)).state, 'VERIFIED');
  } finally { await f.cleanup(); }
});

test('new declarations outside a narrow runtime selection remain part of the complete delivery diff', async () => {
  const f = await scopedRelease();
  try {
    await writeFile(join(f.root, 'src/new.mock.ts'), '// @mock-module MOCK-new MOCK_ONLY\nexport const rows = [1];\n');
    f.git('add', '.'); f.git('commit', '-m', 'new Mock in another source path');
    const revisionSha = f.git('rev-parse', 'HEAD');
    const safety = await f.safety({ ...f.request, revisionSha });
    assert.deepEqual(safety.markedPaths, ['src/new.mock.ts']);
    await assert.rejects(checkMockSafety(safety, { ...f.context, sourceSha: revisionSha }), /未登记|标识未关联/);
  } finally { await f.cleanup(); }
});

test('an unchanged Mock in the affected dependency scope still requires production isolation', async () => {
  const f = await scopedRelease();
  try {
    const request = { ...f.request, runtimePaths: [...f.request.runtimePaths, 'src/mocks'] };
    const snapshot = await inspectMockSource(request);
    const original = await inspectMockSource(f.request);
    assert.notEqual(snapshot.scopeFingerprint, original.scopeFingerprint);
    const safety = await f.safety(request, [module()]);
    assert.deepEqual(safety.markedPaths, ['src/mocks/list.ts']);
    await assert.rejects(checkMockSafety(safety, f.context), /生产范围仍有 Mock/);
  } finally { await f.cleanup(); }
});

test('editing a legacy Mock makes it part of this delivery even outside the selected runtime paths', async () => {
  const f = await scopedRelease();
  try {
    await writeFile(join(f.root, 'src/mocks/list.ts'), '// @mock-module MOCK-list MOCK_ONLY\nexport const rows = [999];\n');
    f.git('add', '.'); f.git('commit', '-m', 'modify legacy simulated behavior');
    const revisionSha = f.git('rev-parse', 'HEAD');
    const safety = await f.safety({ ...f.request, revisionSha });
    assert.deepEqual(safety.markedPaths, ['src/mocks/list.ts']);
    await assert.rejects(checkMockSafety(safety, { ...f.context, sourceSha: revisionSha }), /未登记|标识未关联/);
  } finally { await f.cleanup(); }
});

test('an explicit production dependency is inspected even when stored under a tests directory', async () => {
  const f = await fixture();
  try {
    const dependency = 'src/tests/MockClient.ts';
    await mkdir(join(f.root, 'src/tests'));
    await writeFile(join(f.root, dependency), '// @mock-module MOCK-tests MOCK_ONLY\nexport const rows = [1];\n');
    f.git('add', '.'); f.git('commit', '-m', 'isolated test dependency');
    const baseSha = f.git('rev-parse', 'HEAD');
    await writeFile(join(f.root, 'src/page.ts'), 'export { rows } from "./tests/MockClient";\n');
    f.git('add', '.'); f.git('commit', '-m', 'connect old test dependency to production page');
    const sourceSha = f.git('rev-parse', 'HEAD');
    const request = { ...f.request, baseSha, revisionSha: sourceSha, runtimePaths: ['src/page.ts', dependency] };
    const safety = { ...request, ...await inspectMockSource(request), schemaVersion: 1,
      mockModules: [], evidenceRefs: ['Reviewed changed production import and its exact dependency'] };
    const context = { ...f.context, sourceSha, environmentKind: 'production', targetEnvironment: 'production', targetBranch: 'master' };
    assert.deepEqual(safety.markedPaths, [dependency]);
    await assert.rejects(checkMockSafety(safety, context), /未登记|标识未关联/);
    safety.mockModules = [module('MOCK-tests', [dependency])];
    await assert.rejects(checkMockSafety(safety, context), /生产范围仍有 Mock/);
  } finally { await f.cleanup(); }
});

test('non-runtime inventory metadata cannot hide an actual runtime or activation input', async () => {
  const f = await scopedRelease();
  try {
    for (const patch of [
      { nonRuntimeInventoryEvidenceRefs: [] },
      { runtimePaths: [...f.request.runtimePaths, 'dev'] },
      { mockBindingPaths: ['package.json', f.inventoryPath] },
      { mockModules: [module('MOCK-list', [f.inventoryPath])] },
    ]) {
      await assert.rejects(inspectMockSource({ ...f.request, ...patch }), /库存元数据/);
    }
    await writeFile(join(f.root, f.inventoryPath), '{"rows":[1,2,3]}');
    f.git('add', '.'); f.git('commit', '-m', 'replace inventory with fixture data');
    await assert.rejects(inspectMockSource({ ...f.request, revisionSha: f.git('rev-parse', 'HEAD') }), /库存 JSON/);
  } finally { await f.cleanup(); }
});
