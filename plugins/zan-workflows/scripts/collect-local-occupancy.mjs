#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCliPlan } from './workflow-runtime.mjs';

const exec = promisify(execFile);
const under = (path, root) => {
  const rel = relative(resolve(root), resolve(path));
  return !rel || (!rel.startsWith('..' + '/') && rel !== '..' && !isAbsolute(rel));
};
const sqlText = value => "'" + value.replace(/'/g, "''") + "'";

export async function readCodexTasks(resources, repositoryPath, io = {}) {
  const root = io.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex');
  const files = (await readdir(root)).filter(name => /^state_\d+\.sqlite$/.test(name))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
  if (!files.length) throw new Error('Codex 任务元数据库不可用');
  const database = join(root, files[0]);
  const run = io.exec || exec;
  const options = { timeout: 10000, maxBuffer: 2 * 1024 * 1024 };
  const schema = JSON.parse((await run('sqlite3', ['-readonly', '-json', database, 'PRAGMA table_info(threads)'], options)).stdout);
  const columns = new Set(schema.map(row => row.name));
  if (!['id', 'cwd', 'archived', 'git_branch'].every(name => columns.has(name))) throw new Error('Codex 任务元数据格式不支持');
  const roots = [...new Set([resolve(repositoryPath), ...resources.filter(row => row.path).map(row => resolve(row.path))])];
  // Exact bound branches are also candidate metadata, so cwd aliases outside
  // the lexical root can be resolved. Ownership is still decided by real paths.
  const branches = [...new Set(resources.map(row => row.branch))];
  const pathScope = roots.map(path => `(cwd=${sqlText(path)} OR substr(cwd,1,length(${sqlText(path)})+1)=${sqlText(path + '/')})`).join(' OR ');
  const scope = pathScope + (branches.length ? ` OR git_branch IN (${branches.map(sqlText).join(',')})` : '');
  const query = `SELECT id,cwd,archived,git_branch FROM threads WHERE ${scope} LIMIT 1001`;
  const rows = JSON.parse((await run('sqlite3', ['-readonly', '-json', database, query], options)).stdout || '[]');
  return { complete: rows.length < 1001, source: 'codex-sqlite-readonly', records: rows.slice(0, 1000) };
}

export function parseOpenFiles(value) {
  const records = [];
  let current;
  for (const line of value.split('\n')) {
    if (line[0] === 'p' && /^\d+$/.test(line.slice(1))) {
      current = { pid: Number(line.slice(1)), paths: [] }; records.push(current);
    } else if (current && line[0] === 'n' && line[1] === '/') current.paths.push(line.slice(1).replace(/ \(deleted\)$/, ''));
  }
  return records;
}

export async function readProcessFiles(io = {}) {
  if (!['darwin', 'linux'].includes(io.platform || process.platform)) throw new Error('此平台没有受支持的只读进程采集器');
  const run = io.exec || exec;
  const options = { timeout: 10000, maxBuffer: 16 * 1024 * 1024 };
  const pids = async () => new Set((await run('ps', ['-axo', 'pid='], options)).stdout.trim().split(/\s+/).map(Number).filter(Number.isSafeInteger));
  const before = await pids();
  const files = await run('lsof', ['-nP', '-Fpn'], options);
  const after = await pids();
  const records = parseOpenFiles(files.stdout);
  const observable = new Set(records.filter(row => row.paths.length).map(row => row.pid));
  const complete = !files.stderr?.trim() && [...before].filter(pid => after.has(pid)).every(pid => observable.has(pid));
  return { complete, source: 'lsof-process-files', records };
}

export async function collectLocalOccupancy(resources, input, io = {}) {
  if (!Array.isArray(resources) || resources.some(row => typeof row.branch !== 'string' ||
      (row.path !== null && (!isAbsolute(row.path) || typeof row.path !== 'string')))) throw new Error('占用采集必须绑定具体分支和绝对 worktree 路径');
  const checkedAt = (io.now || Date.now)();
  const unresolved = new Set();
  const canonical = async path => { try { return await (io.realpath || realpath)(path); }
    catch { unresolved.add(path); return resolve(path); } };
  const scoped = await Promise.all(resources.map(async row => ({ ...row, canonicalPath: row.path ? await canonical(row.path) : null })));
  const [tasks, processes] = await Promise.allSettled([
    (io.readTasks || readCodexTasks)(resources, input.repositoryPath, io), (io.readProcesses || readProcessFiles)(io),
  ]);
  const taskData = tasks.status === 'fulfilled' ? tasks.value : { complete: false, records: [], source: 'tasks-unavailable' };
  const processData = processes.status === 'fulfilled' ? processes.value : { complete: false, records: [], source: 'processes-unavailable' };
  // Resolve aliases once per distinct observed path, without reading any file content.
  const paths = new Map();
  for (const value of [...taskData.records.map(row => row.cwd), ...processData.records.flatMap(row => row.paths || [])]) {
    if (typeof value === 'string' && isAbsolute(value) && !paths.has(value)) paths.set(value, canonical(value));
  }
  for (const [key, value] of paths) paths.set(key, await value);
  const fresh = (io.now || Date.now)() - checkedAt <= 60000;
  return scoped.map(resource => {
    const matchingTasks = taskData.records.filter(row => {
      const cwd = paths.get(row.cwd);
      return cwd && (resource.canonicalPath ? (under(cwd, resource.canonicalPath) ||
        under(cwd, input.repositoryPath) && row.git_branch === resource.branch)
        : under(cwd, input.repositoryPath) && row.git_branch === resource.branch);
    });
    const needed = matchingTasks.some(row => row.archived === 0 || row.archived === false);
    const unknownTask = matchingTasks.some(row => ![0, 1, false, true].includes(row.archived)) ||
      taskData.records.some(row => row.git_branch === resource.branch && row.archived !== 1 && row.archived !== true &&
        (unresolved.has(row.cwd) || typeof row.cwd !== 'string' || !isAbsolute(row.cwd)));
    const processRoot = resource.canonicalPath || resolve(input.repositoryPath);
    const matchingProcesses = processData.records.filter(row =>
      (row.paths || []).some(path => paths.has(path) && under(paths.get(path), processRoot)));
    const taskKnown = taskData.complete === true && !unknownTask;
    // Without a worktree, repository use still cannot be assumed irrelevant to the branch.
    const processKnown = processData.complete === true;
    return { branch: resource.branch, path: resource.path, checkedAt,
      task: needed ? 'ACTIVE' : taskKnown ? 'IDLE' : 'UNKNOWN',
      process: matchingProcesses.length ? 'ACTIVE' : processKnown ? 'IDLE' : 'UNKNOWN',
      needed: needed ? true : taskKnown ? false : 'UNKNOWN',
      scopeComplete: fresh && taskKnown && processKnown,
      source: `${taskData.source}+${processData.source}`,
      taskIds: matchingTasks.filter(row => row.archived === 0 || row.archived === false).map(row => row.id),
      processIds: matchingProcesses.map(row => row.pid),
      readOnly: true };
  });
}

async function main() {
  const input = await readCliPlan();
  if (input.execute) throw new Error('占用采集只有只读模式');
  const occupancyEvidence = await collectLocalOccupancy(input.resources, input);
  process.stdout.write(JSON.stringify({ state: occupancyEvidence.every(row => row.scopeComplete) ? 'COLLECTED' : 'PARTIAL',
    occupancyEvidence, readOnly: true }) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write('占用采集不可用，不能据此删除资源\n'); process.exitCode = 1; });
}
