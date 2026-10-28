import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { processGroup, signalGroup } from './process-group.mjs';
import { waitForDeadline } from './workflow-runtime.mjs';

const launcher = fileURLToPath(new URL('./start-mcp.mjs', import.meta.url));

export class StdioMcpClient {
  constructor(command = process.execPath, args = [launcher, 'tapd-mcp'], name = 'tapd-mcp') {
    this.name = name;
    this.ownsGroup = ['darwin', 'linux'].includes(process.platform);
    this.child = spawn(command, args, { detached: this.ownsGroup, stdio: ['pipe', 'pipe', 'inherit'] });
    this.started = new Promise(resolve => {
      this.child.once('spawn', () => resolve(true));
      this.child.once('error', () => resolve(false));
    });
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
        reject(Object.assign(new Error(`MCP ${method} 超时`), { code: 'MCP_TIMEOUT' }));
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

  close({ timeoutMs = 2000 } = {}) {
    if (this.closing) return this.closing;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw new Error('MCP 关闭期限必须在 0 到 30 秒之间');
    this.rejectAll(`${this.name} 已关闭`);
    this.child.stdin.end();
    this.lines.close();
    this.closing = (async () => {
      const pid = this.child.pid;
      const deadline = Date.now() + timeoutMs;
      let cleanupComplete = false, forced = false, remainingPids = [];
      try {
        const { settled, value: started } = await waitForDeadline(this.started, deadline);
        if (!settled) throw new Error('MCP 启动未能在关闭期限内核实');
        if (!started) cleanupComplete = true;
        else if (this.ownsGroup) {
          const inspect = () => processGroup(pid, Math.min(2000, Math.max(1, deadline - Date.now())));
          signalGroup(pid, 'SIGTERM');
          let snapshot = await inspect();
          // Reserve half of the remaining budget for forced exit and its readback.
          const end = Date.now() + Math.max(0, (deadline - Date.now()) / 2);
          while (snapshot.pids.length && Date.now() < end) {
            await delay(Math.min(25, Math.max(1, end - Date.now()))); snapshot = await inspect();
          }
          if (snapshot.pids.length) {
            forced = true; signalGroup(pid, 'SIGKILL');
            do {
              snapshot = await inspect();
              if (!snapshot.pids.length) break;
              await delay(25);
            } while (Date.now() < deadline);
          }
          remainingPids = snapshot.pids;
          cleanupComplete = remainingPids.length === 0;
        } else {
          // Other hosts get a truthful direct-child result, not unverified tree cleanup.
          this.child.kill('SIGTERM');
          const end = deadline;
          while (this.child.exitCode === null && this.child.signalCode === null && Date.now() < end) await delay(25);
          if (this.child.exitCode === null && this.child.signalCode === null) { forced = true; this.child.kill('SIGKILL'); }
        }
      } catch {
        try { if (this.ownsGroup && pid) signalGroup(pid, 'SIGKILL'); else this.child.kill('SIGKILL'); } catch {}
      } finally { this.child.stdout.destroy(); this.child.stdin.destroy(); }
      return { server: this.name, pid: pid ?? null, state: cleanupComplete ? 'CLOSED' : 'CLEANUP_FAILED',
        cleanupComplete, cleanupScope: this.ownsGroup ? 'process-group' : 'direct-child-unverified', forced, remainingPids };
    })();
    return this.closing;
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
    const client = await this.clients.get(name).ready;
    if (this.closed) throw new Error('MCP 会话已关闭');
    return client;
  }

  async call(server, name, args) {
    const client = await this.get(server);
    if (this.closed) throw new Error('MCP 会话已关闭');
    return client.call(name, args);
  }

  close(options) {
    if (this.closing) return this.closing;
    this.closed = true;
    const pending = [...this.clients].map(([server, { client }]) => {
      try { return Promise.resolve(client.close(options)).then(result => result || { server, cleanupComplete: false, state: 'UNVERIFIED' }); }
      catch { return Promise.resolve({ server, cleanupComplete: false, state: 'CLEANUP_FAILED' }); }
    });
    this.closing = Promise.allSettled(pending).then(results => {
      const clients = results.map(result => result.status === 'fulfilled' ? result.value : { cleanupComplete: false, state: 'CLEANUP_FAILED' });
      return { cleanupComplete: clients.every(client => client.cleanupComplete === true), clients };
    });
    return this.closing;
  }
}
