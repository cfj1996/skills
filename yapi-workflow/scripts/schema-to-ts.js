#!/usr/bin/env node
/**
 * YApi Schema to TypeScript type generator
 * 与 @zan/yapi-cli 保持一致的类型生成逻辑
 *
 * Usage:
 *   node schema-to-ts.js --input <schema.json> --name <TypeName>
 *   node schema-to-ts.js --stdin --name <TypeName>
 *
 * 输入格式 (JSON):
 *   {
 *     "path": "/api/user/list",
 *     "method": "GET",
 *     "pathParams": [...],
 *     "query": [...],
 *     "bodySchema": {...},
 *     "responseSchema": {...}
 *   }
 */

const { compile } = require('json-schema-to-typescript');

// JavaScript 保留字
const RESERVED_TYPE_IDENTIFIERS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

/**
 * 将字符串转换为合法的 TypeScript 类型名称
 */
function toTypeName(value) {
  if (!value || typeof value !== 'string') {
    return 'UnknownType';
  }
  return value
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/(^|\s+)([\p{L}\p{N}])/gu, (_, __, letter) => letter.toUpperCase())
    .replace(/\s+/gu, '');
}

/**
 * 格式化属性名（处理保留字和特殊字符）
 */
function formatPropertyKey(key) {
  if (/^[$A-Z_a-z][$\w]*$/u.test(key) && !RESERVED_TYPE_IDENTIFIERS.has(key)) {
    return key;
  }
  return JSON.stringify(key);
}

/**
 * 渲染参数类型（用于 pathParams / query）
 */
function renderParamType(name, params) {
  if (!params || !params.length) {
    return `export type ${name} = Record<string, never>`;
  }

  const lines = params.map((param) => {
    const optionalMark = param.required ? '' : '?';
    const type = param.type || 'string';
    return `  ${formatPropertyKey(param.name)}${optionalMark}: ${type};`;
  });

  return `export type ${name} = {\n${lines.join('\n')}\n}`;
}

/**
 * 渲染 Schema 类型（用于 bodySchema / responseSchema）
 */
async function renderSchemaDeclaration(name, schema) {
  if (schema === undefined || schema === null) {
    return `export type ${name} = unknown`;
  }

  if (typeof schema === 'object' && Object.keys(schema).length === 0) {
    return `export type ${name} = unknown`;
  }

  // 解析字符串 schema
  let targetSchema = schema;
  if (typeof schema === 'string') {
    try {
      targetSchema = JSON.parse(schema);
    } catch {
      return `export type ${name} = unknown`;
    }
  }

  // 为数组类型添加 title
  if (targetSchema.type === 'array' && !targetSchema.title) {
    targetSchema = { ...targetSchema, title: name };
  }

  try {
    const declaration = await compile(targetSchema, name, {
      additionalProperties: false,
      bannerComment: '',
    });
    return declaration.trim();
  } catch (err) {
    // 降级：简单类型推断
    return `export type ${name} = unknown`;
  }
}

/**
 * 从路径生成基础类型名称
 */
function pathToBaseName(path) {
  if (!path) return 'Api';
  const segments = path
    .replace(/^\//, '')
    .split('/')
    .map(seg => {
      // 移除路径参数 {id}
      if (seg.startsWith('{') && seg.endsWith('}')) {
        seg = seg.slice(1, -1);
      }
      // 转换为 PascalCase
      return seg
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
    });
  return segments.join('') || 'Api';
}

/**
 * 渲染完整的接口类型声明
 */
async function renderInterfaceDeclarations(input) {
  const path = input.path || '';
  const method = (input.method || 'GET').toUpperCase();
  const baseName = toTypeName(path) || pathToBaseName(path);

  const lines = [
    `// Generated from YApi interface`,
    `// ${method} ${path}`,
    '',
    renderParamType(`${baseName}PathParams`, input.pathParams || []),
    '',
    renderParamType(`${baseName}Query`, input.query || []),
    '',
    await renderSchemaDeclaration(`${baseName}RequestBody`, input.bodySchema),
    '',
    await renderSchemaDeclaration(`${baseName}ResponseBody`, input.responseSchema),
  ];

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let input = null;
  let typeName = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      const filePath = args[++i];
      input = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    } else if (arg === '--stdin') {
      const raw = await readStdin();
      input = JSON.parse(raw);
    } else if (arg === '--name' || arg === '-n') {
      typeName = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
YApi Schema to TypeScript type generator

Usage:
  node schema-to-ts.js --input <file>
  node schema-to-ts.js --stdin

Input JSON format:
  {
    "path": "/api/user/list",
    "method": "GET",
    "pathParams": [{"name": "id", "type": "number", "required": true}],
    "query": [{"name": "page", "type": "number", "required": false}],
    "bodySchema": { "type": "object", "properties": {...} },
    "responseSchema": { "type": "object", "properties": {...} }
  }

Options:
  --input, -i <file>   Read input from file
  --stdin              Read input from stdin
  --name, -n <name>    Base type name (auto-generated from path if not provided)
  --help, -h           Show this help
`);
      process.exit(0);
    }
  }

  if (!input) {
    console.error('Error: No input provided. Use --input or --stdin');
    process.exit(1);
  }

  try {
    const output = await renderInterfaceDeclarations(input);
    console.log(output);
  } catch (err) {
    console.error('Error generating types:', err.message);
    process.exit(1);
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main();