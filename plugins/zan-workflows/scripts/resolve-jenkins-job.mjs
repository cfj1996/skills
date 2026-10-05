#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFor } from './mcp-client.mjs';
import { readCliPlan, readTool, requireText } from './workflow-runtime.mjs';

export async function resolveJenkinsJob(call, input) {
  if (input.execute) throw new Error('Job 定位只有只读模式');
  requireText(input.jobName, '已路由的 Job 名称');
  const segments = input.jobName.split('/');
  if (segments.some(part => !part || ['.', '..'].includes(part)) || input.jobName.includes('\\')) {
    throw new Error('Job 名称或文件夹路径无效');
  }
  const instances = await readTool(call, 'jenkins_list_instances', {});
  if (!Array.isArray(instances) || !instances.length) throw new Error('Jenkins 实例不可验证');
  const selected = input.instance ? instances.filter(row => row.name === input.instance) : [instances[0]];
  if (selected.length !== 1) throw new Error('Jenkins 实例缺失或不唯一');
  const instance = selected[0];
  const base = new URL(instance.url);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Jenkins 实例地址不可验证');
  }
  const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : null;
  const jobs = await readTool(call, 'jenkins_search_jobs', { query: input.jobName, instance: instance.name,
    includeFolders: false, recursive: false, ...(folder ? { folder } : {}) });
  if (!Array.isArray(jobs)) throw new Error('Job 查询返回不可识别');
  const fullName = row => row.fullName || (folder && row.name && !row.name.includes('/') ? folder + '/' + row.name : row.name);
  const matches = jobs.filter(row => fullName(row) === input.jobName && row.isFolder !== true);
  if (matches.length !== 1) throw new Error('精确 Job 缺失或不唯一；不能采用相似名称');
  const job = matches[0], url = new URL(job.url);
  const path = base.pathname.replace(/\/$/, '') + '/job/' + segments.map(encodeURIComponent).join('/job/') + '/';
  if (url.origin !== base.origin || url.pathname !== path || url.username || url.password || url.search || url.hash) {
    throw new Error('读回的 Job URL 不属于已核实实例和精确 Job');
  }
  return { state: 'RESOLVED', instance: instance.name, jobName: input.jobName, jobUrl: url.href,
    source: 'JENKINS_READBACK', readOnly: true, writes: 0 };
}

async function main() {
  const input = await readCliPlan();
  if (input.execute) throw new Error('Job 定位只有只读模式');
  const client = clientFor('jenkins-mcp');
  try {
    await client.initialize();
    const result = await resolveJenkinsJob((name, args) => client.call(name, args), input);
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { client.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('Job 只读定位失败，未触发构建或部署\n'); process.exitCode = 1; });
}
