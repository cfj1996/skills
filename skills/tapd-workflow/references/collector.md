# 阶段一：信息收集

## 目标

通过 TAPD MCP 提取需求/Bug/Task 详情、评论、附件、PRD、原型和图片，并把可执行上下文注入当前会话。

## 采集规则

- 首次处理时读取详情、评论、附件和图片，直接在当前会话中沉淀可执行上下文
- 必须先根据链接路径识别条目类型：`/bug/detail/` 查 Bug，`/story/detail/` 查 Story，`/task/detail/` 查 Task
- MCP 返回 `count: 0` 或未找到条目时，不得继续进入范围确认；先检查是否用错 Bug/Story/Task 查询，再用正确类型重查
- 识别附件中的 PRD、需求说明、设计稿说明、测试说明或其他产品文档，并逐一判断是否需要解析
- 提取标题、状态、优先级、描述、评论摘要、原型链接、截图信息，以及补充文档清单
- Bug 必须采集字段：id, title, status, priority, severity, current_owner, reporter, te, de, created
- Bug 记录严重程度、模块、复现步骤；Story 记录所属迭代、验收标准
- 拿到 `short-id` 后，必须先解析目标项目仓库，再执行 `LocalGitResumeGate`；不得只检查项目根目录是否已有 `__test___/{short-id}/` 或 `docs/{short-id}/`
- 目标项目仓库未解析时，`LocalGitResumeGate` 记录为 `PENDING_PROJECT` 或 `BLOCKED`，不得在当前 shell CWD、workspace 根目录或猜测项目中搜索分支
- `LocalGitResumeGate` 在目标项目仓库中使用本地 git 优先：
  - 先搜索本地已有 refs
  - 本地 refs 未命中或需要刷新时，允许执行 `git fetch origin --prune` 作为只读同步动作；该动作只允许发生在 `LocalGitResumeGate` 内，并必须记录到 Gate 结果
  - 用户提供分支时，按顺序验证 `refs/heads/<branch>` 与 `refs/remotes/origin/<branch>`
  - 未提供分支时，使用 `git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin` 搜索包含 `short-id` 的 `feature/*`、`fixbug/*`
  - 使用 `git log --all --grep='--story=<short-id>' --grep='--bug=<short-id>' --grep='--task=<short-id>' --oneline` 搜索 commit trailer
  - 对候选 ref 执行 `git show <ref>:docs/{short-id}/raw.md` 读取历史 raw，并用 `git ls-tree <ref> -- __test___/{short-id}` 检查历史测试证据；只有 stdout 非空时，`test_artifacts_exist_on_ref` 才能记为 `true`
- TAPD 评论或提测 Wiki 中存在分支线索时，先提取分支名，再回到本地 git 验证和读取 raw
- 当前工作区 `docs/{short-id}` 和 `__test___/{short-id}` 只作为最后的加速路径；禁止仅因当前工作区不存在这些目录就判定为首次开发
- `LocalGitResumeGate` 命中 raw 时，必须进入 `RESUME`，以旧 raw 作为 `PreviousContext` 主来源；只追加本轮增量记录，不重新初始化完整 raw
- 用户提供分支且该分支缺少 raw 时，进入 `NEED_CONFIRMATION`，说明证据缺失并等待用户确认是否以该分支为恢复基准；未提供分支时，必须遍历所有候选 ref，只有所有候选都缺少 raw 才进入 `NEED_CONFIRMATION`
- 创建或更新 `docs/{short-id}/raw.md` 作为流程总账，初始内容至少记录 TAPD id 与描述、需求/Bug 描述、流程进度和创建时间；二次接入时必须在复用分支上追加记录。阶段 1/2 只允许写此文件，不允许改业务代码或 TAPD 状态
- 只要出现原型链接，必须用 `chrome-devtools-mcp` 打开原型文档，并只读默认展示的需求文档
- 原型和截图信息要整理进当前上下文，并标注来源
- 对于可访问的补充文档，要提炼出目标、范围、关键流程、验收口径、依赖和明确限制；如果多个文档存在冲突，要记录冲突点和当前优先级判断
- 对于无法访问或内容不完整的文档，要写明文件名、来源、受限原因和对后续判断的影响
- 采集后先向用户展示摘要，等待”继续 / 补充 / 取消”
- 如果 TAPD 描述不清楚，必须先列出缺失信息并请求用户补充，再进入本轮范围确认
- 阶段 1 和阶段 2 除维护 `docs/{short-id}/raw.md` 外，只允许只读采集和澄清；严格禁止在业务代码、TAPD、分支状态进行任何“写”操作
- 用户补充的信息必须纳入当前上下文，并标注来源为“用户补充”
- 如果在用户确认前又出现新的附件、PRD 或补充说明，回到采集阶段补读并合并进当前上下文
- 如果后续会进入写入阶段，先把可能写入 TAPD 的内容一并列出来，避免逐条打断用户
- 继续处理时，重新读取当前 TAPD 信息只用于 `LatestTapdRefresh`；必须结合 `PreviousContext` 和用户补充确认本轮增量范围，不得推翻旧 raw/Wiki/MR 恢复出的历史上下文
- `collection_confidence` 和 `warnings` 用于标记完整度

## TAPD Bug 字段说明

| 字段缩写 | 全称 | 含义 |
|----------|------|------|
| `te` | tester | 测试人员（提测时使用此字段） |
| `de` | developer | 开发人员 |
| `reporter` | reporter | 报告人（提交Bug的人） |
| `current_owner` | current_owner | 当前处理人 |

## 动态字段口径与解析规则

- 对于 Bug，`测试人员` 优先使用 `te` 字段（需去除末尾分号等分隔符）。
- 对于 Story，或者 Bug 中 `te` 为空的情况，`测试人员` **禁止硬编码**为特定 custom_field。必须调用 `get_entity_custom_fields` 工具获取配置，寻找名称或语义为“测试人员”的自定义字段并取值。
- 如果动态解析无法确定，向用户请求确认，并记录到项目私有记忆中（MEMORY.md），**禁止盲目兜底到 `reporter`**。
- `开发人员` 优先使用 `de` 字段，为空时使用当前处理人（`current_owner`）并标注来源。

## 输出要求

- `collection_confidence` 低于 0.6 时，必须列出缺失项
- 原型可访问但未通过 `chrome-devtools-mcp` 读取默认展示的需求文档，视为收集不完整
- 无法访问页面、附件或补充文档时，写清原因

## 结束条件

- 当前上下文已经完整覆盖关键信息
- 关键信息足以支持任务规划
- 若上下文不足，已向用户明确缺失项并完成补充
