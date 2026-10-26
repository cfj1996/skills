// A bounded XML reader for Jenkins CONFIG_XML. Keep element identity and text
// separate: comments, attributes and CDATA must never impersonate <definition>.
// DTDs, custom entities and processing instructions are outside this adapter.
export function readInlineJenkinsPipeline(xml) {
  const fail = () => { throw new Error('正式发布需要受支持的唯一内联 Pipeline；实际 XML definition 必须是 CpsFlowDefinition，SCM/未知或无效配置尚无可验证门禁适配'); };
  const decode = value => value.replace(/&(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);|&/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    if (!/^&#(?:x[\da-f]+|\d+);$/i.test(entity)) return fail();
    const point = entity[2] === 'x' || entity[2] === 'X' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    if (![9, 10, 13].includes(point) && !(point >= 0x20 && point <= 0xd7ff) &&
        !(point >= 0xe000 && point <= 0xfffd) && !(point >= 0x10000 && point <= 0x10ffff)) return fail();
    return String.fromCodePoint(point);
  });
  const document = { children: [], text: '' }, stack = [document];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?xml\s[^?]*\?>|<\/[A-Za-z_][\w:.-]*\s*>|<[A-Za-z_][\w:.-]*(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
  let position = 0, declaration = false;
  while (position < xml.length) {
    token.lastIndex = position;
    const match = token.exec(xml);
    if (!match) return fail();
    const part = match[0], parent = stack.at(-1);
    position = token.lastIndex;
    if (part.startsWith('<!--')) {
      if (part.slice(4, -3).includes('--') || part.endsWith('--->')) return fail();
    } else if (part.startsWith('<?')) {
      if (declaration || stack.length !== 1 || document.children.length || document.text.trim()) return fail();
      declaration = true;
    } else if (part.startsWith('<![CDATA[')) {
      if (stack.length === 1) return fail();
      parent.text += part.slice(9, -3);
    } else if (part.startsWith('</')) {
      const name = part.slice(2, -1).trim();
      if (stack.length === 1 || parent.name !== name) return fail();
      stack.pop();
    } else if (part.startsWith('<')) {
      const name = part.match(/^<([\w:.-]+)/)[1], attributes = Object.create(null);
      for (const attribute of part.slice(name.length + 1).matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (Object.hasOwn(attributes, attribute[1])) return fail();
        attributes[attribute[1]] = decode(attribute[2] ?? attribute[3]);
      }
      const node = { name, attributes, children: [], text: '' };
      parent.children.push(node);
      if (!part.endsWith('/>')) stack.push(node);
    } else {
      if (part.includes(']]>')) return fail();
      parent.text += decode(part);
    }
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.text.trim()) return fail();
  const root = document.children[0];
  if (root.name !== 'flow-definition' || root.text.trim() || Object.keys(root.attributes).some(key => key !== 'plugin')) return fail();
  const definitions = root.children.filter(node => node.name === 'definition');
  if (definitions.length !== 1 || definitions[0].attributes.class !== 'org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition' ||
      definitions[0].text.trim() || Object.keys(definitions[0].attributes).some(key => !['class', 'plugin'].includes(key)) ||
      definitions[0].children.some(node => !['script', 'sandbox'].includes(node.name))) return fail();
  const scripts = definitions[0].children.filter(node => node.name === 'script');
  if (scripts.length !== 1 || scripts[0].children.length || Object.keys(scripts[0].attributes).length) return fail();
  return scripts[0].text;
}
