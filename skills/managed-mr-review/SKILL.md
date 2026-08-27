---
name: managed-mr-review
description: 管理由 centralized project-knowledge 配置解析的管辖项目 GitLab MR；未接入 Zan 的项目执行普通审核，已接入项目追加 Zan 合规门禁，并在明确授权后远程合并。
---

# 管辖项目 MR 审核

## 定位

这个技能用于管理用户管辖项目的 GitLab MR，固定分成三步：

1. 获取有哪些需要用户合并的 MR。
2. 对这些 MR 或用户指定的 MR 做 code review，输出审核报告。
3. 对已审核的 MR 或用户指定的 MR 做远程合并。

三步可以串联执行，也可以单独执行。不要把“发现 MR”“审核 MR”“合并 MR”混成一个隐式动作。

默认只执行用户明确要求的步骤。只有用户明确说“合并”“自动合并”“合并通过的”“审核通过就合并”等合并意图时，才进入第 3 步。

## 配置与仓库范围

在第 1 步前必须解析并校验
`${PROJECT_KNOWLEDGE_ROOT}/workflows/managed-mr-review/config.yaml`（`kind: ManagedMrReviewConfiguration`）。
`${PROJECT_KNOWLEDGE_ROOT}` 从当前工具的 workspace entry file 或环境配置解析；无法解析时立即标记为“暂缓：project-knowledge 不可用”。

- 管辖项目只来自 `spec.governedProjects.include`，项目路径和 GitLab project path 再从其 `source` 指向的 `data/workspace/project-relations.yaml` 解析。
- 配置缺失、项目无法解析或配置校验失败时，必须明确报告并跳过该项目；禁止恢复到 skill 文档、历史记忆或任何内置白名单。
- 只处理解析后目标分支为 `master` 或 `main` 的 open MR。

团队身份同样只来自 `spec.team`。`personId` 用于区分重复或不完整姓名；`gitlabUsername: null` 必须保持未确认，不得从提交人、邮箱或显示名推断。

## 审核模式与结论模型

先按项目执行一次 Adoption preflight，再决定审核模式。使用本技能的
`scripts/review-policy.mjs classify-adoption` 固化分类，详细检查方法见
[Zan conformance review reference](references/zan-conformance.md)：

- `ordinary` / `not-adopted`：项目没有声明接入 Zan。执行完整普通 code review，不要求 Zan 路由、矩阵或声明命令；未接入本身不阻断代码结论或合并。
- `zan-enhanced` / `adopted`：根 `AGENTS.md` 与有效 `StandardAdoption` 均存在。普通审核之外执行 Zan changed-file 路由、矩阵及声明的 `typeCheckCommand`、`testCommand`、`conformanceCommand`；`MUST fail/unknown` 阻断合并。
- `ordinary-with-zan-warning` / `misconfigured`：项目已声明或部分接入 Zan，但 Adoption 无效或缺件。代码审核继续并独立给结论；治理配置异常单独阻断合并。
- `ordinary-with-zan-warning` / `unknown`：工具或权限导致无法判断接入状态。代码审核继续；在状态可确认前，治理证据不足单独阻断合并。

`AGENTS.md` 和 Adoption 都不存在时必须判为 `not-adopted`，不能判为“Zan 配置缺失”。只有“已声明但损坏”或“无法读取”才进入治理暂缓。

代码结论和合并资格必须分开：

- `代码结论`：`通过`、`不通过`、`未完成`，只由 diff、调用链、运行/测试证据和可复现问题决定。
- `合并资格`：`可合并`、`不可合并`，由代码结论、安全、mergeability、项目明确要求的 pipeline/approval/discussion 门禁，以及适用时的 Zan 门禁共同决定。
- `pipeline = none` 只是“未观察到 pipeline”。除非项目或 GitLab 规则明确要求 pipeline，否则不能单独阻断。
- 后端/YApi 契约不可见时，只在它确实导致关键正确性无法判断时将代码结论标为 `未完成`；不得把所有接口改动一律暂缓。

**安全硬限制（禁止 develop 合并）**：
- **绝对不允许** `develop` 分支作为源分支合并到任何目标分支。
- **绝对不允许** MR 提交历史中包含来自 `develop` 分支的合并记录（Merge commits）。
- 违反上述规则的 MR 必须立即跳过或判定为 `不通过`，并在结果中明确写明“安全违规：禁止合并 develop 分支及其历史”。

目标分支不是 `master` / `main` 的 MR 必须跳过，并在结果说明中写明原因。

“需要我合并”的判定：

- 优先读取 GitLab 当前用户、reviewer、assignee、approval、maintainer/owner 权限和项目成员信息。
- 如果 GitLab 工具不能判断当前用户身份或权限，则以 project-knowledge 配置解析出的管辖范围列出目标分支为 `master` / `main` 的 open MR，并在结果里标注“按 project-knowledge 管辖范围判定”。
- 如果用户指定了 MR，则只处理指定 MR；范围外或目标分支不符的指定 MR 仍需明确标注原因。

## 工具优先级

1. 优先使用 GitLab MCP 查询项目、MR、diff、讨论、pipeline、approval、mergeability 和执行远程合并。
2. 如果当前会话没有可用的 GitLab MCP 查询能力，先用 `tool_search` 查找 GitLab 相关 MCP 工具。
3. 如果 GitLab MCP 不能列出 MR，但可获取单个 MR，允许用 GitLab REST 或本地仓库只读 ref 作为审核补充来源；合并动作仍优先走 GitLab MCP。
4. 页面抓取只能作为最后补充，不作为合并前的唯一依据。

本地仓库仅用于只读 diff 和上下文检查。不要为了审核切换用户工作区分支；优先 fetch MR refs 或使用 `git show <ref>:<path>`。

## 第 1 步：获取待合并 MR

触发语义包括“有哪些需要我合并的 MR”“获取待合并 MR”“列一下管辖项目 MR”等。

收集候选 MR：

- `state = opened`
- `target_branch in ["master", "main"]`
- `source_branch != "develop"`（安全违规项，需显式标注）
- 项目名在仓库范围内
- 如工具支持，优先保留和当前用户 reviewer / assignee / approver / maintainer 权限相关的 MR

对每个候选 MR 至少读取：

- 项目名、MR iid、标题、作者、创建时间
- source branch、target branch
- 当前 HEAD SHA
- mergeability / conflict 状态
- pipeline、approval、未解决讨论摘要（工具可用时）

输出表格：

```markdown
| MR（项目名称+id） | 标题 | 作者 | 目标分支 | 状态 | 需要我处理的依据 |
| --- | --- | --- | --- | --- | --- |
```

状态建议使用：

- `待审核`：可进入第 2 步 code review。
- `暂缓`：缺少必要状态、冲突、pipeline/讨论状态不明，或工具不可用。
- `跳过`：范围外、目标分支不是 `master` / `main`、不是 open MR。

第 1 步只负责发现和归类，不输出“审核通过/不通过”结论，除非用户同时明确要求进入第 2 步。

## 第 2 步：Code Review 审核

触发语义包括“审核这些 MR”“review 指定 MR”“对上面 MR 做 code review”“输出审核报告”等。

输入来源可以是：

- 第 1 步得到的候选 MR。
- 用户明确指定的 MR，例如 `project!123`、MR URL、项目名 + iid。
- 用户说“这些 MR”时，沿用当前对话中最近一次第 1 步结果。

审核每个 MR 前重新读取 MR 最新状态和 HEAD SHA；如果和第 1 步记录不一致，仍可审核，但必须在报告里注明“发现后有新提交，以最新 SHA 审核”。

对每个 MR 收集：

- changed files 和 diff
- 关键上下文文件
- pipeline、approval、未解决讨论、mergeability（工具可用时）
- 当前 HEAD SHA

### 项目级 Preflight 与证据复用

先按项目分组，再为每个项目读取一次集中配置、项目 AI_CONTEXT、Graphify freshness、目标分支状态、项目审核模式和公共治理证据，生成 project preflight packet。每个 MR 再生成绑定 HEAD SHA 的 review packet，包含 diff、changed files、提交历史、pipeline、discussion、approval 和 mergeability。

Reviewer 优先消费 packet，不重复加载 workspace 规则、项目路由、公共配置和无差异的标准资源。如果 MR 修改了 `AGENTS.md`、Adoption，或其 HEAD 上这些文件与 project preflight 不同，必须为该 MR 重新分类；否则同一项目复用一次 preflight 结果。

### 并行审核策略

委派前根据 changed hunk 的真实行为分类：

- `HIGH`：实际修改权限/鉴权、租户/站点标识、金额或库存计算、敏感数据访问、删除/批量写入、关键接口 payload/schema，或需要跨模块数据流推理的大型 diff。
- `ROUTINE`：边界清晰的 UI、文案、样式、展示分组或局部逻辑。业务域名称本身不能单独升级风险。
- `ROUTINE` 使用 `agents/mr-code-reviewer.md`；`HIGH` 使用 `agents/mr-critical-reviewer.md`。两个及以上 MR 按 MR 粒度并行，最多 6 个。

并行审核要求：

- 每个 subagent 必须以 code review 为唯一职责，只负责自己分配到的 MR，不合并、不 approve、不修改文件。
- 分配任务时提供 project preflight packet、项目名、MR iid、target/source branch、HEAD SHA 和 review packet；不要要求 reviewer 重读公共材料，也不要泄漏其他 MR 的代码结论。
- 子代理输出必须包含：`审核模式`、`Zan 状态`、`代码结论（通过/不通过/未完成）`、`合并资格（可合并/不可合并）`、`合并阻断项`、`主要问题`、`证据`和 HEAD SHA。只有 MR 自身可操作的阻断才生成 GitLab 打回说明。
- 主代理负责汇总、去重、解决结论冲突，并输出最终审核报告表。
- 如果同一个 MR 有多个代码结论，以更保守结论为准：`不通过` 优先于 `未完成`，`未完成` 优先于 `通过`。
- 如果 subagent 超时或失败，对应 MR 标记为 `代码结论：未完成；合并资格：不可合并（code-review-incomplete）`，除非主代理已完成等价审核。

审核重点：

- **安全合规检查（最高优先级阻断项）**：检查 MR 提交历史，严禁包含任何来自 `develop` 分支的合并记录。如果发现 `develop` 被合并到了当前源分支中，必须判定为 `不通过` 并详细说明违规路径。
- 优先检查会阻断上线的问题：权限、数据污染、金额/库存/订单/账务逻辑、接口契约、路由、环境配置、兼容性、构建失败、类型错误、未处理异常。
- 对大型 MR 先看入口文件、权限边界、核心数据流和跨模块调用，再看样式和低风险细节。
- 对业务逻辑分支必须验证真实调用链可达性，不要只凭新增代码存在就下结论。
- 对阻断问题给出具体文件路径、函数/区域或 diff 依据；证据不足时写明缺口。

只有 `zan-enhanced` 模式必须附加 Zan 合规矩阵。`MUST fail/unknown` 只改变合并资格，不覆盖独立代码结论；`SHOULD` 违反标为 warning。

审核报告表头固定为：

```markdown
| MR（项目名称+id） | 审核模式 | 代码结论 | 合并资格 | 主要问题 |
| --- | --- | --- | --- | --- |
```

代码结论使用：

- `通过`：完成关键路径审核，未发现代码阻断。
- `不通过`：存在由本次 diff 引入或暴露的明确阻断问题，并有可定位证据。
- `未完成`：关键代码或必要契约确实不可得，导致正确性无法判断。

合并资格使用 `可合并` / `不可合并`，并列出精确阻断项，例如 `code`、`safety`、`pipeline-failed`、`mergeability`、`zan-must` 或 `zan-governance`。

主要问题必须简短具体。没有问题时写 `未发现阻断问题`；不要写泛泛的“建议加强测试”当作主要问题。

### 阻断详情

重点展开代码 `不通过/未完成` 和 MR 自身的合并阻断。相同项目的公共 Zan 状态或项目配置只汇总一次。

每个代码 `不通过` / `未完成` 或存在 MR 自身合并阻断的项目后追加详情块：

```markdown
#### <项目名>!<iid> 阻断理由

- 代码结论：不通过 / 未完成 / 通过
- 合并资格：不可合并
- 审核 HEAD：<sha>
- 阻断问题：
  1. <问题标题>
     - 证据：<文件路径:行号 或 diff 区域 / pipeline / discussion / mergeability>
     - 风险：<为什么会影响上线、数据、权限、订单、账务、接口契约或构建>
     - 建议：<需要作者怎么改，尽量具体到校验/分支/字段/调用链>
- 可贴到 GitLab 的说明：
  <一段简洁中文，说明为什么当前不能合并，以及作者需要修改什么>
```

详情要求：

- `不通过` 必须至少有一个明确阻断问题和证据；证据不足时应标为 `未完成`，不能强行判 `不通过`。
- 打回理由优先写真实风险，不写空泛建议；例如“可能有问题”不够，必须说明触发条件和影响面。
- 能定位文件时必须给文件路径和行号或 diff 区域；不能定位时说明证据来自 pipeline、未解决讨论、mergeability 或工具限制。
- 对同一 MR 的多个问题按严重程度排序，只保留足以支撑打回的关键问题，避免噪音。
- `通过` 且只有项目公共治理状态的 MR 只保留总表摘要；公共状态在项目级汇总一次。
- “项目未接入 Zan”不是作者需要修复的 MR 问题，不生成 GitLab 打回说明。

审核报告后补充摘要：

- 审核 MR 总数
- 代码通过数 / 不通过数 / 未完成数
- 可合并数 / 不可合并数及阻断类别
- 跳过项及原因
- 可进入第 3 步合并的 MR 列表

## 第 3 步：合并 MR

触发语义包括“合并审核通过的”“合并这些 MR”“合并指定 MR”“自动合并通过项”等。

合并输入可以是：

- 第 2 步审核结论为 `通过` 的 MR。
- 用户明确指定的 MR。

审核通过不等于自动合并。只有用户明确要求第 3 步时才执行合并。

如果用户指定 MR 但当前对话没有该 MR 的审核结论，先执行第 2 步的最小审核和第 3 步合并前检查；除非用户明确要求“跳过审核直接合并”，否则不要直接合并未审核 MR。

合并前必须逐个 MR 重新读取最新状态：

- **安全二次校验**：源分支不能是 `develop`，且提交历史中不能包含 `develop` 的合并记录。
- 最新 HEAD SHA 必须与审核时记录的 SHA 一致；如果变了，停止合并该 MR 并标记为 `暂缓：审核后有新提交，需重新审核`。
- 目标分支仍必须是 `master` 或 `main`。
- 状态仍必须是 open。
- 结论必须是 `通过`。
- mergeability 不能显示 conflict / cannot merge。
- 工具可见的 unresolved discussion 或 failed pipeline 如果会阻断合并，不能合并。
- `not-adopted` 不要求 Zan 矩阵或 Zan 命令；普通审核门禁通过即可进入合并。
- `adopted` 的 Zan 合规矩阵不得存在 `MUST fail/unknown`、无效 Exception 或缺少已声明命令证据。
- `misconfigured/unknown` 的代码结论保持有效，但治理状态阻断合并，直到配置或读取状态恢复。

合并动作优先使用 GitLab MCP：

1. 如可用，先调用 approve/review 通过接口。
2. 再调用 merge 接口，传入当前 SHA（工具支持时）、`auto_merge: true`（需要等待 pipeline 时）、`should_remove_source_branch: false`。
3. 以 GitLab 返回的 `state: merged`、`merged_at`、`merge_commit_sha` 作为成功证据。

如果 GitLab MCP 不可用或合并接口失败，不要声称已合并；在合并结果表中写明阻塞原因。只有用户明确允许等效 GitLab API fallback 时，才用 REST 合并。

自动合并后追加一个结果表：

```markdown
| MR（项目名称+id） | 合并结果 | 证据/原因 |
| --- | --- | --- |
```

## 输出要求

根据用户要求的步骤输出对应表格：

- 第 1 步：输出待合并 MR 发现表，不给审核通过结论。
- 第 2 步：输出代码审核与合并资格双结论表，再给精简摘要。
- 第 3 步：输出合并结果表，再给成功 / 未合并摘要。
- 如果用户要求三步一起执行，按第 1 步、第 2 步、第 3 步顺序分段输出。

不要输出长篇或重复的代码评审报告，除非用户要求展开某个 MR。对阻断问题给出文件路径、函数/区域或 diff 依据；无法定位时说明证据来源不足。项目级公共信息只输出一次。
