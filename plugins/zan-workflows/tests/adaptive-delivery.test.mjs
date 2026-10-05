import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpClientPool } from '../scripts/mcp-client.mjs';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { registerTestSubmission } from '../scripts/register-test-submission.mjs';
import { resolveBugWorkflow, resolveVersionField } from '../scripts/tapd-mappings.mjs';
import { collectLocalOccupancy, parseOpenFiles, readCodexTasks, readProcessFiles } from '../scripts/collect-local-occupancy.mjs';
import { runJenkinsRelease } from '../scripts/run-jenkins-release.mjs';
import { adaptJenkinsInput, parseNpmToolsPublication } from '../scripts/jenkins-job-adapters.mjs';
import { createJenkinsReader } from '../scripts/jenkins-readonly.mjs';

const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const api = data => reply({ status: 1, data });
const sha = 'a'.repeat(40), pipelineSha = 'b'.repeat(40);
const registration = () => ({ workspaceId: 12345, entryId: '123450001', entryType: 'bug', workMode: 'INITIAL',
  statusAction: 'WAITING_TEST', versionAction: 'WRITE', testVersion: 'demo@1.0.0-canary.1', purpose: '提测登记',
  prerequisites: { git: 'VERIFIED', deployment: 'DEPLOYED', profile: 'NO_WIKI', wiki: 'SKIPPED_NO_WIKI' } });
function tapd({ custom = false, required = false, owner = 'reviewer', failWrite = false } = {}) {
  const item = { id: '123450001', status: 'in_progress', workitem_type_id: '', test_version: '', custom_field_one: '', current_owner: owner };
  const calls = [];
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_bug') return api([{ Bug: { ...item } }]);
    if (name === 'get_workflows_status_map') return api({ in_progress: '修复中', resolved: '待测试' });
    if (name === 'get_workflows_all_transitions') return api([{ StepPrevious: 'in_progress', StepNext: 'resolved',
      Appendfield: required ? [{ FieldName: 'current_owner', Notnull: 'yes' }] : [] }]);
    if (name === 'get_entity_custom_fields') return api(custom ? [{ CustomFieldConfig: {
      name: '测试版本', custom_field: 'custom_field_one', type: 'text', enabled: '1' } }] : []);
    if (name === 'update_bug') {
      if (failWrite) throw new Error('unknown update');
      Object.assign(item, args.options); return api({ Bug: item });
    }
    throw new Error(name);
  };
  return { call, calls, item };
}

test('one MCP connection and initialization serve concurrent gets and later helper calls', async () => {
  const counts = { launches: 0, initializes: 0, closes: 0 };
  const pool = new McpClientPool(() => {
    counts.launches++;
    return { initialize: async () => { counts.initializes++; }, call: async () => 'read', close: () => { counts.closes++; } };
  });
  const [first, second] = await Promise.all([pool.get('tapd-mcp'), pool.get('tapd-mcp')]);
  assert.equal(first, second);
  await pool.call('tapd-mcp', 'get_bug', {});
  pool.close(); pool.close();
  assert.deepEqual(counts, { launches: 1, initializes: 1, closes: 1 });
  await assert.rejects(pool.get('tapd-mcp'), /已关闭/);
});

test('an initialization failure is retained and never silently relaunched', async () => {
  let launches = 0;
  const pool = new McpClientPool(() => { launches++; return {
    initialize: async () => { throw new Error('connection failed'); }, close() {},
  }; });
  await assert.rejects(pool.get('tapd-mcp'));
  await assert.rejects(pool.get('tapd-mcp'));
  assert.equal(launches, 1); pool.close();
});

test('session preview and execution reuse the same MCP while writes still require explicit execution', async () => {
  const fake = tapd(); let initializes = 0;
  const pool = new McpClientPool(() => ({ initialize: async () => { initializes++; }, call: fake.call, close() {} }));
  const session = new WorkflowSession({ allowExecute: true, pool });
  const plan = await session.dispatch({ id: 'plan', action: 'registration', phase: 'PLAN', input: { ...registration(), execute: true } });
  assert.equal(fake.calls.some(row => row.name === 'update_bug'), false);
  const result = await session.dispatch({ id: 'execute', action: 'registration', phase: 'EXECUTE', input: { ...plan, confirmed: true } });
  assert.equal(result.state, 'REGISTERED'); assert.equal(initializes, 1);
  await assert.rejects(session.dispatch({ id: 'execute', action: 'registration', phase: 'EXECUTE', input: plan }), /ID 不可重复/);
  session.close();
});

test('a read-only session rejects EXECUTE before connecting and a failed execution blocks later writes', async () => {
  const readonly = new WorkflowSession({ pool: { call: () => { throw new Error('must not connect'); }, close() {} } });
  await assert.rejects(readonly.dispatch({ id: 'r', action: 'registration', phase: 'EXECUTE', input: registration() }), /不允许/);
  readonly.close();
  const fake = tapd({ failWrite: true });
  const session = new WorkflowSession({ allowExecute: true, pool: { call: (_server, ...args) => fake.call(...args), close() {} } });
  const plan = await session.dispatch({ id: 'p', action: 'registration', phase: 'PLAN', input: registration() });
  await assert.rejects(session.dispatch({ id: 'e', action: 'registration', phase: 'EXECUTE', input: { ...plan, confirmed: true } }));
  await session.dispatch({ id: 'read', action: 'registration', phase: 'PLAN', input: registration() });
  await assert.rejects(session.dispatch({ id: 'e2', action: 'registration', phase: 'EXECUTE', input: { ...plan, confirmed: true } }), /不允许/);
  assert.equal(fake.calls.filter(row => row.name === 'update_bug').length, 1); session.close();
});

test('actual TAPD transition shapes and symbolic custom fields are mapped without caller flags', async () => {
  const fake = tapd({ custom: true, required: true });
  const plan = await registerTestSubmission(fake.call, registration());
  assert.equal(plan.waitingStatus, 'resolved'); assert.equal(plan.versionField, 'custom_field_one');
  assert.deepEqual(plan.requiredFields, ['current_owner']);
  const result = await registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true });
  assert.equal(result.state, 'REGISTERED'); assert.equal(fake.item.custom_field_one, registration().testVersion);
  const write = fake.calls.find(row => row.name === 'update_bug');
  assert.deepEqual(write.args.options, { id: '123450001', status: 'resolved', custom_field_one: registration().testVersion });
  assert.ok(fake.calls.findIndex(row => row.name === 'get_entity_custom_fields') <
    fake.calls.findIndex(row => row.name === 'get_bug' && row.args.options.fields.includes('custom_field_one')));
});

test('native version fallback keeps the custom metadata fingerprint across execution', async () => {
  const fake = tapd(); const plan = await registerTestSubmission(fake.call, registration());
  assert.equal(plan.versionField, 'test_version');
  assert.ok(plan.metadataHashes.customFields);
  const result = await registerTestSubmission(fake.call, { ...plan, execute: true, confirmed: true });
  assert.equal(result.state, 'REGISTERED');
  assert.equal(fake.calls.filter(row => row.name === 'get_entity_custom_fields').length, 2);
});

test('ambiguous statuses, wrong codes and disallowed transitions cannot be accepted through verified flags', () => {
  assert.throws(() => resolveBugWorkflow({ a: '修复中', b: '待测试', c: '待测试' }, { a: ['b'] }), /歧义/);
  assert.throws(() => resolveBugWorkflow({ a: '修复中', b: '待测试' }, { a: [] }), /不能直接/);
  assert.throws(() => resolveBugWorkflow({ a: '修复中', b: '待测试' }, { a: ['b'] }, { activeStatus: 'wrong', workflowVerified: true }), /不一致/);
});

test('ambiguous, disabled or incompatible version fields stop instead of guessing', () => {
  const row = { custom_field: 'custom_field_one', name: '测试版本', type: 'text', enabled: '1' };
  const input = { entryType: 'bug', versionField: 'custom_field_one', versionFieldVerified: true };
  assert.throws(() => resolveVersionField([{ CustomFieldConfig: row }, { CustomFieldConfig: { ...row, custom_field: 'custom_field_two' } }], input), /歧义/);
  assert.throws(() => resolveVersionField([{ CustomFieldConfig: { ...row, enabled: '0' } }], input), /缺失/);
  assert.throws(() => resolveVersionField([{ CustomFieldConfig: { ...row, type: 'user_chooser' } }], input), /类型/);
  assert.throws(() => resolveVersionField([], { entryType: 'bug', versionFieldLabel: '业务版本' }), /缺失/);
});

test('missing transition fields block the read-only preview without adding unauthorized fields', async () => {
  const fake = tapd({ required: true, owner: '' });
  await assert.rejects(registerTestSubmission(fake.call, registration()), /必填字段/);
  assert.equal(fake.calls.some(row => row.name === 'update_bug'), false);
});

const path = '/fixture/repo/.worktrees/delivery', branch = 'feature/test.delivery';
const resources = [{ branch, path }];
const occupancyInput = { repositoryPath: '/fixture/repo' };
const occupancyIo = (tasks = [], processes = [], complete = true) => ({
  now: () => 1000, realpath: async value => value,
  readTasks: async () => ({ complete, source: 'scoped-task-provider', records: tasks }),
  readProcesses: async () => ({ complete, source: 'process-file-provider', records: processes }),
});

test('occupancy discovers open files even when the process cwd is outside the worktree', async () => {
  const processes = parseOpenFiles(`p123\nn/tmp\nn${path}/src/page.js\np124\nn${path}-other/src/page.js\n`);
  const [row] = await collectLocalOccupancy(resources, occupancyInput, occupancyIo([], processes));
  assert.equal(row.process, 'ACTIVE'); assert.deepEqual(row.processIds, [123]);
});

test('nonarchived task association is retained even when no process is running', async () => {
  const [row] = await collectLocalOccupancy(resources, occupancyInput, occupancyIo([{ id: 'task', cwd: path, archived: 0 }]));
  assert.equal(row.task, 'ACTIVE'); assert.equal(row.needed, true); assert.equal(row.process, 'IDLE');
});

test('archived tasks and a complete empty process snapshot prove idle while partial snapshots never do', async () => {
  const archived = [{ id: 'old', cwd: path, archived: 1 }];
  const [idle] = await collectLocalOccupancy(resources, occupancyInput, occupancyIo(archived));
  assert.equal(idle.scopeComplete, true); assert.equal(idle.task, 'IDLE'); assert.equal(idle.needed, false);
  const [unknown] = await collectLocalOccupancy(resources, occupancyInput, occupancyIo([], [], false));
  assert.equal(unknown.scopeComplete, false); assert.equal(unknown.task, 'UNKNOWN'); assert.equal(unknown.process, 'UNKNOWN');
});

test('occupancy resolves symlink aliases and keeps active signals despite incomplete inventory', async () => {
  const io = occupancyIo([{ id: 'active', cwd: '/alias', archived: 0 }], [], false);
  io.realpath = async value => value === '/alias' ? path : value;
  const [row] = await collectLocalOccupancy(resources, occupancyInput, io);
  assert.equal(row.task, 'ACTIVE'); assert.equal(row.needed, true); assert.equal(row.scopeComplete, false);
});

test('scoped Codex inventory uses read-only SQLite and handles quoted Unicode paths', async () => {
  const exec = promisify(execFile), temp = await mkdtemp(join(tmpdir(), 'zan-occupancy-'));
  try {
    const project = join(temp, "项目'🙂"), home = join(temp, 'codex'), alias = join(temp, 'alias');
    await mkdir(home); await mkdir(project); await symlink(project, alias);
    const database = join(home, 'state_5.sqlite');
    await exec('sqlite3', [database, "CREATE TABLE threads(id TEXT,cwd TEXT,archived INTEGER,git_branch TEXT);"]);
    const quote = value => "'" + value.replace(/'/g, "''") + "'";
    await exec('sqlite3', [database, `INSERT INTO threads VALUES('related',${quote(project + '/child')},0,'feature/demo');
      INSERT INTO threads VALUES('alias',${quote(alias)},0,'feature/demo');
      INSERT INTO threads VALUES('unrelated','/unrelated',0,'feature/unrelated');`]);
    const calls = [];
    const snapshot = await readCodexTasks([{ branch: 'feature/demo', path: project }], project, { codexHome: home,
      exec: async (...args) => { calls.push(args); return exec(...args); } });
    assert.equal(snapshot.complete, true); assert.deepEqual(snapshot.records.map(row => row.id), ['related', 'alias']);
    const [occupancy] = await collectLocalOccupancy([{ branch: 'feature/demo', path: project }], { repositoryPath: project },
      { codexHome: home, readProcesses: async () => ({ complete: true, source: 'fixture-processes', records: [] }) });
    assert.deepEqual(occupancy.taskIds, ['related', 'alias']);
    assert.ok(calls.every(([, args]) => args[0] === '-readonly'));
    assert.ok(calls.every(([, args]) => !/title|first_user_message|rollout_path/.test(args.at(-1))));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('unobservable stable processes mark the collection incomplete', async () => {
  const data = await readProcessFiles({ platform: 'darwin', exec: async command => command === 'ps'
    ? { stdout: '1\n2\n' } : { stdout: 'p1\nn/\n', stderr: '' } });
  assert.equal(data.complete, false);
});

test('a branch without a worktree does not imply an idle repository process', async () => {
  const [row] = await collectLocalOccupancy([{ branch, path: null }], occupancyInput,
    occupancyIo([], [{ pid: 100, paths: ['/fixture/repo/.git/refs/heads/feature/test.delivery'] }]));
  assert.equal(row.process, 'ACTIVE');
});

const npmBody = `def repoMap = ['demo': 'team/demo.git']
def resolveBranchName(releaseType) { return releaseType == 'release:canary' ? 'develop' : 'master' }
'实际发包': publishedPackageSummary
'发布类型': params.RELEASE_TYPE
readNpmPublishedPackages(this)
未从 npm 源查询到本次发布包版本`;
const npmInput = () => ({ targetProject: 'demo', releaseTarget: 'demo', releaseScope: 'PROJECT', targetEnvironment: 'npm',
  releaseKind: 'package', releaseChannel: 'official', releaseRef: 'master', expectedSha: sha,
  purpose: '发布已确认项目', sourceRepository: 'https://git.example.test/team/demo.git',
  jobName: 'npm-tools-test', jobUrl: 'https://ci.example.test/job/npm-tools-test/',
  pipelineSource: { repositoryPath: '/fixture/pipeline', repositoryUrl: 'https://git.example.test/team/jenkinsfile.git',
    expectedSha: pipelineSha, ref: 'master', scriptPath: 'Jenkinsfile' } });
const successLog = (type = 'release:prod', version = '1.2.3') => `[2026-10-04T06:24:06.492Z] ================ 发布成功 ================
[2026-10-04T06:24:06.492Z] 项目名称        : demo
[2026-10-04T06:24:06.492Z] 实际发包        : @demo/core@${version}
[2026-10-04T06:24:06.492Z] 提交版本        : aaaaaaa
[2026-10-04T06:24:06.492Z] 发布类型        : ${type}
[2026-10-04T06:24:06.492Z] ================================================`;
function jenkins({ forbidden = false, packageJob = false, modifyIdentity, badPipeline = false, log = successLog() } = {}) {
  const base = packageJob ? npmInput() : { ...npmInput(), releaseTarget: 'demo-app', releaseKind: 'deployment',
    releaseChannel: 'canary', releaseRef: 'develop', jobName: 'front-demo-test', jobUrl: 'https://ci.example.test/job/front-demo-test/' };
  const calls = [];
  const definitions = packageJob ? [{ name: 'PROJECT_NAME', choices: ['demo'] }, { name: 'RELEASE_TYPE', choices: ['release:canary', 'release:prod'] }]
    : [{ name: 'branch', choices: ['develop'] }];
  const params = packageJob ? { PROJECT_NAME: 'demo', RELEASE_TYPE: 'release:prod' } : { branch: 'develop' };
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 'jenkins_list_instances') return reply([{ name: 'default', url: 'https://ci.example.test' }]);
    if (name === 'jenkins_get_job_parameters') return reply({ jobName: base.jobName, parameters: definitions });
    if (name === 'jenkins_get_job_config') return forbidden ? { isError: true, content: [{ type: 'text', text: 'HTTP 403' }] }
      : reply({ jobName: base.jobName, config: '<approved/>' });
    if (name === 'jenkins_trigger_build') return reply({ jobName: base.jobName, queueUrl: 'https://ci.example.test/queue/item/9/' });
    throw new Error(name);
  };
  const reader = { instanceUrl: 'https://ci.example.test', jobUrl: base.jobUrl,
    job: async () => modifyIdentity?.() || { fullName: base.jobName, url: base.jobUrl, type: 'pipeline', buildable: true },
    queueIdentity: () => ({ id: 9 }), queue: async () => ({ executable: { number: 10 } }),
    build: async () => ({ queueId: 9, building: false, result: 'SUCCESS', url: base.jobUrl + '10/', actions: [
      { parameters: Object.entries(params).map(([name, value]) => ({ name, value })) },
      { remoteUrls: [base.sourceRepository], lastBuiltRevision: { SHA1: sha } },
      ...(packageJob ? [{ remoteUrls: [base.pipelineSource.repositoryUrl], lastBuiltRevision: { SHA1: badPipeline ? sha : pipelineSha } }] : []),
    ] }), console: async () => log };
  return { base, calls, call, reader, io: { checkSource: async () => {}, readPipeline: async () => npmBody } };
}

test('branch-only deployment resolves parameters and handles forbidden XML with a displayed metadata binding', async () => {
  const fake = jenkins({ forbidden: true });
  const plan = await runJenkinsRelease(fake.call, fake.reader, fake.base, fake.io);
  assert.deepEqual(plan.params, { branch: 'develop' }); assert.equal(plan.version, sha);
  assert.equal(plan.jobBindingMode, 'READABLE_METADATA'); assert.equal(plan.jobConfigHash, null);
  const result = await runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true }, fake.io);
  assert.equal(result.state, 'DEPLOYED'); assert.equal(result.sourceVerified, true);
  assert.equal(fake.calls.filter(row => row.name === 'jenkins_trigger_build').length, 1);
});

test('metadata identity changes block a 403-compatible execution before trigger', async () => {
  let changed = false;
  const fake = jenkins({ forbidden: true, modifyIdentity: () => changed ? { fullName: 'other-job' } : null });
  const plan = await runJenkinsRelease(fake.call, fake.reader, fake.base, fake.io); changed = true;
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true }, fake.io), /已变化/);
  assert.equal(fake.calls.some(row => row.name === 'jenkins_trigger_build'), false);
});

test('npm-tools computes ref and channel from verified pipeline source then reads actual published versions', async () => {
  const fake = jenkins({ packageJob: true, forbidden: true });
  const plan = await runJenkinsRelease(fake.call, fake.reader, fake.base, fake.io);
  assert.equal(plan.versionStrategy, 'PIPELINE_COMPUTED'); assert.equal(plan.refParameter, null);
  assert.deepEqual(plan.params, { PROJECT_NAME: 'demo', RELEASE_TYPE: 'release:prod' });
  const result = await runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true }, fake.io);
  assert.equal(result.state, 'RELEASED'); assert.equal(result.version, null); assert.equal(result.versionIdentity, sha);
  assert.deepEqual(result.publishedPackages, [{ name: '@demo/core', version: '1.2.3' }]);
});

test('computed releases cannot widen a package request to project scope or guess a different source branch', async () => {
  const fake = jenkins({ packageJob: true });
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...fake.base, releaseTarget: '@demo/core' }, fake.io), /整个项目/);
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...fake.base, releaseRef: 'develop' }, fake.io), /实际流水线/);
  assert.equal(fake.calls.some(row => row.name === 'jenkins_trigger_build'), false);
});

test('pipeline drift blocks before trigger and the wrong actual pipeline SHA cannot prove publication', async () => {
  const fake = jenkins({ packageJob: true });
  const plan = await runJenkinsRelease(fake.call, fake.reader, fake.base, fake.io);
  await assert.rejects(runJenkinsRelease(fake.call, fake.reader, { ...plan, execute: true, confirmed: true },
    { ...fake.io, readPipeline: async () => npmBody + '\nchanged' }), /规则已变化/);
  assert.equal(fake.calls.some(row => row.name === 'jenkins_trigger_build'), false);
  const wrong = jenkins({ packageJob: true, badPipeline: true });
  const wrongPlan = await runJenkinsRelease(wrong.call, wrong.reader, wrong.base, wrong.io);
  await assert.rejects(runJenkinsRelease(wrong.call, wrong.reader, { ...wrongPlan, execute: true, confirmed: true }, wrong.io), /实际流水线源码/);
});

test('publication evidence must match project, channel and actual version kind', () => {
  const input = { ...npmInput(), params: { RELEASE_TYPE: 'release:prod' } };
  assert.throws(() => parseNpmToolsPublication(successLog().replace('demo\n', 'other\n'), input), /不属于/);
  assert.throws(() => parseNpmToolsPublication(successLog('release:prod', '1.2.3-canary.1'), input), /预发布/);
  assert.throws(() => parseNpmToolsPublication('SUCCESS without publication', input), /摘要/);
  const packages = parseNpmToolsPublication(successLog('release:canary', '1.2.3-canary.1'),
    { ...input, releaseChannel: 'canary', params: { RELEASE_TYPE: 'release:canary' } });
  assert.equal(packages[0].version, '1.2.3-canary.1');
});

test('GET-only Job and publication reads remain bound to the exact configured Job', async () => {
  const urls = [];
  const reader = createJenkinsReader({ MCP_JENKINS_URL: 'https://ci.example.test', MCP_JENKINS_USER: 'test', MCP_JENKINS_API_TOKEN: '' },
    'front-demo-test', 'https://ci.example.test/job/front-demo-test/', async (url, options) => {
      urls.push({ url, options });
      return { ok: true, json: async () => ({ fullName: 'front-demo-test', url: 'https://ci.example.test/job/front-demo-test/', buildable: true, _class: 'pipeline' }),
        body: (async function* () { yield Buffer.from('summary'); })() };
    });
  assert.equal((await reader.job()).fullName, 'front-demo-test');
  assert.equal(await reader.console(10), 'summary');
  await assert.rejects(reader.console(0), /构建号/);
  assert.ok(urls.every(({ url, options }) => url.startsWith('https://ci.example.test/job/front-demo-test/') && options.method === 'GET' && options.redirect === 'error'));
});
