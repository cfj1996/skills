# Skills

# 系统定位

公司本地 AI 技能仓库，维护 Codex/Claude/Gemini 等工作流技能。

本文件用于 Claude Code、Codex、Cursor、OpenCode、Graphify 和 MCP 工作流快速建立项目上下文。它不是 README，也不替代源码；它用于说明项目边界、修改约束和 AI 进入项目后的工作顺序。

当前仓库类型：AI 技能。根配置入口包括：`package.json`、`AGENTS.md`。

# 核心职责

- 公司本地 AI 技能仓库，维护 Codex/Claude/Gemini 等工作流技能
- 当前主要能力分布在 `skills` 下的 company-project-routing, grouped-project-graph, login-token-workflow, managed-mr-review, tapd-workflow, team-identity-map。
- 维护本仓库内的源码、配置、构建脚本和图谱上下文。
- 通过 `graphify-out/` 提供代码结构图谱，帮助 AI 在读源码前缩小范围。

# 非职责范围

- 不负责其它仓库的业务实现或公共能力演进，跨仓复用应回到对应基础库或业务仓库。
- 不应在本仓库临时复制其它项目的页面、接口或组件模式。
- 不应提交本地图谱缓存、锁文件、本机路径文件、IDE 缓存或运行产物。
- 如果任务只涉及其它业务域，应先切换到对应项目再修改。

# 技术架构

- 以仓库内脚本、配置和目录约定组织能力。
- Graphify 图谱指标：217 nodes、197 edges。

# 核心目录结构

- `skills/`

# 关键依赖关系

- 当前 package.json 未声明明显运行时依赖，优先检查脚本、配置和 README。

# 核心模块

- `skills/`：company-project-routing, grouped-project-graph, login-token-workflow, managed-mr-review, tapd-workflow, team-identity-map。

# 系统边界

- 先以本仓库的 package、路由、页面、packages/apps/skills 分层确定责任边界。
- 修改公共包、组件库、CLI、MCP 或技能时，必须考虑所有消费者，而不是只验证当前文件。
- 管理后台类项目中，页面入口、菜单、权限、请求层和状态层通常强相关，不能孤立修改页面。
- 工具库类项目中，package exports、构建脚本、类型声明和发布脚本是边界核心。

# 开发规范

- 新增代码前先查是否已有同类目录、组件、hook、service、package 或 skill。
- 请求/API 类型/工具函数/组件应进入已有分层，不要在页面或脚本里重复实现。
- 配置、脚本、包导出、路由、鉴权和构建产物变更要做影响范围检查。
- 只提交与当前任务相关的文件；已有本地修改不要顺手纳入提交。
- graphify 核心产物可提交：`graphify-out/graph.json`、`graphify-out/GRAPH_REPORT.md`、`graphify-out/graph.html`。不要提交 `cache/`、`.rebuild.lock`、`.graphify_root`。

# AI 修改规则

1. 先读本文件，确认项目定位和边界。
2. 再读 `graphify-out/GRAPH_REPORT.md`，用图谱理解核心节点、社区结构和跨文件关系。
3. 若存在 README、AGENTS、docs、skills 或 package 级说明，按最相关入口继续阅读。
4. 涉及跨模块、调用链、影响范围的问题，优先使用 `graphify query "<question>"`、`graphify path "<A>" "<B>"` 或 `graphify explain "<concept>"`。
5. 最后才读取源码和执行搜索；不要用全仓 grep 代替图谱定位。
6. 修改代码后按需执行 `graphify update .`，确保图谱与代码保持同步。
7. 不要回退、覆盖或提交非本任务已有改动。

# 高风险区域

- 技能文档会被多个 Agent 读取，规则措辞和触发边界要明确。
- 图谱产物体积可能较大，cache、lock 和本机路径文件不要提交。

# AI 推荐工作流

1. `pwd` 确认当前仓库。
2. 读 `AI_CONTEXT.md`。
3. 读 `graphify-out/GRAPH_REPORT.md`。
4. 用 Graphify 查询或图谱报告定位模块。
5. 阅读目标目录最小源码集合。
6. 修改并运行最小验证。
7. 按需运行 `graphify update .`。
8. 提交时排除 graphify cache/lock/root 和已有无关改动。

# Graphify 使用规则

- `graphify-out/GRAPH_REPORT.md` 是代码问题的第一入口。
- 有 `graphify-out/wiki/index.md` 时，优先阅读 wiki，再读源码。
- 跨模块关系、调用链、依赖路径、影响范围问题，优先使用 `graphify query/path/explain`。
- `graphify-out/graph.json` 是完整图谱数据；`graph.html` 仅在节点数未超过官方限制时存在。
- 修改代码后按需执行 `graphify update .`；该操作更新本地图谱，不需要提交 cache。
