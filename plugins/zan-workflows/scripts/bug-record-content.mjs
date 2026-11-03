function unescapeText(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#[xX][a-f\d]+);/gi, (entity, raw) => {
    const name = raw.toLowerCase();
    if (Object.hasOwn(named, name)) return named[name];
    const cp = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : entity;
  });
}
export function semanticBody(body) {
  // Tokenize before decoding entities: escaped user text is not HTML markup.
  const parts = body.trim().replace(/\r\n/g, '\n').split(/(<[^>]*>)/g);
  const block = /^<\/?(?:p|li|ul|br)(?:\s*\/)?>$/i;
  return JSON.stringify(parts.flatMap((part, index) => {
    if (!part || /^\s+$/.test(part) && (block.test(parts[index - 1] || '') || block.test(parts[index + 1] || ''))) return [];
    if (part[0] !== '<') return [['text', unescapeText(part)]];
    const link = part.match(/^<a\s+href=(["'])([^"'<>]*)\1\s*>$/i);
    if (link) return [['link', unescapeText(link[2])]];
    const tag = part.match(/^<(\/?)(p|ul|li|strong|b|br|a)\s*\/?>$/i);
    return [['tag', tag ? tag[1] + tag[2].toLowerCase().replace(/^b$/, 'strong') : part]];
  }));
}

export const bugRecordTitle = '【Bug 溯源与修复记录】';

export function hasBugRepairTitle(value) {
  if (typeof value !== 'string') return false;
  const visible = unescapeText(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ');
  return visible.includes(bugRecordTitle);
}
