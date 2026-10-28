#!/usr/bin/env node
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClientPool } from './mcp-client.mjs';
import { readTool } from './workflow-runtime.mjs';
import { exportExecutionReport, renderReport } from './export-execution-report.mjs';
import { hash, readFeedbackInput, readPrivateFile, readPrivateJson, redactText,
  writePrivateFile } from './execution-recorder.mjs';

export const FEEDBACK_TARGET = Object.freeze({
  projectId: '374',
  projectUrl: 'http://git.jubaozan.cn/chenfangjie/skills',
});

function projectUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !/^\/[^/]+\/[^/]+/.test(url.pathname)) throw new Error('需要准确 GitLab 项目 URL，不含凭证或查询参数');
  url.pathname = url.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  if (url.pathname.includes('/-/') || url.pathname.includes('..')) throw new Error('需要项目首页 URL');
  return url.href.replace(/\/$/, '');
}

async function checkedProject(call) {
  const project = await readTool(call, 'get_project', { project_id: FEEDBACK_TARGET.projectId });
  if (!project || project.id !== Number(FEEDBACK_TARGET.projectId) ||
      projectUrl(project.web_url) !== FEEDBACK_TARGET.projectUrl) {
    throw new Error('反馈项目读回与内置目标不匹配');
  }
  if (project.issues_enabled !== true) {
    throw new Error('固定反馈项目未启用 Issues');
  }
  return FEEDBACK_TARGET;
}

function verifyIssue(issue, target, key, attachment) {
  if (!Number.isSafeInteger(issue?.iid) || issue.iid <= 0 || issue.project_id !== Number(target.projectId) ||
      typeof issue.description !== 'string' || !issue.description.includes('<!-- ' + key + ' -->') ||
      attachment && !issue.description.includes(attachment)) throw new Error('Issue 内容或归属读回不匹配');
  const url = new URL(issue.web_url);
  const expected = new URL(target.projectUrl);
  if (url.origin !== expected.origin || ![expected.pathname + '/-/issues/' + issue.iid,
    expected.pathname + '/issues/' + issue.iid].includes(url.pathname) ||
    url.username || url.password || url.search || url.hash) throw new Error('Issue 链接不属于反馈项目');
  return { issueIid: issue.iid, issueUrl: issue.web_url };
}

async function findIssue(call, target, key) {
  const matches = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await readTool(call, 'list_issues', { project_id: target.projectId,
      scope: 'all', state: 'all', search: key, per_page: 100, page, summary: false });
    if (!Array.isArray(rows)) throw new Error('反馈 Issue 查询结果无法识别');
    for (const row of rows) {
      if (!Number.isSafeInteger(row?.iid)) throw new Error('反馈 Issue 查询缺少身份');
      const issue = await readTool(call, 'get_issue', { project_id: target.projectId, issue_iid: String(row.iid) });
      if (typeof issue.description === 'string' && issue.description.includes('<!-- ' + key + ' -->')) {
        matches.push(issue);
      }
    }
    if (matches.length > 1) throw new Error('存在多个相同反馈标识的 Issue，需人工核实');
    if (rows.length < 100) return matches[0] || null;
  }
  throw new Error('反馈查询超过预算，未完整核实重复项');
}

function attachmentLink(upload) {
  // Construct our own label; never copy arbitrary server-returned Markdown into an Issue.
  const path = upload?.url;
  if (typeof path !== 'string' || !/^\/uploads\/[a-f0-9]{32}\/execution-report\.zip$/.test(path)) {
    throw new Error('附件响应不是本项目的标准相对上传路径');
  }
  return '[execution-report.zip](' + path + ')';
}

export async function submitExecutionFeedback(call, input, options = {}) {
  const fields = new Set(['runId', 'feedback', 'evidence', 'execute', 'confirmed']);
  if (Object.keys(input).some(key => !fields.has(key))) throw new Error('提交仅接受运行编号、反馈和证据，不能修改固定接收地址');
  const exported = exportExecutionReport(input, options);
  const local = { runId: exported.runId, revision: exported.revision,
    archivePath: exported.archivePath, reportPath: exported.reportPath, writes: 0 };
  if (input.execute && input.confirmed !== true) throw new Error('上传需要用户明确提出提交反馈；本地执行授权不包含上传');
  const target = await checkedProject(call);
  const key = 'zan-feedback-' + exported.runId + '-' + exported.revision;
  const receiptPath = join(resolve(exported.archivePath, '..'), 'submission-' + hash(target.projectUrl) + '.json');
  const lockPath = receiptPath + '.lock';
  let locked = false;
  if (input.execute) {
    try { writePrivateFile(lockPath, 'submission in progress\n', { exclusive: true }); locked = true; }
    catch (error) {
      if (error.code === 'EEXIST') return { state: 'IN_PROGRESS_OR_INTERRUPTED', ...local, ...target };
      throw error;
    }
  }
  let receipt = null;
  const save = value => {
    receipt = { schemaVersion: 1, key, archiveHash: exported.archiveHash, ...target, ...value };
    writePrivateFile(receiptPath, JSON.stringify(receipt) + '\n');
  };
  let writes = 0, writePending = false;
  try {
    receipt = fs.existsSync(receiptPath) ? readPrivateJson(receiptPath, 8192) : null;
    if (receipt && (receipt.key !== key || receipt.archiveHash !== exported.archiveHash)) throw new Error('提交回执与当前报告不一致');
    const found = await findIssue(call, target, key);
    if (found) {
      const identity = verifyIssue(found, target, key, receipt?.attachment);
      // An uploaded report is complete only when the readback also contains its attachment.
      if (!/\/uploads\/[a-f0-9]{32}\/execution-report\.zip/.test(found.description)) throw new Error('反馈 Issue 缺少报告附件');
      if (input.execute) save({ state: 'VERIFIED', ...identity, attachment: receipt?.attachment });
      return { state: 'VERIFIED', ...local, ...target, ...identity, reused: true };
    }
    if (!input.execute) return { state: receipt ? 'NEEDS_RECONCILIATION' : 'READY',
      ...local, ...target, title: '[插件反馈] ' + exported.report.skill + ' ' + exported.runId,
      description: renderReport(exported.report, 60), priorState: receipt?.state || null };
    if (receipt && !['UPLOADED'].includes(receipt.state)) {
      return { state: 'UNKNOWN', ...local, ...target, priorState: receipt.state,
        reason: '已有未核实写入，保留本地报告；先核实远端，不自动重放上传或建单' };
    }
    if (hash(readPrivateFile(exported.archivePath, 4194304)) !== exported.archiveHash) throw new Error('报告附件已变化');
    let attachment = receipt?.attachment;
    if (!attachment) {
      save({ state: 'UPLOAD_STARTED' }); writePending = true;
      const uploaded = await readTool(call, 'upload_markdown', { project_id: target.projectId,
        file_path: exported.archivePath, _confirmed: true });
      writes++; attachment = attachmentLink(uploaded);
      save({ state: 'UPLOADED', attachment }); writePending = false;
    }
    if (hash(readPrivateFile(exported.archivePath, 4194304)) !== exported.archiveHash) throw new Error('报告附件已变化');
    save({ state: 'CREATE_STARTED', attachment }); writePending = true;
    const created = await readTool(call, 'create_issue', { project_id: target.projectId,
      title: '[插件反馈] ' + exported.report.skill + ' ' + exported.runId,
      description: renderReport(exported.report, 60) + '\n附件：' + attachment + '\n\n<!-- ' + key + ' -->\n',
      _confirmed: true });
    writes++;
    if (!Number.isSafeInteger(created?.iid)) throw new Error('建单响应缺少 Issue 身份');
    // Persist the acknowledged write before its independent readback.
    save({ state: 'CREATED_UNVERIFIED', attachment, issueIid: created.iid }); writePending = false;
    const issue = await readTool(call, 'get_issue', { project_id: target.projectId, issue_iid: String(created.iid) });
    const identity = verifyIssue(issue, target, key, attachment);
    save({ state: 'VERIFIED', attachment, ...identity });
    return { state: 'VERIFIED', ...local, ...target, ...identity, writes, reused: false };
  } catch (error) {
    if (writePending || receipt) {
      return { state: 'UNKNOWN', ...local, ...target, writes: writePending ? null : writes,
        priorState: receipt?.state || null, reason: '提交效果未完整核实；保留报告和回执，不自动重放写入' };
    }
    throw error;
  } finally {
    if (locked) fs.rmSync(lockPath, { force: true });
  }
}

async function main() {
  const input = await readFeedbackInput(process.argv.slice(2), { execute: true });
  const pool = new McpClientPool();
  const call = (name, args) => pool.call('gitlab-mcp', name, args);
  try {
    const result = await submitExecutionFeedback(call, input);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (['UNKNOWN', 'NEEDS_RECONCILIATION', 'IN_PROGRESS_OR_INTERRUPTED'].includes(result.state)) process.exitCode = 1;
  } finally {
    const closed = await pool.close();
    if (!closed.cleanupComplete) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(redactText(error.message) + '\n'); process.exitCode = 1; });
}
