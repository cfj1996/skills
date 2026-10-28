import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function processGroup(pid, timeoutMs = 2000) {
  const { stdout } = await exec('ps', ['-axo', 'pid=,pgid=,rss=,stat='],
    { timeout: Math.max(1, Math.ceil(timeoutMs)), maxBuffer: 8 * 1024 * 1024 });
  const rows = stdout.trim().split('\n').filter(Boolean).map(line => line.trim().split(/\s+/));
  if (rows.some(row => row.length < 4 || row.slice(0, 3).some(value => !/^\d+$/.test(value)))) {
    throw new Error('无法解析进程内存，检查未运行或已中止');
  }
  const group = rows.filter(row => Number(row[1]) === pid && !row[3].startsWith('Z'));
  return { pids: group.map(row => Number(row[0])), rssMb: group.reduce((sum, row) => sum + Number(row[2]), 0) / 1024 };
}

export function signalGroup(pid, signal) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('只能终止本次创建的有效进程组');
  try { process.kill(-pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}
