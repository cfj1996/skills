import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, copyFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const template = fileURLToPath(new URL('../assets/project-mock-check/check-mock.mjs', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const jobUrl = 'https://ci.example.test/job/release/';
const config = () => ({ schemaVersion: 1, sourcePaths: ['src'], artifactPaths: ['dist'],
  mockModuleIds: ['MOCK-orders'], forbiddenPaths: ['mocks', 'fixtures'],
  forbiddenContent: ['ENABLE_ORDER_FIXTURES'], runtimeRules: [] });

async function fixture(t, { git = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'project-mock-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['scripts', 'src', 'dist']) await mkdir(join(root, path));
  await copyFile(template, join(root, 'scripts/check-mock.mjs'));
  await writeFile(join(root, 'mock-check.json'), JSON.stringify(config()));
  await writeFile(join(root, 'src/main.js'), 'export const current = "real-api";\n');
  await writeFile(join(root, 'dist/main.js'), 'export const current="real-api";\n');
  const cmd = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let sha = 'a'.repeat(40);
  if (git) {
    cmd('init', '-q');
    cmd('config', 'user.name', 'Mock fixture');
    cmd('config', 'user.email', 'fixture@example.test');
    cmd('add', '.');
    cmd('commit', '-qm', 'fixture');
    sha = cmd('rev-parse', 'HEAD');
  }
  const run = (phase = 'source', extra = [], env = {}) => {
    const executionEnv = { ...process.env, ...env };
    for (const name of ['MOCK_SOURCE_SHA', 'JOB_URL', 'BUILD_NUMBER', 'QUEUE_ID']) if (!Object.hasOwn(env, name)) delete executionEnv[name];
    return spawnSync(process.execPath, ['scripts/check-mock.mjs', '--phase', phase, '--config', 'mock-check.json', '--source-sha', sha, ...extra],
      { cwd: root, env: executionEnv, encoding: 'utf8', timeout: 15000 });
  };
  const policy = async changes => writeFile(join(root, 'mock-check.json'), JSON.stringify({ ...config(), ...changes }));
  const commit = () => {
    cmd('add', '.');
    cmd('commit', '-qm', 'reviewed project fixture update');
    sha = cmd('rev-parse', 'HEAD');
    return sha;
  };
  return { root, get sha() { return sha; }, run, policy, cmd, commit };
}

function receipt(result, marker) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(marker + ' '), result.stdout);
  return JSON.parse(lines[0].slice(marker.length + 1));
}

function blocked(result, expected) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^MOCK_CHECK_BLOCKED /);
  assert.equal(result.stdout.includes('"state":"PASSED"'), false);
  if (expected) assert.match(result.stdout, expected);
}

const artifactArgs = ['--job-url', jobUrl, '--build-number', '47'];

test('project checker executes offline against a complete source tree and future artifacts are not required', async t => {
  const f = await fixture(t, { git: false });
  await rm(join(f.root, 'dist'), { recursive: true });
  const result = receipt(f.run(), 'MOCK_SOURCE_GATE');
  assert.equal(result.phase, 'source');
  assert.equal(result.sourceSha, f.sha);
  assert.equal(result.checkerHash, hash(await readFile(join(f.root, 'scripts/check-mock.mjs'))));
  assert.equal(result.configHash, hash(await readFile(join(f.root, 'mock-check.json'))));
  assert.match(result.sourceFingerprint, /^[a-f\d]{64}$/);
  assert.deepEqual(result.remainingMockPaths, []);
  assert.equal(result.runtimeEnabled, false);
  assert.equal(Object.hasOwn(result, 'artifactFingerprint'), false);
});

test('actual artifact receipt binds source, checker, policy, actual files and CI identity without requiring QUEUE_ID', async t => {
  const f = await fixture(t);
  const source = receipt(f.run(), 'MOCK_SOURCE_GATE');
  const artifact = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  assert.equal(artifact.phase, 'artifact');
  assert.equal(artifact.sourceSha, f.sha);
  assert.equal(artifact.jobUrl, jobUrl);
  assert.equal(artifact.buildNumber, 47);
  assert.equal(Object.hasOwn(artifact, 'queueId'), false);
  assert.equal(artifact.beforeDeploy, true);
  assert.equal(artifact.sourceFingerprint, source.sourceFingerprint);
  assert.equal(artifact.checkerHash, source.checkerHash);
  assert.equal(artifact.configHash, source.configHash);
  assert.match(artifact.artifactFingerprint, /^[a-f\d]{64}$/);
  const withEnv = receipt(f.run('artifact', [], { JOB_URL: jobUrl, BUILD_NUMBER: '48', QUEUE_ID: '91' }), 'MOCK_PRODUCTION_GATE');
  assert.equal(withEnv.buildNumber, 48);
  assert.equal(withEnv.queueId, 91);
});

test('source markers and registered module data fail production checks before any artifact exists', async t => {
  const f = await fixture(t);
  for (const source of ['/** @mock-module MOCK-orders MOCK_ONLY */\nexport const fake=[];',
    '// @api-mock true\nexport const fake=[];', '{"id":"MOCK-orders","marker":"MOCK_ONLY"}',
    'export const id="MOCK-orders";', 'export const fallback = ENABLE_ORDER_FIXTURES;']) {
    const path = source.startsWith('{') ? 'src/config.json' : 'src/main.js';
    await writeFile(join(f.root, path), source);
    blocked(f.run(), /prohibition failed/);
    await rm(join(f.root, 'src/config.json'), { force: true });
    await writeFile(join(f.root, 'src/main.js'), 'export const current="real-api";');
  }
});

test('full artifact traversal detects nested Mock files, registered data and custom activation rules', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'dist/deep/nested'), { recursive: true });
  for (const body of ['export const fixture="MOCK_ONLY";', 'export const fixture="MOCK-orders";', 'ENABLE_ORDER_FIXTURES=true;']) {
    await writeFile(join(f.root, 'dist/deep/nested/data.js'), body);
    blocked(f.run('artifact', artifactArgs), /prohibition failed/);
  }
  await rm(join(f.root, 'dist/deep'), { recursive: true });
  await mkdir(join(f.root, 'dist/fixtures'));
  await writeFile(join(f.root, 'dist/fixtures/data.json'), '[{"order":"sample"}]');
  blocked(f.run('artifact', artifactArgs), /prohibited path/);
});

test('runtime activation fields must be removed even when their current value is false', async t => {
  const f = await fixture(t);
  await f.policy({ runtimeRules: [
    { phase: 'source', path: 'src/runtime.json', forbiddenKeys: ['mockEnabled'] },
    { phase: 'artifact', path: 'dist/runtime.json', forbiddenKeys: ['mockEndpoint'] },
  ] });
  await writeFile(join(f.root, 'src/runtime.json'), '{"feature":{"mockEnabled":false}}');
  await writeFile(join(f.root, 'dist/runtime.json'), '{"mockEndpoint":""}');
  f.commit();
  blocked(f.run(), /runtime Mock activation key remains/);
  await writeFile(join(f.root, 'src/runtime.json'), '{"feature":{"real":true}}');
  receipt(f.run(), 'MOCK_SOURCE_GATE');
  f.commit();
  blocked(f.run('artifact', artifactArgs), /runtime Mock activation key remains/);
  await writeFile(join(f.root, 'dist/runtime.json'), '{}');
  receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  await rm(join(f.root, 'dist/runtime.json'));
  blocked(f.run('artifact', artifactArgs), /not inspected/);
});

test('missing, empty, individual-file or overlapping scopes cannot pass as complete release trees', async t => {
  const f = await fixture(t);
  await rm(join(f.root, 'dist/main.js'));
  blocked(f.run('artifact', artifactArgs), /empty/);
  await rm(join(f.root, 'dist'), { recursive: true });
  blocked(f.run('artifact', artifactArgs), /missing/);
  await f.policy({ sourcePaths: ['src/main.js'] });
  blocked(f.run(), /complete directories/);
  await f.policy({ sourcePaths: ['src', 'src/nested'] });
  blocked(f.run(), /overlap/);
  await f.policy({ sourcePaths: [] });
  blocked(f.run(), /sourcePaths/);
  await f.policy({ artifactPaths: ['src'] });
  blocked(f.run(), /separate/);
});

test('symlinked roots, nested files and configuration are rejected before scanning outside the project', async t => {
  const f = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'mock-check-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'outside.js'), 'export const fake="MOCK_ONLY"');
  await symlink(join(outside, 'outside.js'), join(f.root, 'dist/linked.js'));
  blocked(f.run('artifact', artifactArgs), /Symbolic links/);
  await rm(join(f.root, 'dist/linked.js'));
  await f.policy({ sourcePaths: ['linked'] });
  await symlink(outside, join(f.root, 'linked'));
  blocked(f.run(), /Symbolic links/);
  await rm(join(f.root, 'mock-check.json'));
  await writeFile(join(outside, 'policy.json'), JSON.stringify(config()));
  await symlink(join(outside, 'policy.json'), join(f.root, 'mock-check.json'));
  blocked(f.run(), /Symbolic links/);
});

test('unsupported archives, unsafe paths, unknown configuration and undeclared runtime scope fail closed', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'dist/archive.tgz'), 'opaque archive bytes');
  blocked(f.run('artifact', artifactArgs), /unpacked staging/);
  await f.policy({ sourcePaths: ['../elsewhere'] });
  blocked(f.run(), /sourcePaths/);
  await f.policy({ skipMockCheck: true });
  blocked(f.run(), /Unsupported/);
  await f.policy({ runtimeRules: [{ phase: 'source', path: 'config/runtime.json', forbiddenKeys: ['mockEnabled'] }] });
  blocked(f.run(), /outside/);
  await f.policy({ forbiddenPaths: ['**/mocks'] });
  blocked(f.run(), /forbiddenPaths/);
});

test('source identity and actual CI checkout are required, independent of caller-supplied success labels', async t => {
  const f = await fixture(t);
  blocked(f.run('artifact', artifactArgs, { MOCK_SOURCE_SHA: 'f'.repeat(40) }), /Conflicting/);
  const wrongSha = spawnSync(process.execPath, ['scripts/check-mock.mjs', '--phase', 'source', '--config', 'mock-check.json', '--source-sha', 'f'.repeat(40)],
    { cwd: f.root, encoding: 'utf8', timeout: 15000 });
  blocked(wrongSha, /does not match/);
  blocked(f.run('artifact'), /Job URL/);
  blocked(f.run('artifact', ['--job-url', jobUrl]), /build number/);
  blocked(f.run('artifact', ['--job-url', 'https://user:secret@ci.example.test/job/x/', '--build-number', '3']), /credential-free/);
  const exported = await fixture(t, { git: false });
  blocked(exported.run('artifact', artifactArgs), /actual CI Git checkout/);
});

test('fingerprints change when checked source, artifact, checker or policy bytes change', async t => {
  const f = await fixture(t);
  const first = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  await writeFile(join(f.root, 'src/main.js'), 'export const current="another-real-api";');
  blocked(f.run('artifact', artifactArgs), /differ from the exact committed source tree/);
  f.commit();
  const sourceChanged = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  assert.notEqual(first.sourceFingerprint, sourceChanged.sourceFingerprint);
  assert.equal(first.artifactFingerprint, sourceChanged.artifactFingerprint);
  await writeFile(join(f.root, 'dist/main.js'), 'export const current="another-real-api";');
  const artifactChanged = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  assert.notEqual(sourceChanged.artifactFingerprint, artifactChanged.artifactFingerprint);
  await f.policy({ forbiddenContent: ['ANOTHER_EXPLICIT_RULE'] });
  f.commit();
  const policyChanged = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  assert.notEqual(artifactChanged.configHash, policyChanged.configHash);
  const path = join(f.root, 'scripts/check-mock.mjs');
  await writeFile(path, await readFile(path, 'utf8') + '\n// revised reviewed checker\n');
  f.commit();
  const checkerChanged = receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
  assert.notEqual(policyChanged.checkerHash, checkerChanged.checkerHash);
});

test('build-time checker or policy rewrites block before publication instead of relying on post-build receipt validation', async t => {
  const f = await fixture(t);
  const checkerPath = join(f.root, 'scripts/check-mock.mjs');
  const checkerBytes = await readFile(checkerPath);
  const policyPath = join(f.root, 'mock-check.json');
  const policyBytes = await readFile(policyPath);
  await writeFile(checkerPath, checkerBytes.toString('utf8') + '\n// build accidentally rewrote checker\n');
  blocked(f.run('artifact', artifactArgs), /differs from the committed source/);
  await writeFile(checkerPath, checkerBytes);
  await f.policy({ forbiddenPaths: [], forbiddenContent: [], mockModuleIds: [] });
  blocked(f.run('artifact', artifactArgs), /differs from the committed source/);
  await writeFile(policyPath, policyBytes);
  receipt(f.run('artifact', artifactArgs), 'MOCK_PRODUCTION_GATE');
});

test('real release entry consumes a failed artifact check before a following publication action', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'dist/main.js'), 'export const fixture="MOCK_ONLY";');
  const publication = join(f.root, 'published');
  const entry = `const {spawnSync}=require('node:child_process');const fs=require('node:fs');const child=spawnSync(process.execPath,${JSON.stringify([
    'scripts/check-mock.mjs', '--phase', 'artifact', '--config', 'mock-check.json', '--source-sha', f.sha, ...artifactArgs,
  ])},{stdio:'inherit'});if(child.status!==0)process.exit(child.status||1);fs.writeFileSync(${JSON.stringify(publication)},'fixture publication');`;
  const result = spawnSync(process.execPath, ['-e', entry], { cwd: f.root, encoding: 'utf8', timeout: 15000 });
  blocked(result, /prohibition failed/);
  await assert.rejects(readFile(publication), { code: 'ENOENT' });
  await writeFile(join(f.root, 'dist/main.js'), 'export const real=true;');
  const passed = spawnSync(process.execPath, ['-e', entry], { cwd: f.root, encoding: 'utf8', timeout: 15000 });
  receipt(passed, 'MOCK_PRODUCTION_GATE');
  assert.equal(await readFile(publication, 'utf8'), 'fixture publication');
});

test('CI source mutation must fail before a following publication action', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'src/main.js'), 'export const current="build-replaced-source";');
  const publication = join(f.root, 'published');
  const entry = `const {spawnSync}=require('node:child_process');const fs=require('node:fs');const child=spawnSync(process.execPath,${JSON.stringify([
    'scripts/check-mock.mjs', '--phase', 'artifact', '--config', 'mock-check.json', '--source-sha', f.sha, ...artifactArgs,
  ])},{stdio:'inherit'});if(child.status!==0)process.exit(child.status||1);fs.writeFileSync(${JSON.stringify(publication)},'fixture publication');`;
  const result = spawnSync(process.execPath, ['-e', entry], { cwd: f.root, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, 'Source changed after the approved commit, but publication was reached: ' + result.stdout);
  await assert.rejects(readFile(publication), { code: 'ENOENT' });
});

test('actual source enumeration rejects untracked, ignored, removed and index-hidden source changes', async t => {
  for (const mutation of ['untracked', 'ignored', 'deleted', 'renamed', 'skip-worktree', 'assume-unchanged']) {
    const f = await fixture(t);
    if (mutation === 'ignored') {
      await writeFile(join(f.root, '.gitignore'), 'src/ignored.js\n');
      f.commit();
      await writeFile(join(f.root, 'src/ignored.js'), 'export const newlyLoaded="real-looking";');
    } else if (mutation === 'untracked') {
      await writeFile(join(f.root, 'src/newly-loaded.js'), 'export const newlyLoaded="real-looking";');
    } else if (mutation === 'deleted' || mutation === 'renamed') {
      const bytes = await readFile(join(f.root, 'src/main.js'));
      await rm(join(f.root, 'src/main.js'));
      if (mutation === 'renamed') await writeFile(join(f.root, 'src/other.js'), bytes);
    } else {
      f.cmd('update-index', '--' + mutation, 'src/main.js');
      await writeFile(join(f.root, 'src/main.js'), 'export const changed="hidden-from-git-status";');
      assert.equal(f.cmd('status', '--porcelain'), '', mutation + ' fixture must be hidden from git status');
    }
    blocked(f.run('artifact', artifactArgs), /exact committed source tree|empty/);
  }
});

test('a monorepo package compares project-relative source roots with the matching Git subtree', async t => {
  const f = await fixture(t);
  const packageRoot = join(f.root, 'packages/component');
  await mkdir(packageRoot, { recursive: true });
  for (const path of ['scripts', 'src', 'dist', 'mock-check.json']) await rename(join(f.root, path), join(packageRoot, path));
  f.commit();
  const run = () => spawnSync(process.execPath, ['scripts/check-mock.mjs', '--phase', 'artifact', '--config', 'mock-check.json',
    '--source-sha', f.sha, ...artifactArgs], { cwd: packageRoot, encoding: 'utf8', timeout: 15000 });
  receipt(run(), 'MOCK_PRODUCTION_GATE');
  await writeFile(join(packageRoot, 'src/main.js'), 'export const rewritten="build-mutated";');
  blocked(run(), /exact committed source tree/);
});
