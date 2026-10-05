import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { repositoryKey, sha256, stableJson } from './workflow-runtime.mjs';

const exec = promisify(execFile);
const fullSha = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;

export async function readPipelineSource(source) {
  if (!source || !fullSha.test(source.expectedSha || '') || !source.repositoryPath || !source.repositoryUrl ||
      !source.ref || !source.scriptPath || source.scriptPath.startsWith('/') || source.scriptPath.split('/').includes('..')) {
    throw new Error('计算版本的 Job 需要已核实的流水线仓库、ref/SHA 和脚本路径');
  }
  const run = args => exec('git', args, { cwd: source.repositoryPath, timeout: 30000, maxBuffer: 512 * 1024 });
  const [root, origin, content] = await Promise.all([
    run(['rev-parse', '--show-toplevel']), run(['remote', 'get-url', 'origin']),
    run(['show', `${source.expectedSha}:${source.scriptPath}`]),
  ]);
  if (resolve(root.stdout.trim()) !== resolve(source.repositoryPath) || repositoryKey(origin.stdout.trim()) !== repositoryKey(source.repositoryUrl)) {
    throw new Error('流水线脚本不属于已确认的仓库');
  }
  return content.stdout;
}

export function npmToolsContract(body, input) {
  // This adapter recognizes the maintained Jenkinsfile contract, not arbitrary Groovy.
  const branches = body.match(/def resolveBranchName\(releaseType\)\s*\{\s*return releaseType == 'release:canary' \? '([^']+)' : '([^']+)'\s*\}/);
  const repos = body.match(/def repoMap\s*=\s*\[([\s\S]*?)\]/);
  const repoRows = repos ? [...repos[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)] : [];
  const repo = repoRows.filter(row => row[1] === input.targetProject);
  if (!branches || repo.length !== 1 || !body.includes("'实际发包': publishedPackageSummary") ||
      !body.includes("'发布类型': params.RELEASE_TYPE") || !body.includes("readNpmPublishedPackages(this)") ||
      !body.includes("未从 npm 源查询到本次发布包版本")) throw new Error('流水线不符合已适配的 npm-tools 发布证据格式');
  const pipelineUrl = new URL(input.pipelineSource.repositoryUrl);
  const target = new URL('/' + repo[0][2], pipelineUrl);
  if (repositoryKey(target.href) !== repositoryKey(input.sourceRepository)) throw new Error('项目选择与流水线目标仓库不一致');
  return { ref: input.releaseChannel === 'canary' ? branches[1] : branches[2],
    releaseType: input.releaseChannel === 'canary' ? 'release:canary' : 'release:prod',
    pipelineBodyHash: sha256(body) };
}

export async function adaptJenkinsInput(definitions, input, io = {}) {
  const names = new Set((definitions.parameters || []).map(row => row.name));
  const inferred = input.releaseKind === 'package' && names.has('PROJECT_NAME') && names.has('RELEASE_TYPE')
    ? 'npm-tools-v1' : input.releaseKind === 'deployment' && names.has('branch') && !input.refParameter
      ? 'branch-deployment-v1' : 'explicit-v1';
  const adapter = input.jobAdapter || inferred;
  if (!['explicit-v1', 'branch-deployment-v1', 'npm-tools-v1'].includes(adapter)) throw new Error('未知 Jenkins Job 适配器');
  let result = { ...input, jobAdapter: adapter, params: { ...(input.params || {}) } };
  if (adapter === 'branch-deployment-v1') {
    if (input.releaseKind !== 'deployment' || !names.has('branch')) throw new Error('Job 不支持 branch 部署适配');
    result.refParameter = 'branch';
    if (result.params.branch === undefined) result.params.branch = input.releaseRef;
    result.version ||= input.expectedSha;
  } else if (adapter === 'npm-tools-v1') {
    if (input.releaseKind !== 'package' || !names.has('PROJECT_NAME') || !names.has('RELEASE_TYPE')) throw new Error('Job 不支持 npm-tools 参数');
    if (input.releaseScope !== 'PROJECT' || input.releaseTarget !== input.targetProject) {
      throw new Error('此 Job 会发布整个项目，必须在清单中明确 PROJECT 范围及项目目标');
    }
    const body = await (io.readPipeline || readPipelineSource)(input.pipelineSource);
    const contract = npmToolsContract(body, input);
    if (input.releaseRef !== contract.ref) throw new Error('发布 ref 与实际流水线计算的分支不一致');
    for (const [key, value] of [['PROJECT_NAME', input.targetProject], ['RELEASE_TYPE', contract.releaseType]]) {
      if (result.params[key] !== undefined && result.params[key] !== value) throw new Error('已提供参数与实际流水线规则不一致');
      result.params[key] = value;
    }
    result = { ...result, refParameter: null, channelParameter: 'RELEASE_TYPE', versionParameter: null,
      versionStrategy: 'PIPELINE_COMPUTED', version: input.version || input.expectedSha, ...contract };
    // The displayed source SHA is an identity. It is not a predicted npm version.
    if (result.version !== input.expectedSha) throw new Error('此 Job 的计算版本计划使用源码 SHA 作为身份，实际包版本在构建后读回');
  }
  const fingerprint = sha256(stableJson({ adapter, refParameter: result.refParameter || null,
    channelParameter: result.channelParameter || null, versionStrategy: result.versionStrategy || 'EXPLICIT',
    pipelineBodyHash: result.pipelineBodyHash || null, releaseScope: result.releaseScope || null }));
  if (input.adapterHash && input.adapterHash !== fingerprint) throw new Error('Jenkins 参数/流水线适配规则已变化');
  return { ...result, adapterHash: fingerprint };
}

export function parseNpmToolsPublication(consoleText, input) {
  const body = consoleText.replace(/\u001b\[[;?\d]*[ -/]*[@-~]/g, '')
    .replace(/^\[[\dT:.Z+-]+\]\s?/gm, '');
  const sections = [...body.matchAll(/^=+ 发布成功 =+\s*\n([\s\S]*?)^=+\s*$/gm)];
  if (!sections.length) throw new Error('本次构建没有可核实的 npm 发布成功摘要');
  const section = sections.at(-1)[1];
  const project = section.match(/^项目名称\s*:\s*(\S+)\s*$/m)?.[1];
  const releaseType = section.match(/^发布类型\s*:\s*(\S+)\s*$/m)?.[1];
  if (project !== input.targetProject || releaseType !== input.params.RELEASE_TYPE) throw new Error('发布摘要不属于已确认项目或渠道');
  const packageBlock = section.match(/^实际发包\s*:\s*(.+(?:\n {2}[^\n]+)*)/m)?.[1];
  if (!packageBlock) throw new Error('发布成功摘要没有实际包版本');
  const packages = packageBlock.split('\n').map(line => {
    const match = line.trim().match(/^((?:@[a-z\d_.-]+\/)?[a-z\d_.-]+)@(\d+\.\d+\.\d+(?:-[a-z\d.-]+)?(?:\+[a-z\d.-]+)?)$/i);
    if (!match) throw new Error('实际发布包或版本格式不可识别');
    if (input.releaseChannel === 'official' && match[2].includes('-')) throw new Error('正式发布读回了预发布版本');
    if (input.releaseChannel === 'canary' && !match[2].includes('-')) throw new Error('金丝雀发布读回了稳定版本');
    return { name: match[1], version: match[2] };
  });
  if (new Set(packages.map(row => row.name)).size !== packages.length) throw new Error('发布摘要包含重复包');
  return packages;
}
