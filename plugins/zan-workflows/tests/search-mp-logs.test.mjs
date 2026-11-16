import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/searching-mp-logs/scripts/search-mp-logs.mjs', import.meta.url));
const example = JSON.parse(readFileSync(new URL('../references/credentials.example.json', import.meta.url), 'utf8'));
const settings = { ...example.volcengineTls, accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk=abc', securityToken: 'fixture-sts' };
const timeRange = ['--from', '2026-11-16T14:00:00+08:00', '--to', '2026-11-16T06:30:00Z'];
const cursor = '[1794808800000,17,1,null]';
const unix = { skip: process.platform === 'win32' };

function run(t, args, { response, status = 0, tls = settings } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'zan-mp-log-fixture-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const tracePath = join(directory, 'invocation.json');
  const configPath = join(directory, 'credentials.json');
  writeFileSync(configPath, JSON.stringify({ version: 1, volcengineTls: tls }), { mode: 0o600 });
  writeFileSync(join(directory, 'volclog'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const source = args[args.indexOf('--secrets-file') + 1];
fs.writeFileSync(process.env.ZAN_MP_LOG_FIXTURE_TRACE, JSON.stringify({
  args, source,
  mode: fs.statSync(source).mode & 0o777,
  credentials: fs.readFileSync(source, 'utf8'),
  inherited: Object.keys(process.env).filter(key => /^(TAPD_ACCESS_TOKEN|VOLCENGINE_TOKEN|ZAN_WORKFLOWS_CONFIG)$/.test(key)),
}));
process.stdout.write(process.env.ZAN_MP_LOG_FIXTURE_RESPONSE);
process.exitCode = Number(process.env.ZAN_MP_LOG_FIXTURE_EXIT);
`, { mode: 0o755 });
  const child = spawnSync(process.execPath, [script, ...args], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      ZAN_WORKFLOWS_CONFIG: configPath,
      TAPD_ACCESS_TOKEN: 'other-service-token',
      VOLCENGINE_TOKEN: 'stale-tls-token',
      ZAN_MP_LOG_FIXTURE_TRACE: tracePath,
      ZAN_MP_LOG_FIXTURE_RESPONSE: JSON.stringify(response ?? null),
      ZAN_MP_LOG_FIXTURE_EXIT: String(status),
    },
  });
  assert.ifError(child.error);
  return { ...child, invocation: existsSync(tracePath) ? JSON.parse(readFileSync(tracePath, 'utf8')) : null };
}

test('mp_log reads TLS settings from the plugin config and preserves filters, cursor and logs', unix, t => {
  const query = 'projectName:"live-app" AND (level:error OR level:fatal)';
  const logs = [{ _id: 'log-a', level: 'error', data: '{"reason":"rootMissing"}', projectName: 'live-app' }];
  const result = run(t, [...timeRange, '--query', query, '--sort', 'asc', '--limit', '21', '--context', cursor], {
    response: {
      status: 'success',
      requestId: 'req-a',
      data: { Logs: logs, Count: 0, Analysis: false, ResultStatus: 'incomplete', ListOver: false, Context: cursor },
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const { args, source, mode, credentials, inherited } = result.invocation;
  assert.deepEqual(args.slice(0, -1), [
    '--secrets-file', source,
    '--region', settings.region,
    '--endpoint', settings.endpoint,
    '--output', 'json',
    '--output-mode', 'stdout',
    'tool', 'exec', 'log.search', '--input',
  ]);
  assert.equal(mode, 0o600);
  assert.equal(credentials, 'VOLCENGINE_ACCESS_KEY_ID=fixture-ak\nVOLCENGINE_ACCESS_KEY_SECRET=fixture-sk=abc\nVOLCENGINE_TOKEN=fixture-sts\n');
  assert.deepEqual(inherited, []);
  assert.equal(existsSync(source), false);
  assert.deepEqual(JSON.parse(args.at(-1)), {
    TopicId: settings.topicId,
    StartTime: Date.UTC(2026, 10, 16, 6),
    EndTime: Date.UTC(2026, 10, 16, 6, 30),
    Query: query,
    Limit: 21,
    Sort: 'asc',
    Context: cursor,
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    logs, returned: 1, resultStatus: 'incomplete', listOver: false, context: cursor, requestId: 'req-a',
  });
});

test('mp_log applies defaults and returns a successful empty page with a static key pair', unix, t => {
  const result = run(t, timeRange, {
    tls: { ...settings, securityToken: '' },
    response: { status: 'success', data: { Logs: null, ResultStatus: 'complete', ListOver: true } },
  });
  assert.equal(result.status, 0, result.stderr);
  const { Query, Limit, Sort, Context } = JSON.parse(result.invocation.args.at(-1));
  assert.deepEqual([Query, Limit, Sort, Context], ['*', 50, 'desc', undefined]);
  assert.doesNotMatch(result.invocation.credentials, /VOLCENGINE_TOKEN/u);
  assert.deepEqual(JSON.parse(result.stdout), {
    logs: [], returned: 0, resultStatus: 'complete', listOver: true, context: null, requestId: null,
  });
});

test('mp_log rejects invalid filters and incomplete or invalid config before starting the CLI', t => {
  for (const [args, tls, error] of [
    [['--to', '2026-11-16T14:00:00Z'], settings, /--from/u],
    [['--from', '2026-11-16T14:00:00', '--to', '2026-11-16T07:00:00Z'], settings, /时区/u],
    [['--from', '2026-02-30T14:00:00Z', '--to', '2026-03-05T07:00:00Z'], settings, /日期无效/u],
    [['--from', '2026-11-16T07:00:00Z', '--to', '2026-11-16T06:00:00Z'], settings, /必须早于/u],
    [[...timeRange, '--limit', '1001'], settings, /--limit/u],
    [[...timeRange, '--sort', 'invalid'], settings, /--sort/u],
    [timeRange, { ...settings, secretAccessKey: '' }, /volcengineTls\.secretAccessKey/u],
    [timeRange, { ...settings, securityToken: 'bad\ninjection' }, /volcengineTls\.securityToken/u],
    [timeRange, { ...settings, endpoint: 'http://tls-cn-guangzhou.volces.com' }, /HTTPS/u],
  ]) {
    const result = run(t, args, { tls });
    assert.equal(result.status, 1);
    assert.equal(result.invocation, null);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, error);
  }
});

test('mp_log reports failures with credential values redacted and cleans up the temporary credentials', unix, t => {
  for (const [response, status, error] of [
    [{ status: 'failed', requestId: 'req-denied', error: { code: 'Forbidden', message: 'fixture-ak fixture-sk=abc fixture-sts' } },
      1, /Forbidden.*\[REDACTED\].*req-denied/u],
    [{ status: 'success', data: { ResultStatus: 'error' } }, 0, /返回查询失败/u],
    [{ status: 'success', summary: { dryRun: true }, data: { type: 'plan' } }, 0, /请求预览/u],
    [{ status: 'success', data: { Analysis: true } }, 0, /原始日志/u],
    [{ status: 'success', data: { Logs: {} } }, 0, /Logs 格式无效/u],
  ]) {
    const result = run(t, timeRange, { response, status });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, error);
    assert.doesNotMatch(result.stderr, /fixture-(ak|sk|sts)/u);
    assert.equal(existsSync(result.invocation.source), false);
  }
});
