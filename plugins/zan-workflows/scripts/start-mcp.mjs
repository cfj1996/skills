import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const nodeArgs = ['run', '--node', '22.20.0', 'npx', '--yes'];
export const servers = {
  'gitlab-mcp': {
    command: 'volta',
    args: [...nodeArgs, '@zereight/mcp-gitlab', '--toolsets=all',
      '--tools=create_merge_request,merge_merge_request',
      '--tool-policy-approve=create_merge_request,merge_merge_request'],
    required: ['GITLAB_API_URL', 'GITLAB_PERSONAL_ACCESS_TOKEN'],
  },
  'jenkins-mcp': {
    command: 'volta', args: [...nodeArgs, '@kud/mcp-jenkins@latest'],
    required: ['MCP_JENKINS_URL', 'MCP_JENKINS_USER', 'MCP_JENKINS_API_TOKEN'],
  },
  'tapd-mcp': {
    command: 'uvx', args: ['--from', 'zan-tapd-mcp==0.0.2', 'mcp-server-tapd'],
    required: ['TAPD_ACCESS_TOKEN', 'TAPD_API_BASE_URL', 'TAPD_BASE_URL'],
  },
  'yapi-mcp': {
    command: 'volta',
    args: [...nodeArgs, '--registry=https://npm.jubaozan.cn/',
      '--package=@zan/yapi-cli@latest', 'zan-yapi-cli'],
    required: ['YAPI_BASE_URL'],
    optional: ['YAPI_USERNAME', 'YAPI_PASSWORD', 'YAPI_PROJECT_TOKEN'],
  },
};

export function configPath(env = process.env, home = homedir()) {
  return env.ZAN_WORKFLOWS_CONFIG || join(home, '.config', 'zan-workflows', 'credentials.json');
}

export function readConfig(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // JSON parser messages can include the credential text: never forward them.
    throw new Error('无法读取凭证文件或 JSON 格式无效；请检查 ZAN_WORKFLOWS_CONFIG 或 ~/.config/zan-workflows/credentials.json。');
  }
}

export function buildLaunch(name, config, inherited = process.env, platform = process.platform) {
  const spec = Object.hasOwn(servers, name) && servers[name];
  if (!spec) throw new Error('未知 MCP；可用名称：gitlab-mcp、jenkins-mcp、tapd-mcp、yapi-mcp。');
  if (config?.version !== 1) throw new Error('凭证文件 version 必须为 1。');
  const values = config.servers?.[name]?.env;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`缺少 servers.${name}.env。`);
  }
  for (const key of spec.required) {
    if (typeof values[key] !== 'string' || !values[key].trim()) {
      throw new Error(`缺少 ${name} 的必填字段 ${key}。`);
    }
  }
  const env = { ...inherited };
  // Do not leak another service's credentials or stale auth mode to this child.
  for (const key of Object.keys(env)) {
    if (/^(GITLAB_|MCP_JENKINS_|TAPD_|YAPI_|ZAN_WORKFLOWS_CONFIG$)/i.test(key)) delete env[key];
  }
  for (const key of [...spec.required, ...(spec.optional || [])]) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== 'string' || values[key].includes('\0')) {
      throw new Error(`${name} 的字段 ${key} 必须是有效字符串。`);
    }
    env[key] = values[key];
  }
  if (name === 'yapi-mcp' && !env.YAPI_PROJECT_TOKEN?.trim() &&
      !(env.YAPI_USERNAME?.trim() && env.YAPI_PASSWORD?.trim())) {
    throw new Error('YApi 需要 YAPI_PROJECT_TOKEN 或 YAPI_USERNAME + YAPI_PASSWORD。');
  }
  // Volta is a native executable on Windows and resolves npx itself. No shell
  // or npx.cmd quoting is involved, and secrets are never command arguments.
  return { command: spec.command + (platform === 'win32' ? '.exe' : ''), args: [...spec.args], env };
}

export function redact(text, values) {
  const secrets = Object.entries(values)
    .filter(([key, value]) => /TOKEN|PASSWORD|SECRET/i.test(key) && value)
    .map(([, value]) => value).sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text;
}

export function main(argv = process.argv.slice(2)) {
  const [name, option] = argv;
  if (argv.length > 2 || (option && option !== '--check')) throw new Error('用法：node start-mcp.mjs <MCP 名称> [--check]');
  const launch = buildLaunch(name, readConfig(configPath()));
  if (option === '--check') {
    process.stderr.write(`[zan-workflows] ${name}: 配置校验通过。\n`);
    return;
  }
  const child = spawn(launch.command, launch.args, {
    env: launch.env, cwd: homedir(), stdio: ['inherit', 'inherit', 'pipe'],
    shell: false, windowsHide: true,
  });
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let dropping = false;
  function log(chunk) {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end + 1);
      pending = pending.slice(end + 1);
      if (!dropping && line.length <= 65536) process.stderr.write(redact(line, launch.env));
      dropping = false;
    }
    if (pending.length > 65536) { pending = ''; dropping = true; }
  }
  child.stderr.on('data', chunk => log(decoder.write(chunk)));
  child.stderr.on('end', () => {
    log(decoder.end());
    if (!dropping && pending) process.stderr.write(redact(pending, launch.env));
  });
  const forward = signal => { if (!child.killed) child.kill(signal); };
  const onInt = () => forward('SIGINT');
  const onTerm = () => forward('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  child.on('error', () => {
    process.stderr.write(`[zan-workflows] 无法启动 ${launch.command}；请确认已安装并加入 PATH。\n`);
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`[zan-workflows] ${error.message}\n`);
    process.exitCode = 1;
  }
}
