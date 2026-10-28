import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WorkflowSession } from '../scripts/workflow-session.mjs';
import { dataDirectory, limits, listRuns, pluginIdentity, readRun, recordEvent, redactText,
  hash, runDirectory, sessionRecorder, startRun, writePrivateFile } from '../scripts/execution-recorder.mjs';
import { exportExecutionReport } from '../scripts/export-execution-report.mjs';
import { FEEDBACK_TARGET, submitExecutionFeedback } from '../scripts/submit-execution-feedback.mjs';

function fixture(t, parent = tmpdir()) {
  const dataDir = fs.realpathSync(fs.mkdtempSync(join(parent, 'zan-feedback-')));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const pluginRoot = join(dataDir, 'plugin');
  fs.mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(join(pluginRoot, '.codex-plugin/plugin.json'), '{"version":"test"}');
  const options = { dataDir, pluginRoot, force: true, uploadBaseDir: dataDir };
  const { runId } = startRun({ skill: 'fixing-bug', goal: '修复重复确认' }, options);
  return { options, runId, input: { runId, feedback: { goalReached: 'PARTIAL', problem: '中途重复确认了三次' } } };
}
const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
function gitlab(uploadBaseDir = homedir(), { stringIds = false } = {}) {
  const base = fs.realpathSync(uploadBaseDir);
  const calls = [], issues = [];
  const project = { id: stringIds ? '374' : 374,
    web_url: 'http://git.jubaozan.cn/chenfangjie/skills', visibility: 'public', issues_enabled: true };
  const call = async (name, args) => {
    calls.push({ name, args });
    switch (name) {
      case 'get_project': return response(project);
      case 'list_issues': return response(issues);
      case 'get_issue': return response(issues.find(row => String(row.iid) === args.issue_iid));
      case 'upload_markdown': {
        const path = normalize(args.file_path);
        assert.equal(isAbsolute(path), false, 'MCP rejects absolute file_path');
        assert.equal(path === '..' || path.startsWith('..' + sep), false, 'MCP rejects traversal');
        let current = base;
        for (const part of path.split(sep)) {
          current = join(current, part);
          assert.equal(fs.lstatSync(current).isSymbolicLink(), false, 'MCP rejects symlinks');
        }
        assert.equal(relative(base, fs.realpathSync(current)).startsWith('..'), false, 'MCP rejects escapes');
        assert.ok(fs.readFileSync(current).subarray(0, 2).equals(Buffer.from('PK')));
        return response({ url: '/uploads/' + 'a'.repeat(32) + '/execution-report.zip' });
      }
      case 'create_issue': {
        const issue = { iid: stringIds ? String(issues.length + 1) : issues.length + 1,
          project_id: stringIds ? '374' : 374, description: args.description,
          web_url: project.web_url + '/-/issues/' + (issues.length + 1) };
        issues.push(issue);
        return response(issue);
      }
      default: throw new Error('unexpected tool: ' + name);
    }
  };
  return { calls, issues, project, call };
}
function submissionFixture(t, { stage = false } = {}) {
  const result = fixture(t);
  if (stage) {
    result.options.uploadBaseDir = join(result.options.dataDir, 'upload-home');
    fs.mkdirSync(result.options.uploadBaseDir, { mode: 0o700 });
  }
  return { ...result, fake: gitlab(result.options.uploadBaseDir) };
}

function existingFeedbackIssue(fake, exported, overrides = {}) {
  const issue = { iid: 1, project_id: 374,
    description: '<!-- zan-feedback-' + exported.runId + '-' + exported.revision + ' -->\n' +
      '[execution-report.zip](/uploads/' + 'a'.repeat(32) + '/execution-report.zip)',
    web_url: fake.project.web_url + '/-/issues/1', ...overrides };
  fake.issues.push(issue);
  return issue;
}

test('content fingerprint detects changed installed scripts even without a version bump', t => {
  const { options } = fixture(t), first = pluginIdentity(options.pluginRoot);
  fs.mkdirSync(join(options.pluginRoot, 'scripts'));
  fs.writeFileSync(join(options.pluginRoot, 'scripts/script.mjs'), 'changed');
  const next = pluginIdentity(options.pluginRoot);
  assert.equal(first.version, next.version); assert.notEqual(first.fingerprint, next.fingerprint);
  fs.writeFileSync(join(options.pluginRoot, '.env'), 'PRIVATE_TOKEN=never-read');
  fs.writeFileSync(join(options.pluginRoot, 'credentials.json'), 'never-read');
  assert.equal(pluginIdentity(options.pluginRoot).fingerprint, next.fingerprint);
});

test('whitelisted records omit raw payloads and redact credential, URL and local path variants', t => {
  const { options, runId } = fixture(t);
  const text = 'Authorization: Bearer very-secret-123 password="hidden value" token=secret42 ' +
    'https://user:pass@example.test/api?token=secret43#secret44 /Users/alice/work/file.js ' +
    'C:\\Users\\alice\\secret.txt glpat-abcdefghijklmnop';
  recordEvent(runId, { type: 'user_correction', source: 'user_feedback', summary: text,
    input: { token: 'raw-only-secret' }, rawResult: 'raw-only-result' }, options);
  const saved = JSON.stringify(readRun(runId, options));
  for (const secret of ['very-secret-123', 'hidden value', 'secret42', 'secret43', 'secret44',
    'user:pass', '/Users/alice', 'C:\\\\Users', 'glpat-abcdefghijklmnop', 'raw-only-secret', 'raw-only-result']) {
    assert.equal(saved.includes(secret), false, secret);
  }
  assert.match(saved, /example.test/);
  assert.match(redactText('Authorization=opaque-secret'), /CREDENTIAL/);
});

test('metadata excludes unrelated input and keeps unknown host/model values', t => {
  const { options } = fixture(t);
  const next = startRun({ skill: 'writing-plans', token: 'metadata-secret', host: { token: 'host-secret' } }, options);
  const metadata = readRun(next.runId, options).metadata;
  assert.equal(metadata.host.model, 'unknown'); assert.equal(metadata.host.name, 'unknown');
  assert.equal(JSON.stringify(metadata).includes('secret'), false);
});

test('three confirmation subjects and explicit correction survive without inventing task completion', t => {
  const { runId, options, input } = fixture(t);
  for (const subject of ['修改范围', '修改范围', '提交结果']) {
    recordEvent(runId, { type: 'confirmation_requested', source: 'agent_summary', subject }, options);
  }
  recordEvent(runId, { type: 'user_correction', source: 'user_feedback', summary: '第二次没有变化' }, options);
  const { report } = exportExecutionReport(input, options);
  assert.equal(report.metrics.confirmationCount, 3); assert.equal(report.metrics.correctionCount, 1);
  assert.equal(report.outcome, 'UNKNOWN'); assert.equal(report.feedback.goalReached, 'PARTIAL');
  assert.equal(report.events[0].source, 'agent_summary');
});

test('session lifecycle recording preserves UNKNOWN, request timing and does not equate cleanup with success', t => {
  const { runId, options, input } = fixture(t), observe = sessionRecorder({ ...options, runId });
  observe({ state: 'REQUEST_STARTED', requestId: 'r1', action: 'release', phase: 'EXECUTE', idleBeforeMs: 40 });
  observe({ state: 'REQUEST_FINISHED', requestId: 'r1', action: 'release', phase: 'EXECUTE',
    resultState: 'UNKNOWN', reason: 'REQUEST_TIMEOUT', elapsedMs: 12 });
  observe({ state: 'SESSION_CLOSED', reason: 'FINISHED', busyMs: 12, idleMs: 40, requestCount: 1 });
  const { report } = exportExecutionReport(input, options);
  assert.equal(report.outcome, 'UNKNOWN'); assert.equal(report.metrics.actionElapsedMs, 12);
  assert.equal(report.metrics.precedingIdleMs, 40); assert.equal(report.metrics.explicitWaitMs, 0);
  assert.equal(report.events[1].state, 'UNKNOWN');
});

test('failed diagnostic observers never close or poison the actual WorkflowSession', async t => {
  const session = new WorkflowSession({ recorder: () => { throw new Error('disk unavailable'); },
    pool: { async close() { return { cleanupComplete: true }; } } });
  session.emit({ state: 'SESSION_READY' });
  assert.equal(session.closed, false);
  const result = await session.close();
  assert.equal(result.state, 'SESSION_CLOSED'); assert.notEqual(result.reason, 'OUTPUT_ERROR');
  const rejected = new WorkflowSession({ recorder: () => Promise.reject(new Error('disk unavailable')),
    pool: { async close() { return { cleanupComplete: true }; } } });
  rejected.emit({ state: 'SESSION_READY' }); await Promise.resolve();
  assert.equal(rejected.closed, false); await rejected.close();
});

test('missing linked run and capacity failures are isolated from delivery observers', t => {
  const { options, runId } = fixture(t);
  const invalid = sessionRecorder({ ...options, runId: 'run-' + randomUUID() });
  assert.doesNotThrow(() => invalid({ state: 'REQUEST_STARTED' }));
  const dir = runDirectory(runId, options);
  fs.writeFileSync(join(dir, 'events.jsonl'), ' '.repeat(limits.bytes));
  assert.equal(recordEvent(runId, { type: 'stage_started', source: 'agent_summary' }, options).state, 'CAPACITY_REACHED');
  assert.equal(readRun(runId, options).incomplete, true);
});

test('damaged final JSON line is a coverage gap, while terminal outcomes remain explicit', t => {
  const { options, runId, input } = fixture(t);
  recordEvent(runId, { type: 'run_finished', source: 'agent_summary', outcome: 'COMPLETED' }, options);
  assert.throws(() => recordEvent(runId, { type: 'stage_started', source: 'agent_summary' }, options), /已结束/);
  assert.equal(exportExecutionReport(input, options).report.outcome, 'COMPLETED');
  fs.appendFileSync(join(runDirectory(runId, options), 'events.jsonl'), '{"interrupted');
  const { report } = exportExecutionReport(input, options);
  assert.equal(report.outcome, 'UNKNOWN'); assert.equal(report.coverage.incomplete, true);
});

test('path traversal, run symlinks and event-file symlinks are rejected', t => {
  const { options, runId } = fixture(t);
  assert.throws(() => readRun('../escape', options), /编号/);
  const path = join(runDirectory(runId, options), 'events.jsonl'), outside = join(options.dataDir, 'outside');
  fs.writeFileSync(outside, 'do not touch'); fs.rmSync(path); fs.symlinkSync(outside, path);
  assert.throws(() => recordEvent(runId, { type: 'stage_started', source: 'agent_summary' }, options));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'do not touch');
  const other = 'run-' + randomUUID();
  fs.symlinkSync(options.dataDir, join(options.dataDir, 'runs', other));
  assert.throws(() => readRun(other, options), /目录/);
});

test('exports are deterministic valid ZIPs with only fixed sanitized files', t => {
  const { options, input } = fixture(t);
  input.evidence = [{ label: '用户选取片段', text: 'token=fixture-secret' }];
  const one = exportExecutionReport(input, options), two = exportExecutionReport(input, options);
  assert.equal(one.revision, two.revision); assert.equal(one.archiveHash, two.archiveHash);
  const inspect = spawnSync('python3', ['-c',
    'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; ' +
    'assert sorted(z.namelist())==["events.jsonl","report.json","report.md"]; ' +
    'assert b"fixture-secret" not in z.read("report.json"); print(json.loads(z.read("report.json"))["schemaVersion"])',
    one.archivePath], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr); assert.equal(inspect.stdout.trim(), '1');
});

test('manual exported-file changes and arbitrary evidence paths never enter uploads', t => {
  const { options, input } = fixture(t), report = exportExecutionReport(input, options);
  fs.writeFileSync(report.archivePath, 'tampered');
  assert.throws(() => exportExecutionReport(input, options), /发生修改/);
  assert.throws(() => exportExecutionReport({ ...input, evidence: [{ file_path: '/etc/passwd' }] }, options), /片段/);
});

test('export sanitizes manually modified diagnostic fields a second time', t => {
  const { options, input, runId } = fixture(t), dir = runDirectory(runId, options);
  const metadata = JSON.parse(fs.readFileSync(join(dir, 'run.json')));
  metadata.goal = 'password=second-pass-secret'; metadata.token = 'unknown-field-secret';
  fs.writeFileSync(join(dir, 'run.json'), JSON.stringify(metadata));
  fs.writeFileSync(join(dir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(),
    type: 'stage_started', source: 'agent_summary', summary: 'token=event-secret', input: 'unknown-event-secret' }) + '\n');
  const text = JSON.stringify(exportExecutionReport(input, options).report);
  for (const secret of ['second-pass-secret', 'unknown-field-secret', 'event-secret', 'unknown-event-secret']) {
    assert.equal(text.includes(secret), false);
  }
});

test('feedback always uses the pinned project without reading an old destination file', async t => {
  const { options, input, fake } = submissionFixture(t);
  fs.writeFileSync(join(options.dataDir, 'feedback-config.json'), JSON.stringify({
    schemaVersion: 1, projectId: '999', projectUrl: 'https://other.test/group/feedback',
  }));
  const plan = await submitExecutionFeedback(fake.call, input, options);
  assert.equal(plan.state, 'READY');
  assert.equal(plan.projectId, '374');
  assert.equal(plan.projectUrl, 'http://git.jubaozan.cn/chenfangjie/skills');
  assert.deepEqual(FEEDBACK_TARGET, { projectId: '374', projectUrl: 'http://git.jubaozan.cn/chenfangjie/skills' });
  assert.equal(fake.calls[0].args.project_id, '374');
});

test('destination overrides and a mismatched GitLab project cannot redirect feedback', async t => {
  const { options, input, fake } = submissionFixture(t);
  for (const override of [{ projectId: '999' }, { projectUrl: 'https://other.test/a/b' }, { target: {} },
    { uploadBaseDir: options.dataDir }, { file_path: '/etc/passwd' }]) {
    await assert.rejects(submitExecutionFeedback(fake.call, { ...input, ...override }, options), /固定接收地址/);
  }
  assert.equal(fake.calls.length, 0);
  fake.project.id = 999;
  await assert.rejects(submitExecutionFeedback(fake.call, input, options), /内置目标/);
  fake.project.id = 374; fake.project.web_url = 'https://other.test/team/feedback';
  await assert.rejects(submitExecutionFeedback(fake.call, input, options), /内置目标/);
  assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
});

test('read-only preview writes no attachments/issues; execution requires current user submission authority', async t => {
  const { options, input, fake } = submissionFixture(t);
  const plan = await submitExecutionFeedback(fake.call, input, options);
  assert.equal(plan.state, 'READY');
  assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
  await assert.rejects(submitExecutionFeedback(fake.call, { ...input, execute: true }, options), /上传需要/);
});

test('execute uploads once, creates once, reads back and reuses the same report on repeat', async t => {
  const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
  const first = await submitExecutionFeedback(fake.call, request, options);
  assert.equal(first.state, 'VERIFIED'); assert.equal(first.writes, 2); assert.equal(first.reused, false);
  assert.equal(first.issueUrl, fake.project.web_url + '/-/issues/1');
  const second = await submitExecutionFeedback(fake.call, request, options);
  assert.equal(second.state, 'VERIFIED'); assert.equal(second.writes, 0); assert.equal(second.reused, true);
  assert.equal(fake.calls.filter(row => row.name === 'upload_markdown').length, 1);
  assert.equal(fake.calls.filter(row => row.name === 'create_issue').length, 1);
});

test('decimal string IDs from project, list, create and get responses normalize before verification and reuse', async t => {
  const { options, input } = fixture(t), fake = gitlab(options.uploadBaseDir, { stringIds: true });
  const request = { ...input, execute: true, confirmed: true };
  const first = await submitExecutionFeedback(fake.call, request, options);
  assert.equal(first.state, 'VERIFIED'); assert.equal(first.issueIid, 1); assert.equal(first.writes, 2);
  assert.equal(fake.issues[0].iid, '1'); assert.equal(fake.issues[0].project_id, '374');
  const second = await submitExecutionFeedback(fake.call, request, options);
  assert.equal(second.state, 'VERIFIED'); assert.equal(second.issueIid, 1);
  assert.equal(second.writes, 0); assert.equal(second.reused, true);
  assert.equal(fake.calls.filter(row => row.name === 'upload_markdown').length, 1);
  assert.equal(fake.calls.filter(row => row.name === 'create_issue').length, 1);
  assert.ok(fake.calls.filter(row => row.name === 'get_issue').every(row => row.args.issue_iid === '1'));
});

test('an existing matching Issue with string IDs reconciles without an upload or create', async t => {
  const { options, input } = fixture(t), fake = gitlab(options.uploadBaseDir, { stringIds: true });
  existingFeedbackIssue(fake, exportExecutionReport(input, options), { iid: '1', project_id: '374' });
  const result = await submitExecutionFeedback(fake.call, { ...input, execute: true, confirmed: true }, options);
  assert.equal(result.state, 'VERIFIED'); assert.equal(result.issueIid, 1);
  assert.equal(result.writes, 0); assert.equal(result.reused, true);
  assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
});

const malformedIds = ['', ' ', ' 1', '1 ', '1\n', '01', '0', '-1', '1.0', '1e0', '0x1',
  '9007199254740992', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, false, {}, []];

test('malformed list identities and foreign projects are rejected before Issue reads or writes', async t => {
  for (const field of ['iid', 'project_id']) {
    for (const value of [...malformedIds, ...(field === 'project_id' ? [375, '375', '0374'] : [])]) {
      const { options, input, fake } = submissionFixture(t);
      existingFeedbackIssue(fake, exportExecutionReport(input, options), { [field]: value });
      await assert.rejects(submitExecutionFeedback(fake.call, { ...input, execute: true, confirmed: true }, options), /缺少身份|项目不匹配/);
      assert.equal(fake.calls.some(row => ['get_issue', 'upload_markdown', 'create_issue'].includes(row.name)), false);
    }
  }
});

test('malformed get identities and foreign projects cannot verify an existing feedback Issue', async t => {
  for (const field of ['iid', 'project_id']) {
    for (const value of [...malformedIds, ...(field === 'project_id' ? [375, '375', '0374'] : [])]) {
      const { options, input, fake } = submissionFixture(t);
      const issue = existingFeedbackIssue(fake, exportExecutionReport(input, options));
      const call = (name, args) => name === 'get_issue' ? response({ ...issue, [field]: value }) : fake.call(name, args);
      await assert.rejects(submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options), /内容或归属/);
      assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
    }
  }
});

test('malformed create acknowledgments remain UNKNOWN and require independent reconciliation', async t => {
  for (const field of ['iid', 'project_id']) {
    for (const value of [...malformedIds, ...(field === 'project_id' ? [375, '375', '0374'] : [])]) {
      const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
      const call = async (name, args) => {
        const result = await fake.call(name, args);
        return name === 'create_issue' ? response({ ...fake.issues[0], [field]: value }) : result;
      };
      const first = await submitExecutionFeedback(call, request, options);
      assert.equal(first.state, 'UNKNOWN'); assert.equal(first.priorState, 'CREATE_STARTED');
      assert.equal(fake.calls.some(row => row.name === 'get_issue'), false);
      const reconciled = await submitExecutionFeedback(fake.call, request, options);
      assert.equal(reconciled.state, 'VERIFIED'); assert.equal(reconciled.writes, 0);
      assert.equal(fake.calls.filter(row => row.name === 'upload_markdown').length, 1);
      assert.equal(fake.calls.filter(row => row.name === 'create_issue').length, 1);
    }
  }
});

test('the default MCP home base receives an existing home report as a relative path', async t => {
  const { options, input } = fixture(t, homedir()), fake = gitlab();
  delete options.uploadBaseDir;
  const exported = exportExecutionReport(input, options);
  const result = await submitExecutionFeedback(fake.call, { ...input, execute: true, confirmed: true }, options);
  assert.equal(result.state, 'VERIFIED');
  const upload = fake.calls.find(row => row.name === 'upload_markdown');
  assert.equal(upload.args.file_path, relative(fs.realpathSync(homedir()), exported.archivePath));
  assert.equal(isAbsolute(upload.args.file_path), false);
  assert.equal(hash(fs.readFileSync(exported.archivePath)), exported.archiveHash);
});

test('reports outside MCP home use a private identical ZIP and clean only their unique staging directory', async t => {
  const { options, input, fake } = submissionFixture(t, { stage: true });
  const exported = exportExecutionReport(input, options), keep = join(options.uploadBaseDir, 'keep');
  fs.writeFileSync(keep, 'unrelated file');
  let staged;
  const call = async (name, args) => {
    if (name === 'upload_markdown') {
      staged = resolve(options.uploadBaseDir, args.file_path);
      assert.match(args.file_path, /^\.zan-feedback-upload-[^/\\]+[/\\]execution-report\.zip$/);
      assert.equal(fs.statSync(dirname(staged)).mode & 0o777, 0o700);
      assert.equal(fs.statSync(staged).mode & 0o777, 0o600);
      assert.equal(hash(fs.readFileSync(staged)), exported.archiveHash);
      assert.deepEqual(fs.readFileSync(staged), fs.readFileSync(exported.archivePath));
    }
    return fake.call(name, args);
  };
  const result = await submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options);
  assert.equal(result.state, 'VERIFIED');
  assert.equal(fs.existsSync(staged), false); assert.equal(fs.existsSync(dirname(staged)), false);
  assert.equal(fs.readFileSync(keep, 'utf8'), 'unrelated file');
  assert.equal(hash(fs.readFileSync(exported.archivePath)), exported.archiveHash);
});

test('MCP upload mock rejects absolute paths, traversal and symlinks before reading files', async t => {
  const { options } = fixture(t), fake = gitlab(options.uploadBaseDir);
  const path = join(options.uploadBaseDir, 'valid.zip');
  fs.writeFileSync(path, 'PKfixture');
  fs.symlinkSync(path, join(options.uploadBaseDir, 'linked.zip'));
  await assert.rejects(fake.call('upload_markdown', { file_path: path }), /absolute/);
  await assert.rejects(fake.call('upload_markdown', { file_path: '../valid.zip' }), /traversal/);
  await assert.rejects(fake.call('upload_markdown', { file_path: 'linked.zip' }), /symlinks/);
  await fake.call('upload_markdown', { file_path: 'valid.zip' });
});

for (const stage of [false, true]) {
  test(`report directory symlinks are rejected before upload state is saved (staging=${stage})`, async t => {
    const { options, input, fake } = submissionFixture(t, { stage });
    const exported = exportExecutionReport(input, options), dir = dirname(exported.archivePath);
    const moved = dir + '-original';
    const call = async (name, args) => {
      if (name === 'get_project') {
        fs.renameSync(dir, moved);
        fs.symlinkSync(moved, dir);
      }
      return fake.call(name, args);
    };
    await assert.rejects(submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options), /符号链接/);
    assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
    assert.equal(fs.readdirSync(moved).some(name => name.startsWith('submission-')), false);
    if (stage) assert.deepEqual(fs.readdirSync(options.uploadBaseDir), []);
  });
}

test('an external data directory replaced by a root symlink during preflight cannot become a trusted source', async t => {
  const { options, input, fake } = submissionFixture(t, { stage: true });
  const exported = exportExecutionReport(input, options), root = options.dataDir, moved = root + '-original';
  t.after(() => fs.rmSync(moved, { recursive: true, force: true }));
  const call = async (name, args) => {
    if (name === 'get_project') {
      fs.renameSync(root, moved);
      fs.symlinkSync(moved, root);
    }
    return fake.call(name, args);
  };
  await assert.rejects(submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options), /符号链接/);
  assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
  assert.equal(fs.readdirSync(join(moved, relative(root, dirname(exported.archivePath))))
    .some(name => name.startsWith('submission-')), false);
});

test('the pinned public project is supported, while disabled Issues block writes', async t => {
  const { options, input, fake } = submissionFixture(t);
  assert.equal(fake.project.visibility, 'public');
  assert.equal((await submitExecutionFeedback(fake.call, input, options)).state, 'READY');
  fake.project.issues_enabled = false;
  await assert.rejects(submitExecutionFeedback(fake.call, { ...input, execute: true, confirmed: true }, options), /未启用 Issues/);
  assert.equal(fake.calls.some(row => row.name === 'upload_markdown'), false);
});

test('unknown upload is never replayed after a lost response', async t => {
  const { options, input, fake } = submissionFixture(t, { stage: true });
  let staged;
  const call = (name, args) => {
    if (name === 'upload_markdown') {
      staged = resolve(options.uploadBaseDir, args.file_path);
      assert.equal(fs.existsSync(staged), true);
      return Promise.reject(new Error('response lost'));
    }
    return fake.call(name, args);
  };
  const first = await submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options);
  assert.equal(first.state, 'UNKNOWN'); assert.equal(first.writes, null);
  assert.equal(fs.existsSync(staged), false); assert.equal(fs.existsSync(dirname(staged)), false);
  const again = await submitExecutionFeedback(fake.call, { ...input, execute: true, confirmed: true }, options);
  assert.equal(again.state, 'UNKNOWN');
  assert.equal(fake.calls.some(row => ['upload_markdown', 'create_issue'].includes(row.name)), false);
});

test('lost create response reconciles the actual Issue without another upload or create', async t => {
  const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
  const call = async (name, args) => {
    const result = await fake.call(name, args);
    if (name === 'create_issue') throw new Error('response lost after write');
    return result;
  };
  assert.equal((await submitExecutionFeedback(call, request, options)).state, 'UNKNOWN');
  assert.equal((await submitExecutionFeedback(fake.call, request, options)).state, 'VERIFIED');
  assert.equal(fake.calls.filter(row => row.name === 'create_issue').length, 1);
  assert.equal(fake.calls.filter(row => row.name === 'upload_markdown').length, 1);
});

test('wrong readback and external attachment links cannot be reported as complete', async t => {
  const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
  const call = (name, args) => name === 'upload_markdown' ?
    response({ url: 'https://outside.test/stolen.zip' }) : fake.call(name, args);
  assert.equal((await submitExecutionFeedback(call, request, options)).state, 'UNKNOWN');
  assert.equal(fake.calls.some(row => row.name === 'create_issue'), false);
});

test('simultaneous submissions use one local attempt, without duplicate writes', async t => {
  const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const call = async (name, args) => { if (name === 'upload_markdown') await blocked; return fake.call(name, args); };
  const first = submitExecutionFeedback(call, request, options);
  await new Promise(resolve => setImmediate(resolve));
  const second = await submitExecutionFeedback(fake.call, request, options);
  assert.equal(second.state, 'IN_PROGRESS_OR_INTERRUPTED'); release();
  assert.equal((await first).state, 'VERIFIED');
  assert.equal(fake.calls.filter(row => row.name === 'upload_markdown').length, 1);
});

test('local CLI uses explicit data directory and exports without credentials or network', t => {
  const { options, runId } = fixture(t);
  const env = { ...process.env, ZAN_WORKFLOWS_DATA_DIR: options.dataDir, ZAN_WORKFLOWS_RECORDING: 'off' };
  const recorder = fileURLToPath(new URL('../scripts/execution-recorder.mjs', import.meta.url));
  const listing = spawnSync(process.execPath, [recorder, 'list', '--json'], { env, input: '{}', encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr); assert.equal(JSON.parse(listing.stdout).runs[0].runId, runId);
  const exporter = fileURLToPath(new URL('../scripts/export-execution-report.mjs', import.meta.url));
  const exported = spawnSync(process.execPath, [exporter, '--json'],
    { env, input: JSON.stringify({ runId }), encoding: 'utf8', timeout: 5000 });
  assert.equal(exported.status, 0, exported.stderr); assert.equal(JSON.parse(exported.stdout).state, 'EXPORTED');
  const submit = fileURLToPath(new URL('../scripts/submit-execution-feedback.mjs', import.meta.url));
  const removed = spawnSync(process.execPath, [submit, 'configure', '--json'],
    { env, input: '{}', encoding: 'utf8', timeout: 5000 });
  assert.equal(removed.status, 1); assert.match(removed.stderr, /无效命令选项/);
});

test('actual session CLI links executor events to the explicit run without storing business input', t => {
  const { options, runId } = fixture(t), script = fileURLToPath(new URL('../scripts/workflow-session.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8', timeout: 5000,
    env: { ...process.env, ZAN_WORKFLOWS_RECORDING: 'on', ZAN_WORKFLOWS_DATA_DIR: options.dataDir, ZAN_WORKFLOWS_RUN_ID: runId },
    input: JSON.stringify({ id: 'invalid', action: 'not-supported', phase: 'PLAN', input: { token: 'never-store-this' } }) +
      '\n' + JSON.stringify({ id: 'finish', action: 'finish', phase: 'PLAN', input: {} }) + '\n' });
  assert.equal(result.status, 0, result.stderr);
  const ready = result.stderr.trim().split('\n').map(line => JSON.parse(line)).find(row => row.state === 'SESSION_READY');
  assert.equal(ready.feedbackRecording.runId, runId);
  const run = readRun(runId, options);
  assert.equal(run.events[0].type, 'action_started'); assert.equal(run.events[0].source, 'executor');
  assert.equal(run.events[1].state, 'BLOCKED');
  assert.equal(JSON.stringify(run).includes('never-store-this'), false);
});

test('recording opt-out disables even an explicitly linked automatic session recorder', t => {
  const { options, runId } = fixture(t), before = process.env.ZAN_WORKFLOWS_RECORDING;
  try {
    process.env.ZAN_WORKFLOWS_RECORDING = 'off';
    const record = sessionRecorder({ ...options, force: false, runId });
    record({ state: 'REQUEST_STARTED', requestId: 'not-recorded' });
    assert.equal(record.status.state, 'DISABLED'); assert.equal(readRun(runId, options).events.length, 0);
  } finally {
    if (before === undefined) delete process.env.ZAN_WORKFLOWS_RECORDING; else process.env.ZAN_WORKFLOWS_RECORDING = before;
  }
});

test('malformed JSON input does not echo user content in CLI errors', t => {
  const { options } = fixture(t), script = fileURLToPath(new URL('../scripts/execution-recorder.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'start'], { encoding: 'utf8',
    env: { ...process.env, ZAN_WORKFLOWS_DATA_DIR: options.dataDir }, input: 'sensitive-unlabelled-value', timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stderr.includes('sensitive-unlabelled-value'), false);
});

test('continued runs retain their explicit parent, project alias, retries and sanitized artifact links', t => {
  const { options, runId } = fixture(t);
  const child = startRun({ skill: 'submitting-for-test', parentRunId: runId, project: '商家端' }, options);
  recordEvent(child.runId, { type: 'retry', source: 'agent_summary', action: 'read-only-lookup',
    summary: '仅重试只读定位', artifactUrl: 'https://git.example.test/team/project/-/merge_requests/12?token=never-upload' }, options);
  const { report } = exportExecutionReport({ runId: child.runId }, options);
  assert.equal(report.parentRunId, runId); assert.equal(report.project, '商家端'); assert.equal(report.metrics.retryCount, 1);
  assert.deepEqual(report.artifacts, ['https://git.example.test/team/project/-/merge_requests/12']);
  assert.throws(() => startRun({ skill: 'fixing-bug', parentRunId: '../escape' }, options), /编号/);
});

test('an archive changed during remote preflight is rejected before uploading', async t => {
  const { options, input, fake } = submissionFixture(t), exported = exportExecutionReport(input, options);
  const call = async (name, args) => {
    if (name === 'get_project') fs.writeFileSync(exported.archivePath, 'modified after export');
    return fake.call(name, args);
  };
  await assert.rejects(submitExecutionFeedback(call, { ...input, execute: true, confirmed: true }, options), /附件已变化/);
  assert.equal(fake.calls.some(row => row.name === 'upload_markdown'), false);
});

test('a successful create acknowledgment cannot replace an independent matching Issue readback', async t => {
  const { options, input, fake } = submissionFixture(t), request = { ...input, execute: true, confirmed: true };
  const call = (name, args) => name === 'get_issue' ?
    response({ ...fake.issues[0], project_id: 88 }) : fake.call(name, args);
  const result = await submitExecutionFeedback(call, request, options);
  assert.equal(result.state, 'UNKNOWN'); assert.equal(result.writes, 2);
  assert.equal((await submitExecutionFeedback(fake.call, request, options)).state, 'VERIFIED');
  assert.equal(fake.calls.filter(row => row.name === 'create_issue').length, 1);
});

test('an exporter upgrade creates a fresh report revision while preserving the original run version', t => {
  const { options, input } = fixture(t), first = exportExecutionReport(input, options);
  const scripts = join(options.pluginRoot, 'scripts');
  fs.mkdirSync(scripts);
  for (const name of ['execution-recorder.mjs', 'export-execution-report.mjs']) {
    fs.copyFileSync(fileURLToPath(new URL('../scripts/' + name, import.meta.url)), join(scripts, name));
  }
  fs.appendFileSync(join(scripts, 'export-execution-report.mjs'), '\n// Simulate an installed exporter upgrade.\n');
  const upgraded = spawnSync(process.execPath, ['--input-type=module', '-e',
    'const {exportExecutionReport}=await import(' + JSON.stringify(pathToFileURL(join(scripts, 'export-execution-report.mjs')).href) + ');' +
    'console.log(JSON.stringify(exportExecutionReport(' + JSON.stringify(input) + ',' + JSON.stringify(options) + ')));'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(upgraded.status, 0, upgraded.stderr);
  const next = JSON.parse(upgraded.stdout);
  assert.notEqual(first.revision, next.revision);
  assert.equal(first.report.plugin.fingerprint, next.report.plugin.fingerprint);
});
