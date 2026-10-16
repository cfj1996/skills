import { repositoryKey, requireText } from './workflow-runtime.mjs';

// Select one exact numbered project entry without interpreting fenced examples.
export function wikiEntry(body, { entryHeading, sourceBranch, originUrl }) {
  requireText(body, 'Wiki Markdown 正文');
  requireText(entryHeading, 'Wiki 项目条目标题');
  if (!/^[1-9]\d*[.、]\s*\S/.test(entryHeading)) throw new Error('Wiki 项目条目标题无效');
  const lines = body.split('\n');
  let fence = null;
  const visible = lines.map(line => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
      return false;
    }
    return !fence;
  });
  const starts = lines.flatMap((line, i) => visible[i] && line.replace(/\r$/, '') === entryHeading ? [i] : []);
  if (starts.length !== 1) throw new Error('Wiki 项目条目不存在或不唯一');
  const start = starts[0];
  let end = lines.findIndex((line, i) => i > start && visible[i] && /^(?:[1-9]\d*[.、]\s*\S|#{1,6}\s)/.test(line));
  if (end < 0) end = lines.length;
  const indexes = Array.from({ length: end - start }, (_, i) => i + start).filter(i => visible[i]);
  const branchLines = indexes.filter(i => /^\s*-\s*代码分支名\s*[:：]/.test(lines[i]));
  const branch = branchLines.length === 1 ? lines[branchLines[0]].match(/^\s*-\s*代码分支名\s*[:：]\s*(\S+)\s*$/)?.[1] : null;
  if (branch !== sourceBranch) throw new Error('Wiki 条目原分支不一致或不唯一');
  const urls = indexes.flatMap(i => [...lines[i].matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]));
  const repo = repositoryKey(originUrl);
  if (!urls.some(url => { try { return repositoryKey(url) === repo; } catch { return false; } })) {
    throw new Error('Wiki 条目的源码仓库不匹配');
  }
  return { lines, indexes, start, end };
}
