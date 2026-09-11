# Local MCP setup

插件通过 `.mcp.json` 启动 `scripts/start-mcp.mjs`，捆绑 GitLab、Jenkins、
TAPD 和 YApi 四个 STDIO MCP。初始化只需配置一次；每次 MCP 启动时重新读取
本机凭证，安装和更新插件不会覆盖凭证文件。插件不会弹出安装凭证表单。

## Dependencies

- Node.js 22（`node` 必须能从 Codex 的 PATH 找到）。
- Volta 和 Node.js 22.20.0：用于现有三个 npm MCP 的启动方式。
- uv/uvx：用于 TAPD 的 Python 包启动。
- 能访问公司服务、私有 npm 源，以及 npm/Python 包所需的下载源。

Windows 使用同一份 Node.js 脚本，直接启动 `volta.exe` / `uvx.exe`；Volta
负责解析 npx，无 Bash、`shell: true` 或手工拼接 `npx.cmd` 命令。其他平台
启动 `volta` / `uvx`。本机未配置的服务会给出缺失字段并退出，不影响独立服务。

## Credentials

将 [credentials.example.json](credentials.example.json) 复制到用户目录并填写：

- macOS：`/Users/<用户名>/.config/zan-workflows/credentials.json`
- Windows：`C:\Users\<用户名>\.config\zan-workflows\credentials.json`
- Linux：`/home/<用户名>/.config/zan-workflows/credentials.json`

也可用 `ZAN_WORKFLOWS_CONFIG` 指定绝对路径。macOS/Linux 将目录权限设为
`700`、文件设为 `600`；Windows 使用个人用户目录并限制文件 ACL。
不要把真实凭证复制进插件、Git 或聊天。

文件使用 `version: 1` 和 `servers.<MCP 名称>.env`。仅向每个进程注入它自己的
允许字段；启动器不将 token 放入参数，不输出配置内容，且对子进程 stderr 中
已配置的 token/password 脱敏。stdout 原样保留 MCP 协议，不是诊断日志通道。

- GitLab 使用 `GITLAB_PERSONAL_ACCESS_TOKEN`；保留原有 toolsets/tools/审批参数。
- Jenkins 使用 URL、用户名与 API token。
- TAPD 使用原环境配置的三个字段。
- YApi 显式提供用户名+密码；也支持 `YAPI_PROJECT_TOKEN` 替代账号登录。
  不依赖包内默认账号。目标包仍从公司 npm 源获取。

在插件目录执行只校验配置的命令，不启动服务或输出凭证：

```bash
node scripts/start-mcp.mjs gitlab-mcp --check
node scripts/start-mcp.mjs jenkins-mcp --check
node scripts/start-mcp.mjs tapd-mcp --check
node scripts/start-mcp.mjs yapi-mcp --check
```

## Migration and updates

从旧 Codex MCP 配置迁移凭证时，只在本机读取并写入上述文件；GitLab 的原
`--token` 转为环境字段，其余服务按原配置映射。YApi 原配置未显式提供认证时，
先确认当前 CLI 生效的认证来源，再迁移；不能猜测账号。

先验证新启动器的 MCP initialize/tools/list。切换前把旧 MCP 的完整配置
备份到本机受限权限文件，再用 `codex mcp remove <名称>` 移除四个同名独立
注册项：Codex 的独立配置会覆盖插件同名入口，即使 `enabled=false` 也不能
让插件接管。确认插件实例的 `pluginId` 和连接状态；失败时可根据备份恢复
原注册。此切换由迁移操作执行，启动器不自动删除配置。更新凭证后重启相应
MCP；插件升级后用新任务验证。插件化后还需核对 Codex 展示的工具命名及
审批设置，不假定旧配置的工具策略自动迁移。

## Tests

```bash
node --test plugins/zan-workflows/tests/mcp-launcher.test.mjs
```

测试使用虚构凭证和临时进程，验证参数/环境隔离、Windows 命令选择、
配置失败不泄露内容、stdio 转发与退出码。Windows 实机启动需在 Windows
环境另行验证。
