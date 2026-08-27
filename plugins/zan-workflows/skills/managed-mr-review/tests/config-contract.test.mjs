import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { classifyAdoption, evaluateMergeReadiness } from '../scripts/review-policy.mjs';

const skillRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const standaloneRoot = resolve(skillRoot, '../../../../skills/managed-mr-review');
const knowledgeRoot = process.env.PROJECT_KNOWLEDGE_ROOT
  ? resolve(process.env.PROJECT_KNOWLEDGE_ROOT, 'workflows/managed-mr-review')
  : null;

const read = (file) => readFile(file, 'utf8');

test('central config keeps identity fields explicit and distinguishes duplicate names', { skip: !knowledgeRoot }, async () => {
  const config = await read(resolve(knowledgeRoot, 'config.yaml'));

  assert.match(config, /kind: ManagedMrReviewConfiguration/);
  assert.match(config, /personId: team-lead-chen-fangjie\n\s+name: 陈方杰\n\s+gitlabUsername: chenfangjie/);
  assert.match(config, /name: 刘奕君\n/);
  assert.match(config, /name: 刘子昱\n/);
  assert.match(config, /name: 李金涛\n/);
  assert.match(config, /name: 刘奕君\n\s+gitlabUsername: liuyijun/);
  assert.match(config, /name: 刘子昱\n\s+gitlabUsername: liuziyu/);
  assert.match(config, /name: 李金涛\n\s+gitlabUsername: lijintao/);
  assert.match(config, /personId: team-member-1/);
  assert.match(config, /personId: team-member-2/);
  assert.match(config, /personId: team-member-3/);
});

test('central config owns governed project list and explicit review-mode policy', { skip: !knowledgeRoot }, async () => {
  const config = await read(resolve(knowledgeRoot, 'config.yaml'));

  for (const projectId of [
    'admin_menu', 'jbz_admin', 'kp_admin', 'order-admin', 'poster_admin',
    'statistics_admin', 'store_admin', 'supplier-admin-web', 'ledger_admin',
    'weixin-live', 'zan-projects', 'zan-devops', 'provider-mobile', 'fronted',
    'vantix-frontend',
  ]) {
    assert.match(config, new RegExp(`^      - ${projectId.replace('-', '\\-')}$`, 'm'));
  }

  assert.match(config, /unresolvedProjectPolicy: defer-and-report/);
  assert.match(config, /notAdopted:/);
  assert.match(config, /reviewMode: ordinary/);
  assert.match(config, /mergeAllowed: subject-to-ordinary-review-gates/);
  assert.match(config, /misconfigured:/);
  assert.match(config, /governanceBlocksMerge: true/);
});

test('both skill entrypoints delegate scope and routing to project knowledge', { skip: !knowledgeRoot }, async () => {
  const [pluginSkill, standaloneSkill, reference, taskRouting] = await Promise.all([
    read(resolve(skillRoot, 'SKILL.md')),
    read(resolve(standaloneRoot, 'SKILL.md')),
    read(resolve(skillRoot, 'references/zan-conformance.md')),
    read(resolve(process.env.PROJECT_KNOWLEDGE_ROOT, 'standards/zan-system/manifests/task-routing.yaml')),
  ]);

  for (const skill of [pluginSkill, standaloneSkill]) {
    assert.match(skill, /workflows\/managed-mr-review\/config\.yaml/);
    assert.match(skill, /禁止恢复到 skill 文档、历史记忆或任何内置白名单/);
    assert.match(skill, /typeCheckCommand.*testCommand.*conformanceCommand/s);
    assert.match(skill, /MUST.*SHOULD/);
    assert.match(skill, /ordinary.*not-adopted/s);
    assert.match(skill, /代码结论.*合并资格/s);
    assert.match(skill, /pipeline = none/);
  }
  assert.match(reference, /changed file → path\/diff signals → task-routing route id/);
  assert.match(reference, /not-adopted.*未接入本身不阻断/s);
  assert.match(reference, /unknown.*不得变成 `pass`/s);
  assert.match(taskRouting, /changedFileRouting:/);
  assert.match(taskRouting, /routeField: changedFileMatch/);
  assert.match(taskRouting, /unmatchedPolicy: unknown-and-defer/);
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

test('missing pipeline is informational unless the project requires it', () => {
  const ordinary = evaluateMergeReadiness({
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    pipeline: 'none',
    pipelineRequired: false,
    zanStatus: 'not-adopted',
  });
  assert.deepEqual(ordinary, { mergeAllowed: true, blockers: [] });

  const required = evaluateMergeReadiness({
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
    codeReview: 'pass',
    safety: 'pass',
    mergeability: 'mergeable',
    zanStatus: 'misconfigured',
  });
  assert.deepEqual(result, { mergeAllowed: false, blockers: ['zan-governance'] });
});
