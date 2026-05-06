---
name: tapd-workflow
description: 处理 TAPD Bug/Story/Task 时使用，适用于 MCP 采集上下文、确认本轮范围、驱动 Superpowers 开发验证、合并到 develop、生成提测 Wiki 或写回 TAPD。
allowed-tools:
  - tapd-mcp
  - yapi-mcp
  - gitlab-map
  - gitlab-mcp
  - company-project-routing
  - superpowers
---

# TAPD 工作流

## 定位

这个技能是 TAPD Bug/Story/Task 的受控执行流程。它负责 TAPD 上下文、本轮范围、GitLab 合并顺序、提测 Wiki 和 TAPD 写回；代码规划、实现和验证交给 Superpowers 执行。

这是固定阶段流程。不得跳阶段。任一阶段的退出条件不满足时，必须停下补齐证据或修正状态，再进入下一阶段。

## 工具职责

- `tapd-mcp`：读取和写回 TAPD。
- `yapi-mcp`：涉及接口对接时查询接口文档。
- `gitlab-map`：校验分支基线、提交同步和合并状态。
- `gitlab-mcp`：创建分支、处理合并请求、合并到 `develop`。
- `company-project-routing`：根据项目线索解析提测 Wiki 的 `服务名称`。
- `superpowers`：规划、实现、验证和分支收尾工作流。

## 分支基线原则

- 开发分支只能来自 `origin/master` 或用户明确指定的功能分支；禁止从 `origin/develop` 切开发分支。
- 复用已有 Bug / 需求分支时，记录复用关系即可，不得为了贴近 `develop` 另建 develop 基线分支。
- 合并到 `develop` 时，如果分支合法来源比 `develop` 多出历史提交，将这些提交记录为“继承基线差异”，不得当作本轮阻断，也不得因此 cherry-pick 到 `origin/develop` 基线上重建分支。
- 阶段 7 / 8 只评审和说明本轮提交范围；提测 Wiki 只写本轮变更，不写继承基线差异。

## 入口

- 首次处理：`/tapd-workflow <TAPD链接>`
- 继续处理：`/tapd-workflow bug item-id <ITEM_ID>`、`/tapd-workflow story item-id <ITEM_ID>` 或 `/tapd-workflow task item-id <ITEM_ID>`
- 显式出现 `$tapd-workflow`、`/tapd-workflow`、技能卡片或 TAPD 链接并要求修复/开发/处理时，即视为本技能已触发。
- 技能已触发后，用户说“可以”“继续”“直接修复”“不用日志”“你直接进行修复工作”，只表示继续推进当前 TAPD 工作流，不表示跳过阶段门禁。
- 禁止用“没有检测到工作流插件/触发关键字”“用户要求快速修复”作为不执行本工作流的理由；除非用户明确说“跳过 TAPD 工作流”。
- `id` 只用于入口查询；worktree 和提测材料命名使用 TAPD MCP 返回的 `short-id`。
- 提测 Wiki 中的 `代码分支名` 必须是真实 Git 分支名，不能用 `short-id` 代替。
- 必须根据 TAPD 链接路径识别条目类型：`/bug/detail/` 是 Bug，`/story/detail/` 是 Story，`/task/detail/` 是 Task；不得拿 Task 链接调用 Bug 查询。
- 如果某个 MCP 查询返回 `count: 0` 或未找到条目，不能视为采集完成；必须校验条目类型是否用错，改用正确类型重查，仍失败才停在采集阶段说明阻塞。

## 启动协议

本技能必须维护单一阶段状态机。为了保持界面整洁并明确状态，**禁止在文本回复中打印冗长的阶段台账**。相反，**每次阶段变更、进入新状态或遇到门禁阻塞时，必须强制调用 `update_topic` 工具**，在 `summary` 中记录：当前阶段、已完成阶段、TAPD 属性、阻塞项、下一动作等状态流转信息。

在执行任何写操作（特别是 `replace`、`write_file`、包含 `git` 等命令的 `run_shell_command`，或 TAPD/Wiki 写入）前，**必须在 thought 思考过程中进行显式自检**：“当前所处阶段为 X，是否满足写入前提？”。
如果门禁未满足，必须停在当前阶段并通过 `update_topic` 和简短回复说明阻塞项，不得以普通修 Bug 的方式绕过。

在第 4 阶段“分支确认子流程”通过前，禁止修改代码。允许进行只读采集、只读代码搜索、需求澄清；不允许改文件、提交、合并、写 Wiki 或写 TAPD。

不得把 TAPD 工作流降级成普通修 bug 路径。只要发现自己已经跳过阶段，必须停止当前动作，汇报已偏离的阶段，并从最近未满足的门禁补齐。

任何文件编辑、格式化、提交或合并前，必须先在当前回复中明确 `PRE_EDIT_GATE: PASS`。缺少以下任一证据时必须写 `PRE_EDIT_GATE: BLOCKED` 并停止写操作：

- TAPD 已按正确条目类型采集成功，且阶段 1 / 2 已完成；停在补充上下文阶段时不得通过编辑门禁。
- `本轮处理`、`本轮不处理`、`历史内容处理策略` 已声明。
- Superpowers 规划路线和测试策略已确定。
- 用户已完成“分支确认子流程”中的二次确认。
- `gitlab-map` 已完成分支来源、复用关系和基线校验。

如果已经在 `PRE_EDIT_GATE: PASS` 前发生代码修改，立即停止继续修改和声称已修复，只能汇报违规阶段、已改文件、当前风险，并回到“分支确认子流程”补门禁。

## 阶段门禁

| 阶段 | 进入条件 | 退出前必须产出 |
| --- | --- | --- |
| 1. 采集上下文 | 已定位 TAPD 项 | TAPD 摘要、关键字段、评论、附件、原型/PRD 结论 |
| 2. 补充上下文 | 采集结果不足以判断范围 | 缺失信息已说明，用户补充已纳入上下文 |
| 3. 确认本轮范围 | 上下文足以判断范围 | `本轮处理`、`本轮不处理`、`历史内容处理策略` |
| 4. 开发执行阶段 | 本轮范围已明确 | 分支确认子流程已通过并完成校验；规划子流程已完成；实现子流程完成且有测试证据；验证子流程达到 `REVIEW_PASSED` |
| 5. 合并到 develop | 开发执行阶段通过且提交可合并 | GitLab 确认变更已合并到 `develop` |
| 6. 准备提测 Wiki | 合并已完成 | 完整 Wiki 草稿已展示并获得用户确认 |
| 7. 写回 TAPD | 用户已确认写回内容 | Wiki、评论、状态更新已完成 |
| 8. 清理 | 写回完成或取消 | worktree 已清理，最终结果已汇报 |

每个关键阶段完成后都要运行 `regression-checker`。如果检查失败，先修正证据或流程状态，再继续。

阶段完成汇报必须包含：

- 阶段名称
- 本阶段产出
- 证据来源
- `regression-checker` 结论
- 下一阶段和进入条件

如果无法调用独立 `regression-checker`，必须按 [agents/regression-checker.md](agents/regression-checker.md) 做同等自检，并在汇报中标明“按 regression-checker 规则自检”。

## 阶段写入屏障

- 阶段 1「采集上下文」和阶段 2「补充上下文」只能执行只读动作：TAPD 读取、附件/PRD/原型读取、YApi 查询、GitLab 只读查询、代码搜索和文件阅读。
- 阶段 1 / 2 禁止执行任何业务代码和系统状态的写动作：编辑文件、格式化、提交、推送、创建或切换业务分支、创建 worktree、合并、写 Wiki、写评论、修改 TAPD 状态。
- 用户在阶段 1 / 2 说“继续”“可以”“直接修复”，只表示允许进入下一阶段门禁，绝不表示允许修改代码。
- 如果阶段 1 / 2 已发生越界写动作，必须立即停止，列出越界动作并在思考中反省，回到应处的只读阶段。

## 工具能力发现与动态字段解析

- 明确路由：处理 Bug **必须且只能**调用 `get_bug` 和 `update_bug` 工具；处理 Story/Task 必须调用 `get_stories_or_tasks` 和 `update_story_or_task`。
- 提取人员字段（如测试人员）时，**必须先调用 `get_entity_custom_fields`** 动态查找语义匹配的字段（如“测试人员”），**禁止硬编码**假设它是 `custom_field_two` 等特定字段。
- 若动态解析仍无法确定映射，必须向用户确认，并将确认结果记录到项目私有记忆库（MEMORY.md），禁止盲目使用 reporter 兜底。
- 声称工具不可用前必须进行探测，若调用报错必须报告真实错误及参数，不得改写为“工具不存在”。

## 持续推进规则（CLI 人格纪律）

- 你是一个自治的 CLI 执行器，而非聊天机器人。
- 当用户明确授权（“继续 / 可以 / 写入 / 你做”）且门禁已满足时，**直接静默执行动作**，仅通过实际的文件修改或工具调用来响应。
- **禁止**输出未经请求的提问或假设性方案，**不得**以“如果你要，我下一条给你...”或“是否需要我...”来中断流程。只输出确定的下一步动作和工具调用。

## 阶段流程

### 1. 采集上下文

- 通过 `tapd-mcp` 读取 TAPD，不使用 CLI 或页面抓取作为主来源。
- 采集详情、评论、附件、截图、PRD 链接和原型链接。
- 出现原型链接时，使用 `chrome-devtools-mcp` 读取默认展示的需求文档。
- 将有用摘要注入当前对话上下文，不创建 TAPD 专属过程文件。
- 如果 `tapd-mcp` 不可用，停止流程并说明阻塞原因。

参考：[collector.md](references/collector.md)、[prototype.md](references/prototype.md)

### 2. 补充上下文

采集结果不足以判断范围时，必须先补充上下文，不得直接进入范围确认。

- 先向用户说明 TAPD 信息里哪些内容不清楚，例如复现路径、期望行为、影响范围、验收口径、关联分支、测试人员或原型说明。
- 根据已采集信息提出具体补充问题，避免泛泛要求“补充一下”。
- 用户补充后，将补充内容纳入当前上下文，并标明来源为“用户补充”。
- 如果用户补充改变了对 TAPD 的理解，先更新摘要，再进入本轮范围确认。
- 如果补充后仍不足以判断范围，继续停留在本阶段。

### 3. 确认本轮范围

进入规划或实现前，必须明确：

- `本轮处理`
- `本轮不处理`
- `历史内容处理策略`：默认不自动合并历史记录；只有用户点名时才纳入本轮。

未声明的内容一律视为本轮范围外，不得进入代码改动、验证、合并说明或提测 Wiki。

### 4. 开发执行阶段

这是对外单一主阶段，内部包含“分支确认子流程 -> 规划子流程 -> 实现子流程 -> 验证子流程”。
内部子流程不在本文件展开，执行细则见：`references/development-execution.md`。

### 5. 合并到 develop

- 提交后使用 `gitlab-map` 或等效 GitLab 读接口确认可合并状态。
- 合并前必须区分“本轮提交范围”和“继承基线差异”；合法来源带来的额外历史提交只记录为继承基线差异，不阻断合并。
- 使用 GitLab 将已验证变更合并到 `develop`。
- 合并成功后，明确告知用户已经合并。
- 如果 `gitlab-mcp` 不可用或合并条件不满足，停止在提测 Wiki 之前。

参考：[gitlab-map.md](references/gitlab-map.md)

### 6. 准备提测 Wiki

- 只有变更已经合并到 `develop` 后，才允许准备提测 Wiki。
- `服务名称` 必须通过 `company-project-routing` 解析，不能直接复制项目名。
- 生成前先读取月目录和现有模块顺序，再确定插入位置。
- 必须按模板生成完整 Wiki 正文。
- 将最终 Wiki 内容展示给用户，并等待明确确认。

参考：[test-wiki.md](references/test-wiki.md)

### 7. 写回 TAPD

仅在用户确认后执行：

- 创建或更新提测 Wiki。
- Bug 评论正文必须严格写成 `提测wiki：[wiki链接]({wiki链接})`。
- 按需更新 TAPD 状态。
- Wiki、评论、状态更新尽量合并成一次确认。

### 8. 清理

- 确认 GitLab 合并、TAPD 写回、评论/状态更新和 worktree 清理都已完成。
- 汇报最终结果、运行过的测试、合并结果和剩余风险。

## 外部写入规则

- TAPD 写操作必须使用 TAPD MCP。
- 写入前必须展示将要写入的用户可见内容。
- 第 4 阶段“分支确认子流程”通过且 `PRE_EDIT_GATE: PASS` 后，本地代码修改、测试、提交和合并准备不需要逐步确认。
- 合并到 `develop` 前，不得准备或写入提测 Wiki。
- 必须保留 Superpowers 开发流程的完整产物：阶段 4 必须生成或更新 `plan.md`、`tasks.md`、`verification.md`，作为不可或缺的工程审计证据。

## 参考文件加载

- 主流程展开：[workflow.md](references/workflow.md)
- 开发执行子流程：[development-execution.md](references/development-execution.md)
- 采集细则：[collector.md](references/collector.md)
- 规划细则：[planner.md](references/planner.md)
- 实现细则：[implementer.md](references/implementer.md)
- 评审细则：[reviewer.md](references/reviewer.md)
- GitLab 校验：[gitlab-map.md](references/gitlab-map.md)
- 提测 Wiki 模板：[test-wiki.md](references/test-wiki.md)
- 回归场景：[regression-scenarios.md](references/regression-scenarios.md)
