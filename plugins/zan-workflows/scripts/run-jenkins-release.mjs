#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clientFor } from './mcp-client.mjs';
import { configuredJenkinsReader } from './jenkins-readonly.mjs';
import { adaptJenkinsInput, parseNpmToolsPublication } from './jenkins-job-adapters.mjs';
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
  if (input.releaseRef === input.expectedSha) return; // Immutable SHA already verified by the producer.
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
  if (input.versionParameter ? String(input.params[input.versionParameter]) !== input.version : input.version !== input.expectedSha) {
    throw new Error('版本必须绑定实际 Job 参数；无版本参数时使用已确认 SHA 作为发布身份');
  }
  const channelValue = String(input.params[input.channelParameter] || '');
  if (input.releaseKind === 'package' && input.releaseChannel === 'canary' &&
      (!input.channelParameter || !CANARY.test(channelValue) || OFFICIAL.test(channelValue))) {
    throw new Error('金丝雀包发布必须绑定明确的非正式通道参数，不能使用 latest/stable');
  }
  if (input.releaseKind === 'package' && input.releaseChannel === 'official' && input.versionStrategy !== 'PIPELINE_COMPUTED' &&
      !/^\d+\.\d+\.\d+(?:\+[a-z\d.-]+)?$/i.test(input.version)) throw new Error('正式包必须绑定稳定版本');
  if (input.releaseChannel === 'official' && input.channelParameter && CANARY.test(channelValue)) {
    throw new Error('正式发布与实际通道参数不一致');
  }
}

function verifyBuild(build, input, queueId) {
  if (Number(build.queueId) !== queueId) throw new Error('构建不属于本次触发的队列');
  const parameters = (build.actions || []).flatMap(action => action.parameters || []);
  for (const [name, value] of Object.entries(input.params)) {
    const matches = parameters.filter(param => param.name === name);
    if (matches.length !== 1 || String(matches[0].value) !== String(value)) throw new Error(`构建参数未读回或不一致：${name}`);
  }
  const revisions = new Set((build.actions || []).filter(action =>
    Array.isArray(action.remoteUrls) && action.remoteUrls.some(url => repositoryKey(url) === repositoryKey(input.sourceRepository)))
    .map(action => action.lastBuiltRevision?.SHA1).filter(Boolean));
  if (revisions.size !== 1 || !revisions.has(input.expectedSha)) {
    throw new Error('目标源码仓库的实际构建 SHA 缺失或不一致；不能用 changes 列表或其他仓库 SHA 代替');
  }
  if (input.jobAdapter === 'npm-tools-v1') {
    const pipeline = input.pipelineSource;
    const pipelineShas = new Set((build.actions || []).filter(action => Array.isArray(action.remoteUrls) &&
      action.remoteUrls.some(url => repositoryKey(url) === repositoryKey(pipeline.repositoryUrl)))
      .map(action => action.lastBuiltRevision?.SHA1).filter(Boolean));
    if (pipelineShas.size !== 1 || !pipelineShas.has(pipeline.expectedSha)) throw new Error('实际流水线源码与已核实的版本计算/摘要规则不一致');
  }
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

export function releaseRequiredTools(input) {
  return ['jenkins_list_instances', 'jenkins_get_job_parameters',
    ...(bindingMode(input) === 'CONFIG_XML' ? ['jenkins_get_job_config'] : []),
    ...(input.execute ? ['jenkins_trigger_build'] : [])];
}

export async function runJenkinsRelease(call, reader, input, io = {}) {
  validateWait(io);
  const requestedBindingMode = bindingMode(input);
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
  const args = { jobName: input.jobName, ...(input.instance ? { instance: input.instance } : {}) };
  const [definitions, config, instances] = await Promise.all([
    readTool(call, 'jenkins_get_job_parameters', args),
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
  input = await adaptJenkinsInput(definitions, input, io);
  if (input.execute && input.jobAdapter !== 'explicit-v1' && !approvedAdapterHash) throw new Error('执行缺少已确认的 Job 适配规则指纹');
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
  const parameterDefinitionsHash = sha256(stableJson(definitions));
  if ((input.jobConfigHash && input.jobConfigHash !== jobConfigHash) ||
      (input.jobBindingHash && input.jobBindingHash !== jobBindingHash) ||
      (input.jobBindingMode && input.jobBindingMode !== jobBindingMode &&
        (input.execute || input.jobBindingHash || input.jobConfigHash)) ||
      (input.parameterDefinitionsHash && input.parameterDefinitionsHash !== parameterDefinitionsHash)) {
    throw new Error('Job 配置或参数定义已变化，需要更新清单');
  }
  if (!input.execute) return { ...input, instance: args.instance, execute: false, confirmed: false, state: 'AWAITING_CONFIRMATION',
    jobConfigHash, jobBindingHash, jobBindingMode, parameterDefinitionsHash, writes: 0 };
  if (jobBindingMode === 'READABLE_METADATA' && input.jobBindingMode !== jobBindingMode) {
    throw new Error('Job 元数据核验方式尚未纳入已确认清单');
  }
  await (io.checkSource || checkReleaseSource)(input);
  if (input.jobAdapter === 'npm-tools-v1') await (io.checkSource || checkReleaseSource)({
    sourceRepository: input.pipelineSource.repositoryUrl, releaseRef: input.pipelineSource.ref, expectedSha: input.pipelineSource.expectedSha,
  });
  const result = { state: 'UNKNOWN', targetProject: input.targetProject, releaseTarget: input.releaseTarget,
    releaseKind: input.releaseKind, instance: args.instance, sourceRepository: input.sourceRepository,
    jobName: input.jobName, jobUrl: input.jobUrl, releaseRef: input.releaseRef, version: input.version,
    releaseChannel: input.releaseChannel, targetEnvironment: input.targetEnvironment,
    expectedSha: input.expectedSha, queueId: null, buildNumber: null, sourceVerified: false, writes: 0 };
  result.jobBindingMode = jobBindingMode;
  result.jobAdapter = input.jobAdapter;
  result.versionStrategy = input.versionStrategy || 'EXPLICIT';
  let phase = 'TRIGGER';
  const waitOptions = { ...io, deadline: (io.now || Date.now)() + (io.maxWaitMs ?? 1800000) };
  try {
    // Exactly one write. Queue/build polling below is read-only and never retriggers.
    const triggered = await readTool(call, 'jenkins_trigger_build', { ...args, params: input.params });
    result.writes++;
    if (triggered?.jobName !== input.jobName || !triggered.queueUrl) throw new Error('触发结果缺少确切队列；不要重试发布');
    const queue = reader.queueIdentity(triggered.queueUrl);
    result.queueUrl = queue.url || triggered.queueUrl;
    result.queueId = queue.id;
    io.onProgress?.({ state: 'TRIGGERED', queueId: result.queueId, queueUrl: result.queueUrl });
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
    verifyBuild(build, input, result.queueId);
    result.sourceVerified = true;
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
