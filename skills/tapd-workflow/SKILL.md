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

触发本技能后，必须先输出阶段台账，再执行任何代码修改。阶段台账至少包含：

- 当前阶段
- TAPD 类型和 `short-id`（未知时写“待 MCP 采集”）
- 当前上下文是否足够
- 本轮范围状态
- 分支策略状态
- 上一阶段 `regression-checker` 结论（首阶段写“尚未执行”）
- 下一步允许做什么

在第 5 阶段“确认分支”通过前，禁止修改代码。允许进行只读采集、只读代码搜索、需求澄清和规划；不允许改文件、提交、合并、写 Wiki 或写 TAPD。

不得把 TAPD 工作流降级成普通修 bug 路径。只要发现自己已经跳过阶段，必须停止当前动作，汇报已偏离的阶段，并从最近未满足的门禁补齐。

任何文件编辑、格式化、提交或合并前，必须先在当前回复中明确 `PRE_EDIT_GATE: PASS`。缺少以下任一证据时必须写 `PRE_EDIT_GATE: BLOCKED` 并停止写操作：

- TAPD 已按正确条目类型采集成功，或已明确停在补充上下文阶段。
- `本轮处理`、`本轮不处理`、`历史内容处理策略` 已声明。
- Superpowers 规划路线和测试策略已确定。
- 用户已在第 5 阶段二次确认分支/工作区策略。
- `gitlab-map` 已完成分支来源、复用关系和基线校验。

如果已经在 `PRE_EDIT_GATE: PASS` 前发生代码修改，立即停止继续修改和声称已修复，只能汇报违规阶段、已改文件、当前风险，并回到第 5 阶段补门禁。

## 阶段门禁

| 阶段 | 进入条件 | 退出前必须产出 |
| --- | --- | --- |
| 1. 采集上下文 | 已定位 TAPD 项 | TAPD 摘要、关键字段、评论、附件、原型/PRD 结论 |
| 2. 补充上下文 | 采集结果不足以判断范围 | 缺失信息已说明，用户补充已纳入上下文 |
| 3. 确认本轮范围 | 上下文足以判断范围 | `本轮处理`、`本轮不处理`、`历史内容处理策略` |
| 4. 规划 | 本轮范围已明确 | Superpowers 路由、影响范围、测试策略、分支策略 |
| 5. 确认分支 | 计划已清晰 | 用户已二次确认新建或复用策略，分支策略已记录、工作区已就绪、分支来源/复用关系和基线校验已记录 |
| 6. 实现 | 分支门禁已通过 | 计划内改动完成，并有相关测试证据 |
| 7. 验证与评审 | 实现已完成 | 最新验证证据和 `REVIEW_PASSED` |
| 8. 合并到 develop | 评审通过且提交可合并 | GitLab 确认变更已合并到 `develop` |
| 9. 准备提测 Wiki | 合并已完成 | 完整 Wiki 草稿已展示并获得用户确认 |
| 10. 写回 TAPD | 用户已确认写回内容 | Wiki、评论、状态更新已完成 |
| 11. 清理 | 写回完成或取消 | worktree 已清理，最终结果已汇报 |

每个关键阶段完成后都要运行 `regression-checker`。如果检查失败，先修正证据或流程状态，再继续。

阶段完成汇报必须包含：

- 阶段名称
- 本阶段产出
- 证据来源
- `regression-checker` 结论
- 下一阶段和进入条件

如果无法调用独立 `regression-checker`，必须按 [agents/regression-checker.md](agents/regression-checker.md) 做同等自检，并在汇报中标明“按 regression-checker 规则自检”。

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

### 4. 使用 Superpowers 规划（按场景路由）

写代码前必须先做场景判定，再选择 Superpowers 技能，不得只写“进入 Superpowers”。

- 场景 A：需求不清、方案存在分歧或需要先对齐验收口径  
  - 使用 `superpowers:brainstorming`，随后使用 `superpowers:writing-plans`。  
  - 退出条件：方案取舍和验收口径已经明确，可落地为执行计划。
- 场景 B：Bug / 异常排查，根因不明确  
  - 先使用 `superpowers:systematic-debugging`。  
  - 根因明确后补 `superpowers:writing-plans`。  
  - 退出条件：复现路径、根因证据、修复假设和验证路径齐全。
- 场景 C：根因或方案已清晰，进入实现编排  
  - 任务可拆并且互不阻塞时：`superpowers:subagent-driven-development`。  
  - 任务不可拆或强串行依赖时：`superpowers:executing-plans`。  
  - 退出条件：任务清单、执行顺序和责任边界明确。
- 场景 D：涉及接口联调或外部契约  
  - 先使用 `yapi-mcp` / `yapi-workflow` 补充接口上下文，再回到上面 A/B/C 路由。  
  - 退出条件：接口字段、入参出参和错误口径已纳入计划。

第 4 阶段最小产出必须包含：

- 场景判定结果和对应技能选择理由
- 影响范围（模块/文件/接口）
- 测试策略（至少覆盖原失败路径与修复后路径）
- 分支策略建议（只给建议，确认放在第 5 阶段）
- “验证后合并到 `develop`”的预期

第 6/7 阶段仍需强制执行：

- 实现遵循 `superpowers:test-driven-development`
- 完成前执行 `superpowers:verification-before-completion`

参考：[planner.md](references/planner.md)

### 5. 确认分支和 worktree

- 代码修改前先确认分支策略，再创建新 worktree 或切换到用户确认的已有分支/工作区。
- 分支策略必须先记录，不得默认新建分支，也不得默认切换已有分支。
- 执行者只能给出建议和候选项，必须等待用户明确二次确认后，才允许创建新分支、新 worktree，或切换到已有分支/工作区。
- 二次确认必须让用户在以下动作中明确选择：
  - `新建分支 + worktree`：用于用户确认需要独立分支承载本轮工作。
  - `切换/复用已有分支`：默认用于用户确认本轮应承接已有 Bug 分支、需求分支或用户指定功能分支，不创建新 worktree。
  - `切换/复用已有分支 + 新 worktree`：仅当用户明确说明需要隔离工作区时使用。
- 给用户的确认信息必须包含推荐策略、推荐原因、候选分支名、来源分支、工作区路径或拟创建 worktree 路径和风险提示。
- 分支策略建议口径：
  - 首次处理独立线上 Bug：通常新建 Bug 分支。
  - 线上 Bug 再次修复：复用已有 Bug 分支，不重复创建。
  - 需求开发后的缺陷修复：复用该需求分支，不重复创建。
- 分支策略记录必须包含：
  - 场景类型：`新建分支`、`复用线上 Bug 分支` 或 `复用需求分支`
  - 用户二次确认结果：`新建分支 + worktree`、`切换/复用已有分支` 或 `切换/复用已有分支 + 新 worktree`
  - 当前 TAPD `short-id`
  - 复用分支时的原关联 TAPD / Story / Bug 线索
  - 分支名和工作区路径；如果创建新 worktree，还必须记录 worktree 路径
  - 来源分支：`origin/master` 或用户明确指定的功能分支
  - 新建或复用的原因
  - `gitlab-map` 校验结果
- 分支命名：
  - Bug：`fixbug/{git-user}.{YYMMDD}.{slug}-{short-id}`
  - Story：`feature/{git-user}.{YYMMDD}.{slug}-{short-id}`
- 新建 worktree 路径：目标项目根目录下的 `./.worktree/{短描述}-{short-id}`。
- 提交前必须使用 `gitlab-map` 校验当前分支基线、复用关系和可继续提交状态。
- 新建分支来源不是 `origin/master` 或用户明确指定功能分支时，停止流程；如果来源是 `origin/develop`，必须废弃该开发分支并回到合法来源重新创建。
- 复用分支关联关系不清时，停止流程并先确认当前分支是否仍承载该 TAPD/需求。

参考：[gitlab-map.md](references/gitlab-map.md)、[implementer.md](references/implementer.md)

### 6. 实现

- 在用户确认的工作区中执行；新建分支使用新 worktree，复用已有分支默认使用已有工作区。
- 计划可拆成独立任务时，优先使用 `superpowers:subagent-driven-development`。
- 不适合子代理并行时，使用 `superpowers:executing-plans`。
- 实现任务内部遵循 `superpowers:test-driven-development`。
- 改动必须限制在 `本轮处理` 范围内。
- 如果本轮实际生成了 Superpowers 文档，提交代码时必须一并提交相关文档。
- 提交信息必须是中文 Conventional Commits。

### 7. 验证与评审

- 声称完成前必须运行 `superpowers:verification-before-completion`。
- Bug 修复必须覆盖原始失败路径和修复后路径。
- 只根据当前范围、当前计划/证据和本次 diff 做评审。
- 只有评审结论达到 `REVIEW_PASSED` 后，才允许进入合并。

参考：[reviewer.md](references/reviewer.md)

### 8. 合并到 develop

- 提交后使用 `gitlab-map` 或等效 GitLab 读接口确认可合并状态。
- 合并前必须区分“本轮提交范围”和“继承基线差异”；合法来源带来的额外历史提交只记录为继承基线差异，不阻断合并。
- 使用 GitLab 将已验证变更合并到 `develop`。
- 合并成功后，明确告知用户已经合并。
- 如果 `gitlab-mcp` 不可用或合并条件不满足，停止在提测 Wiki 之前。

参考：[gitlab-map.md](references/gitlab-map.md)

### 9. 准备提测 Wiki

- 只有变更已经合并到 `develop` 后，才允许准备提测 Wiki。
- `服务名称` 必须通过 `company-project-routing` 解析，不能直接复制项目名。
- 生成前先读取月目录和现有模块顺序，再确定插入位置。
- 必须按模板生成完整 Wiki 正文。
- 将最终 Wiki 内容展示给用户，并等待明确确认。

参考：[test-wiki.md](references/test-wiki.md)

### 10. 写回 TAPD

仅在用户确认后执行：

- 创建或更新提测 Wiki。
- Bug 评论正文必须严格写成 `提测wiki：[wiki链接]({wiki链接})`。
- 按需更新 TAPD 状态。
- Wiki、评论、状态更新尽量合并成一次确认。

### 11. 清理

- 确认 GitLab 合并、TAPD 写回、评论/状态更新和 worktree 清理都已完成。
- 汇报最终结果、运行过的测试、合并结果和剩余风险。

## 外部写入规则

- TAPD 写操作必须使用 TAPD MCP。
- 写入前必须展示将要写入的用户可见内容。
- 第 5 阶段通过且 `PRE_EDIT_GATE: PASS` 后，本地代码修改、测试、提交和合并准备不需要逐步确认。
- 合并到 `develop` 前，不得准备或写入提测 Wiki。
- 不生成 TAPD 专属过程文件；流程证据以阶段台账和阶段汇报为准。

## 参考文件加载

- 主流程展开：[workflow.md](references/workflow.md)
- 采集细则：[collector.md](references/collector.md)
- 规划细则：[planner.md](references/planner.md)
- 实现细则：[implementer.md](references/implementer.md)
- 评审细则：[reviewer.md](references/reviewer.md)
- GitLab 校验：[gitlab-map.md](references/gitlab-map.md)
- 提测 Wiki 模板：[test-wiki.md](references/test-wiki.md)
- 回归场景：[regression-scenarios.md](references/regression-scenarios.md)
