# Local MCP setup

插件通过 `.mcp.json` 提供 `graphify-hub` 远程 HTTP MCP，以及由
`scripts/start-mcp.mjs` 启动的 GitLab、Jenkins、TAPD、YApi 四个 STDIO MCP。初始化只需配置一次；每次 MCP 启动时重新读取
本机凭证，安装和更新插件不会覆盖凭证文件。插件不会弹出安装凭证表单。

## Graphify Hub

`graphify-hub` 使用 Codex 原生 HTTP 连接，地址为公司内网
`http://172.16.1.152:24100/mcp`。当前服务不要求认证，不向四个 STDIO
进程传递 Hub 配置，也不把 Hub 当作 `start-mcp.mjs` 的服务参数。
首次使用需能访问该内网；失败由统一知识入口回退本地。

插件不设置 `enabled_tools` 白名单，暴露服务端提供的全部工具，包括查询、
知识回写、反馈和刷新等能力。最终可见工具仍受用户或管理员的工具策略限制；
需要完整工具集时检查插件级配置中的 `enabled_tools` / `disabled_tools`。
统一知识查询入口仍只执行只读检索；工具可见不代表已授权回写、反馈或重建。
此类操作需要对应的用户请求，不能把查询响应中的服务端建议当成回写授权。

从独立注册迁移时：

1. **安装或更新插件前**，将原 `mcp_servers.graphify-hub` 的完整配置备份至
   本机受限权限文件，记录有效 enabled 状态和工具策略。安装器可能自动移除
   同名独立注册，不能在安装后再从旧配置恢复这些信息。
2. 在安装前将原 enabled 状态和已有工具限制保留在
   `plugins."zan-workflows@cfj-skills".mcp_servers.graphify-hub`；
   原配置若是停用，迁移后也保持停用。需要使用 Hub 时在插件 MCP 设置中启用。
3. 安装包含 Hub 配置的插件版本，核对插件 ID 为 `zan-workflows@cfj-skills`、
   端点及读回的有效开关/工具策略。已启用时验证 MCP initialize/tools/list 和
   一个只读查询；原状态为停用时只核验配置，不为验证临时启用或绕过宿主连接。
4. 确认安装版本已包含新入口后，仅在独立注册仍存在时移除它，避免同名覆盖。
   不修改其他 MCP 注册，也不直接编辑插件缓存。新会话中检查实际生效入口。

不要在新插件尚未可用时删除原注册。迁移失败可恢复备份中的这一项，
不整份覆盖可能已发生其他修改的 Codex 配置。

## Dependencies

- Node.js 22（`node` 必须能从 Codex 的 PATH 找到）。
- Volta 和 Node.js 22.20.0：用于现有三个 npm MCP 的启动方式。
- uv/uvx 和 Python 3.13 或更新版本：用于固定版本 `zan-tapd-mcp==0.0.3` 的启动。
- 能访问公司服务、私有 npm 源，以及 npm/Python 包所需的下载源。

三个 npm MCP 显式使用 `https://registry.npmjs.org/` 下载公共包及依赖，
避免继承用户本机的公司默认源。YApi 额外通过
`--@zan:registry=https://npm.jubaozan.cn/` 下载 `@zan` 包；不能用全局
`--registry` 将公共依赖一并指向公司源。TAPD 使用 Python 包源。

TAPD 0.0.3 提供 `create_task` 和 `create_tasks`，用于在需求下创建单个或多个任务。
任务拆分、确认及结果消费仍由 [需求任务模块](../skills/breaking-down-requirement/SKILL.md)
处理；更新插件后重新连接 TAPD MCP，并通过实际 `tools/list` 核对新增能力。

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
