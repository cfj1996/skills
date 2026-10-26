---
name: merge-request-review
description: Use when the user asks to find, review, or remotely merge open GitLab merge requests, checking scope, correctness, engineering design and impact across project types, with project-specific delivery and Zan checks only when applicable.
---

# 合并请求 Review

主代理模型配置按阶段动态路由：发现阶段默认 `BALANCED`；高风险审核和所有合并决策使用
`CRITICAL`。reviewer 子代理的模型由运行环境默认分配。选择 reviewer 子代理前读取共享
[model-routing policy](../../references/model-routing.md)。
所有 GitLab 读写同时遵循共享
[tool-routing policy](../../references/tool-routing.md)：GitLab MCP 优先，浏览器不是默认降级路径。

## 定位

这个技能处理用户指定或按明确范围发现的 GitLab MR，适用于 B 端、C 端、小程序、
后端、工具包和工程配置等项目，固定分成三步：

1. 获取有哪些需要用户合并的 MR。
2. 对这些 MR 或用户指定的 MR 做 code review，输出审核报告。
3. 对已审核的 MR 或用户指定的 MR 做远程合并。

三步可以串联执行，也可以单独执行。不要把“发现 MR”“审核 MR”“合并 MR”混成一个隐式动作。

默认只执行用户明确要求的步骤。只有用户明确说“合并”“自动合并”“合并通过的”“审核通过就合并”等合并意图时，才进入第 3 步。

## 审核范围与项目身份

不设团队、管辖项目或 B 端白名单；不依赖旧管辖配置，也不要求项目先登记到知识库。
按请求选择最小明确范围，再通过 GitLab 实时读回核实 host、project id/path 与 MR iid：

- 指定 MR URL、`project!iid` 或项目路径时，只处理指定对象；简称或多 host 有歧义时先查证，仍无法唯一解析才询问。
- “当前项目”从当前仓库已核实的 remote 解析；多个 remote 不得凭目录名猜测。
- “需要我处理/合并”从 GitLab 当前账号及 reviewer、assignee、approval 等实际关系发现；
  maintainer/owner 权限可说明处理资格，但不单独证明每个 MR 都需要当前用户处理。
- 未提供对象时，复用当前对话已确定的项目/MR；没有明确上下文才补问范围。
  不默认遍历账号全部可访问项目，也不以旧名单补齐范围。
- 团队/人员筛选仅在用户提出时使用经核实的账号；未知身份不能从邮箱、显示名或提交人推断。
- 项目可读即可进入审核；没有合并权限不妨碍只读审核。权限不足、对象不存在或身份无法核实要说明实际缺口。

沿用现有分支边界：只处理目标为 `master` 或 `main` 的 open MR。
项目规则、CI 和实际 diff 决定专项检查；公司项目可用知识库补充上下文。
知识库未登记或不可用本身不阻断普通审核；适用标准或关键代码证据缺失仍须如实报告。

## 审核模式与结论模型

先按项目及实际受影响的采用范围执行 Adoption preflight，再决定审核模式。使用本技能的
`scripts/review-policy.mjs classify-adoption` 固化分类，详细检查方法见
[Zan conformance review reference](references/zan-conformance.md)：

- `ordinary` / `not-adopted`：项目没有声明接入 Zan。执行完整普通 code review，不要求 Zan 路由、矩阵或声明命令；未接入本身不阻断代码结论或合并。
- `zan-enhanced` / `adopted`：适用的 `AGENTS.md` 与有效 `StandardAdoption` 均存在。普通审核之外执行 Zan changed-file 路由、矩阵及声明的 `typeCheckCommand`、`testCommand`、`conformanceCommand`；`MUST fail/unknown` 阻断合并。
- `ordinary-with-zan-warning` / `misconfigured`：项目已声明或部分接入 Zan，但 Adoption 无效或缺件。代码审核继续并独立给结论；治理配置异常单独阻断合并。
- `ordinary-with-zan-warning` / `unknown`：工具或权限导致无法判断接入状态。代码审核继续；在状态可确认前，治理证据不足单独阻断合并。

受影响范围内 `AGENTS.md` 和 Adoption 都不存在时必须判为 `not-adopted`，不能判为“Zan 配置缺失”。
monorepo 按继承规则和 Adoption 范围分类；同仓库无关子项目的采用或配置问题不传播。
分类时显式传 `adoptionScope=applicable|not-applicable|unknown`，保留真实文件状态和声明。
排除范围必须附 `scopeEvidence`；范围未知或排除依据缺失仍为 `unknown`，不能豁免治理检查。
多范围 MR 保留各范围结果：任一适用范围 `misconfigured/unknown` 时治理阻断；否则有
`adopted` 时使用增强模式且矩阵只覆盖采用范围，全为 `not-adopted` 时使用普通模式。

代码结论和合并资格必须分开：

- `代码结论`：`通过`、`不通过`、`未完成`，只由 diff、调用链、运行/测试证据和可复现问题决定。
- `合并资格`：`可合并`、`不可合并`，由代码结论、安全、mergeability、项目明确要求的 pipeline/approval/discussion 门禁，以及适用时的 Zan 门禁共同决定。
- 范围、影响与文档一致性也是独立合并条件，按下文统一计算；文档漏记本身不改写
  代码结论。确认代码缺陷才判代码不通过，关键正确性证据不足才判未完成。
- `pipeline = none` 只是“未观察到 pipeline”。除非项目或 GitLab 规则明确要求 pipeline，否则不能单独阻断。
- 后端/YApi 契约不可见时，只在它确实导致关键正确性无法判断时将代码结论标为 `未完成`；不得把所有接口改动一律暂缓。

**安全硬限制（禁止 develop 合并）**：
- 本文 `develop` 同时包含工作区约定的 `dev` 别名；核实实际 ref 和历史。
- **绝对不允许** `develop` 分支作为源分支合并到任何目标分支。
- **绝对不允许** MR 提交历史中包含来自 `develop` 分支的合并记录（Merge commits）。
- 违反上述规则立即阻断合并，记录 `safety` 和“安全违规：禁止合并 develop 分支及其历史”。
  可以停止审核并将代码结论标为 `未完成`；已有充分代码评审结论则保留，不能仅凭分支历史判代码不通过。

目标分支不是 `master` / `main` 的 MR 必须跳过，并在结果说明中写明原因。

“需要我合并”的判定：

- 优先读取 GitLab 当前用户、reviewer、assignee、approval、maintainer/owner 权限和项目成员信息。
- 如果工具不能判断当前用户身份或处理关系，只在已明确的项目范围列出候选并标注“与当前用户的处理关系待核实”；
  无项目范围时补问目标，不报告“没有待处理 MR”，也不回退到管辖名单。
- 如果用户指定了 MR，则只处理指定 MR；目标分支或 open 状态不符的指定 MR 仍需明确标注原因。

## 工具优先级

1. 优先使用 GitLab MCP 查询项目、MR、diff、讨论、pipeline、approval、mergeability 和执行远程合并。
2. 如果当前会话没有可用的 GitLab MCP 查询能力，先用 `tool_search` 查找 GitLab 相关 MCP 工具。
3. 如果 GitLab MCP 不能列出 MR，但可获取单个 MR，允许用 GitLab REST 或本地仓库只读 ref 作为审核补充来源；合并动作仍优先走 GitLab MCP。
4. 页面抓取只能作为最后补充，不作为合并前的唯一依据。

本地仓库仅用于只读 diff 和上下文检查。不要为了审核切换用户工作区分支；优先 fetch MR refs 或使用 `git show <ref>:<path>`。

## 第 1 步：获取待合并 MR

触发语义包括“有哪些需要我合并的 MR”“获取待合并 MR”“列一下这个项目的 MR”等。

收集候选 MR：

- `state = opened`
- `target_branch in ["master", "main"]`
- `source_branch != "develop"`（安全违规项，需显式标注）
- 位于本次请求明确的 MR/项目范围，或经核实的当前用户处理列表
- 查询“需要我处理”时保留有 reviewer / assignee / approver 关系证据的 MR；
  指定项目/MR 时不再按当前用户或团队关系过滤

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

先按 host/project 分组，复用仓库身份和公共门禁；Adoption 分类与规则包按实际受影响
子项目/采用范围分别建立，读取该范围继承的项目规则、声明及例外。范围不同的 MR
不共享同一个 Adoption 结论，分类器输入必须来自实际文件、声明和独立的范围适用性判断。
公司项目需要知识补充时，通过 [workspace-project-knowledge](../workspace-project-knowledge/SKILL.md)
获取：传入 canonical 项目/子项目、审核问题和 `purpose: review`，复用有效 `KnowledgeContext`。
由该入口选择 Hub 或本地来源，不重复 provider 查询；未登记项目可直接使用 GitLab 上的仓库规则、
文档、CI 和审核版本源码，不将知识库登记设为准入条件。生成 project preflight packet，至少包含：

- project id/path、目标分支 SHA、接入模式、各范围 `adoptionScope/scopeEvidence` 及判定证据；
- 受影响的项目类型、从 diff/调用链选择的专项检查，以及文档/交付要求的适用依据；
- 项目明确声明的 pipeline/approval/test 要求；
- 已取得的项目上下文（来源/版本、证据和缺口；有 `KnowledgeContext` 时复用）及适用标准资源路径；
- 公共缺口与读取时间。

每个 MR 再生成绑定 HEAD SHA 的 review packet，包含 diff、changed files、提交历史、pipeline、discussion、approval 和 mergeability。Reviewer 优先消费 packet，不重复加载 workspace 规则、项目路由、公共配置和无差异的标准资源。知识中的实现线索必须在该 MR HEAD 的源码核验；版本未知、范围不明或未命中不能证明代码缺陷或功能不存在。Hub 不可用本身不阻断审核，有等价证据时继续；关键代码证据仍不足时按现有规则标记 `未完成`。

### 修改依据、影响和适用文档核对

对 ordinary 和 zan-enhanced 都应用 [变更与文档一致性](../../references/change-consistency.md)。
主代理先读取 MR 描述、讨论及准确关联的 Issue、需求、设计文档或已确认反馈，核实本次目标、
验收和排除范围；MR 描述可作为明确修改依据，不强制补建 TAPD。缺少关键业务决定时报告缺口，
不能仅从 diff 倒推获准范围。再按项目规则、变更性质和已确认交付要求判断文档适用性：

- 属于 TAPD 提测/上线流程且要求 Wiki 时，经 TAPD 核实工作项、Task 父需求、Wiki 归属及
  当前仓库/原分支条目；无直接链接时沿准确工作项详情/评论追溯已有页。同 MR 多工作项逐项核对。
- 普通项目检查实际要求的 API/使用说明、迁移说明、变更记录等；没有 TAPD/Wiki 不构成缺陷。
- 明确 NO_WIKI 只免除该 Wiki 要求，其他适用文档仍需核对；确认无文档要求时，可用
  `NOT_APPLICABLE` 并附项目规则/实际影响依据。要求是否适用仍未知、必需文档找不到或内容过期时，
  分别报告 unknown/fail，不能以未找到文档冒充不适用。

只读当前及实际相关条目；不猜测文档归属，不在 Review 中新建或修订文档。

packet 增加修改依据/已确认反馈来源、当前完整 diff、重要行为变化及影响/验证、适用文档
正文与条目标识/指纹、文档适用性和缺口。普通和高风险 reviewer 都独立返回
`changeReview` 的 scope、impact、documentation 及具体 evidence，不能以 Wiki 声明
替代范围批准，不能以目录/行数小推断无影响。已批准的必要技术调整允许有明确理由。
缺少文档不等于不适用；文档豁免须有上述范围依据，不免除修改依据和影响核对。

主代理用当前 source/target SHA 和所需范围文档/条目的指纹形成 `currentChange`，
将其与 reviewer 的 `changeReview` 及既有检查传给
`scripts/review-policy.mjs evaluate-merge`。缺项、fail、unknown 或版本变化均阻止
可合并结论；在现有报告中列 `change-scope`、`change-impact`、`change-documentation`
及对应 unknown/stale 阻断。评审完成后补文档只重新核对相关覆盖，不能解除其他阻断。

适用的项目规则、Adoption、标准原文、分支 SHA 和 GitLab 实时门禁仍从权威来源精确读取；
`KnowledgeContext` 不替代这些检查，也不要求 reviewer 重跑全部 preflight。

仅当受影响的采用范围、继承规则、Adoption/Exception 及其版本均匹配时，才复用该范围
preflight。MR 改变这些文件或涉及新的子项目时补充分类；根文件未变不能证明子项目结论可复用。

### 并行审核策略

委派前先根据 MR 元数据、改动文件和 diff 做只读风险分类：

- `HIGH`：changed hunk 实际修改权限/鉴权判断、租户或站点标识、支付/订单/账务/库存/结算计算、敏感数据访问、删除/批量写入、环境/部署配置、关键接口 payload/schema、公开包 API/导出兼容性、持久化迁移、关键并发/重试机制，或需要跨模块数据流推理的大型 diff。
- `ROUTINE`：改动边界清晰的 UI、文案、样式、展示分组或局部逻辑，且不修改上述关键行为。
- “优惠券”“订单”等业务域名称只能作为初筛信号，不能脱离 changed hunk 的真实行为单独升级为 `HIGH`。ROUTINE reviewer 发现真实高风险信号时必须升级。

按风险选择本技能目录中的角色：

- `ROUTINE` 使用 `agents/mr-code-reviewer.md`。
- `HIGH` 使用 `agents/mr-critical-reviewer.md`。
- 启动 reviewer 子代理时不指定 `model` 或 `reasoning_effort`，角色文件也不绑定模型；由运行环境按默认机制分配（包括继承主代理模型的情况）。审核角色和证据门槛仍由风险分类决定。
- 只有一个 MR 时，如果 subagent 可用也按风险选择对应角色；不可用时由主代理按相同检查项串行审核。
- 两个及以上 MR 时按 MR 粒度并行，最多同时启动 6 个 reviewer；超过 6 个时先处理 `HIGH` 和改动最大的 MR，再继续下一批。
- 不能因为并发额度、实际分配的模型或成本考虑把 `HIGH` 降为 `ROUTINE`。子代理不可用时，由主代理按 `HIGH` 规则串行审核，不降低证据门槛。

并行审核要求：

- 每个 subagent 必须以 code review 为唯一职责，只负责自己分配到的 MR，不合并、不 approve、不修改文件；分配内容必须包含风险分类及触发依据。
- 分配任务时提供 project preflight packet、项目名、MR iid、target branch、source branch、HEAD SHA、review packet 和必要上下文；不要要求 reviewer 重读已验证的公共材料，也不要把其他 MR 的代码结论泄漏给它。
- 子代理输出必须包含：`MR（项目名称+id）`、`审核模式`、`Zan 状态`、`代码结论（通过/不通过/未完成）`、`合并资格（可合并/不可合并）`、`合并阻断项`、`主要问题`、`证据`和`审核使用的 HEAD SHA`。只有存在 MR 自身可操作的阻断时才生成 GitLab 打回说明。
- 主代理负责汇总、去重、解决结论冲突，并输出最终审核报告表。
- 如果同一个 MR 有多个代码结论，以更保守结论为准：`不通过` 优先于 `未完成`，`未完成` 优先于 `通过`。
- 如果 subagent 超时或失败，对应 MR 标记为 `代码结论：未完成；合并资格：不可合并（code-review-incomplete）`，除非主代理已经完成等价审核。

审核统一使用 [检查范围与意见判定](references/review-checklist.md)。普通与高风险 reviewer
共用通用检查，按实际 changed hunk、调用链和运行平台加载专项；跨类型变更组合检查。
工程设计是通用检查的一部分，高风险增加关键路径深度，不把普通审核缩成 UI/样式检查。
提交历史中的 develop 违规继续单独阻断，注明具体路径。

只有 `zan-enhanced` 模式必须附加 Zan 合规矩阵，至少包含 `Rule ID`、`MUST`/`SHOULD`、changed file:line 或 diff hunk、有效 Exception（如有）、`pass/fail/warning/unknown`、验证命令和输出证据。`MUST fail/unknown` 只改变合并资格，不覆盖独立代码结论；`SHOULD` 违反标为 warning。

审核报告表头固定为：

```markdown
| MR（项目名称+id） | 审核模式 | 代码结论 | 合并资格 | 主要问题 |
| --- | --- | --- | --- | --- |
```

代码结论使用：

- `通过`：完成关键路径审核，未发现代码阻断。
- `不通过`：存在由本次 diff 引入或暴露的明确阻断问题，并有可定位证据。
- `未完成`：diff 或关键代码证据不可得、关键路径尚未审完，或必要契约确实使正确性无法判断。

合并资格使用：

- `可合并`：代码通过，安全与适用门禁均通过。
- `不可合并`：列出精确阻断项，例如 `code`、`safety`、`pipeline-failed`、`mergeability`、`zan-must` 或 `zan-governance`。

主要问题必须简短具体。没有问题时写 `未发现阻断问题`；不要写泛泛的“建议加强测试”当作主要问题。
有实际意见时按“必须修复、优化建议、需要重新设计、证据不足”标注，给出依据和是否阻断。
优化建议通常不阻断；重新设计必须说明现方案的问题、局部修复为何不足和调整边界。
不为填满分类制造意见；代码缺陷、标准门禁和证据缺口分别影响其对应结论。

### 阻断详情

重点展开代码 `不通过/未完成` 和 MR 自身的合并阻断。相同项目的公共 Zan 状态、pipeline 策略或项目配置只汇总一次，不为每个 MR 重复生成打回理由。

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
- 重新读取目标 SHA、范围依据和适用文档条目，更新 `currentChange` 并再次执行
  evaluate-merge；绑定变化先核对并刷新受影响检查。整页的无关项目/业务合并状态
  变化不自动使代码评审失效，写入防覆盖仍按整页指纹处理。
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
