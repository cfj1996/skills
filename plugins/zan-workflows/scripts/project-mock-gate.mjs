import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, chmod, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, dirname, join, isAbsolute } from 'node:path';
import { repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';
import { runLocalCheck } from './run-local-check.mjs';

const exec = promisify(execFile);
const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;
const HASH = /^[a-f\d]{64}$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
const refs = value => Array.isArray(value) && value.length > 0 && value.every(text);
const safePath = value => text(value) && !isAbsolute(value) && !value.includes('\\') &&
  !/[\0\r\n]/.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..' || part === '.git');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function directArtifactInvocation(invocation, checker) {
  const pathToken = path => `(?:${escapeRegex(path)}|"${escapeRegex(path)}"|'${escapeRegex(path)}')`;
  return !/[;|&`\r\n]/.test(invocation) &&
    new RegExp('^(?:node|nodejs)\\s+' + pathToken(checker.scriptPath) + '(?:\\s|$)').test(invocation) &&
    /(?:^|\s)--phase\s+artifact(?:\s|$)/.test(invocation) &&
    new RegExp('(?:^|\\s)--config\\s+' + pathToken(checker.configPath) + '(?:\\s|$)').test(invocation);
}
const git = (root, args, options = {}) => exec('git', args, {
  cwd: root, timeout: 30000, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...options,
});

async function repository(row) {
  if (!text(row?.repositoryPath) || !text(row.sourceRepository) || !SHA.test(row.sourceSha || '')) {
    throw new Error('项目 Mock 检查需要准确仓库路径、源码地址和不可变 SHA');
  }
  const [root, origin, revision] = await Promise.all([
    git(row.repositoryPath, ['rev-parse', '--show-toplevel']),
    git(row.repositoryPath, ['remote', 'get-url', 'origin']),
    git(row.repositoryPath, ['rev-parse', '--verify', `${row.sourceSha}^{commit}`]),
  ]);
  if (await realpath(root.stdout.trim()) !== await realpath(row.repositoryPath) ||
      repositoryKey(origin.stdout.trim()) !== repositoryKey(row.sourceRepository) || revision.stdout.trim() !== row.sourceSha) {
    throw new Error('项目 Mock 检查绑定的仓库或源码 SHA 与实际 Git 不一致');
  }
}

async function trackedFile(row) {
  if (!safePath(row.path)) throw new Error('项目 Mock 检查路径必须是仓库内的准确相对文件');
  await repository(row);
  const tree = await git(row.repositoryPath, ['ls-tree', '-z', row.sourceSha, '--', row.path]);
  const entries = tree.stdout.split('\0').filter(Boolean);
  if (entries.length !== 1 || !/^100(?:644|755) blob [a-f\d]+\t/.test(entries[0]) || entries[0].slice(entries[0].indexOf('\t') + 1) !== row.path) {
    throw new Error('项目 Mock 检查文件不存在，或使用了符号链接/子模块/目录');
  }
  return (await git(row.repositoryPath, ['show', `${row.sourceSha}:${row.path}`], {
    encoding: 'buffer', maxBuffer: 8 * 1024 * 1024,
  })).stdout;
}

export function projectMockIntegrationFingerprint(files) {
  return sha256(stableJson(files.map(({ path, contentHash }) => ({ path, contentHash })).sort((a, b) => a.path.localeCompare(b.path))));
}

// Entry-point semantics are reviewed against these exact Git files. This is a
// source-review trust boundary, not an arbitrary Groovy/shell interpreter.
export async function prepareProjectMockGate(input, io = {}) {
  const gate = input.projectMockGate;
  if (!gate || gate.schemaVersion !== 1 || gate.sourceSha !== input.expectedSha ||
      !text(gate.sourceRepository) || repositoryKey(gate.sourceRepository) !== repositoryKey(input.sourceRepository)) {
    throw new Error('正式发布缺少绑定本次源码的项目 Mock 检查脚本；请接入项目检查，Jenkins XML 权限不是前提');
  }
  const checker = gate.checker;
  if (!text(gate.repositoryPath) || !SHA.test(gate.sourceSha) || !checker || !safePath(checker.scriptPath) ||
      !safePath(checker.configPath) || !HASH.test(checker.contentHash || '') || !HASH.test(checker.configHash || '')) {
    throw new Error('项目 Mock 检查器缺少准确脚本、配置或内容指纹');
  }
  const read = io.readProjectMockFile || trackedFile;
  const [scriptBytes, configBytes] = await Promise.all([checker.scriptPath, checker.configPath].map(path => read({ ...gate, path })));
  const script = Buffer.isBuffer(scriptBytes) ? scriptBytes : Buffer.from(scriptBytes);
  const config = Buffer.isBuffer(configBytes) ? configBytes : Buffer.from(configBytes);
  if (sha256(script) !== checker.contentHash || sha256(config) !== checker.configHash) {
    throw new Error('项目 Mock 检查脚本或配置已变化，需要重新核实发布清单');
  }
  try { if (!JSON.parse(config.toString('utf8')) || !script.length) throw new Error(); }
  catch { throw new Error('项目 Mock 检查配置不是有效 JSON，或检查脚本为空'); }
  const integration = gate.integration;
  const pipeline = input.pipelineSource;
  const sameRelease = integration && integration.sourceSha === input.expectedSha &&
    repositoryKey(integration.sourceRepository || '') === repositoryKey(input.sourceRepository);
  const samePipeline = integration && pipeline && integration.sourceSha === pipeline.expectedSha &&
    repositoryKey(integration.sourceRepository || '') === repositoryKey(pipeline.repositoryUrl);
  if (!integration || (!sameRelease && !samePipeline) || !text(integration.repositoryPath) ||
      !safePath(integration.entrypoint) || !text(integration.checkerInvocation) || !text(integration.publishInvocation) ||
      !refs(integration.evidenceRefs) || !Array.isArray(integration.files) || !integration.files.length ||
      integration.files.some(file => !safePath(file.path) || !HASH.test(file.contentHash || '')) ||
      new Set(integration.files.map(file => file.path)).size !== integration.files.length ||
      !integration.files.some(file => file.path === integration.entrypoint)) {
    throw new Error('项目 Mock 制品检查尚未接入已核实的实际发布入口；需要准确入口源码和失败停止证据');
  }
  const review = integration.review;
  const filesFingerprint = projectMockIntegrationFingerprint(integration.files);
  if (!review || review.state !== 'VERIFIED' || review.sourceSha !== integration.sourceSha ||
      review.filesFingerprint !== filesFingerprint || review.checkedBeforePublish !== true ||
      review.failClosed !== true || review.noBypass !== true || !refs(review.evidenceRefs)) {
    throw new Error('项目发布入口缺少绑定当前全部文件指纹的先检查后发布、失败停止及无绕过路径评审');
  }
  const contents = await Promise.all(integration.files.map(async file => {
    const bytes = await read({ ...integration, path: file.path });
    if (sha256(bytes) !== file.contentHash) throw new Error('项目 Mock 发布入口源码已变化，需要重新评审接入');
    return { path: file.path, content: Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes };
  }));
  const body = contents.map(row => row.content).join('\n');
  // Verify the reviewed invocations exist. Whether each is executable and all
  // publish paths are guarded is the revision/file-bound review's responsibility.
  if (!directArtifactInvocation(integration.checkerInvocation, checker) ||
      !body.includes(integration.checkerInvocation) || !body.includes(integration.publishInvocation)) {
    throw new Error('受审发布入口未包含项目制品检查与实际发布调用');
  }
  if (integration.kind === 'npm-prepublishOnly') {
    let manifest;
    try { manifest = JSON.parse(contents.find(row => row.path === integration.entrypoint).content); }
    catch { throw new Error('npm 发布入口不是有效 package.json'); }
    if (manifest.scripts?.prepublishOnly !== integration.checkerInvocation ||
        /(?:--ignore-scripts|ignore_scripts\s*=\s*true)/i.test(integration.publishInvocation)) {
      throw new Error('npm prepublishOnly 未直接执行项目制品检查，或发布调用禁用了生命周期');
    }
  }
  const gateHash = sha256(stableJson(gate));
  if (input.projectMockGateHash && input.projectMockGateHash !== gateHash) throw new Error('项目 Mock 检查或发布接入绑定已变化，需要刷新发布清单');
  if (input.execute && !input.projectMockGateHash) throw new Error('正式执行缺少已确认的项目 Mock 检查绑定指纹');
  return { gate, gateHash, checkerHash: checker.contentHash, configHash: checker.configHash };
}

async function batchBlobs(root, entries) {
  const limit = 64 * 1024 * 1024;
  return new Promise((resolveResult, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const chunks = []; let size = 0, stderr = '', failed = false;
    const timer = setTimeout(() => { failed = true; child.kill('SIGKILL'); reject(new Error('项目源码快照读取超时')); }, 30000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > limit + entries.length * 160) { failed = true; child.kill('SIGKILL'); reject(new Error('项目源码快照超过检查预算')); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (failed) return;
      if (code !== 0) reject(new Error('项目源码快照读取失败：' + stderr)); else resolveResult(Buffer.concat(chunks)); });
    child.stdin.on('error', () => {});
    child.stdin.end(entries.map(entry => entry.oid).join('\n') + '\n');
  });
}

async function withSourceSnapshot(gate, action) {
  await repository(gate);
  const tree = (await git(gate.repositoryPath, ['ls-tree', '-r', '-l', '-z', gate.sourceSha])).stdout;
  let total = 0;
  const entries = tree.split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(100(?:644|755)) blob ([a-f\d]+)\s+(\d+)\t([\s\S]+)$/);
    if (!match || !safePath(match[4])) throw new Error('项目源码快照不接受符号链接、子模块或不安全路径');
    total += Number(match[3]);
    return { oid: match[2], size: Number(match[3]), path: match[4] };
  });
  if (!entries.length || entries.length > 100000 || total > 64 * 1024 * 1024) throw new Error('项目源码快照为空或超过检查预算');
  const blobs = await batchBlobs(gate.repositoryPath, entries);
  const temporary = await mkdtemp(join(tmpdir(), 'zan-project-mock-'));
  const snapshot = join(temporary, 'source');
  const directories = new Set([snapshot]);
  await mkdir(snapshot);
  try {
    let position = 0;
    for (const entry of entries) {
      const newline = blobs.indexOf(10, position);
      const header = blobs.subarray(position, newline).toString('utf8');
      if (newline < 0 || header !== `${entry.oid} blob ${entry.size}`) throw new Error('项目源码快照对象内容不可核实');
      const begin = newline + 1, end = begin + entry.size;
      if (blobs[end] !== 10) throw new Error('项目源码快照对象不完整');
      const destination = resolve(snapshot, entry.path);
      if (relative(snapshot, destination).startsWith('..')) throw new Error('项目源码快照路径超出检查范围');
      await mkdir(dirname(destination), { recursive: true });
      let directory = dirname(destination);
      while (directory.startsWith(snapshot)) { directories.add(directory); if (directory === snapshot) break; directory = dirname(directory); }
      await writeFile(destination, blobs.subarray(begin, end), { mode: 0o444 });
      position = end + 1;
    }
    if (position !== blobs.length) throw new Error('项目源码快照存在未绑定对象');
    for (const directory of directories) await chmod(directory, 0o555);
    return await action(snapshot);
  } finally {
    // Only this invocation's freshly allocated temporary snapshot is removed.
    for (const directory of directories) await chmod(directory, 0o700).catch(() => {});
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseSourceReceipt(output, prepared) {
  const rows = String(output).split(/\r?\n/).filter(line => line.startsWith('MOCK_SOURCE_GATE '));
  let receipt;
  try { if (rows.length !== 1) throw new Error(); receipt = JSON.parse(rows[0].slice('MOCK_SOURCE_GATE '.length)); }
  catch { throw new Error('项目源码检查缺少唯一可识别的实际执行回执'); }
  if (receipt.schemaVersion !== 1 || receipt.phase !== 'source' || receipt.state !== 'PASSED' ||
      receipt.sourceSha !== prepared.gate.sourceSha || receipt.checkerHash !== prepared.checkerHash ||
      receipt.configHash !== prepared.configHash || !HASH.test(receipt.sourceFingerprint || '') ||
      receipt.runtimeEnabled !== false || !Array.isArray(receipt.remainingMockPaths) || receipt.remainingMockPaths.length) {
    throw new Error('项目源码 Mock 检查失败，或回执与当前脚本、配置、源码不一致');
  }
  return receipt;
}

export async function runProjectMockSource(prepared, io = {}) {
  const gate = prepared.gate;
  const args = [gate.checker.scriptPath, '--phase', 'source', '--config', gate.checker.configPath, '--source-sha', gate.sourceSha];
  const execute = io.executeProjectMockSource || (async ({ sourceSnapshot }) => {
    const result = await runLocalCheck({ command: process.execPath, args, cwd: sourceSnapshot,
      kind: 'test', timeoutMs: 120000, maxRssMb: 2048, onProgress: io.onProgress, signal: io.signal });
    if (result.status !== 'PASSED' || result.exitCode !== 0) throw new Error('项目源码 Mock 检查脚本执行失败：' + result.status);
    return result.stdoutTail;
  });
  const output = io.executeProjectMockSource
    ? await execute({ gate, command: process.execPath, args })
    : await withSourceSnapshot(gate, sourceSnapshot => execute({ gate, command: process.execPath, args, sourceSnapshot }));
  return parseSourceReceipt(output, prepared);
}

export function verifyProjectMockArtifact(log, input, queueId, buildNumber) {
  // Jenkins may echo the same release log again in its summary/post-success
  // steps. Only byte-identical normalized receipt lines are the same evidence;
  // a second, different receipt remains an ambiguity and blocks verification.
  const rows = [...new Set(String(log).replace(/\u001b\[[;?\d]*[ -/]*[@-~]/g, '')
    .replace(/^\[[\dT:.Z+-]+\]\s?/gm, '').split(/\r?\n/).filter(line => line.startsWith('MOCK_PRODUCTION_GATE ')))];
  let receipt;
  try { if (rows.length !== 1) throw new Error(); receipt = JSON.parse(rows[0].slice('MOCK_PRODUCTION_GATE '.length)); }
  catch { throw new Error('本次正式构建缺少唯一可识别的项目制品 Mock 检查回执'); }
  const checker = input.projectMockGate?.checker;
  const sourceReceipt = input.projectMockSourceReceipt;
  if (!checker || !sourceReceipt || receipt.schemaVersion !== 1 || receipt.phase !== 'artifact' || receipt.state !== 'PASSED' ||
      receipt.sourceSha !== input.expectedSha || receipt.jobUrl !== input.jobUrl || receipt.buildNumber !== buildNumber ||
      receipt.queueId !== undefined && receipt.queueId !== queueId ||
      receipt.checkerHash !== checker.contentHash || receipt.configHash !== checker.configHash ||
      receipt.sourceFingerprint !== sourceReceipt.sourceFingerprint || !HASH.test(receipt.artifactFingerprint || '') ||
      receipt.beforeDeploy !== true || receipt.runtimeEnabled !== false ||
      !Array.isArray(receipt.remainingMockPaths) || receipt.remainingMockPaths.length) {
    throw new Error('Mock 制品检查未通过，或回执与本次源码、项目脚本、配置、Job、队列及构建不一致');
  }
  return { ...receipt, queueId, queueBinding: receipt.queueId === undefined ? 'VERIFIED_BUILD_QUEUE_ID' : 'CHECKER_AND_BUILD_QUEUE_ID' };
}
