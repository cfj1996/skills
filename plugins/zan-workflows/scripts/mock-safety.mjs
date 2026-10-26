#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCliPlan, repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';
import { readInlineJenkinsPipeline } from './jenkins-inline-pipeline.mjs';

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
  const preserved = unique([...(sourceSnapshot.changedPaths || []), ...Object.keys(sourceSnapshot.fileFingerprints || {}).filter(path => covered(path, [...safety.mockBindingPaths, ...safety.mockModules.flatMap(module => module.paths)]))]);
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
  if ((snapshot.markerBindings || []).some(binding => !safety.mockModules.some(module => covered(binding.path, module.paths) && binding.moduleIds.includes(module.id)))) {
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
      return { sourceRepository, sourceSha: receipt.deliveredSha };
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
    return checkMockSafety(safety, { ...context, sourceRepository: row.sourceRepository, sourceSha: row.sourceSha }, io);
  }));
}

export async function checkDeliveryEnvironment(input, actual, io = {}) {
  const binding = input.environmentBinding;
  if (!binding || !['config-xml', 'project-policy'].includes(binding.kind) ||
      !['test', 'production'].includes(binding.environmentKind) || binding.jobUrl !== input.jobUrl ||
      binding.targetEnvironment !== input.targetEnvironment || binding.releaseChannel !== input.releaseChannel ||
      binding.jobBindingHash !== actual.jobBindingHash || binding.parameterDefinitionsHash !== actual.parameterDefinitionsHash ||
      !texts(binding.evidenceRefs) || !HASH.test(binding.sourceHash || '') || !text(binding.mappingText)) {
    throw new Error('缺少实际 Job/参数与项目规则来源绑定的目标环境证据；test/canary 标签不能证明测试环境');
  }
  let source;
  if (binding.kind === 'config-xml') {
    source = actual.config;
    if (typeof source !== 'string') throw new Error('目标环境声明要求读取实际 Job XML，元数据身份不能代替配置');
  } else {
    if (!text(binding.sourcePath)) throw new Error('项目环境映射缺少实际规范/配置来源路径');
    source = await (io.readMockEnvironmentSource || (async value => readFile(value.sourcePath, 'utf8')))(binding);
  }
  if (typeof source !== 'string' || sha256(source) !== binding.sourceHash) throw new Error('目标环境映射来源内容已变化或不可核实');
  const decoded = source.replace(/&quot;/g, '\"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let mapping;
  try { mapping = JSON.parse(binding.mappingText); } catch { throw new Error('目标环境映射必须为来源中可定位的明确 JSON 记录'); }
  if (!decoded.includes(binding.mappingText) || mapping.jobUrl !== input.jobUrl ||
      mapping.targetEnvironment !== input.targetEnvironment || mapping.releaseChannel !== input.releaseChannel ||
      mapping.environmentKind !== binding.environmentKind) throw new Error('项目/Job来源没有本次准确环境和通道映射');
  return binding.environmentKind;
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

// The configuration review is independent of future artifact results. Its
// binding must be refreshed against the actual Jenkins config/metadata hash.
export function checkPreDeployMockGate(input, jobBindingHash, actualConfig) {
  const gate = input.preDeployMockGate;
  if (!gate || gate.state !== 'VERIFIED' || gate.jobBindingHash !== jobBindingHash ||
      gate.sourceSha !== input.expectedSha || gate.jobUrl !== input.jobUrl ||
      !text(gate.checkCommand) || !text(gate.deployStep) || !texts(gate.evidenceRefs) ||
      !gate.checkerEvidence || !texts(gate.checkerEvidence.evidenceRefs) || !HASH.test(gate.checkerEvidence.contentHash || '') ||
      gate.failClosed !== true || gate.beforeDeploy !== true || gate.artifactMarker !== 'MOCK_PRODUCTION_GATE') {
    throw new Error('正式发布缺少绑定当前 Jenkins 配置的制品 Mock 检查门禁；必须先检查、失败停止、再部署');
  }
  // The only supported shell shape executes a relative path from this
  // release checkout. A different repository or revision would review code
  // other than the checker Jenkins actually runs; pinned external checkouts
  // require a separate adapter and cannot be inferred here.
  if (!text(input.sourceRepository) || !text(gate.checkerEvidence.sourceRepository) ||
      repositoryKey(gate.checkerEvidence.sourceRepository) !== repositoryKey(input.sourceRepository) ||
      gate.checkerEvidence.sourceSha !== input.expectedSha) {
    throw new Error('制品检查器必须绑定本次实际发布仓库和源码 SHA；不支持旧版本或未适配的外部检查器');
  }
  if (typeof actualConfig !== 'string' || sha256(actualConfig) !== jobBindingHash || gate.pipelineContentHash !== sha256(actualConfig)) {
    throw new Error('正式发布必须读取并绑定实际流水线代码；Job 可读元数据和自报 VERIFIED 不能证明先检后发');
  }
  // This bounded adapter establishes execution identity before any build,
  // check, or deployment. deleteDir discards stale CI workspace content and
  // GitSCM must checkout this repository at the literal immutable release SHA.
  // No implicit/default checkout, floating branch, skipped stage, custom Groovy,
  // extra shell step, or external checker workspace is inferred as equivalent.
  const code = readInlineJenkinsPipeline(actualConfig);
  const canonical = /^\s*pipeline\s*\{\s*agent\s+any\s+stages\s*\{\s*stage\s*\(\s*'[^'\r\n]+'\s*\)\s*\{\s*steps\s*\{\s*deleteDir\s*\(\s*\)\s*;?\s*checkout\s*\(\s*\[\s*\$class\s*:\s*'GitSCM'\s*,\s*branches\s*:\s*\[\s*\[\s*name\s*:\s*'([a-f\d]{40}(?:[a-f\d]{24})?)'\s*\]\s*\]\s*,\s*userRemoteConfigs\s*:\s*\[\s*\[\s*url\s*:\s*'([^'\r\n]+)'\s*\]\s*\]\s*\]\s*\)\s*;?\s*sh\s*'([^'\r\n]+)'\s*;?\s*\}\s*\}\s*\}\s*\}\s*$/;
  const match = code.match(canonical);
  const commands = [...(gate.buildCommand ? [gate.buildCommand] : []), gate.checkCommand, gate.deployStep];
  if (!match || match[1] !== input.expectedSha || repositoryKey(match[2]) !== repositoryKey(input.sourceRepository) ||
      commands.some(command => !text(command) || /[;|&\n\r`$<>!#(){}'\"]/.test(command))) {
    throw new Error('正式流水线未完整匹配受支持的先检后发模式：必须清空 CI 工作区、checkout 准确仓库和不可变 SHA，再顺序构建/检查/部署；不接受隐式 checkout、条件跳过或额外步骤');
  }

  validateCheckerInvocation(gate);
  // A build can rewrite files after checkout. Verify the actual checker bytes
  // immediately before execution, independently of Git's index or build output.
  // This generated pipeline segment is fixed, not caller-supplied shell syntax.
  const integrity = `sha256sum -- ${gate.checkerEvidence.scriptPath} | grep -Fx -- "${gate.checkerEvidence.contentHash}  ${gate.checkerEvidence.scriptPath}"`;
  const guardedCommands = [...(gate.buildCommand ? [gate.buildCommand] : []), integrity, gate.checkCommand, gate.deployStep];
  if (match[3] !== guardedCommands.join(' && ')) {
    throw new Error('正式流水线未完整匹配受支持的先检后发模式：构建后、检查器执行前必须校验受审脚本的实际 SHA-256 内容；校验失败必须阻止部署');
  }
  return gate;
}

function validateCheckerInvocation(gate) {
  const scriptPath = gate.checkerEvidence?.scriptPath;
  const argv = typeof gate.checkCommand === 'string' ? gate.checkCommand.trim().split(/\s+/) : [];
  // A script mentioned as echo/cat data, an interpreter flag, or another
  // program's argument has not been executed. Additional invocation forms need
  // their own reviewed adapter; do not infer them from a matching path token.
  if (!relpath(scriptPath) || !scriptPath.includes('/') || !/^[A-Za-z0-9_./-]+$/.test(scriptPath) || scriptPath.startsWith('-') ||
      argv.length !== 2 || !['node', 'python3', 'sh', 'bash'].includes(argv[0]) || argv[1] !== scriptPath) {
    throw new Error('Mock 制品检查命令必须直接执行受审脚本：node/python3/sh/bash 加准确相对路径；不接受包装命令、解释器选项或额外参数');
  }
}

export async function verifyMockCheckerEvidence(gate, io = {}) {
  const evidence = gate.checkerEvidence;
  if (!evidence || !text(evidence.repositoryPath) || !text(evidence.sourceRepository) || !SHA.test(evidence.sourceSha || '') ||
      !relpath(evidence.scriptPath) || !evidence.scriptPath.includes('/') || !HASH.test(evidence.contentHash || '') ||
      !texts(evidence.evidenceRefs)) {
    throw new Error('Mock 制品检查命令缺少可追踪的实际检查器源码/职责评审绑定');
  }
  validateCheckerInvocation(gate);
  const source = await (io.readMockCheckerSource || (async row => {
    const [root, origin] = await Promise.all([git(row.repositoryPath, ['rev-parse', '--show-toplevel']), git(row.repositoryPath, ['remote', 'get-url', 'origin'])]);
    if (await realpath(resolve(root.trim())) !== await realpath(resolve(row.repositoryPath)) ||
        repositoryKey(origin.trim()) !== repositoryKey(row.sourceRepository)) throw new Error('制品检查器不属于已核实的源码仓库');
    return git(row.repositoryPath, ['show', `${row.sourceSha}:${row.scriptPath}`]);
  }))(evidence);
  if (typeof source !== 'string' || sha256(source) !== evidence.contentHash || !source.includes('MOCK_PRODUCTION_GATE')) {
    throw new Error('Mock 制品检查器源码已变化或缺少受评审的制品回执职责');
  }
  return { state: 'VERIFIED', sourceSha: evidence.sourceSha, scriptPath: evidence.scriptPath, contentHash: evidence.contentHash };
}

export function verifyProductionMockArtifact(log, input, queueId, buildNumber) {
  const rows = String(log).split('\n').filter(line => line.startsWith('MOCK_PRODUCTION_GATE '));
  if (rows.length !== 1) throw new Error('本次正式构建缺少唯一 Mock 制品检查回执');
  let receipt;
  try { receipt = JSON.parse(rows[0].slice('MOCK_PRODUCTION_GATE '.length)); } catch { throw new Error('Mock 制品检查回执不可识别'); }
  if (receipt.state !== 'PASSED' || receipt.sourceSha !== input.expectedSha || receipt.jobUrl !== input.jobUrl ||
      receipt.queueId !== queueId || receipt.buildNumber !== buildNumber || !HASH.test(receipt.artifactFingerprint || '') ||
      receipt.beforeDeploy !== true || receipt.runtimeEnabled !== false ||
      !Array.isArray(receipt.remainingMockPaths) || receipt.remainingMockPaths.length) {
    throw new Error('Mock 制品检查未通过或回执与本次源码/Job/队列/构建不一致');
  }
  return receipt;
}

async function main() {
  const input = await readCliPlan();
  const result = input.action === 'inspect' ? await inspectMockSource(input)
    : input.action === 'check' ? await checkMockSafetySet(input, input.context) : (() => { throw new Error('action 必须为 inspect 或 check'); })();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(error => {
  process.stdout.write(JSON.stringify({ state: 'BLOCKED', error: error.message, writes: 0 }) + '\n'); process.exitCode = 1;
});
