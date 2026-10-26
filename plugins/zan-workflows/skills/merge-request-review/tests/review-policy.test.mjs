import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { classifyAdoption, evaluateMergeReadiness } from '../scripts/review-policy.mjs';

const skillRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');

const read = (file) => readFile(file, 'utf8');
const currentChange = { sourceSha: 'a'.repeat(40), targetSha: 'b'.repeat(40), documentHashes: {} };
const reviewBinding = { currentChange, changeReview: { ...currentChange,
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
    const mode = run('classify-adoption', { agentDocument: 'missing', adoptionDocument: 'missing' });
    assert.equal(mode.reviewMode, 'ordinary');
    assert.deepEqual(run('evaluate-merge', {
      ...reviewBinding,
      codeReview: 'pass', safety: 'pass', mergeability: 'mergeable',
      pipeline: 'none', pipelineRequired: false, approval: 'not-required',
      unresolvedDiscussions: false, zanStatus: mode.zanStatus,
    }), { mergeAllowed: true, blockers: [] });
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

test('valid declared adoption enables Zan-enhanced review', () => {
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

test('admin-only adoption does not gate an excluded CLI change with verified scope evidence', () => {
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
  assert.deepEqual(evaluateMergeReadiness(gates), { mergeAllowed: true, blockers: [] });
  assert.deepEqual(evaluateMergeReadiness({ ...gates, safety: 'unknown', pipeline: 'failed' }), {
    mergeAllowed: false, blockers: ['safety', 'pipeline-failed'],
  });
});

test('unknown adoption scope cannot inherit a valid root adoption or bypass governance', () => {
  const mode = classifyAdoption({
    agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
    adoptionScope: 'unknown',
  });
  assert.equal(mode.zanStatus, 'unknown');
  assert.equal(mode.governanceBlocksMerge, true);
  assert.deepEqual(evaluateMergeReadiness({ ...reviewBinding,
    codeReview: 'pass', safety: 'pass', mergeability: 'mergeable', zanStatus: mode.zanStatus,
  }), { mergeAllowed: false, blockers: ['zan-governance'] });
});

test('an exclusion without concrete scope evidence remains unknown', () => {
  for (const scopeEvidence of [undefined, null, [], [''], ['  '], 'outside', [null], ['scope checked', 1]]) {
    const mode = classifyAdoption({
      agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
      adoptionScope: 'not-applicable', scopeEvidence,
    });
    assert.equal(mode.zanStatus, 'unknown', JSON.stringify(scopeEvidence));
    assert.equal(mode.governanceBlocksMerge, true);
  }
});

test('verified exclusions isolate unrelated broken configuration while applicable failures still block', () => {
  const facts = { agentDocument: 'present', adoptionDocument: 'invalid', adoptionDeclared: true };
  assert.equal(classifyAdoption({ ...facts, adoptionScope: 'applicable' }).zanStatus, 'misconfigured');
  assert.equal(classifyAdoption(facts).zanStatus, 'misconfigured');
  assert.equal(classifyAdoption({ ...facts, adoptionScope: 'not-applicable',
    scopeEvidence: ['The readable inherited project rule explicitly limits this declaration to apps/admin; packages/cli has no applicable adoption'],
  }).zanStatus, 'not-adopted');
});

test('scope values are validated and omitted scope preserves existing classification', () => {
  const facts = { agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true };
  assert.deepEqual(classifyAdoption(facts), classifyAdoption({ ...facts, adoptionScope: 'applicable' }));
  for (const adoptionScope of [null, false, '', 'outside', [], {}]) {
    assert.throws(() => classifyAdoption({ ...facts, adoptionScope }), /adoptionScope/);
  }
});

test('classify-adoption CLI preserves root file facts while applying a verified exclusion', () => {
  const input = { agentDocument: 'present', adoptionDocument: 'valid', adoptionDeclared: true,
    adoptionScope: 'not-applicable', scopeEvidence: ['Root adoption covers apps/admin; verified change affects packages/cli only'] };
  const mode = JSON.parse(execFileSync(process.execPath, [
    resolve(skillRoot, 'scripts/review-policy.mjs'), 'classify-adoption', JSON.stringify(input),
  ], { encoding: 'utf8' }));
  assert.equal(mode.zanStatus, 'not-adopted');
  assert.equal(mode.zanMatrixRequired, false);
});

test('missing pipeline is informational unless the project requires it', () => {
  const ordinary = evaluateMergeReadiness({
    ...reviewBinding,
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    pipeline: 'none',
    pipelineRequired: false,
    zanStatus: 'not-adopted',
  });
  assert.deepEqual(ordinary, { mergeAllowed: true, blockers: [] });

  const required = evaluateMergeReadiness({
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

test('Zan governance and code findings remain independent merge blockers', () => {
  const result = evaluateMergeReadiness({
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

test('ordinary review binds Issue and required migration docs without a TAPD Wiki', () => {
  const documentHashes = { 'gitlab:issues/17': 'c'.repeat(64), 'repo:MIGRATION.md': 'd'.repeat(64) };
  const changeReview = { ...reviewBinding.changeReview, documentHashes,
    documentation: { status: 'pass', evidence: ['Issue #17 and MIGRATION.md cover the public API change'] },
  };
  const currentChange = { ...reviewBinding.currentChange, documentHashes };
  assert.deepEqual(evaluateMergeReadiness({ ...passingReview, changeReview, currentChange }), {
    mergeAllowed: true, blockers: [],
  });
  const changedDocs = { ...currentChange, documentHashes: { ...documentHashes, 'repo:MIGRATION.md': 'e'.repeat(64) } };
  assert.deepEqual(evaluateMergeReadiness({ ...passingReview, changeReview, currentChange: changedDocs }), {
    mergeAllowed: false, blockers: ['change-documentation-stale'],
  });
});

test('required delivery documentation still blocks when missing or outdated in ordinary mode', () => {
  for (const [status, blocker] of [['unknown', 'change-documentation-unknown'], ['fail', 'change-documentation']]) {
    const changeReview = { ...reviewBinding.changeReview,
      documentation: { status, evidence: ['Project delivery requires a test Wiki; current behavior is not covered'] },
    };
    assert.deepEqual(evaluateMergeReadiness({ ...passingReview, zanStatus: 'not-adopted', changeReview }), {
      mergeAllowed: false, blockers: [blocker],
    });
  }
});

test('merge readiness accepts evidenced ordinary and adopted success paths', () => {
  for (const evidence of [
    {},
    { pipeline: 'pending', pipelineRequired: false, approval: 'not-required' },
    { pipeline: 'success', pipelineRequired: true, approval: 'approved' },
    { zanStatus: 'adopted', zanMust: 'pass', approval: 'approved' },
  ]) {
    assert.deepEqual(evaluateMergeReadiness({ ...passingReview, ...evidence }), {
      mergeAllowed: true,
      blockers: [],
    });
  }
});

test('required pipelines accept only success and retain existing blocker reasons', () => {
  for (const [pipeline, reason] of [
    ['none', 'pipeline-missing'],
    ['pending', 'pipeline-pending'],
    ['failed', 'pipeline-failed'],
    ...['running', 'manual', 'canceled', 'skipped', 'unknown', '', null, true, {}]
      .map((state) => [state, 'pipeline-not-success']),
  ]) {
    assert.deepEqual(evaluateMergeReadiness({
      ...passingReview, pipeline, pipelineRequired: true,
    }), { mergeAllowed: false, blockers: [reason] }, JSON.stringify(pipeline));
  }
});

test('optional pipelines still reject failures and unrecognized or null states', () => {
  for (const [pipeline, reason] of [
    ['failed', 'pipeline-failed'],
    ...['running', 'manual', 'canceled', 'skipped', 'unknown', '', null, true, {}]
      .map((state) => [state, 'pipeline-unknown']),
  ]) {
    assert.deepEqual(evaluateMergeReadiness({
      ...passingReview, pipeline, pipelineRequired: false,
    }), { mergeAllowed: false, blockers: [reason] }, JSON.stringify(pipeline));
  }
});

test('review and merge gates reject unsupported and null states', () => {
  for (const [field, reason] of [
    ['codeReview', 'code-review-incomplete'],
    ['safety', 'safety'],
    ['mergeability', 'mergeability'],
    ['approval', 'approval'],
    ['zanStatus', 'zan-governance'],
  ]) {
    for (const state of ['unknown', 'unexpected-success', '', null, true, {}]) {
      assert.deepEqual(evaluateMergeReadiness({ ...passingReview, [field]: state }), {
        mergeAllowed: false,
        blockers: [reason],
      }, `${field}=${JSON.stringify(state)}`);
    }
  }
  assert.deepEqual(evaluateMergeReadiness({
    ...passingReview,
    codeReview: 'blocker',
    approval: 'required-missing',
    zanStatus: 'misconfigured',
  }), { mergeAllowed: false, blockers: ['code', 'approval', 'zan-governance'] });
});

test('adopted projects require explicit Zan MUST success', () => {
  for (const zanMust of ['fail', 'unknown', 'not-applicable', '', null, true, {}]) {
    assert.deepEqual(evaluateMergeReadiness({
      ...passingReview, zanStatus: 'adopted', zanMust,
    }), { mergeAllowed: false, blockers: ['zan-must'] }, JSON.stringify(zanMust));
  }
});

test('unknown gate requirements and discussion states cannot bypass merge checks', () => {
  for (const state of [null, 'false', '', 0, {}]) {
    assert.deepEqual(evaluateMergeReadiness({ ...passingReview, pipelineRequired: state }), {
      mergeAllowed: false,
      blockers: ['pipeline-requirement-unknown'],
    }, `pipelineRequired=${JSON.stringify(state)}`);
    assert.deepEqual(evaluateMergeReadiness({ ...passingReview, unresolvedDiscussions: state }), {
      mergeAllowed: false,
      blockers: ['unresolved-discussions'],
    }, `unresolvedDiscussions=${JSON.stringify(state)}`);
  }
});
