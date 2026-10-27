#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCliPlan, repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';

const run = promisify(execFile);
const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;
const HASH = /^[a-f\d]{64}$/i;
const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.length > 0 && value.every(text);
const covered = (path, roots) => roots.some(root => root === '.' || path === root || path.startsWith(root.replace(/\/$/, '') + '/'));
const relpath = value => text(value) && !isAbsolute(value) && value !== '..' && !value.split(/[\\/]/).includes('..') && !value.includes('\\');
function declarations(path, body) {
  const ids = [];
  const comment = /^\s*(?:\/\/|\/\*+|\*|#|<!--)\s*(?:@mock-module\s+(MOCK-[A-Za-z0-9-]+)(?:\s+MOCK_ONLY)?|MOCK_ONLY\s+(MOCK-[A-Za-z0-9-]+))\b/gm;
  for (const match of body.matchAll(comment)) ids.push(match[1] || match[2]);
  const apiMock = /^\s*(?:\/\/|\/\*+|\*)\s*@api-mock\s+true\b/m.test(body);
  if (extname(path) === '.json') {
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.marker === 'MOCK_ONLY' && /^MOCK-[A-Za-z0-9-]+$/.test(value.id || '')) ids.push(value.id);
      for (const item of Object.values(value)) visit(item);
    };
    try { visit(JSON.parse(body)); } catch { /* Non-JSON is not inferred as a declaration. */ }
  }
  return { detected: apiMock || ids.length > 0, moduleIds: unique(ids) };
}
const CODE = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.json', '.yaml', '.yml', '.html']);
const nonRuntime = path => /(?:^|\/)(?:tests?|__tests__|docs|node_modules|dist|\.git|\.query-contract\/cache)(?:\/|$)/.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
const unique = values => [...new Set(values)].sort();
const git = async (root, args) => (await run('git', args, { cwd: root, timeout: 30000, maxBuffer: 16 * 1024 * 1024 })).stdout;

// This snapshot proves revision/content binding, not the semantic absence of all
// possible mocks. evidenceRefs must identify the project's inventory/import/
// activation review; marker discoveries are additionally reconciled below.
export async function inspectMockSource(input) {
  if (!text(input.repositoryPath) || !SHA.test(input.baseSha || '') ||
      !texts(input.inspectedPaths) || !input.inspectedPaths.every(relpath) ||
      !texts(input.mockBindingPaths) || !input.mockBindingPaths.every(relpath) || !texts(input.runtimePaths) || !input.runtimePaths.every(relpath)) {
    throw new Error('Mock 清查需要准确仓库、基准 SHA、受检路径和项目 Mock/启动配置绑定路径');
  }
  const root = await realpath(resolve(input.repositoryPath));
  const [actualRoot, actualOrigin, head, base] = await Promise.all([
    git(root, ['rev-parse', '--show-toplevel']), git(root, ['remote', 'get-url', 'origin']),
    git(root, ['rev-parse', 'HEAD']), git(root, ['rev-parse', `${input.baseSha}^{commit}`]),
  ]);
  if (await realpath(resolve(actualRoot.trim())) !== root || repositoryKey(actualOrigin.trim()) !== repositoryKey(input.sourceRepository)) {
    throw new Error('Mock 清查的仓库身份与实际 Git 不一致');
  }
  const revision = input.revisionSha;
  if (revision && (!SHA.test(revision) || (await git(root, ['rev-parse', `${revision}^{commit}`])).trim() !== revision)) throw new Error('指定清查 revision 不是已核实的不可变提交');
  const sourceSha = revision || head.trim();
  if (base.trim() !== input.baseSha || !SHA.test(sourceSha)) throw new Error('Mock 清查基准或当前 HEAD 不可核实');
  const changed = unique((await git(root, ['diff', '--name-only', '-z', input.baseSha, ...(revision ? [revision] : []), '--'])).split('\0').filter(Boolean));
  const untracked = revision ? [] : (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  const ignoredRuntimePaths = revision ? [] : (await git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...input.runtimePaths])).split('\0').filter(Boolean);
  const inspectedPaths = unique(input.inspectedPaths);
  if ([...changed, ...untracked].some(path => !covered(path, inspectedPaths)) ||
      [...input.mockBindingPaths, ...input.runtimePaths, ...ignoredRuntimePaths].some(path => !covered(path, inspectedPaths))) {
    throw new Error('Mock 清查范围未覆盖完整待交付差异/未跟踪文件及项目 Mock 配置入口');
  }
  const currentNames = revision ? (await git(root, ['ls-tree', '-r', '--name-only', '-z', revision, '--', ...inspectedPaths])).split('\0').filter(Boolean)
    : (await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...inspectedPaths])).split('\0').filter(Boolean);
  const baseNames = (await git(root, ['ls-tree', '-r', '--name-only', '-z', input.baseSha, '--', ...inspectedPaths])).split('\0').filter(Boolean);
  const names = unique([...ignoredRuntimePaths, ...currentNames, ...baseNames]);
  const files = [], markedPaths = [], markerBindings = [];
  for (const path of names) {
    const absolute = resolve(root, path);
    if (!covered(path, inspectedPaths) || relative(root, absolute).startsWith('..')) throw new Error('Mock 清查路径超出仓库');
    let data;
    if (revision) {
      if (!currentNames.includes(path)) { files.push([path, null]); continue; }
      const mode = (await git(root, ['ls-tree', revision, '--', path])).split(/\s+/)[0];
      if (mode === '120000' || mode === '160000') throw new Error('Mock revision 清查不接受符号链接或未展开子模块');
      data = (await run('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'buffer', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout;
    } else {
      let stat;
      try { stat = await lstat(absolute); } catch (error) {
        if (error.code === 'ENOENT') { files.push([path, null]); continue; }
        throw error;
      }
      if (stat.isSymbolicLink() || !(await realpath(absolute)).startsWith(root + '/')) throw new Error('Mock 清查不接受符号链接或仓库外路径');
      if (!stat.isFile()) continue;
      if (stat.size > 8 * 1024 * 1024) throw new Error('Mock 清查文件过大，需项目提供受审查的定向检查绑定');
      data = await readFile(absolute);
    }
    files.push([path, sha256(data)]);
    const declaration = !nonRuntime(path) && CODE.has(extname(path)) ? declarations(path, data.toString('utf8')) : null;
    if (declaration?.detected) {
      markedPaths.push(path);
      markerBindings.push({ path, moduleIds: declaration.moduleIds });
    }
  }
  if (input.mockBindingPaths.some(path => !names.some(name => name === path || name.startsWith(path + '/')))) {
    throw new Error('声明的项目 Mock/启动配置绑定路径不存在或未纳入版本清查');
  }
  const contentFingerprint = sha256(stableJson(files));
  const scopeFingerprint = sha256(stableJson({ baseSha: input.baseSha, inspectedPaths, files }));
  return { sourceSha, inspectionKind: revision ? 'revision' : 'working-tree', baseSha: input.baseSha, inspectedPaths, contentFingerprint, scopeFingerprint,
    changedPaths: unique([...changed, ...untracked]), ignoredRuntimePaths, fileFingerprints: Object.fromEntries(files), markedPaths: markedPaths.sort(), markerBindings, writes: 0 };
}

async function verifyCommittedContent(safety, revision) {
  if (!SHA.test(revision || '')) throw new Error('派生源码缺少准确 SHA');
  try { await git(safety.repositoryPath, ['merge-base', '--is-ancestor', safety.sourceSha, revision]); }
  catch { throw new Error('交付版本不能验证为原已检查版本的后继；不能机械更新 Mock 授权'); }
  const names = unique([...(await git(safety.repositoryPath, ['ls-tree', '-r', '--name-only', '-z', safety.baseSha, '--', ...safety.inspectedPaths])).split('\0').filter(Boolean),
    ...(await git(safety.repositoryPath, ['ls-tree', '-r', '--name-only', '-z', revision, '--', ...safety.inspectedPaths])).split('\0').filter(Boolean)]);
  const files = [];
  for (const path of names) {
    try {
      const value = await run('git', ['show', `${revision}:${path}`], { cwd: safety.repositoryPath, encoding: 'buffer', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      files.push([path, sha256(value.stdout)]);
    } catch (error) {
      if (/does not exist|exists on disk, but not in|not exist in/.test(String(error.stderr))) files.push([path, null]);
      else throw new Error('交付版本文件内容不可核实');
    }
  }
  if (sha256(stableJson(files)) !== safety.contentFingerprint) throw new Error('交付提交与已确认的工作区/Mock 清查内容不等价');
}

async function verifyDeliveredSource(safety, revision, sourceSnapshot, io) {
  const evidence = safety.deliverySourceEvidence;
  if (!evidence || evidence.deliveredSha !== revision || !texts(evidence.evidenceRefs)) throw new Error('目标分支包含额外内容，需要只读 revision 清查及目标依赖评审证据');
  try { await git(safety.repositoryPath, ['merge-base', '--is-ancestor', safety.sourceSha, revision]); }
  catch { throw new Error('交付目标未包含原已清查的 source SHA'); }
  const target = await (io.inspectMockSource || inspectMockSource)({ ...safety, revisionSha: revision });
  if (target.sourceSha !== revision || target.inspectionKind !== 'revision' || target.scopeFingerprint !== evidence.scopeFingerprint ||
      target.contentFingerprint !== evidence.contentFingerprint) throw new Error('交付目标 revision 清查证据已过期或不一致');
  const bindingRoots = [...safety.mockBindingPaths, ...safety.mockModules.flatMap(module => module.paths)];
  // Include both trees: a newly added file under an approved directory changes
  // that Mock/config scope even when it reuses an already registered module ID.
  const preserved = unique([...(sourceSnapshot.changedPaths || []),
    ...unique([...Object.keys(sourceSnapshot.fileFingerprints || {}), ...Object.keys(target.fileFingerprints || {})])
      .filter(path => covered(path, bindingRoots))]);
  if (preserved.some(path => sourceSnapshot.fileFingerprints?.[path] !== target.fileFingerprints?.[path])) {
    throw new Error('目标分支改变了已批准源码或 Mock 启动配置；不能机械沿用原授权');
  }
  validateModules({ ...safety, productionSourceEvidence: evidence.productionSourceEvidence || safety.productionSourceEvidence }, target);
  return target;
}

export function mockInventoryFingerprint(safety) {
  return sha256(stableJson({ sourceRepository: repositoryKey(safety.sourceRepository), baseSha: safety.baseSha,
    scopeFingerprint: safety.scopeFingerprint, contentFingerprint: safety.contentFingerprint,
    inspectedPaths: safety.inspectedPaths, mockBindingPaths: safety.mockBindingPaths, runtimePaths: safety.runtimePaths,
    mockModules: safety.mockModules, productionIsolation: safety.productionIsolation || null }));
}

function validateModules(safety, snapshot) {
  if (!Array.isArray(safety.mockModules)) throw new Error('Mock 清单未知，不能默认无 Mock');
  const ids = new Set();
  for (const module of safety.mockModules) {
    if (!/^MOCK-[A-Za-z0-9-]+$/.test(module?.id || '') || ids.has(module.id) || module.marker !== 'MOCK_ONLY' ||
        !['active', 'retired'].includes(module.status) || !texts(module.paths) || !module.paths.every(relpath) ||
        !texts(module.featureRefs) || !['function-data', 'http-contract', 'managed-draft'].includes(module.mode) ||
        !texts(module.scenarios) || !text(module.activation) || !text(module.realRequestBoundary) ||
        !text(module.exitCondition) || !texts(module.verificationLimits)) throw new Error('Mock 模块缺少稳定标识、范围、场景、切换或退出/验证边界');
    if (module.status === 'retired' && !texts(module.exitEvidenceRefs)) throw new Error('退役 Mock 缺少真实替换/移除的退出证据');
    if (module.paths.some(path => !covered(path, snapshot.inspectedPaths))) throw new Error('Mock 模块路径不在本次完整清查范围内');
    ids.add(module.id);
  }
  const active = safety.mockModules.filter(module => module.status === 'active');
  if (active.some(module => !(snapshot.markerBindings || []).some(binding => covered(binding.path, module.paths) && binding.moduleIds.includes(module.id)))) {
    throw new Error('活动 Mock 模块缺少实际源码/配置中的明确稳定标识');
  }
  if ((snapshot.markerBindings || []).some(binding => !Array.isArray(binding.moduleIds) || !binding.moduleIds.length ||
      binding.moduleIds.some(id => !safety.mockModules.some(module => module.id === id && covered(binding.path, module.paths))))) {
    throw new Error('源码 Mock 标识未关联登记的稳定模块 ID，不能仅按路径覆盖');
  }
  if (snapshot.markedPaths.some(path => !safety.mockModules.some(module => covered(path, module.paths)))) {
    throw new Error('发现未登记的 MOCK_ONLY/@api-mock 标识');
  }
  if (safety.mockModules.some(module => module.status === 'retired')) validateSourceIsolationEvidence(safety, snapshot);
}

function validateSourceIsolationEvidence(safety, snapshot) {
  const evidence = safety.productionSourceEvidence;
  if (!evidence || evidence.scopeFingerprint !== snapshot.scopeFingerprint || !texts(evidence.evidenceRefs) ||
      !texts(evidence.configPaths) || !Array.isArray(evidence.remainingRuntimeMockPaths) || evidence.remainingRuntimeMockPaths.length ||
      evidence.configPaths.some(path => !HASH.test(evidence.configurationFingerprints?.[path] || '') ||
        snapshot.fileFingerprints?.[path] !== evidence.configurationFingerprints[path])) {
    throw new Error('缺少本次源码退出/构建隔离证据及实际配置内容指纹；retired 不等于生产制品已清除');
  }
}

function checkProductionSource(safety, snapshot) {
  const active = safety.mockModules.filter(module => module.status === 'active');
  const isolation = safety.productionIsolation;
  if (active.length && (!isolation || !texts(isolation.excludedModuleIds) ||
      active.some(module => !isolation.excludedModuleIds.includes(module.id)) ||
      !texts(isolation.configPaths) || !texts(isolation.evidenceRefs) ||
      isolation.configPaths.some(path => !snapshot.inspectedPaths.some(root => covered(path, [root]))))) {
    throw new Error('生产范围仍有 Mock；关闭开关或退役标签不能代替源码隔离证据');
  }
  if (active.length || safety.mockModules.some(module => module.status === 'retired')) validateSourceIsolationEvidence(safety, snapshot);
}

function checkTestAuthorization(safety, context, fingerprint) {
  if (!safety.mockModules.some(module => module.status === 'active')) return;
  const authorization = safety.testAuthorization;
  if (authorization?.decision !== 'ALLOW' || !text(authorization.source) ||
      !text(context.purpose) || authorization.purpose !== context.purpose ||
      authorization.scopeFingerprint !== safety.scopeFingerprint || authorization.inventoryFingerprint !== fingerprint ||
      authorization.sourceSha !== safety.sourceSha || authorization.targetEnvironment !== context.targetEnvironment ||
      !Array.isArray(authorization.operations) || !authorization.operations.includes(context.operation) ||
      context.targetBranch && authorization.targetBranch !== context.targetBranch ||
      context.jobUrl && authorization.jobUrl !== context.jobUrl) {
    throw new Error('含 Mock 的测试交付尚未针对准确范围、版本、操作和测试目标明确确认；普通提测确认不适用');
  }
}

export async function checkMockSafety(safety, context, io = {}) {
  if (!safety || safety.schemaVersion !== 1 || !text(safety.repositoryPath) ||
      !text(safety.sourceRepository) || !SHA.test(safety.sourceSha || '') || !SHA.test(safety.baseSha || '') ||
      !HASH.test(safety.scopeFingerprint || '') || !HASH.test(safety.contentFingerprint || '') ||
      !texts(safety.inspectedPaths) || !texts(safety.mockBindingPaths) || !texts(safety.runtimePaths) || !texts(safety.evidenceRefs)) {
    throw new Error('缺少当前完整范围的 Mock 清查证据；未声明不能视为无 Mock');
  }
  if (context.sourceRepository && repositoryKey(safety.sourceRepository) !== repositoryKey(context.sourceRepository)) throw new Error('Mock 清查源码身份与本次交付不一致');
  if (!['test', 'production'].includes(context.environmentKind) || !text(context.operation) || !text(context.targetEnvironment)) {
    throw new Error('Mock 门禁必须绑定明确交付类别、目标环境和操作');
  }
  const snapshot = await (io.inspectMockSource || inspectMockSource)(safety);
  if (snapshot.baseSha !== safety.baseSha ||
      snapshot.scopeFingerprint !== safety.scopeFingerprint || snapshot.contentFingerprint !== safety.contentFingerprint ||
      stableJson(snapshot.inspectedPaths) !== stableJson(safety.inspectedPaths)) {
    throw new Error('Mock 清查已过期：源码、未提交差异、文件内容或清查范围发生变化');
  }
  let deliveredSnapshot = null;
  if (snapshot.sourceSha !== safety.sourceSha || context.requireCommitted || context.sourceSha && context.sourceSha !== safety.sourceSha) {
    try { await (io.verifyMockCommittedContent || verifyCommittedContent)(safety, context.sourceSha || snapshot.sourceSha); }
    catch (error) {
      if (!context.sourceSha || context.sourceSha === snapshot.sourceSha) throw error;
      deliveredSnapshot = await verifyDeliveredSource(safety, context.sourceSha, snapshot, io);
    }
  }
  validateModules(safety, snapshot);
  const inventoryFingerprint = mockInventoryFingerprint(safety);
  if (context.environmentKind === 'production') checkProductionSource(deliveredSnapshot
    ? { ...safety, productionSourceEvidence: safety.deliverySourceEvidence?.productionSourceEvidence || safety.productionSourceEvidence } : safety, deliveredSnapshot || snapshot);
  else checkTestAuthorization(safety, context, inventoryFingerprint);
  return { state: 'VERIFIED', sourceRepository: safety.sourceRepository, sourceSha: safety.sourceSha, deliveredSha: context.sourceSha || snapshot.sourceSha,
    scopeFingerprint: safety.scopeFingerprint, inventoryFingerprint, operation: context.operation, purpose: context.purpose,
    targetEnvironment: context.targetEnvironment, mockModuleIds: safety.mockModules.filter(module => module.status === 'active').map(module => module.id),
    productionArtifactVerified: false, writes: 0 };
}

export async function checkMockSafetySet(input, context, io = {}) {
  const safeties = input.mockSafeties || (input.mockSafety ? [input.mockSafety] : null);
  if (!Array.isArray(safeties) || !safeties.length) throw new Error('交付前必须提供全部相关仓库的 Mock 清查集合');
  let expected;
  if (context.sourceRepository) {
    expected = [{ sourceRepository: context.sourceRepository, sourceSha: context.sourceSha }];
    if (input.mockRepositories && (input.mockRepositories.length !== 1 ||
        repositoryKey(input.mockRepositories[0]?.sourceRepository) !== repositoryKey(context.sourceRepository) ||
        input.mockRepositories[0]?.sourceSha !== context.sourceSha)) {
      throw new Error('调用方 Mock 仓库清单与已核实的交付源码身份/SHA 冲突');
    }
  } else {
    const receipts = input.gitDeliveryReceipts || input.prerequisites?.gitReceipts;
    const required = input.requiredRepositories;
    if (!Array.isArray(receipts) || !receipts.length || !texts(required)) {
      throw new Error('多仓 Mock 门禁必须绑定原交付范围及全部真实 Git 交付回执，不能使用自报仓库清单');
    }
    expected = receipts.map(receipt => {
      const sourceRepository = receipt.originUrl || receipt.sourceRepository;
      if (!['MERGED', 'VERIFIED'].includes(receipt.state) || receipt.containment !== true ||
          !(context.environmentKind === 'production' ? ['master', 'main'] : ['dev', 'develop']).includes(receipt.targetBranch) ||
          context.environmentKind === 'production' && receipt.defaultTargetVerified !== true || !SHA.test(receipt.deliveredSha || '') ||
          !SHA.test(receipt.sourceSha || '') || !text(sourceRepository)) {
        throw new Error('Mock 门禁的 Git 交付回执未验证准确源码包含关系');
      }
      if (context.targetBranch && context.targetBranch !== receipt.targetBranch) throw new Error('Mock 门禁测试目标分支与交付回执冲突');
      return { sourceRepository, sourceSha: receipt.deliveredSha, targetBranch: receipt.targetBranch };
    });
    const requiredKeys = required.map(repositoryKey), receiptKeys = expected.map(row => repositoryKey(row.sourceRepository));
    if (new Set(requiredKeys).size !== requiredKeys.length || new Set(receiptKeys).size !== receiptKeys.length ||
        requiredKeys.length !== receiptKeys.length || requiredKeys.some(key => !receiptKeys.includes(key))) {
      throw new Error('Git 交付回执没有覆盖完整本轮仓库范围');
    }
    if (input.mockRepositories && stableJson(input.mockRepositories.map(row => ({ sourceRepository: repositoryKey(row.sourceRepository), sourceSha: row.sourceSha })).sort((x,y) => x.sourceRepository.localeCompare(y.sourceRepository))) !==
        stableJson(expected.map(row => ({ sourceRepository: repositoryKey(row.sourceRepository), sourceSha: row.sourceSha })).sort((x,y) => x.sourceRepository.localeCompare(y.sourceRepository)))) {
      throw new Error('Mock 仓库清单与原 Git 交付回执冲突');
    }
  }
  if (!Array.isArray(expected) || !expected.length || expected.some(row => !text(row.sourceRepository) || !SHA.test(row.sourceSha || ''))) {
    throw new Error('Mock 清查集合缺少完整交付仓库/源码版本绑定');
  }
  const keys = safeties.map(row => repositoryKey(row.sourceRepository));
  const expectedKeys = expected.map(row => repositoryKey(row.sourceRepository));
  if (new Set(keys).size !== keys.length || keys.length !== expectedKeys.length || expectedKeys.some(key => !keys.includes(key))) {
    throw new Error('Mock 清查集合没有准确覆盖全部本轮交付仓库');
  }
  return Promise.all(safeties.map(safety => {
    const row = expected.find(item => repositoryKey(item.sourceRepository) === repositoryKey(safety.sourceRepository));
    return checkMockSafety(safety, { ...context, sourceRepository: row.sourceRepository, sourceSha: row.sourceSha,
      targetBranch: row.targetBranch || context.targetBranch }, io);
  }));
}

export function mockSafetyPreview(input, production = false) {
  const safeties = input.mockSafeties || (input.mockSafety ? [input.mockSafety] : []);
  const unknown = !safeties.length || safeties.some(row => !Array.isArray(row.mockModules) || !texts(row.evidenceRefs));
  const active = safeties.flatMap(row => row.mockModules || []).filter(row => row.status === 'active');
  return { mockSafetyState: unknown ? 'MISSING_INSPECTION' : production ? 'SOURCE_AND_ARTIFACT_GATE_REQUIRED'
      : active.length ? 'EXPLICIT_MOCK_TEST_CONFIRMATION_REQUIRED' : 'FRESH_INSPECTION_REQUIRED',
    mockModuleIds: active.map(row => row.id),
    mockSafetyRequirements: ['Refresh complete source/diff and project activation bindings before every write',
      ...(active.length ? ['Bind human confirmation to exact Mock scope, purpose, target and operations'] : []),
      ...(production ? ['Verify source isolation and fail-closed artifact check before deployment'] : [])] };
}

// Kept as a public compatibility export; production checks now use project scripts.
export { verifyProjectMockArtifact as verifyProductionMockArtifact } from './project-mock-gate.mjs';

async function main() {
  const input = await readCliPlan();
  const result = input.action === 'inspect' ? await inspectMockSource(input)
    : input.action === 'check' ? await checkMockSafetySet(input, input.context) : (() => { throw new Error('action 必须为 inspect 或 check'); })();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(error => {
  process.stdout.write(JSON.stringify({ state: 'BLOCKED', error: error.message, writes: 0 }) + '\n'); process.exitCode = 1;
});
