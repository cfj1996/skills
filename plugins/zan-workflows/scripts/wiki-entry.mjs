import { repositoryKey, requireText, sha256 } from './workflow-runtime.mjs';

function visibleLines(body) {
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
  return { lines, visible };
}

// Select one exact numbered project entry without interpreting fenced examples.
export function wikiEntry(body, { entryHeading, sourceBranch, originUrl }) {
  requireText(body, 'Wiki Markdown 正文');
  requireText(entryHeading, 'Wiki 项目条目标题');
  if (!/^[1-9]\d*[.、]\s*\S/.test(entryHeading)) throw new Error('Wiki 项目条目标题无效');
  const { lines, visible } = visibleLines(body);
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

export function findWikiEntry(body, selector) {
  requireText(body, 'Wiki Markdown 正文');
  requireText(selector.originUrl, 'Wiki 项目仓库');
  const matches = [], { lines, visible } = visibleLines(body);
  const repo = repositoryKey(selector.originUrl);
  for (let start = 0; start < lines.length; start++) {
    if (!visible[start] || !/^[1-9]\d*[.、]\s*\S/.test(lines[start])) continue;
    let end = lines.findIndex((line, i) => i > start && visible[i] && /^(?:[1-9]\d*[.、]\s*\S|#{1,6}\s)/.test(line));
    if (end < 0) end = lines.length;
    const content = lines.slice(start, end).filter((_, i) => visible[start + i]).join('\n');
    const branches = [...content.matchAll(/^\s*-\s*代码分支名\s*[:：]\s*(\S+)\s*$/gm)];
    const repos = [...content.matchAll(/^\s*-\s*项目名称\s*[:：]\s*\[[^\]]+\]\(([^)]+)\)/gm)];
    if (branches.some(match => match[1] === selector.sourceBranch)
        && repos.some(match => repositoryKey(match[1]) === repo)) {
      // Do not hide a malformed matching entry by accepting another one.
      matches.push(wikiEntry(body, { ...selector, entryHeading: lines[start].replace(/\r$/, '') }));
    }
  }
  if (matches.length !== 1) throw new Error('Wiki 当前仓库/原分支条目不存在或不唯一');
  if (selector.entryHeading && matches[0].lines[matches[0].start].replace(/\r$/, '') !== selector.entryHeading) {
    throw new Error('Wiki 项目条目标题与当前仓库/原分支不一致');
  }
  return matches[0];
}

// A continuation may revise its own description/impact, never another entry.
export function assertWikiEntryUpdate(before, after, selector) {
  const selectors = Array.isArray(selector) ? selector : [selector];
  if (!selectors.length) throw new Error('Wiki 更新必须选择当前项目条目');
  const oldEntries = selectors.map(item => findWikiEntry(before, item));
  const newEntries = selectors.map(item => findWikiEntry(after, item));
  const mask = (body, entries) => {
    if (new Set(entries.map(entry => entry.start)).size !== entries.length) throw new Error('Wiki 更新条目重复');
    const lines = body.split('\n');
    for (const [index, entry] of entries.map((entry, index) => [index, entry]).sort((a, b) => b[1].start - a[1].start)) {
      lines.splice(entry.start, entry.end - entry.start, `<!-- selected-entry:${index} -->`);
    }
    return lines.join('\n');
  };
  if (oldEntries.some((entry, i) => entry.lines[entry.start] !== newEntries[i].lines[newEntries[i].start])
      || mask(before, oldEntries) !== mask(after, newEntries)) {
    throw new Error('续修只能更新当前 Wiki 项目条目，必须保留其他条目及正文');
  }
}

// For review freshness only. Writes still bind the hash of the entire page.
export function wikiReviewHash(body, selector) {
  const entry = findWikiEntry(body, selector);
  const visible = new Set(entry.indexes);
  const statusLines = entry.indexes.filter(i => /^\s*-\s*是否上线\s*[:：]/.test(entry.lines[i]));
  if (statusLines.length > 1 || statusLines.length && entry.indexes.some(i => /^\s*-\s*当前版本\s*[:：]/.test(entry.lines[i]))) {
    throw new Error('Wiki 当前条目的状态字段重复或冲突');
  }
  return sha256(entry.lines.slice(entry.start, entry.end).filter((line, offset) =>
    !visible.has(entry.start + offset) || !/^\s*-\s*是否上线\s*[:：]\s*(未合并|待合并|已合并)\s*$/.test(line)
  ).join('\n'));
}
