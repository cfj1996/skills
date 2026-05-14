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
  - update_topic
---

# TAPD 工作流

## 全局变量/占位符定义

| 变量 | 定义 | 来源 | 示例 |
| :--- | :--- | :--- | :--- |
| `{short-id}` | TAPD 任务唯一简短 ID | `tapd-mcp` 的 `short-id` 字段 | `1014292` |
| `{slug}` | 任务标题的语义化描述短语 | 从 TAPD `title` 提取（必须使用中文简述，如“修复分红规则”） | `修复分红规则` |
| `{git-user}` | 当前 Git 用户名 | `git config user.name` | `cfj` |
| `{YYMMDD}` | 任务启动时的年月日 | 系统日期 | `260509` |
| `{te}` | 测试人员 | `tapd-mcp` 的 `te` 字段或自定义字段（见 [collector.md](references/collector.md) 动态解析规则） | `张三` |
| `{de}` | 开发人员 | `tapd-mcp` 的 `de` 字段或 `current_owner` | `李四` |
| `{reporter}` | 报告人 | `tapd-mcp` 的 `reporter` 字段 | `王五` |
| `{artifact-root}` | 本轮流程文档目录 | 项目根目录下的 `docs/{short-id}` | `docs/1014292` |
| `{test-root}` | 本轮测试文件目录 | 项目根目录下的 `__test___/{short-id}` | `__test___/1014292` |

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

注意：本节中的 `tapd-mcp`、`gitlab-map`、`gitlab-mcp` 是 MCP 能力/集成职责名，不要求运行时暴露同名可调用 namespace。实际工具名以当前会话暴露为准；只要通过 GitLab MCP 能力完成对应校验职责，即视为满足。

## 证据文件目录原则

- 所有本轮测试代码文件必须放在项目根目录的 `__test___/{short-id}/` 下，文件名使用 `xxx.test.js` 或 `xxx.test.ts`。
- 计划、任务拆解、验证报告、评审报告、截图证据和 Superpowers 生成的所有过程文档必须放在项目根目录的 `docs/{short-id}/` 下。
- 禁止将测试文件散落在业务代码目录、worktree 根目录或其他临时目录。
- `docs/{short-id}/raw.md` 是必需文件，负责记录流程执行阶段，至少包含：TAPD id 与描述、需求/Bug 描述、单元测试是否执行且通过、集成测试是否执行且通过（无法自动确认时记录“需需求人确认”）、流程进度、创建时间、修复时间。阶段 1/2 初始化时，单元测试、集成测试和修复时间可以记录为“未执行/未完成/待填写”；阶段 8 清理前必须补成真实结果或明确阻塞原因。
- 提交代码时，应包含 `__test___/{short-id}/` 和 `docs/{short-id}/` 下的相关证据文件。

## 分支基线原则

- 开发分支只能来自 `origin/master` 或用户明确指定的功能分支；禁止从 `origin/develop` 切开发分支。
- 复用已有 Bug / 需求分支时，记录复用关系即可，不得为了贴近 `develop` 另建 develop 基线分支。
- 合并到 `develop` 时，如果分支合法来源比 `develop` 多出历史提交，将这些提交记录为“继承基线差异”，不得当作本轮阻断，也不得因此 cherry-pick 到 `origin/develop` 基线上重建分支。
- 阶段 7 / 8 只评审和说明本轮提交范围；提测 Wiki 只写本轮变更，不写继承基线差异。

## 入口

- 首次处理：`/tapd-workflow <TAPD链接>`
- 显式出现 `$tapd-workflow`、`/tapd-workflow`、技能卡片或 TAPD 链接并要求修复/开发/处理时，即视为本技能已触发。
- 技能已触发后，用户说“可以”“继续”“直接修复”“不用日志”“你直接进行修复工作”，只表示继续推进当前 TAPD 工作流，不表示跳过阶段门禁。
- 禁止用“没有检测到工作流插件/触发关键字”“用户要求快速修复”作为不执行本工作流的理由；除非用户明确说“跳过 TAPD 工作流”。
- `id` 只用于入口查询；worktree 和提测材料命名使用 TAPD MCP 返回的 `short-id`。
- 提测 Wiki 中的 `代码分支名` 必须是真实 Git 分支名，不能用 `short-id` 代替。
- 必须根据 TAPD 链接路径识别条目类型：`/bug/detail/` 是 Bug，`/story/detail/` 是 Story，`/task/detail/` 是 Task；不得拿 Task 链接调用 Bug 查询。
- 如果某个 MCP 查询返回 `count: 0` 或未找到条目，不能视为采集完成；必须校验条目类型是否用错，改用正确类型重查，仍失败才停在采集阶段说明阻塞。

## 启动协议

本技能必须维护单一阶段状态机。为了保持界面整洁并明确状态，**禁止在文本回复中打印冗长的阶段台账**。相反，**每次阶段变更、进入新状态或遇到门禁阻塞时，必须强制调用 `update_topic` 工具**，在 `summary` 中记录：当前阶段、已完成阶段、TAPD 属性、阻塞项、下一动作等状态流转信息。

阶段 1 采集成功并拿到 `short-id` 后，必须创建或更新 `docs/{short-id}/raw.md`。此文件是流程总账，后续每个阶段完成、阻塞、测试执行、集成验证、状态写回和最终清理都必须追加或更新对应条目。

在执行任何写操作（特别是 `replace`、`write_file`、包含 `git` 等命令的 `run_shell_command`，或 TAPD/Wiki 写入）前，**必须在 thought 思考过程中进行显式自检**：“当前所处阶段为 X，是否满足写入前提？”。
如果门禁未满足，必须停在当前阶段并通过 `update_topic` 和简短回复说明阻塞项，不得以普通修 Bug 的方式绕过。

**越界回滚机制**：不得把 TAPD 工作流降级成普通修 bug 路径。只要发现自己已经跳过阶段（例如没做测试就想提交，没独立评审就想合并），必须停止当前动作，汇报已偏离的阶段，撤销越界操作，并从最近未满足的门禁补齐。

**评审子 Agent 只读边界与自动发起**：阶段 4 调用评审子 Agent 时，必须使用最强隔离（优先 `agent_type: explorer`、默认 `fork_context: false`），并在 prompt 中明文禁止子 Agent 执行 git 提交/推送、创建或合并 MR、写回 TAPD/Wiki。**主 Agent 在完成代码实现与自测后，应自动发起只读评审，无需用户针对“调用子 Agent”这一单纯只读动作进行额外二次确认。** 提交、推送、MR、合并只能由主 Agent 在核验 `REVIEW_PASSED` 后执行；详见 [references/reviewer.md](references/reviewer.md)。

## PRE_EDIT_GATE 硬阻断（肌肉记忆级）

除阶段 1/2 维护 `docs/{short-id}/raw.md` 这一流程总账外，任何文件编辑、代码格式化、git 提交或合并前，**必须**先在当前回复中明确输出 `PRE_EDIT_GATE: PASS`。缺少以下任一证据时必须写 `PRE_EDIT_GATE: BLOCKED` 并停止一切写操作：

1. TAPD 已按正确条目类型采集成功，且阶段 1 / 2 已完成；停在补充上下文阶段时不得通过编辑门禁。
2. `本轮处理`、`本轮不处理`、`历史内容处理策略` 已声明。
3. 用户已完成“分支确认子流程”中的二次确认。
4. `gitlab-map` 已完成分支来源、复用关系和基线校验。

如果已经在 `PRE_EDIT_GATE: PASS` 前发生代码修改，立即停止继续修改和声称已修复，只能汇报违规阶段、已改文件、当前风险，并回到“分支确认子流程”或“规划子流程”补门禁。

## 阶段门禁

| 阶段 | 进入条件 | 退出前必须产出 |
| --- | --- | --- |
| 1. 采集上下文 | 已定位 TAPD 项 | TAPD 摘要、关键字段、评论、附件、原型/PRD 结论；`docs/{short-id}/raw.md` 已初始化 |
| 2. 补充上下文 | 采集结果不足以判断范围 | 缺失信息已说明，用户补充已纳入上下文 |
| 3. 确认本轮范围 | 上下文足以判断范围 | 已明确展示需求描述、Bug 描述、`本轮处理`、`本轮不处理`、`历史内容处理策略`，并获得用户确认 |
| 4. 开发执行阶段 | 本轮范围已确认 | Bug 状态已更新为“修复中”或 Story/Task 状态已更新为“进行中”；分支确认校验通过；Superpowers 规划、实现、证据包真实生成；验证达到 `REVIEW_PASSED` |
| 5. 合并到 develop | 开发执行阶段通过且提交可合并 | **经用户确认后**，GitLab 确认变更已合并到 `develop` |
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

## 阶段推进前置门禁

- **进入阶段 5 前，必须先把阶段 4 标记为 completed**。阶段 4 的实际产出满足退出条件但右侧面板/状态计划仍显示阶段 4 loading 时，不得创建 MR、合并 MR 或继续写 Wiki。
- **创建或合并 MR 前，必须确认状态面板不再停留在阶段 4 loading**。若当前会话没有 `update_topic`，必须使用可用的等价状态工具（如 `update_plan`）完成同步后再继续。
- 如果状态同步失败、工具不可用，或面板状态与实际执行状态不一致，必须停止阶段推进并明确说明：实际完成到哪个阶段、面板停在哪个阶段、需要用户确认或工具恢复后才能继续。

## 阶段写入屏障

- 阶段 1「采集上下文」和阶段 2「补充上下文」只能执行只读动作：TAPD 读取、附件/PRD/原型读取、YApi 查询、GitLab 只读查询、代码搜索和文件阅读。
- 阶段 1 / 2 唯一允许的本地写动作是创建或更新 `docs/{short-id}/raw.md` 记录流程总账；除此之外，禁止执行任何业务代码和系统状态的写动作：编辑文件、格式化、提交、推送、创建或切换业务分支、创建 worktree、合并、写 Wiki、写评论、修改 TAPD 状态。
- 用户在阶段 1 / 2 说“继续”“可以”“直接修复”，只表示允许进入下一阶段门禁，绝不表示允许修改代码。
- 如果阶段 1 / 2 已发生越界写动作，必须立即停止，列出越界动作并在思考中反省，回到应处的只读阶段。

## 工具能力发现与动态字段解析

- 明确路由：处理 Bug **必须且只能**调用 `get_bug` 和 `update_bug` 工具；处理 Story/Task 必须调用 `get_stories_or_tasks` 和 `update_story_or_task`。
- 提取人员字段（如测试人员）时，**必须先调用 `get_entity_custom_fields`** 动态查找语义匹配的字段，**禁止硬编码**。若无法确定映射，必须向用户确认并记录到 `MEMORY.md`。
- 声称工具不可用前必须进行探测，若调用报错必须报告真实错误及参数，不得改写为“工具不存在”。

## 二次进入与增量开发（打回重修/隔天继续/需求补充）

- 遇到测试打回、需求补充或隔天继续处理同一条目（Bug/Story/Task）时，必须判定为“增量开发/修复”。
- 流程启动时必须先根据 TAPD 信息判断是否为二次开发：检查该 `short-id` 是否已有 `__test___/{short-id}/` 和 `docs/{short-id}/`，并读取其中的测试、计划、验证、评审和 `raw.md` 历史记录。
- 必须优先复用原有业务分支、工作区和既有 Wiki，禁止默认从头拉取新分支或推翻重建全量流程。
- 必须将用户反馈的最新失败表现、新增需求或未完成项作为「本轮处理范围」，保留前一轮的有效产物。

## 持续推进规则（CLI 人格纪律）

- 你是一个自治的 CLI 执行器，而非聊天机器人。
- 当用户明确授权（“继续 / 可以 / 写入 / 你做”）且门禁已满足时，**直接静默执行动作**（包括代码实现、运行测试、**自动发起只读评审**等），仅通过实际的文件修改或工具调用来响应。
- **禁止**输出未经请求的提问或假设性方案，**不得**以“如果你要，我下一条给你...”或“是否需要我...”来中断流程。只输出确定的下一步动作和工具调用。

## 阶段流程

### 1. 采集上下文
- 通过 `tapd-mcp` 读取 TAPD，不使用 CLI 或页面抓取作为主来源。
- 采集详情、评论、附件、截图、PRD 链接和原型链接。
- 如果 `tapd-mcp` 不可用，停止流程并说明阻塞原因。
- **凭证安全禁令**：禁止在回复、日志、提测 Wiki 或评论中包含 TAPD/GitLab/YApi 的访问令牌（Token）、密码或敏感环境变量。一旦发现误打印，必须在下一轮回复中要求用户手动清理会话历史或在远端撤销凭证。

### 2. 补充上下文
- 采集结果不足以判断范围时，必须先补充上下文，提出具体问题，待用户补充改变理解后更新摘要，再进入范围确认。

### 3. 确认本轮范围
- 必须明确展示 TAPD 需求描述、Bug 描述（Story/Task 无 Bug 描述时写“无 Bug 描述，按需求/任务描述处理”）、`本轮处理`、`本轮不处理`、`历史内容处理策略`。
- 必须获得用户对上述内容的明确确认后，才能进入开发执行阶段。用户未确认时只能补充上下文或调整范围。
- 未声明的一律视为本轮范围外。

### 4. 开发执行阶段（核心防伪装区）
这是对外单一主阶段，内部包含“分支确认 -> 规划 -> 实现 -> 验证”。
**注意：这里是 Superpowers 执行的深水区，禁止“形式主义”和“伪造执行”。必须真实运行各项排查和测试工具。**
- 进入本阶段时，必须先通过 TAPD MCP 写回状态：Bug 更新为“修复中”；Story/Task 更新为“进行中”。写回失败时停止开发并报告真实错误。
执行细则见：`references/development-execution.md`。

### 5. 合并到 develop
- 进入本阶段前必须通过“阶段推进前置门禁”：阶段 4 已标记 completed，且右侧面板/状态计划不再停留在阶段 4 loading。
- 提交后使用 `gitlab-map` 确认可合并状态。
- 合并条件只按本轮提交范围判断；合法来源带来的额外历史提交只记录为继承基线差异，不阻断合并。
- **必须先向用户展示合并影响（源分支、目标分支、本轮提交列表），获得用户明确确认后，方可使用 GitLab 将已验证变更合并到 `develop`。**
- **严禁在未征得用户同意的情况下自动执行合并动作。**

### 6. 准备提测 Wiki
- **必须先检查当前 TAPD 详情中是否已经存在提测 Wiki 链接。若已存在，直接在该 Wiki 页面上补充，不得新建。**
- `服务名称` 必须通过 `company-project-routing` 解析。必须按模板生成完整 Wiki 正文。

### 7. 写回 TAPD
仅在用户确认后执行：创建或更新提测 Wiki、写 Bug 评论、更新 TAPD 状态。

**Bug 评论写入硬门禁**：
- 调用 `create_comments` 前必须执行 `TAPD_COMMENT_GATE` 自检。
- Bug 评论正文只能由最终 Wiki 链接生成，且必须完全等于单行：`提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`。
- `{wiki链接}` 必须是 TAPD Wiki 的完整可点击地址，例如 `https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}`。
- 评论正文禁止拼接 MR、Jenkins、构建结果、实现说明、验证摘要或多行文本；这些信息只能出现在最终回复中，不能写入 TAPD 评论。
- 如果评论正文不完全匹配上述格式，必须停止写评论并修正正文，不得调用 `create_comments`。

### 8. 清理
确认 GitLab 合并、TAPD 写回。
**工作区清理门禁**：
- 必须执行 `superpowers:finishing-a-development-branch` 完成分支收尾。
- 必须清理本轮创建的所有 worktree。
- 清理后必须运行 `git status` 确认当前工作区已恢复干净（或处于预期的基线状态）。
- 归档/删除本次处理产生的临时过程文件。
- 输出本次流程明细：TAPD 链接、需求/Bug 描述、处理范围、分支与提交、MR/合并结果、Wiki 链接、单元测试结果、集成测试结果、`docs/{short-id}/raw.md` 路径、剩余风险、清理结果。

## 参考文件加载

- 规划与实现：[development-execution.md](references/development-execution.md)
- 采集细则：[collector.md](references/collector.md)
- 评审细则：[reviewer.md](references/reviewer.md)
- GitLab 校验：[gitlab-map.md](references/gitlab-map.md)
- 分支与 Worktree 策略：[branch-worktree-strategy.md](references/branch-worktree-strategy.md)
- 提测 Wiki 模板：[test-wiki.md](references/test-wiki.md)
- 回归场景：[regression-scenarios.md](references/regression-scenarios.md)
- 原型规范：[prototype.md](references/prototype.md)
