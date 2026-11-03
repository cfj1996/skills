import { extname } from 'node:path';
import { runScopedCommand, sha256 } from './workflow-runtime.mjs';

// Only immutable Git objects and derived metadata are cached. A live worktree,
// target ref, authorization or delivery result is never a cache entry.
export function createMockInspectionCache() {
  return { snapshots: new Map(), blobs: new Map() };
}

export function remember(map, key, value, limit) {
  if (!map) return;
  if (!map.has(key) && map.size >= limit) map.delete(map.keys().next().value);
  map.set(key, value);
}

const maxFile = 8 * 1024 * 1024;
export async function inspectRevisionFiles(root, revision, paths, parseAs, declarations, io) {
  const git = (args, options = {}) => runScopedCommand('git', ['--no-replace-objects', ...args],
    { cwd: root, timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options }, io);
  const tree = await git(['ls-tree', '-rlz', revision, '--', ...paths]);
  const files = new Map(), missing = new Map(), cache = io.mockInspectionCache?.blobs;
  for (const entry of tree.stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t'), name = entry.slice(tab + 1);
    const [mode, type, oid, sizeText] = entry.slice(0, tab).trim().split(/\s+/);
    const size = Number(sizeText);
    if (tab < 0 || !['100644', '100755'].includes(mode) || type !== 'blob') {
      throw new Error('Mock revision 清查不接受符号链接或未展开子模块');
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > maxFile) throw new Error('Mock 清查文件过大，需项目提供受审查的定向检查绑定');
    const parse = parseAs(name), key = JSON.stringify([root, oid, parse ? extname(name) : null]);
    if (cache?.has(key)) { files.set(name, cache.get(key)); continue; }
    if (!missing.has(oid)) missing.set(oid, { oid, size, paths: [] });
    missing.get(oid).paths.push({ name, key, parse });
  }
  async function readBatch(batch) {
    const result = await git(['cat-file', '--batch'], { stdin: batch.map(row => row.oid).join('\n') + '\n',
      encoding: 'buffer' });
    let offset = 0;
    for (const row of batch) {
      const end = result.stdout.indexOf(10, offset);
      const header = result.stdout.toString('ascii', offset, end);
      if (end < 0 || header !== [row.oid, 'blob', row.size].join(' ')) throw new Error('Git 对象读回与版本清单不一致');
      const data = result.stdout.subarray(end + 1, end + 1 + row.size);
      offset = end + 1 + row.size;
      if (result.stdout[offset++] !== 10) throw new Error('Git 对象读回不完整');
      const hash = sha256(data);
      for (const { name, parse, key } of row.paths) {
        const facts = { hash, declaration: parse ? declarations(name, data.toString('utf8')) : null };
        files.set(name, facts);
        remember(cache, key, facts, 16384);
      }
    }
    if (offset !== result.stdout.length) throw new Error('Git 对象读回包含额外内容');
    io.onProgress?.({ state: 'MOCK_REVISION_BLOBS_READ', count: batch.length });
  }
  let batch = [], bytes = 0;
  for (const row of missing.values()) {
    if (batch.length && bytes + row.size > maxFile) {
      await readBatch(batch);
      batch = []; bytes = 0;
    }
    batch.push(row); bytes += row.size;
    if (batch.length === 1024) { await readBatch(batch); batch = []; bytes = 0; }
  }
  if (batch.length) await readBatch(batch);
  return files;
}
