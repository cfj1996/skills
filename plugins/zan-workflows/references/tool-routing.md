# Zan 外部系统工具路由

## 总则

访问公司外部系统时，默认按以下优先级选择工具；TAPD 文件读取、任务创建与项目知识遵循下方各自的专用路由：

```text
专用 MCP → 官方 API/受控 CLI → 浏览器降级
```

不得因为浏览器已有登录页、当前有可见标签页、MCP 工具未出现在最近输出中，或浏览器操作看起来更直观，就跳过 MCP。

## 系统映射

| 系统 | 首选能力 | 典型操作 |
| --- | --- | --- |
| TAPD / TAPD Wiki | `tapd-mcp` | Bug/Story/Task 读取、图片/附件/关联文档文件下载、任务创建/更新、评论、状态、测试版本、Wiki 查询与写入 |
| GitLab | `gitlab-mcp` | 项目、MR、diff、冲突、pipeline、审批、创建/更新/合并 MR |
| Jenkins | `jenkins-mcp` | Job 查询、参数读取、触发构建、队列/构建跟踪、结果与日志读取 |
| YApi | `yapi-mcp` | 项目、分类、接口、请求/响应字段及契约事实查询 |
| 项目知识 | `workspace-project-knowledge` 统一入口 | 内部优先 `graphify-hub` MCP，只读检索；不可用、未覆盖或不足时回退本地集中知识 |
| 本地 Git | `git` CLI | status、diff、fetch、branch、commit、push、包含性校验 |

本地 Git CLI 不替代 GitLab MCP 的 MR/审批/合并能力；GitLab MCP 也不替代本地源码 diff 和 commit。

## TAPD 图片与附件读取

读取需求、Bug、任务或 Wiki 时，需要核对正文、评论中的图片、文件或附件，统一调用
TAPD MCP 0.0.4 起提供的 `download_workitem_files(workspace_id, entry_type, entry_id, output_dir?)`。
`entry_type` 为 `story|bug|task|wiki`，传准确项目和条目 ID；需求/Bug/任务支持短 ID，Wiki 使用完整 ID。
不为每张图片或附件分别拼接网页直链、读取本机凭证或编写临时 API 下载脚本。

该工具在 MCP 内分页发现正文、自定义富文本字段、评论和附件中的资源，换取下载链接，
下载内嵌图片、普通附件及关联的 TAPD 文档文件并去重；不递归展开关联需求/Bug/Wiki。
`output_dir` 可选，每次创建独立子目录；返回 `directory`、逐项 `files` 和 `errors`。
调用方使用返回的本地 `path` 实际查看图片或读取文档，不能只拿到清单就声称看过内容。
本地 STDIO 模式路径可直接使用；远程模式路径属于 MCP 服务端，不能冒充调用方本地路径。

只有 `state=complete` 才表示全部发现与下载成功。`partial` 保留成功文件并逐项报告
未完成阶段/文件；`failed` 表示无法读取条目。根据实际缺口说明影响，不忽略失败项。
工具按文件内容识别图片，兼容错误的扩展名或 `Content-Type: text/plain`，
不由调用方仅凭响应头判定图片失效。

先通过工具发现及实际 `tools/list` 核对方法。缺失时检查 MCP 启动版本、连接及工具策略，
升级到已发布的 0.0.4 或更新兼容版本并重新连接；仍缺失时报告
`BLOCKED_TAPD_FILE_CAPABILITY`。本能力不降级为调用方直接请求 API 或浏览器登录。
插件版本接入以对应 MCP 包已经发布为前提，不能把源码实现完成当作当前安装版本已可调用。

## TAPD 任务创建

独立拆分任务、需求开发和正式 Plan 所需的任务创建，统一由
[breaking-down-requirement](../skills/breaking-down-requirement/SKILL.md)
在完整清单获确认后执行。使用 TAPD MCP 0.0.3 的以下方法：

| 操作 | MCP 方法 | 参数绑定 |
| --- | --- | --- |
| 创建一个任务 | `create_task(workspace_id, name, options)` | 准确空间、标题；`options.story_id` 绑定父需求，其余为该项获准字段 |
| 在同一需求下创建多个任务 | `create_tasks(workspace_id, tasks, story_id, options)` | 准确空间与公共父需求；`tasks` 按依赖顺序包含 1～50 项，每项含 name，字段绑定已确认内容 |
| 更新现有任务 | `update_story_or_task(workspace_id, options)` | `options.entity_type=tasks` 和准确现有 `id`，仅传获准变更 |
| 复用或准确读回任务 | `get_stories_or_tasks(workspace_id, options)` | `options.entity_type=tasks`、准确 id、limit=1；fields 包含本轮需比对的内容及 description |

实际调用使用当前会话暴露的 `tapd-mcp` 工具和 schema。新建不传旧 id 或
entity_type；人员、预估工时按已核实字段映射传输，标准字段为 owner、effort，
不把内部估算对象或清单阅读序号当成工具参数。仅同空间、同父需求且依赖顺序
连续的 CREATE 合批，不夹带 REUSE/UPDATE，也不增加未获准的状态、进度或日期。
【新建】【复用】【调整】仅是清单标题的展示前缀，不写入 name；本轮剩余
工时也不替代 effort，仍传已确认的任务最终预估。

批量结果的 index 是本批发送列表内的零起始序号，必须经本批列表对应回稳定
任务 key；不是原清单全局序号或 `#F01`，新批次重新计 index。逐项绑定真实 ID
和读回，完整校验及 partial/unknown 等停止与恢复规则由任务模块维护。
开发入口和 Plan 消费同一 `TaskBreakdownResult`，不自行另建任务或重复写入。

方法缺失时先核对实际启动版本（任务创建最低为 0.0.3）与 MCP 连接；仍未恢复，或必填字段不受
支持时，保留草稿并返回 `BLOCKED_TASK_WRITE_CAPABILITY`。任务创建以本节
方法为准，不因旧连接缺工具就转用通用创建、API/CLI 或浏览器，也不拿更新
方法冒充创建。这里只确定工具路线，不替代拟写入内容的确认和准确读回。

## 项目知识入口

需求、开发、Plan、评审等调用方只向
[workspace-project-knowledge](../skills/workspace-project-knowledge/SKILL.md)
提供 canonical 项目/子项目（可未知）、问题和目的，并消费统一 `KnowledgeContext`。
Hub 映射、范围过滤、工具选择、失败复用和本地回退统一遵循入口的
[查询约定](../skills/workspace-project-knowledge/references/knowledge-query.md)。

此类检索不使用下述通用 API/浏览器降级：Hub 未启用或不可用时回退本地，
不创建临时 HTTP 客户端绕过宿主配置。查询不包含知识写回、反馈或图谱重建。
工程规则、治理配置、精确部署映射及当前源码仍从各自权威来源核验。

## 调用流程

1. 在首次访问某系统前，检查对应 MCP 工具是否可用；必要时执行工具发现或插件 MCP 配置诊断。
2. MCP 可用时，所有支持的读写均走 MCP，并读回结果。
3. MCP 缺少特定能力且无上述专用路由约束时，优先使用已批准的官方 API 或受控 CLI；记录缺失的具体能力。
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
