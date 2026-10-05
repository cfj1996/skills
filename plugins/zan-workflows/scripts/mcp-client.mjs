import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('./start-mcp.mjs', import.meta.url));

export class StdioMcpClient {
  constructor(command = process.execPath, args = [launcher, 'tapd-mcp'], name = 'tapd-mcp') {
    this.name = name;
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = new Map();
    this.nextId = 1;
    const rejectAll = message => {
      this.unavailable = true;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      this.pending.clear();
    };
    this.rejectAll = rejectAll;
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method === 'ping' && message.id !== undefined) {
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n');
        return;
      }
      if (message.method) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const error = new Error(`MCP ${pending.method} 失败：${message.error.code}`);
        // Preserve the status category without echoing server messages or credentials.
        const status = String(message.error.message || '').match(/\bHTTP\s+(\d{3})\b/i);
        if (status) error.httpStatus = Number(status[1]);
        pending.reject(error);
      }
      else pending.resolve(message.result);
    });
    this.child.on('exit', () => rejectAll(`${name} 已退出`));
    this.child.on('error', () => rejectAll(`无法启动 ${name}`));
    this.child.stdin.on('error', () => rejectAll(`${name} 输入已关闭`));
  }

  request(method, params = {}, timeoutMs = 30000) {
    if (this.unavailable) return Promise.reject(new Error(`${this.name} 连接已不可用；不会重连或重试写操作`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async initialize() {
    await this.request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'zan-workflow-helper', version: '1.0.0' },
    }, 120000);
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await this.request('tools/list');
    this.toolNames = new Set((list.tools || []).map(tool => tool.name));
  }

  requireTools(names) {
    for (const name of names) if (!this.toolNames?.has(name)) throw new Error(`${this.name} 未提供 ${name}`);
  }

  async call(name, args) {
    this.requireTools([name]);
    return this.request('tools/call', { name, arguments: args });
  }

  close() {
    this.rejectAll(`${this.name} 已关闭`);
    this.child.stdin.end();
    this.lines.close();
    this.child.kill();
  }
}

export function clientFor(name) {
  return new StdioMcpClient(process.execPath, [launcher, name], name);
}

// A pool belongs to one live workflow process, never to a saved workflow record.
export class McpClientPool {
  constructor(factory = clientFor) {
    this.factory = factory;
    this.clients = new Map();
    this.closed = false;
  }

  async get(name) {
    if (this.closed) throw new Error('MCP 会话已关闭');
    if (!['tapd-mcp', 'gitlab-mcp', 'jenkins-mcp'].includes(name)) throw new Error('不支持的工作流 MCP');
    if (!this.clients.has(name)) {
      const client = this.factory(name);
      const ready = Promise.resolve().then(() => client.initialize()).then(() => client);
      // A failed connection stays failed. Never relaunch to retry an unknown write.
      this.clients.set(name, { client, ready });
    }
    return this.clients.get(name).ready;
  }

  async call(server, name, args) {
    return (await this.get(server)).call(name, args);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const { client } of this.clients.values()) client.close();
  }
}
