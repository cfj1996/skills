#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCliPlan, sha256, stableJson } from './workflow-runtime.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const TYPES = new Set(['string', 'text', 'choice', 'boolean', 'number', 'password']);
const SECRET = /password|passwd|secret|token|credential|api[_-]?key/i;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);

export async function resolveJenkinsContractsPath(input = {}) {
  if (input.jenkinsContractsPath !== undefined) {
    if (!text(input.jenkinsContractsPath) || !isAbsolute(input.jenkinsContractsPath)) throw new Error('Jenkins 固定参数文件路径必须为明确绝对路径');
    return resolve(input.jenkinsContractsPath);
  }
  const configured = input.projectKnowledgeRoot || process.env.PROJECT_KNOWLEDGE_ROOT;
  if (configured) return resolve(configured, 'data/workspace/jenkins-build-contracts.json');
  const starts = [input.repositoryPath, process.env.WORKSPACE_ROOT, process.cwd()].filter(text);
  for (const start of starts) {
    let current = resolve(start);
    for (;;) {
      for (const candidate of [resolve(current, 'project-knowledge'), ...(current.endsWith('/project-knowledge') ? [current] : [])]) {
        const file = resolve(candidate, 'data/workspace/jenkins-build-contracts.json');
        try { await access(file); return file; } catch {}
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('找不到 project-knowledge 的 Jenkins 固定参数配置；先运行独立同步脚本，部署不会联网刷新');
}

function validateDefinitions(job) {
  if (!Array.isArray(job.parameters)) throw new Error('Jenkins 固定参数定义缺失；先刷新维护配置');
  const names = new Set();
  for (const parameter of job.parameters) {
    if (!object(parameter) || !text(parameter.name) || RESERVED.has(parameter.name) || names.has(parameter.name) ||
        !TYPES.has(parameter.type)) throw new Error('Jenkins 固定参数存在重复名称、未知类型或无效定义；先维护适配');
    names.add(parameter.name);
    if (parameter.type === 'choice' && (!Array.isArray(parameter.choices) || !parameter.choices.length ||
        parameter.choices.some(value => typeof value !== 'string'))) throw new Error(`固定 choice 参数缺少准确选项：${parameter.name}`);
    if ((parameter.sensitive || parameter.type === 'password' || SECRET.test(parameter.name)) &&
        (own(parameter, 'defaultValue') || own(parameter, 'choices'))) throw new Error('敏感 Jenkins 参数不得在知识库保存默认值或选项值');
  }
}

export async function loadFrozenJenkinsContract(input, io = {}) {
  // The only test seam replaces file I/O. Definition objects in a deployment
  // payload are deliberately ignored; production always rereads the authority.
  const contractPath = await resolveJenkinsContractsPath(input);
  let body;
  try { body = await (io.readFrozenJenkinsContracts || readFile)(contractPath, 'utf8', input); }
  catch { throw new Error('无法读取 project-knowledge 的 Jenkins 固定参数配置；部署不会查询 Jenkins 参数或自动刷新'); }
  let registry;
  try { registry = JSON.parse(body); } catch { throw new Error('Jenkins 固定参数配置不是有效 JSON'); }
  if (registry.schemaVersion !== 1 || !object(registry.instance) || !text(registry.instance.name) ||
      !text(registry.instance.url) || !object(registry.jobs) || !object(registry.projectJobs)) throw new Error('Jenkins 固定参数配置版本或实例/项目映射无效');
  const job = registry.jobs[input.jobName];
  if (!object(job) || job.jobName !== input.jobName || job.status !== 'ready' || job.jobUrl !== input.jobUrl) {
    throw new Error('Job 尚未接入有效的 Jenkins 固定参数配置，或名称/URL 不匹配；请先独立刷新/维护');
  }
  if (input.instance && input.instance !== registry.instance.name) throw new Error('Jenkins 实例与知识库固定参数配置不一致');
  let instanceUrl, actualJobUrl;
  try { instanceUrl = new URL(registry.instance.url); actualJobUrl = new URL(job.jobUrl); } catch { throw new Error('固定 Jenkins 实例或 Job URL 无效'); }
  const segments = input.jobName.split('/');
  const expectedPath = instanceUrl.pathname.replace(/\/$/, '') + '/job/' + segments.map(encodeURIComponent).join('/job/') + '/';
  if (!['http:', 'https:'].includes(instanceUrl.protocol) || instanceUrl.username || instanceUrl.password || instanceUrl.search || instanceUrl.hash ||
      segments.some(segment => !segment || ['.', '..'].includes(segment)) || input.jobName.includes('\\') ||
      actualJobUrl.origin !== instanceUrl.origin || actualJobUrl.pathname !== expectedPath ||
      actualJobUrl.username || actualJobUrl.password || actualJobUrl.search || actualJobUrl.hash) {
    throw new Error('固定 Job URL 未绑定到同一 Jenkins 实例或准确 Job 路径');
  }
  validateDefinitions(job);
  if (!object(job.profiles)) throw new Error('Job 缺少已核实的固定环境策略');
  const projectKey = input.jenkinsProjectKey || input.targetProject;
  if (input.jenkinsProjectKey && registry.projectJobs[input.jenkinsProjectKey] !== input.jobName) throw new Error('jenkinsProjectKey 不属于该固定 Job');
  const candidates = Object.entries(job.profiles).filter(([name, profile]) => {
    if (!object(profile) || (input.jenkinsProfile && name !== input.jenkinsProfile) ||
        profile.targetEnvironment !== input.targetEnvironment || profile.releaseChannel !== input.releaseChannel) return false;
    if (Array.isArray(profile.allowedProjects)) return profile.allowedProjects.includes(profile.projectParameter ? input.targetProject : projectKey);
    return registry.projectJobs[projectKey] === input.jobName;
  });
  if (candidates.length !== 1) throw new Error('固定 Jenkins 环境策略缺失或不唯一；核实项目归属并显式选择 jenkinsProfile，不猜默认平台/环境');
  const [profileId, profile] = candidates[0];
  if (!['test', 'production'].includes(profile.environmentKind) || !['canary', 'official'].includes(profile.releaseChannel) || !object(profile.fixedParams) ||
      (profile.releaseChannel === 'official' && profile.environmentKind !== 'production')) throw new Error('Jenkins 固定环境策略不可识别或正式通道被误标为测试环境');
  for (const key of [...Object.keys(profile.fixedParams), ...['refParameter', 'versionParameter', 'channelParameter', 'projectParameter'].flatMap(field => profile[field] ? [profile[field]] : [])]) {
    if (!job.parameters.some(parameter => parameter.name === key)) throw new Error('固定环境策略引用了未采集的构建参数；请先刷新维护');
    if (own(profile.fixedParams, key) && job.parameters.some(parameter => parameter.name === key &&
      (parameter.sensitive || parameter.type === 'password' || SECRET.test(parameter.name)))) throw new Error('敏感 Jenkins 参数不能固化到环境策略');
  }
  const definitions = { jobName: job.jobName, parameters: job.parameters };
  const parameterDefinitionsHash = sha256(stableJson(definitions));
  if (job.parameterDefinitionsHash && job.parameterDefinitionsHash !== parameterDefinitionsHash) throw new Error('Jenkins 固定参数定义指纹不一致；配置可能损坏');
  const relatedProjects = Object.fromEntries(Object.entries(registry.projectJobs).filter(([, name]) => name === job.jobName));
  const semantic = value => Array.isArray(value) ? value.map(semantic) : object(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !['syncedAt', 'collectedAt', 'refreshedAt', 'readAt', 'observedAt', 'fetchedAt', 'policyFileHash'].includes(key)).map(([key, item]) => [key, semantic(item)])) : value;
  const semanticJob = semantic(job);
  const contractHash = sha256(stableJson({ schemaVersion: registry.schemaVersion, instance: registry.instance,
    projectJobs: relatedProjects, job: semanticJob }));
  const profileHash = sha256(stableJson({ profileId, profile }));
  if ((input.jenkinsContractHash && input.jenkinsContractHash !== contractHash) ||
      (input.jenkinsProfileHash && input.jenkinsProfileHash !== profileHash) ||
      (input.parameterDefinitionsHash && input.parameterDefinitionsHash !== parameterDefinitionsHash)) {
    throw new Error('Jenkins 固定参数或环境策略已变化，需要刷新本轮清单确认');
  }
  if (input.execute && (!input.jenkinsContractHash || !input.jenkinsProfileHash)) throw new Error('执行缺少已确认的 Jenkins 固定参数/环境策略指纹');
  return { contractPath, contractHash, profileHash, profileId, profile, projectKey,
    instance: registry.instance, definitions, parameterDefinitionsHash };
}

function validateValue(parameter, value) {
  const type = parameter.type;
  if (type === 'boolean' ? typeof value !== 'boolean' : type === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
    : typeof value !== 'string') throw new Error(`Jenkins 参数类型与固定定义不符：${parameter.name}`);
  if (type === 'choice' && !parameter.choices.includes(value)) throw new Error(`未确认或不合法的 Jenkins 参数选项：${parameter.name}`);
  if (parameter.requiresValue && (value === '' || value === null || value === undefined)) throw new Error(`Jenkins 参数需要显式提供值：${parameter.name}`);
}

export function resolveFrozenJenkinsParameters(contract, input, io = {}) {
  const { definitions, profile } = contract;
  if (input.params !== undefined && !object(input.params)) throw new Error('Jenkins 参数必须是明确对象');
  const supplied = input.params || {};
  const known = new Set(definitions.parameters.map(parameter => parameter.name));
  const sensitiveNames = definitions.parameters.filter(parameter => parameter.sensitive || parameter.type === 'password' || SECRET.test(parameter.name)).map(parameter => parameter.name);
  if (input.secretParameterEnv !== undefined && (!object(input.secretParameterEnv) ||
      Object.keys(input.secretParameterEnv).some(name => !sensitiveNames.includes(name)))) {
    throw new Error('secretParameterEnv 只能引用固定定义中的敏感参数');
  }
  if (Object.keys(supplied).some(name => !known.has(name))) throw new Error('未确认的 Jenkins 参数；必须先刷新固定定义，不能临时联网添加');
  const params = {};
  for (const parameter of definitions.parameters) {
    const sensitive = parameter.sensitive || parameter.type === 'password' || SECRET.test(parameter.name);
    if (sensitive) {
      const envName = input.secretParameterEnv?.[parameter.name];
      if (!text(envName) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName) ||
          (own(supplied, parameter.name) && supplied[parameter.name] !== '[REDACTED]')) {
        throw new Error(`敏感 Jenkins 参数必须通过 secretParameterEnv 显式注入，不能保存到部署 JSON：${parameter.name}`);
      }
      const secret = (io.env || process.env)[envName];
      if (!text(secret)) throw new Error(`敏感 Jenkins 参数尚未显式注入：${parameter.name}`);
      params[parameter.name] = secret;
    } else if (own(supplied, parameter.name)) params[parameter.name] = supplied[parameter.name];
    else if (own(parameter, 'defaultValue')) params[parameter.name] = parameter.defaultValue;
    else if (![...Object.keys(profile.fixedParams), profile.refParameter || input.refParameter,
      profile.projectParameter, profile.versionParameter || input.versionParameter].includes(parameter.name)) {
      throw new Error(`Jenkins 固定参数没有默认值，必须显式提供：${parameter.name}`);
    }
  }
  const bind = (name, value, label, mayReplaceDefault = true) => {
    if (!name) return;
    if (!known.has(name)) throw new Error(`${label}引用未采集的 Jenkins 参数：${name}`);
    if (value === undefined) throw new Error(`${label}缺少明确绑定值`);
    if (own(supplied, name) && String(supplied[name]) !== String(value)) throw new Error(`${label}与本次实际参数不一致：${name}`);
    if (!mayReplaceDefault && own(params, name) && params[name] !== value) throw new Error(`${label}与固定策略不一致：${name}`);
    params[name] = value;
  };
  for (const [name, value] of Object.entries(profile.fixedParams)) bind(name, value, '固定环境参数');
  const refParameter = profile.refParameter || input.refParameter;
  bind(refParameter, input.releaseRef, '发布 ref');
  if (profile.projectParameter) bind(profile.projectParameter, input.targetProject, '发布项目');
  const versionParameter = profile.versionParameter || input.versionParameter;
  let version = input.version || input.expectedSha;
  if (versionParameter) {
    // Adapter defaults may use SHA as build identity. A profile-bound business
    // version (e.g. the historical "vesion") has its own frozen default.
    const requested = io.suppliedVersion;
    if (requested !== undefined) bind(versionParameter, requested, '发布版本');
    version = params[versionParameter];
  }
  for (const [name, value] of Object.entries(profile.fixedParams)) {
    if (params[name] !== value) throw new Error(`发布绑定试图覆盖固定环境参数：${name}`);
  }
  for (const parameter of definitions.parameters) validateValue(parameter, params[parameter.name]);
  const publicParams = Object.fromEntries(definitions.parameters.map(parameter => [parameter.name,
    parameter.sensitive || parameter.type === 'password' || SECRET.test(parameter.name) ? '[REDACTED]' : params[parameter.name]]));
  return { params, publicParams, refParameter, versionParameter, channelParameter: profile.channelParameter || input.channelParameter,
    version, environmentKind: profile.environmentKind, sensitiveParameterNames: sensitiveNames, parametersValueHash: sha256(stableJson(params)) };
}

export async function prepareFrozenJenkinsBuild(input, io = {}) {
  const contract = await loadFrozenJenkinsContract(input, io);
  const resolved = resolveFrozenJenkinsParameters(contract, input, { ...io, suppliedVersion: input.version });
  if (input.jenkinsParametersValueHash && input.jenkinsParametersValueHash !== resolved.parametersValueHash) throw new Error('本轮 Jenkins 实际参数值已变化，需要重新核对确认');
  return { state: 'PREPARED', source: 'PROJECT_KNOWLEDGE', jenkinsContractsPath: contract.contractPath,
    jenkinsContractHash: contract.contractHash, jenkinsProfile: contract.profileId, jenkinsProfileHash: contract.profileHash,
    parameterDefinitionsHash: contract.parameterDefinitionsHash, jenkinsParametersValueHash: resolved.parametersValueHash,
    instance: contract.instance.name, jobName: input.jobName, jobUrl: input.jobUrl,
    targetEnvironment: input.targetEnvironment, releaseChannel: input.releaseChannel, environmentKind: resolved.environmentKind,
    params: resolved.publicParams, refParameter: resolved.refParameter, versionParameter: resolved.versionParameter,
    channelParameter: resolved.channelParameter, version: resolved.version,
    ...(resolved.sensitiveParameterNames.length ? { secretParameterEnv: input.secretParameterEnv, sensitiveParameterNames: resolved.sensitiveParameterNames } : {}), writes: 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  readCliPlan().then(input => prepareFrozenJenkinsBuild(input)).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { process.stdout.write(JSON.stringify({ state: 'BLOCKED', error: error.message, writes: 0 }) + '\n'); process.exitCode = 1; });
}
