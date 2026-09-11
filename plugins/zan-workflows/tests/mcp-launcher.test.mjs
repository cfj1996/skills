import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildLaunch, configPath, readConfig, redact, servers } from '../scripts/start-mcp.mjs';

const config = { version: 1, servers: Object.fromEntries(Object.entries(servers).map(([name, spec]) =>
  [name, { env: Object.fromEntries(spec.required.map(key => [key, `fake-${key}`])) }])) };
config.servers['yapi-mcp'].env.YAPI_PROJECT_TOKEN = 'fake-yapi-token';
const script = fileURLToPath(new URL('../scripts/start-mcp.mjs', import.meta.url));

test('each service receives only its own configured credentials, never credential args', () => {
  for (const name of Object.keys(servers)) {
    const plan = buildLaunch(name, config, { PATH: '/bin', TAPD_ACCESS_TOKEN: 'stale', GITLAB_JOB_TOKEN: 'stale', NODE_OPTIONS: '' });
    for (const [other, entry] of Object.entries(config.servers)) {
      for (const [key, value] of Object.entries(entry.env)) {
        assert.equal(plan.env[key], name === other ? value : undefined);
        assert.ok(!plan.args.includes(value));
      }
    }
    assert.equal(plan.env.GITLAB_JOB_TOKEN, undefined);
    assert.equal(plan.env.PATH, '/bin');
  }
  assert.ok(buildLaunch('gitlab-mcp', config).args.includes('--tool-policy-approve=create_merge_request,merge_merge_request'));
});

test('Windows uses native executables; config path follows home or explicit override', () => {
  assert.equal(buildLaunch('gitlab-mcp', config, {}, 'win32').command, 'volta.exe');
  assert.equal(buildLaunch('tapd-mcp', config, {}, 'win32').command, 'uvx.exe');
  assert.equal(configPath({}, '/example/home'), join('/example/home', '.config/zan-workflows/credentials.json'));
  assert.equal(configPath({ ZAN_WORKFLOWS_CONFIG: '/custom/file' }), '/custom/file');
});

test('missing services, invalid schema and incomplete YApi credentials fail closed', () => {
  assert.throws(() => buildLaunch('constructor', config));
  assert.throws(() => buildLaunch('gitlab-mcp', { version: 2 }));
  assert.throws(() => buildLaunch('tapd-mcp', { version: 1, servers: {} }));
  const incomplete = structuredClone(config);
  delete incomplete.servers['yapi-mcp'].env.YAPI_PROJECT_TOKEN;
  assert.throws(() => buildLaunch('yapi-mcp', incomplete), /YAPI_PROJECT_TOKEN/);
  incomplete.servers['yapi-mcp'].env.YAPI_USERNAME = 'user';
  incomplete.servers['yapi-mcp'].env.YAPI_PASSWORD = 'secret';
  assert.equal(buildLaunch('yapi-mcp', incomplete).env.YAPI_PASSWORD, 'secret');
});

test('malformed credential JSON never appears in an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zan-mcp-test-'));
  try {
    const path = join(dir, 'credentials.json');
    writeFileSync(path, '{"secret":"DO_NOT_LEAK" broken}');
    assert.throws(() => readConfig(path), error => !error.message.includes('DO_NOT_LEAK'));
    const child = spawnSync(process.execPath, [script, 'gitlab-mcp'], { env: { ...process.env, ZAN_WORKFLOWS_CONFIG: path }, encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.ok(!child.stderr.includes('DO_NOT_LEAK'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('redaction treats punctuation literally and handles overlapping secrets', () => {
  assert.equal(redact('x a.*b-long a.*b', { TOKEN: 'a.*b', PASSWORD: 'a.*b-long' }), 'x [REDACTED] [REDACTED]');
});

test('launcher forwards stdin/stdout, redacts split stderr and propagates exit status', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'zan-mcp-process-'));
  try {
    const path = join(dir, 'credentials.json');
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
    writeFileSync(join(dir, 'volta'), `#!${process.execPath}\nprocess.stdin.pipe(process.stdout);\nprocess.stderr.write('fake-GITLAB_');\nsetTimeout(() => { process.stderr.write('PERSONAL_ACCESS_TOKEN\\n'); process.exitCode = 7; }, 10);\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [script, 'gitlab-mcp'], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ZAN_WORKFLOWS_CONFIG: path },
      input: '{"jsonrpc":"2.0","id":1}\n', encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 7);
    assert.equal(result.stdout, '{"jsonrpc":"2.0","id":1}\n');
    assert.equal(result.stderr, '[REDACTED]\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
