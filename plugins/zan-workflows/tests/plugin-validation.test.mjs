import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorRoot = path.join(pluginRoot, 'scripts/vendor/openai-plugin-validator');
const validator = path.join(vendorRoot, 'validate_plugin.py');

function validate(root, cwd = tmpdir()) {
  return spawnSync('python3', ['-B', validator, root], {
    cwd, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
}

function fixture(t, change = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'zan-plugin-validation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.codex-plugin'));
  mkdirSync(path.join(root, 'assets'));
  mkdirSync(path.join(root, 'skills/example'), { recursive: true });
  writeFileSync(path.join(root, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"/>');
  writeFileSync(path.join(root, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Exercise the fixture workflow.\n---\n\n# Example\n');
  writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { example: { command: 'node', args: [] } } }));
  const manifest = {
    name: 'fixture-plugin', version: '1.2.3', description: 'A validation fixture.',
    author: { name: 'Fixture author' }, skills: './skills/', mcpServers: './.mcp.json',
    interface: {
      displayName: 'Fixture', shortDescription: 'Validation fixture',
      longDescription: 'A local disposable package used to exercise validation.',
      developerName: 'Fixture author', category: 'Productivity', capabilities: [],
      defaultPrompt: ['Exercise this fixture.'], logo: './assets/logo.svg',
    },
  };
  change(manifest, root);
  writeFileSync(path.join(root, '.codex-plugin/plugin.json'), JSON.stringify(manifest));
  return root;
}

function rejects(result, expected) {
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, expected);
  assert.doesNotMatch(result.stderr, /Traceback/);
}

test('vendored validator and license match the pinned upstream blobs', () => {
  const blobs = {
    'validate_plugin.py': 'b5be462c3b4fe3ea6083cca948ccf52e05301546',
    'identifier_validation.py': '41a1a2f1b503c165f5d4b93f7f0e99eb0b3add6e',
    LICENSE: '4606e72e042564097e8780d66c1d4dcb611869bd',
    NOTICE: '2805899d56d0332d175cfc613c67d45d6f006db7',
  };
  for (const [name, expected] of Object.entries(blobs)) {
    const body = readFileSync(path.join(vendorRoot, name));
    const actual = createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
    assert.equal(actual, expected, name);
  }
});

test('repository plugin validates from outside the repository cwd', () => {
  const result = validate(pluginRoot);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Plugin validation passed:/);
});

test('a well-formed disposable plugin validates', t => {
  const result = validate(fixture(t));
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('invalid manifest version is rejected by the CLI', t => {
  rejects(validate(fixture(t, m => { m.version = '1.2'; })), /version.*strict semver/);
});

test('missing companion MCP manifest is rejected', t => {
  rejects(validate(fixture(t, (_m, root) => rmSync(path.join(root, '.mcp.json')))), /\.mcp\.json.*required/);
});

test('malformed MCP server collection is rejected', t => {
  const root = fixture(t, (_m, dir) => writeFileSync(path.join(dir, '.mcp.json'), '{"mcpServers":[]}'));
  rejects(validate(root), /mcpServers.*must be an object/);
});

test('missing and escaping icon references are rejected', t => {
  rejects(validate(fixture(t, m => { m.interface.logo = './assets/missing.svg'; })), /logo.*missing file/);
  rejects(validate(fixture(t, m => { m.interface.logo = '../outside.svg'; })), /logo.*inside the plugin archive/);
});

test('malformed skill frontmatter is rejected', t => {
  const root = fixture(t, (_m, dir) => writeFileSync(path.join(dir, 'skills/example/SKILL.md'), '---\nname: [\n---\n'));
  rejects(validate(root), /frontmatter must be valid YAML/);
});
