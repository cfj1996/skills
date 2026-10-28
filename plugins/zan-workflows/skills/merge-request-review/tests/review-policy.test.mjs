import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { classifyAdoption, evaluateMergeReadiness as evaluateActualMergeReadiness,
  evaluateApprovalReadiness as evaluateActualApprovalReadiness } from '../scripts/review-policy.mjs';
import { inspectMockSource, mockInventoryFingerprint } from '../../../scripts/mock-safety.mjs';
import { noMockFixture, fixtureMockIo } from '../../../tests/helpers/mock-safety-fixture.mjs';

const skillRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');

const read = (file) => readFile(file, 'utf8');
const currentChange = { sourceSha: 'a'.repeat(40), targetSha: 'b'.repeat(40), documentHashes: {},
  sourceRepository: 'https://git.example.test/team/demo.git', targetBranch: 'main',
  purpose: 'Review and merge this exact MR', scopeFingerprint: noMockFixture().scopeFingerprint };
const evaluateMergeReadiness = input => evaluateActualMergeReadiness(input, fixtureMockIo);
const evaluateApprovalReadiness = input => evaluateActualApprovalReadiness(input, fixtureMockIo);
const reviewBinding = { mergePermission: 'allowed', currentChange, mockSafety: noMockFixture({ sourceRepository: currentChange.sourceRepository, sourceSha: currentChange.sourceSha }), changeReview: { ...currentChange,
  scope: { status: 'pass', evidence: ['维护范围与当前 diff 一致'] },
  impact: { status: 'pass', evidence: ['已检查实际影响及验证'] },
  documentation: { status: 'not-required', exemption: 'NOT_APPLICABLE', evidence: ['非提测维护'] },
} };

test('renamed CLI reviews an ordinary project without central config or a project allowlist', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'merge-request-review-'));
  try {
    const run = (command, payload) => JSON.parse(execFileSync(process.execPath, [
      resolve(skillRoot, 'scripts/review-policy.mjs'), command, JSON.stringify(payload),
    ], {
      cwd: workspace,
      env: { ...process.env, PROJECT_KNOWLEDGE_ROOT: resolve(workspace, 'unregistered-knowledge') },
      encoding: 'utf8',
    }));
    const git = args => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' }).trim();
    git(['init', '-q', '--initial-branch=feature/test']);
    git(['config', 'user.name', 'Fixture']);
    git(['config', 'user.email', 'fixture@example.test']);
    git(['remote', 'add', 'origin', currentChange.sourceRepository]);
    await mkdir(resolve(workspace, 'src'));
    await writeFile(resolve(workspace, 'package.json'), '{}\n');
    await writeFile(resolve(workspace, 'src/app.js'), 'export const value = 1;\n');
    git(['add', '.']); git(['commit', '-qm', 'base']);
    const baseSha = git(['rev-parse', 'HEAD']);
    await writeFile(resolve(workspace, 'src/app.js'), 'export const value = 2;\n');
    git(['add', '.']); git(['commit', '-qm', 'change']);
    const sourceSha = git(['rev-parse', 'HEAD']);
    const inspectionInput = { repositoryPath: workspace, sourceRepository: currentChange.sourceRepository,
      baseSha, inspectedPaths: ['.'], mockBindingPaths: ['package.json'], runtimePaths: ['src'] };
    const snapshot = await inspectMockSource(inspectionInput);
    const mockSafety = { ...inspectionInput, ...snapshot, schemaVersion: 1, sourceSha,
      mockModules: [], evidenceRefs: ['fixture: complete MR source, imports and activation reviewed; no Mock'] };
    const actualChange = { ...currentChange, sourceSha, targetSha: baseSha, scopeFingerprint: snapshot.scopeFingerprint };
    const mode = run('classify-adoption', { agentDocument: 'missing', adoptionDocument: 'missing' });
    assert.equal(mode.reviewMode, 'ordinary');
    const cliInput = {
      ...reviewBinding, currentChange: actualChange, mockSafety,
      changeReview: { ...reviewBinding.changeReview, sourceSha, targetSha: baseSha },
      codeReview: 'pass', safety: 'pass', mergeability: 'mergeable',
      pipeline: 'none', pipelineRequired: false, approval: 'not-required',
      unresolvedDiscussions: false, zanStatus: mode.zanStatus,
    };
    assert.deepEqual(run('evaluate-merge', cliInput), { mergeAllowed: true, blockers: [] });
    const pendingApproval = { ...cliInput, approval: 'required-missing', approvePermission: 'allowed' };
    assert.deepEqual(run('evaluate-approve', pendingApproval), { approvalAllowed: true, blockers: [] });
    assert.deepEqual(run('evaluate-merge', pendingApproval), { mergeAllowed: false, blockers: ['approval'] });
  }
  finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('not-adopted projects use ordinary review and do not inherit a Zan blocker', async () => {
  const fixture = await read(resolve(skillRoot, 'tests/fixtures/missing-project-configuration.yaml'));
  const mode = classifyAdoption({
    agentDocument: 'missing',
    adoptionDocument: 'missing',
  });

  assert.deepEqual(mode, {
    reviewMode: 'ordinary',
    zanStatus: 'not-adopted',
    codeReviewContinues: true,
    zanMatrixRequired: false,
    governanceBlocksMerge: false,
  });
  assert.match(fixture, /reviewMode: ordinary/);
  assert.match(fixture, /mergeAllowed: subject-to-ordinary-review-gates/);
  assert.match(fixture, /safetyChecksStillRun: true/);
  assert.match(fixture, /missingPipelineBlocksByDefault: false/);
});

test('declared but broken Zan adoption keeps code review alive and blocks only governance', async () => {
  const fixture = await read(resolve(skillRoot, 'tests/fixtures/broken-zan-adoption.yaml'));
  const mode = classifyAdoption({
    agentDocument: 'present',
    adoptionDocument: 'missing',
    adoptionDeclared: true,
  });

  assert.equal(mode.reviewMode, 'ordinary-with-zan-warning');
  assert.equal(mode.zanStatus, 'misconfigured');
  assert.equal(mode.codeReviewContinues, true);
  assert.equal(mode.governanceBlocksMerge, true);
  assert.match(fixture, /codeConclusionIndependent: true/);
});

test('valid declared adoption enables Zan-enhanced review', async () => {
  const mode = classifyAdoption({
    agentDocument: 'present',
    adoptionDocument: 'valid',
    adoptionDeclared: true,
  });
  assert.deepEqual(mode, {
    reviewMode: 'zan-enhanced',
    zanStatus: 'adopted',
    codeReviewContinues: true,
    zanMatrixRequired: true,
    governanceBlocksMerge: false,
  });
});

test('admin-only adoption does not gate an excluded CLI change with verified scope evidence', async () => {
  const mode = classifyAdoption({
    agentDocument: 'present',
    adoptionDocument: 'valid',
    adoptionDeclared: true,
    adoptionScope: 'not-applicable',
    scopeEvidence: ['HEAD:AGENTS.md and standard-adoption.yaml cover apps/admin only; the full diff and affected consumers are confined to packages/cli'],
  });
  assert.deepEqual(mode, {
    reviewMode: 'ordinary',
    zanStatus: 'not-adopted',
    codeReviewContinues: true,
    zanMatrixRequired: false,
    governanceBlocksMerge: false,
  });
  const gates = { ...reviewBinding, codeReview: 'pass', safety: 'pass',
    mergeability: 'mergeable', pipeline: 'success', pipelineRequired: true,
    approval: 'not-required', unresolvedDiscussions: false, zanStatus: mode.zanStatus };
  assert.deepEqual(await evaluateMergeReadiness(gates), { mergeAllowed: true, blockers: [] });
  assert.deepEqual(await evaluateMergeReadiness({ ...gates, safety: 'unknown', pipeline: 'failed' }), {
    mergeAllowed: false, blockers: ['safety', 'pipeline-failed'],
  });
});

test('unknown adoption scope cannot inherit a valid root adoption or bypass governance', async () => {
  const mode = classifyAdoption({
    agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
    adoptionScope: 'unknown',
  });
  assert.equal(mode.zanStatus, 'unknown');
  assert.equal(mode.governanceBlocksMerge, true);
  assert.deepEqual(await evaluateMergeReadiness({ ...reviewBinding,
    codeReview: 'pass', safety: 'pass', mergeability: 'mergeable', zanStatus: mode.zanStatus,
  }), { mergeAllowed: false, blockers: ['zan-governance'] });
});

test('an exclusion without concrete scope evidence remains unknown', async () => {
  for (const scopeEvidence of [undefined, null, [], [''], ['  '], 'outside', [null], ['scope checked', 1]]) {
    const mode = classifyAdoption({
      agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
      adoptionScope: 'not-applicable', scopeEvidence,
    });
    assert.equal(mode.zanStatus, 'unknown', JSON.stringify(scopeEvidence));
    assert.equal(mode.governanceBlocksMerge, true);
  }
});

test('verified exclusions isolate unrelated broken configuration while applicable failures still block', async () => {
  const facts = { agentDocument: 'present', adoptionDocument: 'invalid', adoptionDeclared: true };
  assert.equal(classifyAdoption({ ...facts, adoptionScope: 'applicable' }).zanStatus, 'misconfigured');
  assert.equal(classifyAdoption(facts).zanStatus, 'misconfigured');
  assert.equal(classifyAdoption({ ...facts, adoptionScope: 'not-applicable',
    scopeEvidence: ['The readable inherited project rule explicitly limits this declaration to apps/admin; packages/cli has no applicable adoption'],
  }).zanStatus, 'not-adopted');
});

test('scope values are validated and omitted scope preserves existing classification', async () => {
  const facts = { agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true };
  assert.deepEqual(classifyAdoption(facts), classifyAdoption({ ...facts, adoptionScope: 'applicable' }));
  for (const adoptionScope of [null, false, '', 'outside', [], {}]) {
    assert.throws(() => classifyAdoption({ ...facts, adoptionScope }), /adoptionScope/);
  }
});

test('classify-adoption CLI preserves root file facts while applying a verified exclusion', async () => {
  const input = { agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
    adoptionScope: 'not-applicable', scopeEvidence: ['Root adoption covers apps/admin; verified change affects packages/cli only'] };
  const mode = JSON.parse(execFileSync(process.execPath, [
    resolve(skillRoot, 'scripts/review-policy.mjs'), 'classify-adoption', JSON.stringify(input),
  ], { encoding: 'utf8' }));
  assert.equal(mode.zanStatus, 'not-adopted');
  assert.equal(mode.zanMatrixRequired, false);
});

test('missing pipeline is informational unless the project requires it', async () => {
  const ordinary = await evaluateMergeReadiness({
    ...reviewBinding,
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    pipeline: 'none',
    pipelineRequired: false,
    zanStatus: 'not-adopted',
  });
  assert.deepEqual(ordinary, { mergeAllowed: true, blockers: [] });

  const required = await evaluateMergeReadiness({
    ...reviewBinding,
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    pipeline: 'none',
    pipelineRequired: true,
    zanStatus: 'not-adopted',
  });
  assert.deepEqual(required, { mergeAllowed: false, blockers: ['pipeline-missing'] });
});

test('Zan governance and code findings remain independent merge blockers', async () => {
  const result = await evaluateMergeReadiness({
    ...reviewBinding,
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    zanStatus: 'misconfigured',
  });
  assert.deepEqual(result, { mergeAllowed: false, blockers: ['zan-governance'] });
});

const passingReview = {
  ...reviewBinding,
  codeReview: 'pass',
  safety: 'pass',
  mergeability: 'mergeable',
};

test('merge eligibility requires explicit verified merge permission', async () => {
  const withoutPermission = { ...passingReview };
  delete withoutPermission.mergePermission;
  assert.deepEqual(await evaluateMergeReadiness(withoutPermission), {
    mergeAllowed: false, blockers: ['merge-permission'],
  });
  for (const mergePermission of ['denied', 'unknown', undefined, null, true, 'approved', '', {}]) {
    assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, mergePermission }), {
      mergeAllowed: false, blockers: ['merge-permission'],
    }, JSON.stringify(mergePermission));
  }
});

test('merge permission and MR approvals cannot substitute for other merge gates', async () => {
  assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, approval: 'required-missing' }), {
    mergeAllowed: false, blockers: ['approval'],
  });
  assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, mergePermission: 'denied', approval: 'approved' }), {
    mergeAllowed: false, blockers: ['merge-permission'],
  });
  assert.deepEqual(await evaluateMergeReadiness({
    ...passingReview, mergePermission: 'denied', codeReview: 'blocker', pipeline: 'failed',
  }), { mergeAllowed: false, blockers: ['code', 'merge-permission', 'pipeline-failed'] });
});

const pendingApproval = { ...passingReview, approval: 'required-missing', approvePermission: 'allowed' };

test('a missing required approval permits an authorized approval check but still blocks merging', async () => {
  assert.deepEqual(await evaluateApprovalReadiness(pendingApproval), { approvalAllowed: true, blockers: [] });
  assert.deepEqual(await evaluateMergeReadiness(pendingApproval), { mergeAllowed: false, blockers: ['approval'] });
  assert.equal(pendingApproval.approval, 'required-missing', 'the checker must preserve the actual unmet approval state');
});

test('approval checks require an independently verified approve permission', async () => {
  const withoutPermission = { ...pendingApproval };
  delete withoutPermission.approvePermission;
  assert.deepEqual(await evaluateApprovalReadiness(withoutPermission), {
    approvalAllowed: false, blockers: ['approve-permission'],
  });
  for (const approvePermission of ['denied', 'unknown', undefined, null, true, 'approved', '', {}]) {
    assert.deepEqual(await evaluateApprovalReadiness({ ...pendingApproval, approvePermission }), {
      approvalAllowed: false, blockers: ['approve-permission'],
    }, JSON.stringify(approvePermission));
  }
});

test('approval checks reject unknown approval requirements rather than assuming they can be satisfied', async () => {
  for (const approval of ['unknown', 'pending', '', null, true, {}]) {
    assert.deepEqual(await evaluateApprovalReadiness({ ...pendingApproval, approval }), {
      approvalAllowed: false, blockers: ['approval'],
    }, JSON.stringify(approval));
  }
});

test('permission to approve does not waive code, safety, project, documentation or Mock gates', async () => {
  for (const [patch, blockers] of [
    [{ codeReview: 'blocker' }, ['code']],
    [{ safety: 'unknown' }, ['safety']],
    [{ mergeability: 'unknown' }, ['mergeability']],
    [{ mergePermission: 'denied' }, ['merge-permission']],
    [{ pipeline: 'failed' }, ['pipeline-failed']],
    [{ pipelineRequired: true }, ['pipeline-missing']],
    [{ unresolvedDiscussions: true }, ['unresolved-discussions']],
    [{ zanStatus: 'misconfigured' }, ['zan-governance']],
    [{ changeReview: { ...reviewBinding.changeReview,
      documentation: { status: 'fail', evidence: ['required migration document does not cover the current API change'] } } },
    ['change-documentation']],
    [{ mockSafety: undefined }, ['mock-safety']],
  ]) {
    const result = await evaluateApprovalReadiness({ ...pendingApproval, ...patch });
    assert.equal(result.approvalAllowed, false, JSON.stringify(patch));
    assert.deepEqual(result.blockers, blockers, JSON.stringify(patch));
    assert.equal('mergeAllowed' in result, false);
  }
});

test('ordinary review binds Issue and required migration docs without a TAPD Wiki', async () => {
  const documentHashes = { 'gitlab:issues/17': 'c'.repeat(64), 'repo:MIGRATION.md': 'd'.repeat(64) };
  const changeReview = { ...reviewBinding.changeReview, documentHashes,
    documentation: { status: 'pass', evidence: ['Issue #17 and MIGRATION.md cover the public API change'] },
  };
  const currentChange = { ...reviewBinding.currentChange, documentHashes };
  assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, changeReview, currentChange }), {
    mergeAllowed: true, blockers: [],
  });
  const changedDocs = { ...currentChange, documentHashes: { ...documentHashes, 'repo:MIGRATION.md': 'e'.repeat(64) } };
  assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, changeReview, currentChange: changedDocs }), {
    mergeAllowed: false, blockers: ['change-documentation-stale'],
  });
});

test('required delivery documentation still blocks when missing or outdated in ordinary mode', async () => {
  for (const [status, blocker] of [['unknown', 'change-documentation-unknown'], ['fail', 'change-documentation']]) {
    const changeReview = { ...reviewBinding.changeReview,
      documentation: { status, evidence: ['Project delivery requires a test Wiki; current behavior is not covered'] },
    };
    assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, zanStatus: 'not-adopted', changeReview }), {
      mergeAllowed: false, blockers: [blocker],
    });
  }
});

test('merge readiness accepts evidenced ordinary and adopted success paths', async () => {
  for (const evidence of [
    {},
    { pipeline: 'pending', pipelineRequired: false, approval: 'not-required' },
    { pipeline: 'success', pipelineRequired: true, approval: 'approved' },
    { zanStatus: 'adopted', zanMust: 'pass', approval: 'approved' },
  ]) {
    assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, ...evidence }), {
      mergeAllowed: true,
      blockers: [],
    });
  }
});

test('required pipelines accept only success and retain existing blocker reasons', async () => {
  for (const [pipeline, reason] of [
    ['none', 'pipeline-missing'],
    ['pending', 'pipeline-pending'],
    ['failed', 'pipeline-failed'],
    ...['running', 'manual', 'canceled', 'skipped', 'unknown', '', null, true, {}]
      .map((state) => [state, 'pipeline-not-success']),
  ]) {
    assert.deepEqual(await evaluateMergeReadiness({
      ...passingReview, pipeline, pipelineRequired: true,
    }), { mergeAllowed: false, blockers: [reason] }, JSON.stringify(pipeline));
  }
});

test('optional pipelines still reject failures and unrecognized or null states', async () => {
  for (const [pipeline, reason] of [
    ['failed', 'pipeline-failed'],
    ...['running', 'manual', 'canceled', 'skipped', 'unknown', '', null, true, {}]
      .map((state) => [state, 'pipeline-unknown']),
  ]) {
    assert.deepEqual(await evaluateMergeReadiness({
      ...passingReview, pipeline, pipelineRequired: false,
    }), { mergeAllowed: false, blockers: [reason] }, JSON.stringify(pipeline));
  }
});

test('review and merge gates reject unsupported and null states', async () => {
  for (const [field, reason] of [
    ['codeReview', 'code-review-incomplete'],
    ['safety', 'safety'],
    ['mergeability', 'mergeability'],
    ['approval', 'approval'],
    ['zanStatus', 'zan-governance'],
  ]) {
    for (const state of ['unknown', 'unexpected-success', '', null, true, {}]) {
      assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, [field]: state }), {
        mergeAllowed: false,
        blockers: [reason],
      }, `${field}=${JSON.stringify(state)}`);
    }
  }
  assert.deepEqual(await evaluateMergeReadiness({
    ...passingReview,
    codeReview: 'blocker',
    approval: 'required-missing',
    zanStatus: 'misconfigured',
  }), { mergeAllowed: false, blockers: ['code', 'approval', 'zan-governance'] });
});

test('adopted projects require explicit Zan MUST success', async () => {
  for (const zanMust of ['fail', 'unknown', 'not-applicable', '', null, true, {}]) {
    assert.deepEqual(await evaluateMergeReadiness({
      ...passingReview, zanStatus: 'adopted', zanMust,
    }), { mergeAllowed: false, blockers: ['zan-must'] }, JSON.stringify(zanMust));
  }
});

test('unknown gate requirements and discussion states cannot bypass merge checks', async () => {
  for (const state of [null, 'false', '', 0, {}]) {
    assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, pipelineRequired: state }), {
      mergeAllowed: false,
      blockers: ['pipeline-requirement-unknown'],
    }, `pipelineRequired=${JSON.stringify(state)}`);
    assert.deepEqual(await evaluateMergeReadiness({ ...passingReview, unresolvedDiscussions: state }), {
      mergeAllowed: false,
      blockers: ['unresolved-discussions'],
    }, `unresolvedDiscussions=${JSON.stringify(state)}`);
  }
});

const mockModule = () => ({ id: 'MOCK-list', marker: 'MOCK_ONLY', status: 'active',
  featureRefs: ['F-list'], taskRefs: [], paths: ['src/list.mock.ts'], mode: 'function-data',
  scenarios: ['success', 'empty'], activation: 'explicit local fixture provider',
  realRequestBoundary: 'list only; save is not called', exitCondition: 'replace with verified real query',
  verificationLimits: ['real query and permissions remain unverified'], authorizationEvidenceRefs: ['human: local Mock scope'],
  exitEvidenceRefs: [] });
const mockInput = (branch = 'main') => ({ ...passingReview,
  currentChange: { ...currentChange, targetBranch: branch, targetEnvironment: 'qa-list', purpose: 'Review and merge this exact MR' },
  mockSafety: { ...reviewBinding.mockSafety, mockModules: [mockModule()] },
});

test('ordinary review cannot infer no Mock from missing inspection or accept a pass flag', async () => {
  for (const patch of [{ mockSafety: undefined }, { mockSafety: true }, { mockSafety: { state: 'VERIFIED' } },
    { mockSafety: { ...reviewBinding.mockSafety, mockModules: undefined } }]) {
    const result = await evaluateMergeReadiness({ ...passingReview, ...patch });
    assert.equal(result.mergeAllowed, false);
    assert.ok(result.blockers.includes('mock-safety'));
  }
});

test('MR Mock inspection binds the current target and complete diff rather than a caller-selected base', async () => {
  for (const currentPatch of [{ targetSha: 'd'.repeat(40) }, { scopeFingerprint: 'e'.repeat(64) },
    { sourceRepository: undefined }, { sourceSha: undefined }, { targetBranch: 'release-next' }, { purpose: '' }]) {
    const result = await evaluateMergeReadiness({ ...passingReview,
      currentChange: { ...currentChange, ...currentPatch } });
    assert.equal(result.mergeAllowed, false);
    assert.ok(result.blockers.includes('mock-safety'));
  }
});

test('caller repository rows cannot override the authoritative MR head', async () => {
  const result = await evaluateMergeReadiness({ ...passingReview,
    mockRepositories: [{ sourceRepository: currentChange.sourceRepository, sourceSha: 'd'.repeat(40) }] });
  assert.equal(result.mergeAllowed, false);
  assert.match(result.mockSafetyError, /冲突/);
});

test('production Mock prohibition applies to non-adopted projects and ordinary pipeline success', async () => {
  const result = await evaluateMergeReadiness({ ...mockInput(), zanStatus: 'not-adopted',
    pipeline: 'success', pipelineRequired: true, approval: 'approved' });
  assert.equal(result.mergeAllowed, false);
  assert.ok(result.blockers.includes('mock-safety'));
  assert.match(result.mockSafetyError, /生产范围仍有 Mock/);
});

test('retired labels and disabled activation do not prove source exit', async () => {
  const input = mockInput();
  input.mockSafety.mockModules[0] = { ...mockModule(), status: 'retired', activation: 'disabled',
    exitEvidenceRefs: ['review: removed from runtime imports'] };
  const result = await evaluateMergeReadiness(input);
  assert.equal(result.mergeAllowed, false);
  assert.match(result.mockSafetyError, /源码退出|隔离证据/);
});

test('isolated development fixtures may remain at source merge with current config and exit evidence', async () => {
  const input = mockInput();
  input.mockSafety.mockModules[0] = { ...mockModule(), status: 'retired',
    exitEvidenceRefs: ['review: real implementation replaced business imports'] };
  const snapshot = await fixtureMockIo.inspectMockSource(input.mockSafety);
  input.mockSafety.productionSourceEvidence = { scopeFingerprint: input.mockSafety.scopeFingerprint,
    evidenceRefs: ['review: runtime imports and build exclusion inspected'], configPaths: ['package.json'],
    configurationFingerprints: { 'package.json': snapshot.fileFingerprints['package.json'] },
    remainingRuntimeMockPaths: [] };
  assert.deepEqual(await evaluateMergeReadiness(input), { mergeAllowed: true, blockers: [] });
});

test('test-target Mock requires exact human scope authorization and cannot inherit ordinary merge approval', async () => {
  const input = mockInput('dev');
  const missing = await evaluateMergeReadiness(input);
  assert.equal(missing.mergeAllowed, false);
  assert.match(missing.mockSafetyError, /明确确认/);
  input.mockSafety.testAuthorization = { decision: 'ALLOW', source: 'human: displayed full Mock test checklist confirmed',
    sourceSha: input.mockSafety.sourceSha, scopeFingerprint: input.mockSafety.scopeFingerprint,
    inventoryFingerprint: mockInventoryFingerprint(input.mockSafety), targetBranch: 'dev', targetEnvironment: 'qa-list',
    purpose: input.currentChange.purpose, operations: ['git-delivery'] };
  assert.deepEqual(await evaluateMergeReadiness(input), { mergeAllowed: true, blockers: [] });
  for (const patch of [{ targetEnvironment: 'qa-other' }, { purpose: 'Different test purpose' }]) {
    const result = await evaluateMergeReadiness({ ...input, currentChange: { ...input.currentChange, ...patch } });
    assert.equal(result.mergeAllowed, false);
    assert.match(result.mockSafetyError, /明确确认/);
  }
  const production = await evaluateMergeReadiness({ ...input, currentChange: { ...input.currentChange, targetBranch: 'main' } });
  assert.equal(production.mergeAllowed, false, 'test permission cannot authorize production');
});
