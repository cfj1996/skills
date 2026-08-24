import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

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

test('central config owns governed project list and explicit no-fallback policy', { skip: !knowledgeRoot }, async () => {
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
  assert.match(config, /mergeAllowed: false/);
  assert.match(config, /doNotFallbackToPackageScripts: true/);
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
  }
  assert.match(reference, /changed file → path\/diff signals → task-routing route id/);
  assert.match(reference, /unknown.*不得变成 `pass`/s);
  assert.match(taskRouting, /changedFileRouting:/);
  assert.match(taskRouting, /routeField: changedFileMatch/);
  assert.match(taskRouting, /unmatchedPolicy: unknown-and-defer/);
});

test('missing project configuration fixture remains a merge-blocking defer', async () => {
  const fixture = await read(resolve(skillRoot, 'tests/fixtures/missing-project-configuration.yaml'));
  assert.match(fixture, /conformance: unknown/);
  assert.match(fixture, /conclusion: 暂缓/);
  assert.match(fixture, /mergeAllowed: false/);
  assert.match(fixture, /safetyChecksStillRun: true/);
  assert.match(fixture, /fallbackToPackageScripts: false/);
});
