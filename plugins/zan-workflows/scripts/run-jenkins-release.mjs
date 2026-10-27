#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clientFor } from './mcp-client.mjs';
import { configuredJenkinsReader } from './jenkins-readonly.mjs';
import { checkMockSafetySet, mockSafetyPreview, verifyProductionMockArtifact } from './mock-safety.mjs';
import { prepareProjectMockGate, runProjectMockSource } from './project-mock-gate.mjs';
import { adaptJenkinsInput, jenkinsAdapterFingerprint, parseNpmToolsPublication } from './jenkins-job-adapters.mjs';
import { loadFrozenJenkinsContract, resolveFrozenJenkinsParameters } from './frozen-jenkins-contracts.mjs';
import { pollState, progressToStderr, readCliPlan, readTool, repositoryKey, requireText, sha256, stableJson, toolData, validateWait } from './workflow-runtime.mjs';

const CANARY = /(?:^|[^a-z\d])(?:canary|alpha|beta|next|rc|test)(?:$|[^a-z\d])|测试|金丝雀/i;
const OFFICIAL = /(?:^|[^a-z\d])(?:latest|stable|official|production)(?:$|[^a-z\d])|正式/i;
const git = promisify(execFile);

export async function checkReleaseSource(input, readRemote = async (uri, patterns) => {
  const result = await git('git', ['ls-remote', uri, ...patterns], {
    timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return result.stdout;
}) {
  repositoryKey(input.sourceRepository);
  const url = input.sourceRepository.includes('://') ? new URL(input.sourceRepository) : null;
  if (url && ['http:', 'https:'].includes(url.protocol) && (url.username || url.password)) {
    throw new Error('源码 URL 不能携带凭证；使用配置的 Git 凭证');
  }
  if (input.releaseRef === input.expectedSha) return { kind: 'commit', ref: input.releaseRef,
    sourceRepository: input.sourceRepository, sourceSha: input.expectedSha }; // Immutable SHA already verified by the producer.
  const ref = input.releaseRef.replace(/^origin\//, '');
  const patterns = ref.startsWith('refs/') ? [ref] : [`refs/heads/${ref}`, `refs/tags/${ref}`];
  let output;
  try {
    output = await readRemote(input.sourceRepository, [...patterns, ...patterns.filter(value => value.startsWith('refs/tags/')).map(value => value + '^{}')]);
  } catch { throw new Error('发布前源码 ref 查询失败；未触发 Jenkins'); }
  const rows = output.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/));
  const refs = rows.filter(row => !row[1]?.endsWith('^{}'));
  const peeled = refs.length === 1 ? rows.find(row => row[1] === refs[0][1] + '^{}') : undefined;
  if (refs.length !== 1 || (peeled || refs[0])[0] !== input.expectedSha || !patterns.includes(refs[0][1])) {
    throw new Error('发布前源码 ref/SHA 已变化或存在同名 branch/tag 歧义');
  }
  const actualRef = refs[0][1];
  return { kind: actualRef.startsWith('refs/heads/') ? 'branch' : actualRef.startsWith('refs/tags/') ? 'tag' : 'ref',
    ref: actualRef, ...(actualRef.startsWith('refs/heads/') ? { branch: actualRef.slice('refs/heads/'.length) } : {}),
    sourceRepository: input.sourceRepository, sourceSha: input.expectedSha };
}

function checkParameters(definitions, input) {
  if (definitions?.jobName !== input.jobName || !Array.isArray(definitions.parameters)) throw new Error('Job 参数定义不可识别');
  for (const [name, value] of Object.entries(input.params)) {
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`Jenkins 参数必须是明确的标量：${name}`);
    }
    const definition = definitions.parameters.find(param => param.name === name);
    if (!definition || (definition.choices && !definition.choices.some(choice => String(choice) === String(value)))) {
      throw new Error(`未确认或不合法的 Jenkins 参数：${name}`);
    }
  }
  if (input.jobAdapter !== 'npm-tools-v1' && (!input.refParameter || String(input.params[input.refParameter]) !== input.releaseRef)) {
    throw new Error('发布 ref 必须绑定实际 Job 参数');
  }
  const computedPackageVersion = input.releaseKind === 'package' && input.jobAdapter === 'npm-tools-v1' &&
    input.versionStrategy === 'PIPELINE_COMPUTED';
  if (input.releaseKind === 'package' && !computedPackageVersion &&
      (!input.versionParameter || input.versionStrategy === 'PIPELINE_COMPUTED' ||
        !/^\d+\.\d+\.\d+(?:-[a-z\d.-]+)?(?:\+[a-z\d.-]+)?$/i.test(input.version))) {
    throw new Error('包发布必须绑定实际版本参数，或使用已核实的 npm-tools 计算版本契约；源码 SHA 不能代替包版本');
  }
  if (input.versionParameter ? String(input.params[input.versionParameter]) !== input.version : input.version !== input.expectedSha) {
    throw new Error('版本必须绑定实际 Job 参数；无版本参数时使用已确认 SHA 作为发布身份');
  }
  const channelValue = String(input.params[input.channelParameter] || '');
  if (input.releaseKind === 'package' && input.releaseChannel === 'canary' &&
      (!input.channelParameter || !CANARY.test(channelValue) || OFFICIAL.test(channelValue))) {
    throw new Error('金丝雀包发布必须绑定明确的非正式通道参数，不能使用 latest/stable');
  }
  if (input.releaseKind === 'package' && input.releaseChannel === 'official' && !computedPackageVersion &&
      !/^\d+\.\d+\.\d+(?:\+[a-z\d.-]+)?$/i.test(input.version)) throw new Error('正式包必须绑定稳定版本');
  if (input.releaseChannel === 'official' && input.channelParameter && CANARY.test(channelValue)) {
    throw new Error('正式发布与实际通道参数不一致');
  }
}

function verifyBuild(build, input, queueId) {
  if (Number(build.queueId) !== queueId) throw new Error('构建不属于本次触发的队列');
  const parameters = (build.actions || []).flatMap(action => action.parameters || []);
  const sensitiveReadback = {};
  for (const [name, value] of Object.entries(input.params)) {
    const matches = parameters.filter(param => param.name === name);
    if (input.sensitiveParameterNames?.includes(name)) {
      if (matches.length !== 1 || (String(matches[0].value) !== String(value) &&
          !/^\*+$/.test(String(matches[0].value)) && matches[0].value !== '[REDACTED]')) {
        throw new Error(`敏感构建参数缺少可识别的注入回执：${name}`);
      }
      sensitiveReadback[name] = String(matches[0].value) === String(value) ? 'MATCHED' : 'MASKED_BY_JENKINS';
      continue;
    }
    if (matches.length !== 1 || String(matches[0].value) !== String(value)) throw new Error(`构建参数未读回或不一致：${name}`);
  }
  const revisions = new Set((build.actions || []).filter(action =>
    Array.isArray(action.remoteUrls) && action.remoteUrls.some(url => repositoryKey(url) === repositoryKey(input.sourceRepository)))
    .map(action => action.lastBuiltRevision?.SHA1).filter(Boolean));
  if (revisions.size !== 1 || !revisions.has(input.expectedSha)) {
    throw new Error('目标源码仓库的实际构建 SHA 缺失或不一致；不能用 changes 列表或其他仓库 SHA 代替');
  }
  const integration = input.projectMockGate?.integration;
  const boundPipeline = integration && input.pipelineSource &&
    repositoryKey(integration.sourceRepository) !== repositoryKey(input.sourceRepository);
  if (input.jobAdapter === 'npm-tools-v1' || boundPipeline) {
    const pipeline = input.pipelineSource;
    const pipelineShas = new Set((build.actions || []).filter(action => Array.isArray(action.remoteUrls) &&
      action.remoteUrls.some(url => repositoryKey(url) === repositoryKey(pipeline.repositoryUrl)))
      .map(action => action.lastBuiltRevision?.SHA1).filter(Boolean));
    if (pipelineShas.size !== 1 || !pipelineShas.has(pipeline.expectedSha)) throw new Error('实际流水线源码与已核实的版本计算/摘要规则不一致');
  }
  return sensitiveReadback;
}

async function jobConfig(call, args) {
  try {
    const result = await call('jenkins_get_job_config', args);
    const text = result?.content?.filter(row => row.type === 'text').map(row => row.text).join('\n') || '';
    if (result?.isError && /\bHTTP\s+403\b/.test(text)) return null;
    return toolData(result, 'jenkins_get_job_config');
  } catch (error) {
    if (error.httpStatus === 403) return null;
    throw error;
  }
}

function bindingMode(input) {
  const mode = input.jobBindingMode ?? (input.jobConfigHash ? 'CONFIG_XML' : 'READABLE_METADATA');
  if (!['READABLE_METADATA', 'CONFIG_XML'].includes(mode)) throw new Error('Job 核验方式无效');
  return mode;
}

function releaseTargetBranch(input, sourceBinding) {
  if (sourceBinding && (sourceBinding.sourceSha !== input.expectedSha ||
      repositoryKey(sourceBinding.sourceRepository) !== repositoryKey(input.sourceRepository))) {
    throw new Error('发布 ref 核实结果与本次源码仓库/SHA 冲突');
  }
  // A bare name may resolve to a tag. Only the verified remote ref establishes
  // branch identity; a user-provided targetBranch is a constraint, not evidence.
  const explicit = sourceBinding?.kind === 'branch' && sourceBinding.ref === 'refs/heads/' + sourceBinding.branch
    ? sourceBinding.branch : !sourceBinding && input.releaseRef?.startsWith('refs/heads/')
      ? input.releaseRef.slice('refs/heads/'.length) : null;
  if (explicit) {
    if (input.targetBranch && input.targetBranch !== explicit) throw new Error('发布目标分支与实际发布 ref 冲突');
    return explicit;
  }
  const receipts = input.gitDeliveryReceipts || input.prerequisites?.gitReceipts || [];
  const branches = new Set(receipts.filter(receipt => ['MERGED', 'VERIFIED'].includes(receipt.state) &&
    receipt.containment === true && receipt.deliveredSha === input.expectedSha &&
    typeof (receipt.originUrl || receipt.sourceRepository) === 'string' &&
    repositoryKey(receipt.originUrl || receipt.sourceRepository) === repositoryKey(input.sourceRepository) &&
    typeof receipt.targetBranch === 'string' && receipt.targetBranch.length > 0).map(receipt => receipt.targetBranch));
  if (branches.size === 1) {
    const target = [...branches][0];
    if (input.targetBranch && input.targetBranch !== target) throw new Error('发布目标分支与已核实的 Git 交付回执冲突');
    return target;
  }
  return null;
}

export function releaseRequiredTools(input) {
  return ['jenkins_list_instances',
    ...(bindingMode(input) === 'CONFIG_XML' ? ['jenkins_get_job_config'] : []),
    ...(input.execute ? ['jenkins_trigger_build'] : [])];
}

export async function runJenkinsRelease(call, reader, input, io = {}) {
  validateWait(io);
  const completionMode = input.completionMode ?? 'BUILD_TERMINAL';
  if (!['BUILD_TERMINAL', 'TRIGGER_ACCEPTED'].includes(completionMode) ||
      (completionMode === 'TRIGGER_ACCEPTED' && (input.releaseChannel !== 'canary' ||
        (input.releaseKind === 'deployment' && input.targetEnvironment !== 'test')))) {
    throw new Error('提交即返回仅用于测试提测构建；正式发布必须等待构建完成');
  }
  input = { ...input, completionMode };
  const requestedBindingMode = bindingMode(input);
  if (input.execute && (input.releaseChannel === 'official' || /production|prod|正式|线上/i.test(input.targetEnvironment || '')) &&
      (input.preDeployMockGate || requestedBindingMode === 'CONFIG_XML') && !input.projectMockGate) {
    throw new Error('旧正式发布清单依赖 Jenkins XML 门禁；请刷新为项目脚本检查清单，无需重复申请配置读取权限');
  }
  for (const key of ['targetProject', 'releaseTarget', 'targetEnvironment', 'jobName', 'jobUrl',
    'releaseRef', 'releaseChannel', 'purpose', 'sourceRepository', 'expectedSha']) requireText(input[key], key);
  for (const address of [input.sourceRepository, input.pipelineSource?.repositoryUrl].filter(Boolean)) {
    repositoryKey(address);
    const url = address.includes('://') ? new URL(address) : null;
    if (url?.password || (url && ['http:', 'https:'].includes(url.protocol) && url.username)) {
      throw new Error('计划中的源码地址不能携带凭证');
    }
  }
  if (!['deployment', 'package'].includes(input.releaseKind) || !['canary', 'official'].includes(input.releaseChannel) ||
      !/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(input.expectedSha) || (input.params && (Array.isArray(input.params) || typeof input.params !== 'object'))) {
    throw new Error('缺少明确发布类别、通道、源码 SHA 或结构化参数');
  }
  if (reader.jobUrl !== input.jobUrl) throw new Error('只读查询未绑定本次确认的 Job URL');
  if (input.execute && (input.confirmed !== true || !(input.jobBindingHash || input.jobConfigHash) || !input.parameterDefinitionsHash)) {
    throw new Error('执行必须有当前发布清单确认和 Job 配置/参数定义指纹');
  }
  const suppliedVersion = input.version;
  const frozen = await loadFrozenJenkinsContract(input, io);
  input = { ...input, instance: frozen.instance.name };
  const definitions = frozen.definitions;
  const args = { jobName: input.jobName, instance: frozen.instance.name };
  const [config, instances] = await Promise.all([
    requestedBindingMode === 'CONFIG_XML' ? jobConfig(call, args) : Promise.resolve(null),
    readTool(call, 'jenkins_list_instances', {}),
  ]);
  if (!Array.isArray(instances) || !instances.length) throw new Error('Jenkins 实例不可验证');
  const selected = input.instance ? instances.filter(item => item.name === input.instance) : [instances[0]];
  if (selected.length !== 1 || selected[0].url?.replace(/\/$/, '') !== reader.instanceUrl) {
    throw new Error('MCP 与只读 API 没有绑定到同一 Jenkins 实例');
  }
  args.instance = selected[0].name;
  const approvedAdapterHash = input.adapterHash;
  // Adapter identity is validated after the frozen profile supplies the final
  // bindings; validating an intermediate, incomplete adapter breaks a PLAN's
  // own returned EXECUTE payload when REF/CHANNEL names were inferred locally.
  input = await adaptJenkinsInput(definitions, { ...input, adapterHash: undefined }, io);
  if (input.execute && input.jobAdapter !== 'explicit-v1' && !approvedAdapterHash) throw new Error('执行缺少已确认的 Job 适配规则指纹');
  const resolvedParameters = resolveFrozenJenkinsParameters(frozen, input, { ...io, suppliedVersion });
  if (input.jenkinsParametersValueHash && input.jenkinsParametersValueHash !== resolvedParameters.parametersValueHash) throw new Error('本轮 Jenkins 实际参数值已变化，需要重新核对确认');
  if (input.execute && !input.jenkinsParametersValueHash) throw new Error('执行缺少已确认的 Jenkins 实际参数值指纹');
  input = { ...input, params: resolvedParameters.params, refParameter: resolvedParameters.refParameter,
    versionParameter: resolvedParameters.versionParameter, channelParameter: resolvedParameters.channelParameter, version: resolvedParameters.version,
    sensitiveParameterNames: resolvedParameters.sensitiveParameterNames,
    jenkinsContractsPath: frozen.contractPath, jenkinsContractHash: frozen.contractHash, jenkinsProfile: frozen.profileId,
    jenkinsProfileHash: frozen.profileHash, jenkinsParametersValueHash: resolvedParameters.parametersValueHash };
  const finalAdapterHash = jenkinsAdapterFingerprint(input);
  if (approvedAdapterHash && approvedAdapterHash !== finalAdapterHash) throw new Error('Jenkins 参数/流水线适配规则已变化');
  input = { ...input, adapterHash: finalAdapterHash };
  requireText(input.version, '版本或计算版本身份');
  checkParameters(definitions, input);
  let jobConfigHash = null, jobBindingHash, jobBindingMode;
  if (config === null) {
    if (!reader.job) throw new Error('缺少 Job 可读身份核验能力');
    const identity = await reader.job();
    jobBindingMode = 'READABLE_METADATA';
    jobBindingHash = sha256(stableJson(identity));
  } else {
    if (config?.jobName !== input.jobName || typeof config.config !== 'string') throw new Error('Job 配置不可识别');
    jobConfigHash = sha256(config.config);
    jobBindingMode = 'CONFIG_XML';
    jobBindingHash = jobConfigHash;
  }
  const parameterDefinitionsHash = frozen.parameterDefinitionsHash;
  if ((input.jobConfigHash && input.jobConfigHash !== jobConfigHash) ||
      (input.jobBindingHash && input.jobBindingHash !== jobBindingHash) ||
      (input.jobBindingMode && input.jobBindingMode !== jobBindingMode &&
        (input.execute || input.jobBindingHash || input.jobConfigHash)) ||
      (input.parameterDefinitionsHash && input.parameterDefinitionsHash !== parameterDefinitionsHash)) {
    throw new Error('Job 配置或参数定义已变化，需要更新清单');
  }
  const actualEnvironment = resolvedParameters.environmentKind;
  const production = actualEnvironment === 'production' || input.releaseChannel === 'official' || /(?:^|[\W_])(?:prod|production|live)(?:$|[\W_])|线上|正式/i.test(input.targetEnvironment);
  const projectGate = production ? await prepareProjectMockGate(input, io) : null;
  if (projectGate) input = { ...input, projectMockGateHash: projectGate.gateHash };
  if (!input.execute) return { ...input, params: resolvedParameters.publicParams, environmentKind: resolvedParameters.environmentKind, ...mockSafetyPreview(input, production), instance: args.instance, execute: false, confirmed: false, state: 'AWAITING_CONFIRMATION',
    jobConfigHash, jobBindingHash, jobBindingMode, parameterDefinitionsHash, writes: 0 };
  if (jobBindingMode === 'READABLE_METADATA' && input.jobBindingMode !== jobBindingMode) {
    throw new Error('Job 元数据核验方式尚未纳入已确认清单');
  }
  const sourceBinding = await (io.checkSource || checkReleaseSource)(input);
  const pipelineIntegration = projectGate && repositoryKey(projectGate.gate.integration.sourceRepository) !== repositoryKey(input.sourceRepository);
  if (input.jobAdapter === 'npm-tools-v1' || pipelineIntegration) await (io.checkSource || checkReleaseSource)({
    sourceRepository: input.pipelineSource.repositoryUrl, releaseRef: input.pipelineSource.ref, expectedSha: input.pipelineSource.expectedSha,
  });
  if (!production && /(?:^|[\W_])(?:prod|production)(?:$|[\W_])|线上|正式/i.test(input.jobName + ' ' + input.jobUrl)) {
    throw new Error('测试环境声明与生产 Jenkins Job 标识冲突，不能绕过生产 Mock 门禁');
  }
  if (production && completionMode === 'TRIGGER_ACCEPTED') throw new Error('已核实的生产环境不能采用测试提交即返回策略');
  const targetBranch = releaseTargetBranch(input, sourceBinding);
  const safeties = input.mockSafeties || (input.mockSafety ? [input.mockSafety] : []);
  if (!production && !targetBranch && safeties.some(safety => safety.mockModules?.some(module => module.status === 'active'))) {
    throw new Error('含 Mock 的测试发布缺少实际目标分支证据；SHA/tag 不能代替准确测试分支授权');
  }
  const mockSafetyReceipts = await checkMockSafetySet(input, { operation: production ? 'production-release' : 'test-deploy', purpose: input.purpose,
    environmentKind: production ? 'production' : 'test', targetEnvironment: input.targetEnvironment, jobUrl: input.jobUrl,
    ...(targetBranch ? { targetBranch } : {}),
    sourceRepository: input.sourceRepository, sourceSha: input.expectedSha, requireCommitted: true }, io);
  if (production) {
    input = { ...input, projectMockSourceReceipt: await runProjectMockSource(projectGate, io) };
  }
  const result = { state: 'UNKNOWN', targetProject: input.targetProject, releaseTarget: input.releaseTarget,
    releaseKind: input.releaseKind, instance: args.instance, sourceRepository: input.sourceRepository,
    jobName: input.jobName, jobUrl: input.jobUrl, releaseRef: input.releaseRef, version: input.version,
    releaseChannel: input.releaseChannel, targetEnvironment: input.targetEnvironment,
    expectedSha: input.expectedSha, queueId: null, buildNumber: null, sourceVerified: false, writes: 0 };
  result.mockSafetyReceipts = mockSafetyReceipts;
  result.jenkinsContractHash = frozen.contractHash;
  result.jenkinsProfile = frozen.profileId;
  result.jenkinsProfileHash = frozen.profileHash;
  result.parameterDefinitionsHash = parameterDefinitionsHash;
  result.jenkinsParametersValueHash = resolvedParameters.parametersValueHash;
  if (projectGate) {
    result.projectMockGateHash = projectGate.gateHash;
    result.projectMockSourceReceipt = input.projectMockSourceReceipt;
  }
  result.jobBindingMode = jobBindingMode;
  result.jobAdapter = input.jobAdapter;
  result.versionStrategy = input.versionStrategy || 'EXPLICIT';
  result.completionMode = completionMode;
  let phase = 'TRIGGER';
  const waitOptions = { ...io, deadline: (io.now || Date.now)() + (io.maxWaitMs ?? 1800000) };
  try {
    // Exactly one write. Queue/build polling below is read-only and never retriggers.
    const triggered = await readTool(call, 'jenkins_trigger_build', { ...args, params: input.params });
    result.writes++;
    if (triggered?.jobName !== input.jobName || !triggered.queueUrl) throw new Error('触发结果缺少确切队列；不要重试发布');
    const queue = reader.queueIdentity(triggered.queueUrl);
    if (!Number.isSafeInteger(queue.id) || queue.id < 1) throw new Error('触发结果缺少确切队列 ID；不要重试发布');
    result.queueUrl = queue.url || triggered.queueUrl;
    result.queueId = queue.id;
    io.onProgress?.({ state: 'TRIGGERED', queueId: result.queueId, queueUrl: result.queueUrl });
    if (completionMode === 'TRIGGER_ACCEPTED') {
      // The accepted queue is the submission receipt, not evidence of a completed build.
      return { ...result, state: 'BUILD_SUBMITTED', submittedParams: { ...resolvedParameters.publicParams },
        ...(input.releaseKind === 'package' ? { version: null, versionIdentity: input.expectedSha } : {}) };
    }
    phase = 'WAIT_QUEUE';
    const queued = await pollState(() => reader.queue(triggered.queueUrl), item => {
      if (item.cancelled) {
        result.state = 'FAILED';
        return { state: 'CANCELLED', error: '本次 Jenkins 队列已取消' };
      }
      if (item.executable?.number) return { state: 'BUILD_STARTED', done: true };
      return { state: item.blocked ? 'QUEUE_BLOCKED' : 'QUEUED' };
    }, waitOptions);
    result.buildNumber = Number(queued.executable.number);
    phase = 'WAIT_BUILD';
    const build = await pollState(() => reader.build(result.buildNumber), value => {
      if (Number(value.queueId) !== result.queueId) return { state: 'WRONG_QUEUE', error: '构建不属于本次队列' };
      if (value.building === true) return { state: 'BUILDING' };
      if (value.building !== false || !value.result) return { state: 'UNKNOWN', error: '构建终态不可识别' };
      if (value.result !== 'SUCCESS') {
        result.state = 'FAILED';
        return { state: value.result, error: `Jenkins 终态 ${value.result}` };
      }
      return { state: 'SUCCESS', done: true };
    }, waitOptions);
    phase = 'VERIFY_SOURCE';
    const sensitiveReadback = verifyBuild(build, input, result.queueId);
    if (Object.keys(sensitiveReadback).length) result.sensitiveParameterReadback = sensitiveReadback;
    result.sourceVerified = true;
    if (production) {
      phase = 'VERIFY_MOCK_ARTIFACT';
      if (!reader.console) throw new Error('正式构建缺少当前制品 Mock 门禁回执读取能力');
      result.mockArtifactReceipt = verifyProductionMockArtifact(await reader.console(result.buildNumber), input, result.queueId, result.buildNumber);
    }
    if (input.jobAdapter === 'npm-tools-v1') {
      phase = 'VERIFY_PUBLICATION';
      if (!reader.console) throw new Error('计算版本的 Job 缺少本次构建发布摘要读取能力');
      result.publishedPackages = parseNpmToolsPublication(await reader.console(result.buildNumber), input);
      result.versionIdentity = input.expectedSha;
      result.version = null; // The repository identity must never be reported as an npm version.
    }
    return { ...result, state: input.releaseKind === 'package' ? 'RELEASED' : 'DEPLOYED', buildUrl: build.url };
  } catch (error) {
    error.result = { ...result, phase, error: error.message };
    throw error;
  }
}

async function main() {
  const input = await readCliPlan();
  const reader = configuredJenkinsReader(input);
  const client = clientFor('jenkins-mcp');
  try {
    await client.initialize();
    client.requireTools(releaseRequiredTools(input));
    const result = await runJenkinsRelease((name, args) => client.call(name, args), reader, input, {
      maxWaitMs: input.maxWaitMs, onProgress: progressToStderr,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify(error.result || { state: 'BLOCKED', error: error.message, writes: 0 }, null, 2) + '\n');
    process.exitCode = 1;
  } finally { client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('无法读取发布计划或配置已确认的 Jenkins 只读查询\n'); process.exitCode = 1; });
}
