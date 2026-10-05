import { buildLaunch, configPath, readConfig } from './start-mcp.mjs';

// The connected Jenkins MCP omits queue executables, build queueId, parameters and SCM actions.
// Fill only those read gaps; writes continue to use jenkins-mcp.
export function createJenkinsReader(env, jobName, jobUrl, fetchImpl = fetch) {
  const base = new URL(env.MCP_JENKINS_URL);
  const expected = new URL(jobUrl);
  const basePath = base.pathname.replace(/\/$/, '');
  const jobPath = basePath + '/job/' + jobName.split('/').map(encodeURIComponent).join('/job/') + '/';
  if (base.username || base.password || base.search || base.hash ||
      expected.username || expected.password || expected.search || expected.hash ||
      expected.origin !== base.origin || expected.pathname !== jobPath) {
    throw new Error('Job URL 与配置的 Jenkins 实例或精确 Job 路径不一致');
  }
  const authorization = 'Basic ' + Buffer.from(`${env.MCP_JENKINS_USER}:${env.MCP_JENKINS_API_TOKEN}`).toString('base64');
  const request = async (url, accept = 'application/json') => {
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', redirect: 'error',
        headers: { Authorization: authorization, Accept: accept }, signal: AbortSignal.timeout(30000) });
    } catch { throw new Error('Jenkins 只读 API 连接失败；不会重试发布'); }
    if (!response.ok) throw new Error(`Jenkins 只读 API HTTP ${response.status}`);
    return response;
  };
  const get = async url => {
    const response = await request(url);
    try { return await response.json(); } catch { throw new Error('Jenkins 只读 API 返回非 JSON'); }
  };
  const queueIdentity = queueUrl => {
    const url = new URL(queueUrl, base);
    const match = url.pathname.slice(basePath.length).match(/^\/queue\/item\/(\d+)\/?$/);
    if (url.origin !== base.origin || !url.pathname.startsWith(basePath + '/') || !match ||
        url.username || url.password || url.search || url.hash) throw new Error('队列地址超出已确认 Jenkins 范围');
    if (!Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) throw new Error('队列 ID 无效');
    return { id: Number(match[1]), url: url.href.replace(/\/$/, '') };
  };
  return {
    instanceUrl: base.href.replace(/\/$/, ''),
    jobUrl: expected.href,
    queueIdentity,
    async job() {
      const url = new URL('api/json', expected);
      url.searchParams.set('tree', '_class,fullName,url,buildable');
      const data = await get(url.href);
      if (data.fullName !== jobName || data.url !== expected.href || data.buildable !== true || typeof data._class !== 'string') {
        throw new Error('Job 可读身份或可构建状态不一致');
      }
      return { fullName: data.fullName, url: data.url, buildable: data.buildable, type: data._class };
    },
    async queue(queueUrl) {
      const { id, url } = queueIdentity(queueUrl);
      const data = await get(url + '/api/json');
      if (Number(data.id) !== id || data.task?.url !== expected.href) throw new Error('队列 ID 或 Job 归属不一致');
      return data;
    },
    async build(number) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('构建号无效');
      const url = new URL(String(number) + '/api/json', expected);
      url.searchParams.set('tree', 'number,queueId,building,result,url,actions[parameters[name,value],lastBuiltRevision[SHA1],remoteUrls]');
      const data = await get(url.href);
      if (Number(data.number) !== number || data.url !== new URL(String(number) + '/', expected).href) {
        throw new Error('构建号或 Job 归属不一致');
      }
      return data;
    },
    async console(number) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('构建号无效');
      const response = await request(new URL(String(number) + '/consoleText', expected).href, 'text/plain');
      let bytes = 0;
      const chunks = [];
      for await (const value of response.body) {
        const chunk = Buffer.from(value);
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) throw new Error('构建发布摘要超出只读日志大小限制');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

export function configuredJenkinsReader(input) {
  const launch = buildLaunch('jenkins-mcp', readConfig(configPath()), {});
  return createJenkinsReader(launch.env, input.jobName, input.jobUrl);
}
