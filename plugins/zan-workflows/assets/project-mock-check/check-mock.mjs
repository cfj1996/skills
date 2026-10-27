#!/usr/bin/env node
// Copy into the project and review its configured production scope. This checker
// inspects files only; the project's release entry must consume its exit status.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 100000;
const hash = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' && value.trim() === value && value.length > 0;
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)].sort();
const within = (path, root) => path === root || path.startsWith(root + '/');
const pathValue = value => text(value) && !isAbsolute(value) && value !== '.' &&
  !/[\\\x00-\x1f*?\[\]{}]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');

function parseArgs(argv) {
  const options = Object.create(null);
  const allowed = new Set(['phase', 'config', 'source-sha', 'job-url', 'build-number', 'queue-id']);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, '');
    if (argv[index] !== '--' + name || !allowed.has(name) || Object.hasOwn(options, name) || !text(argv[index + 1])) {
      fail('Expected unique --phase/--config and supported identity options with values');
    }
    options[name] = argv[index + 1];
  }
  if (!['source', 'artifact'].includes(options.phase) || !pathValue(options.config)) fail('Explicit source|artifact phase and safe project-relative config path are required');
  return options;
}

function stringList(value, name, { paths = false, nonempty = false } = {}) {
  if (!Array.isArray(value) || nonempty && value.length === 0 || value.some(item => !(paths ? pathValue(item) : text(item))) ||
      new Set(value).size !== value.length) fail('Invalid explicit ' + name);
  return value;
}

function validateConfig(config) {
  const allowed = new Set(['schemaVersion', 'sourcePaths', 'artifactPaths', 'mockModuleIds', 'forbiddenPaths', 'forbiddenContent', 'runtimeRules']);
  if (!object(config) || config.schemaVersion !== 1 || Object.keys(config).some(key => !allowed.has(key))) fail('Unsupported Mock check configuration');
  stringList(config.sourcePaths, 'sourcePaths', { paths: true, nonempty: true });
  stringList(config.artifactPaths, 'artifactPaths', { paths: true, nonempty: true });
  stringList(config.mockModuleIds, 'mockModuleIds');
  if (config.mockModuleIds.some(id => !/^MOCK-[A-Za-z0-9-]+$/.test(id))) fail('Invalid stable Mock module ID');
  stringList(config.forbiddenPaths, 'forbiddenPaths', { paths: true });
  stringList(config.forbiddenContent, 'forbiddenContent');
  if (!Array.isArray(config.runtimeRules)) fail('Explicit runtimeRules are required');
  for (const rule of config.runtimeRules) {
    if (!object(rule) || Object.keys(rule).some(key => !['phase', 'path', 'forbiddenKeys'].includes(key)) ||
        !['source', 'artifact'].includes(rule.phase) || !pathValue(rule.path)) fail('Invalid runtime rule');
    stringList(rule.forbiddenKeys, 'runtime forbiddenKeys', { nonempty: true });
    const roots = rule.phase === 'source' ? config.sourcePaths : config.artifactPaths;
    if (!roots.some(root => within(rule.path, root))) fail('Runtime rule is outside its inspected phase');
  }
  // Overlapping roots create duplicate/ambiguous fingerprints and often conceal
  // an accidentally narrowed staging policy. Keep each complete tree once.
  for (const roots of [config.sourcePaths, config.artifactPaths]) {
    if (roots.some((root, index) => roots.some((other, otherIndex) => index !== otherIndex && within(root, other)))) fail('Inspection roots must not overlap');
  }
  if (config.sourcePaths.some(source => config.artifactPaths.some(artifact => within(source, artifact) || within(artifact, source)))) {
    fail('Source and final artifact trees must be separate');
  }
  return config;
}

async function checkedPath(root, path) {
  if (!pathValue(path)) fail('Unsafe inspection path');
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    const stat = await lstat(current).catch(() => fail('Required inspection path is missing: ' + path));
    if (stat.isSymbolicLink()) fail('Symbolic links are not an inspected release scope: ' + path);
  }
  const actual = await realpath(current);
  if (relative(root, actual).startsWith('..') || isAbsolute(relative(root, actual))) fail('Inspection path escapes project root');
  return current;
}

function gitEnvironment() {
  const env = { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
  return env;
}

function gitHead(root) {
  try {
    const result = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, env: gitEnvironment(), encoding: 'utf8', timeout: 10000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!SHA.test(result)) fail('Actual checkout SHA is invalid');
    return result.toLowerCase();
  } catch (error) {
    if (/not a git repository/.test(String(error.stderr))) return null;
    fail('Actual checkout identity cannot be verified');
  }
}

function verifyCommittedGateFile(root, sha, absolutePath, actualHash) {
  const options = { cwd: root, env: gitEnvironment(), timeout: 10000, maxBuffer: MAX_FILE_BYTES, stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { ...options, encoding: 'utf8' }).trim();
    const path = relative(repositoryRoot, absolutePath).split('\\').join('/');
    if (!pathValue(path)) fail('Gate file is outside the actual checkout');
    const entry = execFileSync('git', ['--literal-pathspecs', 'ls-tree', sha, '--', path], { ...options, cwd: repositoryRoot, encoding: 'utf8' });
    if (!/^100(?:644|755) blob [a-f\d]+\t/.test(entry)) fail('Gate file is not a committed regular file');
    const committed = execFileSync('git', ['show', sha + ':' + path], { ...options, cwd: repositoryRoot });
    if (hash(committed) !== actualHash) fail('Project checker or policy differs from the committed source: ' + path);
  } catch (error) {
    if (/^(Project checker or policy|Gate file)/.test(error.message)) throw error;
    fail('Project checker and policy must be readable from the actual source commit');
  }
}

function committedSourceTree(root, sha, paths) {
  const options = { cwd: root, env: gitEnvironment(), timeout: 10000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' };
  try {
    const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], options).trim();
    const objectFormat = execFileSync('git', ['rev-parse', '--show-object-format'], options).trim();
    if (!['sha1', 'sha256'].includes(objectFormat)) fail('Unsupported Git object format');
    const prefix = relative(repositoryRoot, root).split('\\').join('/');
    if (prefix && !pathValue(prefix)) fail('Source scope is outside the actual checkout');
    const repositoryPaths = paths.map(path => prefix ? prefix + '/' + path : path);
    const listing = execFileSync('git', ['--literal-pathspecs', 'ls-tree', '-r', '-z', sha, '--', ...repositoryPaths], { ...options, cwd: repositoryRoot });
    const files = listing.split('\0').filter(Boolean).map(entry => {
      const match = /^(100644|100755) blob ([a-f\d]+)\t([\s\S]+)$/.exec(entry);
      if (!match || match[2].length !== (objectFormat === 'sha1' ? 40 : 64)) fail('Source tree contains an unsupported Git entry');
      const path = prefix ? match[3].slice(prefix.length + 1) : match[3];
      if (prefix && !match[3].startsWith(prefix + '/') || !pathValue(path) || !paths.some(scope => within(path, scope))) fail('Committed source is outside its declared scope');
      return [path, match[2]];
    });
    if (!files.length) fail('Source scope has no committed files');
    files.sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0);
    return { objectFormat, files };
  } catch (error) {
    if (/^(Unsupported Git|Source |Committed source)/.test(error.message)) throw error;
    fail('The exact committed source tree cannot be verified');
  }
}

function sourceIdentity(root, options) {
  const declared = [options['source-sha'], process.env.MOCK_SOURCE_SHA].filter(value => value !== undefined);
  if (declared.some(value => !SHA.test(value)) || unique(declared.map(value => value.toLowerCase())).length > 1) fail('Conflicting or invalid explicit source SHA');
  const head = gitHead(root);
  if (options.phase === 'artifact' && !head) fail('Artifact checks require the actual CI Git checkout');
  const sha = declared[0]?.toLowerCase() || head;
  if (!sha || head && head !== sha) fail('Source SHA does not match the actual checkout');
  return sha;
}

function sourceDeclarations(path, body) {
  if (/^\s*(?:\/\/|\/\*+|\*|#|<!--)\s*(?:@mock-module\s+MOCK-[A-Za-z0-9-]+(?:\s+MOCK_ONLY)?|MOCK_ONLY\s+MOCK-[A-Za-z0-9-]+|@api-mock\s+true)\b/m.test(body)) return true;
  if (!path.endsWith('.json')) return false;
  let data;
  try { data = JSON.parse(body); } catch { return false; }
  const visit = value => object(value) && value.marker === 'MOCK_ONLY' || value && typeof value === 'object' && Object.values(value).some(visit);
  return Boolean(visit(data));
}

function prohibitedPath(path, roots, forbidden) {
  const scoped = roots.map(root => relative(root, path).split('\\').join('/'));
  return forbidden.some(part => [path, ...scoped].some(candidate => candidate === part || candidate.startsWith(part + '/') ||
    candidate.endsWith('/' + part) || candidate.includes('/' + part + '/')));
}

function hasForbiddenKey(value, names) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => names.includes(key) || hasForbiddenKey(item, names));
}

async function inspect(root, paths, config, phase, objectFormat) {
  const files = [];
  const gitBlobs = [];
  const bodies = new Map();
  const violations = [];
  let totalBytes = 0;
  async function walk(path) {
    const absolute = await checkedPath(root, path);
    const stat = await lstat(absolute);
    if (prohibitedPath(path, paths, config.forbiddenPaths)) violations.push(path + ': prohibited path');
    if (stat.isDirectory()) {
      const names = (await readdir(absolute)).sort();
      if (!names.length && paths.includes(path)) fail('Inspected tree is empty: ' + path);
      for (const name of names) await walk(path + '/' + name);
      return;
    }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || files.length >= MAX_FILES || totalBytes + stat.size > MAX_TOTAL_BYTES) fail('Unsupported or oversized inspection file: ' + path);
    if (phase === 'artifact' && /\.(?:zip|gz|tgz|tar|bz2|xz|7z|rar|br|zst)$/i.test(path)) fail('Inspect the final unpacked staging tree before archiving: ' + path);
    const bytes = await readFile(absolute);
    totalBytes += bytes.length;
    if (bytes.length !== stat.size || totalBytes > MAX_TOTAL_BYTES) fail('Inspection file changed while being read: ' + path);
    const body = bytes.toString('utf8');
    files.push([path, hash(bytes)]);
    if (objectFormat) gitBlobs.push([path, createHash(objectFormat).update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex')]);
    bodies.set(path, body);
    const marked = phase === 'source' ? sourceDeclarations(path, body) : /\bMOCK_ONLY\b|\bMOCK-[A-Za-z0-9-]+\b|@api-mock\s+true\b/.test(body);
    if (marked || config.mockModuleIds.some(id => body.includes(id)) || config.forbiddenContent.some(value => body.includes(value))) violations.push(path + ': Mock declaration, module data or prohibited activation content');
  }
  for (const path of [...paths].sort()) {
    const absolute = await checkedPath(root, path);
    if (!(await lstat(absolute)).isDirectory()) fail('Inspection roots must be complete directories: ' + path);
    await walk(path);
  }
  if (!files.length) fail('Inspection contains no files');
  for (const rule of config.runtimeRules.filter(row => row.phase === phase)) {
    if (!bodies.has(rule.path)) fail('Required runtime configuration was not inspected: ' + rule.path);
    let value;
    try { value = JSON.parse(bodies.get(rule.path)); } catch { fail('Runtime configuration is not valid JSON: ' + rule.path); }
    if (hasForbiddenKey(value, rule.forbiddenKeys)) violations.push(rule.path + ': runtime Mock activation key remains');
  }
  if (violations.length) fail('Production Mock prohibition failed: ' + unique(violations).join('; '));
  const sort = ([first], [second]) => first < second ? -1 : first > second ? 1 : 0;
  return { fingerprint: hash(JSON.stringify(files.sort(sort))), gitBlobs: gitBlobs.sort(sort) };
}

function positiveNumber(value, field) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Explicit CI ' + field + ' is required');
  return Number(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = await realpath(process.cwd());
  const configBytes = await readFile(await checkedPath(root, options.config));
  let parsed;
  try { parsed = JSON.parse(configBytes.toString('utf8')); } catch { fail('Mock check configuration is not valid JSON'); }
  const config = validateConfig(parsed);
  const sourceSha = sourceIdentity(root, options);
  const checker = await realpath(fileURLToPath(import.meta.url));
  const checkerRelative = relative(root, checker).split('\\').join('/');
  if (!pathValue(checkerRelative)) fail('The project checker must belong to the inspected project');
  await checkedPath(root, checkerRelative);
  const checkerHash = hash(await readFile(checker));
  const configHash = hash(configBytes);
  if (options.phase === 'artifact') {
    verifyCommittedGateFile(root, sourceSha, checker, checkerHash);
    verifyCommittedGateFile(root, sourceSha, resolve(root, options.config), configHash);
  }
  const sourceTree = options.phase === 'artifact' ? committedSourceTree(root, sourceSha, config.sourcePaths) : null;
  const sourceInspection = await inspect(root, config.sourcePaths, config, 'source', sourceTree?.objectFormat);
  if (sourceTree && JSON.stringify(sourceInspection.gitBlobs) !== JSON.stringify(sourceTree.files)) fail('Actual production source files differ from the exact committed source tree');
  const sourceFingerprint = sourceInspection.fingerprint;
  const receipt = { schemaVersion: 1, phase: options.phase, state: 'PASSED', sourceSha, checkerHash, configHash,
    sourceFingerprint, remainingMockPaths: [], runtimeEnabled: false };
  if (options.phase === 'artifact') {
    receipt.artifactFingerprint = (await inspect(root, config.artifactPaths, config, 'artifact')).fingerprint;
    const jobUrl = options['job-url'] || process.env.JOB_URL;
    let url;
    try { url = new URL(jobUrl); } catch { fail('Explicit CI Job URL is required'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) fail('CI Job URL must be an exact credential-free Job URL');
    receipt.jobUrl = jobUrl;
    receipt.buildNumber = positiveNumber(options['build-number'] || process.env.BUILD_NUMBER, 'build number');
    const queue = options['queue-id'] || process.env.QUEUE_ID;
    if (queue !== undefined) receipt.queueId = positiveNumber(queue, 'queue ID');
    receipt.beforeDeploy = true;
  }
  // Recheck the files that define the inspection after reading the full trees.
  if (hash(await readFile(checker)) !== checkerHash || hash(await readFile(await checkedPath(root, options.config))) !== configHash) fail('Checker or policy changed during inspection');
  if (options.phase === 'artifact' && gitHead(root) !== sourceSha) fail('Actual checkout changed during artifact inspection');
  process.stdout.write((options.phase === 'source' ? 'MOCK_SOURCE_GATE ' : 'MOCK_PRODUCTION_GATE ') + JSON.stringify(receipt) + '\n');
}

main().catch(error => {
  process.stdout.write('MOCK_CHECK_BLOCKED ' + JSON.stringify({ state: 'BLOCKED', error: error.message }) + '\n');
  process.exitCode = 1;
});
