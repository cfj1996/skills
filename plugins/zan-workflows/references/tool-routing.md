# Zan 外部系统工具路由

## 总则

访问公司外部系统时，默认按以下优先级选择工具；项目知识遵循下方统一入口的 Hub 专用策略：

```text
专用 MCP → 官方 API/受控 CLI → 浏览器降级
```

不得因为浏览器已有登录页、当前有可见标签页、MCP 工具未出现在最近输出中，或浏览器操作看起来更直观，就跳过 MCP。

## 系统映射

| 系统 | 首选能力 | 典型操作 |
| --- | --- | --- |
| TAPD / TAPD Wiki | `tapd-mcp` | Bug/Story/Task 读取、评论、状态、测试版本、Wiki 查询与写入 |
| GitLab | `gitlab-mcp` | 项目、MR、diff、冲突、pipeline、审批、创建/更新/合并 MR |
| Jenkins | `jenkins-mcp` | Job 查询、参数读取、触发构建、队列/构建跟踪、结果与日志读取 |
| YApi | `yapi-mcp` | 项目、分类、接口、请求/响应字段及契约事实查询 |
| 项目知识 | `workspace-project-knowledge` 统一入口 | 仅通过 `graphify-hub` MCP 查询图谱、业务知识、功能定位；无本地回退 |
| 本地 Git | `git` CLI | status、diff、fetch、branch、commit、push、包含性校验 |

本地 Git CLI 不替代 GitLab MCP 的 MR/审批/合并能力；GitLab MCP 也不替代本地源码 diff 和 commit。

## 项目知识入口

需求、开发、Plan、评审等调用方只向
[workspace-project-knowledge](../skills/workspace-project-knowledge/SKILL.md)
提供 canonical 项目/子项目（可未知）、问题和目的，并消费统一 `KnowledgeContext`。
Hub 身份核验、范围过滤、工具选择、失败复用和缺口处理统一遵循入口的
[查询约定](../skills/workspace-project-knowledge/references/knowledge-query.md)。

此类检索不使用下述通用 API/浏览器降级：Hub 未启用、不可用、未覆盖或结果不足时，
返回 `partial` / `unavailable` 和具体缺口，不读取本地知识库、内置快照或本地图谱，
也不以源码搜索补做知识查询。不创建临时 HTTP 客户端绕过宿主配置。
查询不包含知识写回、反馈或图谱重建。
工程规则、治理配置、精确部署映射及当前源码仍从各自权威来源核验。

## 调用流程

1. 在首次访问某系统前，检查对应 MCP 工具是否可用；必要时执行工具发现或插件 MCP 配置诊断。
2. MCP 可用时，所有支持的读写均走 MCP，并读回结果。
3. MCP 缺少特定能力时，优先使用已批准的官方 API 或受控 CLI；记录缺失的具体能力。
4. MCP 连接、认证或权限失败时，报告原始系统、失败阶段和恢复方式。不得静默打开浏览器登录页替代。
5. 浏览器只允许用于：
   - 原型、页面布局、DOM、登录态或真实交互评审；
   - MCP/API/CLI 明确不提供所需能力；或
   - 用户在看到降级原因、目标页面、操作和数据后明确同意浏览器降级。
6. 浏览器降级不继承旧授权。涉及写操作时，将“使用浏览器执行”加入更新后的操作计划并重新确认。

## 禁止事项

- 不得用浏览器代替 `tapd-mcp` 修改状态、测试版本、评论或 Wiki。
- 不得用浏览器代替 `gitlab-mcp` 创建、更新、审批或合并 MR。
- 不得用浏览器代替 `jenkins-mcp` 触发或跟踪已有 MCP 支持的构建。
- 不得因浏览器未登录而阻塞一个 MCP 已具备凭证和能力的流程。
- 不得在 MCP 不可用时声称外部写入已完成；保留当前状态并给出配置/授权恢复动作。

`writing-plans` 的 in-app Browser 面板和原型检查属于真实页面交互，不受“浏览器仅降级”限制；它们不能承担 TAPD、GitLab、Jenkins 或 YApi 系统写入。
