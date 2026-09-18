---
name: writing-plans
description: Use when a requirement or prototype must be routed to the affected project, scoped against current remote master code, reviewed in dialogue or a panel according to complexity, bound to a development branch, and turned into an executable Plan.
---

# Writing Plans

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) when selecting a
reviewer or considering escalation; the browser and Plan authorization gates
remain unchanged at every profile.

Turn a requirement or prototype into verified project scope and a branch-bound Plan ready for an implementation workflow. Do not turn uncertainty into implementation commitments.

Accept `phase=SCOPE_REVIEW|PLAN_WRITE|AUTO`. `SCOPE_REVIEW` stops after producing
the configured confirmed or proposed scope, `PLAN_WRITE` requires a confirmed scope plus validated branch
definitions, and `AUTO` may run both only when those branch definitions are
already available. End-to-end requirement implementation is orchestrated by
`zan-workflows:developing-requirement`.

Accept `confirmation_mode=STANDALONE|DEFER_TO_ORCHESTRATOR`, defaulting to
`STANDALONE`. Deferred mode returns a proposed scope for a combined downstream
checklist and must not ask a separate dialogue scope-confirmation question.

## 固定主流程

严格按以下顺序推进，不得先开面板、先定分支或先写 Plan：

1. 根据需求、PRD 或原型确定受影响项目；多项目时区分主项目、协同项目及各自责任边界。
2. 对每个项目获取并验证最新远程 `origin/master`，以远程代码和项目规则为基线收敛需求范围、功能点、现有能力、缺口及排除项；不得用当前本地开发分支替代基线。
3. 生成需求确认前检查清单，区分 `REQUIREMENT_BLOCKER`、`IMPLEMENTATION_BLOCKER` 和 `NON_BLOCKING`。
4. 根据范围复杂度选择评审模式：简单需求直接在对话中确认，复杂需求才开启评审面板。
5. 需求范围和上下文确认后，输出配置对应的 confirmed/proposed scope，交由分支绑定能力确定每个项目的 `CREATE|USE_EXISTING`、固定分支和基准。
6. 消费已验证的分支定义，基于确认范围、远程基线和项目上下文编写并确认 Plan。
7. 输出 branch-bound Plan；本技能不直接修改业务源码，端到端请求交回 `zan-workflows:developing-requirement` 编排执行。

以一个页面或模块为主要交付单元；模块必须具备可独立开发、对接和验收的内聚边界。拒绝项目级“大 Plan”；
跨项目需求允许一个协调范围，但每个项目必须有独立的仓库证据、分支绑定、交付单元 Plan、任务和验证方式。

## 启动确认

1. Read applicable `AGENTS.md`, dependencies, and existing constraints. Do not assume a component system.
2. 使用 `zan-workflows:workspace-project-knowledge` 从需求/原型路由受影响项目；目标明确时读取该项目知识，目标不明确时先完成项目归属判断，禁止全工作区盲搜。
3. 对每个候选仓库验证 Git root、origin 和远程 `master`，执行只读 fetch，并记录实际 `origin/master` SHA。源码搜索只在项目确定后进行。
4. 用 `origin/master` 中的路由、页面、组件、服务、API、状态与测试证据整理完整功能清单、排除项和未决问题。需求或原型描述与代码冲突时显式展示冲突，不自行选边。
5. 展示项目列表、远程基线、范围摘要和推荐评审模式。Resolve unresolved matters from evidence and ask only for missing decisions. If available, `superpowers:brainstorming` may assist; it is optional and must not launch a separate workflow.

在项目、远程基线和范围证据齐全前保持只读；此时不得创建分支、写 Plan 或改源码。
`phase=SCOPE_REVIEW` 不自行创建或选择分支。`STANDALONE` 在用户确认范围后返回；
`DEFER_TO_ORCHESTRATOR` 返回待清单确认的提案。

用户在 Agent 对话中说“漏了某功能”、追加需求或修正原描述时，继续当前评审，
不要求用户重新提供整份需求。Agent 对照完整功能清单识别新增、补充和受影响项，
展示增量及影响范围；复杂模式同步面板，简单模式直接在对话中更新；明确的补充直接处理，
只有语义冲突或缺少关键决定时才询问。

复杂模式未提交时补入当前轮；提交后的补充进入下一轮并保留原提交。简单模式保留
已确认的对话摘要并仅展示增量。两种模式都要保留未受影响功能的
编号、意见和结论，新增项待评审，业务行为改变时重开需求结论；只补技术证据或
实现方案时保留需求结论，并展示技术变更待复核。具体快照、合并与同步步骤见 [对话补充功能](references/feature-review-runtime.md#对话补充功能)。

## 产物位置规则

仅 `phase=PLAN_WRITE` 可以确认并写入产物位置规则。`SCOPE_REVIEW` 只读取现有规则、
检查已有 Plan/Draft 和文档目录并返回候选位置；不得写 `AGENTS.md`、创建目录或固化规则。

按“自动识别 → 推荐目录或手动指定 → 写入 Agent 文件 → 读取验证”解析产物位置，
不把某个固定目录写死在插件里。先读当前工具适用的 `AGENTS.md` 及其明确委托规则，
规则有效时直接复用；用户本次手动指定的位置优先于已有目录惯例或旧规则。

缺少规则时，依据只读证据检查已有 Plan/Draft 和文档目录，填充候选值并展示完整候选，
给出推荐理由和将写入的 Agent 文件。`SCOPE_REVIEW` 返回该候选并停止；`PLAN_WRITE`
在用户确认完整候选或手动指定明确位置后，
直接将规则固化至最近适用公共作用域的 `AGENTS.md`，随后重新读取并验证位置能够
唯一解析，才能继续使用正式规则。指定本身就是本次目录及规则写入授权，不再追加
“是否固化”的确认，也不再停留在临时候选状态。未经用户确认不得固化；这里的
确认包括明确手动指定，确认前不得固化，也不得视为正式规则。

推荐按项目实际目录组织，插件不得提供默认目录。Plan 和 Draft 的目录可以分别指定；
用户只给根目录时，Agent 结合项目惯例补齐命名、编号及子目录，并展示最终解析结果。
只有确有多解、作用域冲突或覆盖既有文件风险时才询问缺失信息。
位置规则确定与评审内容保存仍是两道独立门禁，确定目录不自动保存评审内容。
记录 Plan 路径模式、Draft OpenAPI 路径模式、交付单元命名、编号规则、路径变量与既有文件处理方式。
具体写入边界和字段见 [产物规则与评审卡规范](references/page-review-standard.md)。

## 范围与功能点

Read an existing Plan semantically when present; scripts must not parse Markdown. Record a Plan 内容指纹. 首次按功能模块与子模块全量整理，页面也是模块；后续默认查看新增、修改和未决项，同时保留完整模块清单。

每个功能点至少包含职责与边界、输入、输出、行为规则、验收例子、代码落点或缺口、来源证据和本次变更。
功能清单必须能回答“改哪个项目、为什么改、现有 `origin/master` 已有什么、还要增加什么、明确不改什么”。

新会话使用 `schemaVersion=2` 的模块卡。每张卡按“职责与范围 → 输入输出 → 行为规则与验收例子 → 待确认问题 → 本次变更”组织，内部实现默认折叠。只有职责、输入输出与验收能够独立说明时才拆子模块；布局、API、权限等技术维度是 Agent 后台检查清单，不再按维度或 API 消费点强制拆卡。

Agent 根据 [API 契约阶段](references/api-contract-stages.md) 建立消费需求清单，对已知消费点分类并开展正式来源搜索，形成接口事实清单。尚未查清的事实进入模块的待确认问题与实现阻塞项，不阻止用户评审已明确的功能行为。Treat 能力归属、运行时范围 and 本次交付关系 as separate facts; never assign an API to a page or module.

在任何范围确认或 `READY_FOR_CHECKLIST` 输出前，按
[需求确认前检查清单](references/requirement-readiness-checklist.md) 汇总所有已确认、缺失和冲突项。
`REQUIREMENT_BLOCKER` 未清零时范围保持 `PENDING|BLOCKED`；仅有
`IMPLEMENTATION_BLOCKER` 时允许确认需求，但实现方案必须保持 blocked，禁止进入实施。

For every module card, build the canonical `implementationPlan` from applicable 项目规范、依赖、现有源码、PRD、原型和 API 证据. Use the compact four-block contract in [产物规则与评审卡规范](references/page-review-standard.md). 实现证据不足时设 `implementationPlan.status=blocked` 并说明缺口；需求 `conclusion` 独立，允许需求“已确认”同时实现方案待补充，不自动把需求改为“阻塞”。需要用户决定的行为问题和 Agent 能自行查证的技术问题分别标明责任方。

Keep the page state only as “评审中” or “阻塞” while reviewing. 不得生成 Draft OpenAPI. Use [状态模型](references/status-model.md) for evidence gates and objective counts; never report a single page completion percentage.

## 评审模式选择

完成项目定位和远程 `master` 范围分析后再选择模式，并记录选择理由：

- `DIALOGUE`：单项目、单一内聚页面/模块、功能点较少、关系清晰，且没有需要逐项收集的多组业务决定。直接在对话中展示范围、功能点、排除项、未决问题和实现摘要，用户一次确认或给出增量修正即可。
- `PANEL`：涉及多项目、多页面/子模块、较多独立功能点，或存在复杂状态、跨模块依赖、API/权限/路由冲突及多轮独立决策。使用评审面板逐项确认。

不要只因存在原型、API 或多个技术维度就开启面板；也不要为了省事把复杂需求压缩成一次对话确认。
简单模式在范围扩大后可以升级为面板模式，并保留已确认的功能清单和来源证据。

## 简单需求：对话模式

在对话中给出受影响项目与 `origin/master` SHA、范围、功能点、排除项、实现摘要，以及完整的需求确认前检查清单和推荐分支动作。
`STANDALONE` 由用户确认该摘要后进入“开发分支与 Plan”；
`DEFER_TO_ORCHESTRATOR` 不单独提问，把摘要交给需求开发清单统一确认。两者都无需打开
in-app 浏览器、注入 Shadow DOM、启动通知桥或要求统一提交。
用户的增量修正只重开受影响项；没有冲突时不重复确认整份范围。

## 复杂需求：功能评审运行协议

只有选择 `PANEL` 后，才按 [功能评审运行协议](references/feature-review-runtime.md) 打开 Codex in-app Browser、动态注入现有 Shadow DOM 面板、验证挂载并等待统一提交。选择 `DIALOGUE` 时禁止仅为形式完整而启动面板。

原型来源可以是远程 HTTPS 页面、现有 loopback 页面或本地文件。远程原型直接在
in-app Browser 打开；本地文件才启动临时 loopback 服务。使用运行协议中的来源
安全门禁、登录态恢复和跨域 iframe 降级规则，不得把原型 URL 写入 ReviewSession
或 Plan。

消费项目 dev server、build 和运行态验收不是功能评审前置条件。没有当前 Browser、host、Shadow Root、临时 API 和当前提交证据时，只能报告“评审阻塞”，不得用独立 HTML、静态代码评审、截图或文字结论替代面板。

挂载后在支持 `codex queue` 的本机环境默认连接 [自动通知桥](references/feature-review-runtime.md#连接自动通知)。
面板统一提交、用户确认更新 Plan 时通知当前 Agent 任务继续；先检查连接成功，才能
显示“自动通知已连接”。通知只负责续接，Agent 仍须读取当前页面提交与确认请求。
连接不可用或投递失败时保留意见，明确提示回到对话继续，不把入队当成已处理或已保存。

## 统一提交评审

`PANEL` 模式仅在用户统一提交后处理本轮输入；展示拟更新内容、保留评审状态且不写文件。
`DIALOGUE` 的 `STANDALONE` 模式以用户对范围摘要的明确确认作为等价门禁；
`DEFER_TO_ORCHESTRATOR` 由组合清单确认，不要求单独的统一提交按钮。两种模式均不得在范围确认前写 Plan。
不得在确认前写 Plan。

## 开发分支与 Plan

范围与上下文确认后，才处理开发分支和 Plan：

1. `phase=SCOPE_REVIEW` 返回 `ConfirmedRequirementScope` 并停止；不得自行越过分支绑定门禁。
2. `phase=PLAN_WRITE` 消费 `zan-workflows:preparing-work` 产生的已验证 `TapdWorkDefinition`，重新读取项目 Git 规则、实际 origin、最新 `origin/master` SHA 和工作区状态。
3. 要求每个受影响项目都有精确分支动作 `CREATE|USE_EXISTING`、固定分支和基准；不得先创建分支再倒推范围，也不得用推荐分支冒充已验证绑定。
4. 检查已确认范围与分支现有差异是否重叠；冲突、混入无关改动或远程基线变化时停止并重新展示影响。
5. 按产物位置规则生成 Plan，记录项目、仓库、`origin/master` 基线、开发分支、功能点、代码落点、任务顺序、验证方式、风险和未决项。
6. `DIALOGUE` 模式展示 Plan 摘要并取得明确确认；`PANEL` 模式使用已回填结果和“确认更新 Plan”门禁。写入后读回核对。

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update. This is separate from confirmation of the 产物位置规则 and development branch binding.

Use the human-readable [页面交付 Plan 模板](assets/page-delivery-plan-template.md) only after both the project location rule and this update are confirmed. 按模块原样保存需求、验收例子、`reviewConclusion`、实现方案、未决事项与本轮变更。需求已确认但实现 `blocked` 时允许阶段保存，明确缺口且不得标为可实施；`ready` 方案仍须保留一句话摘要、四块实施内容与证据。规范化校验模型使用 `schemaVersion=3`，兼容旧版 `2` 的阶段保存；适用模块仍有未解决 `questions` 时不能进入可实施。Markdown 中不嵌入 JSON。保持同一模块一份 Plan、稳定编号与明确双向关联。用户确认只表示允许写入，Agent 写入并读回核对后调用 `markPlanSaved`，面板才显示“已保存”。

## 输出契约与交接

`SCOPE_REVIEW` 返回需求身份、受影响项目、每个项目的 origin/master SHA、范围、功能点、
排除项、代码证据、评审模式、风险、未决问题、检查清单、
`requirement_blocker_count`、`implementation_blocker_count` 和 `implementation_ready`。
`STANDALONE` 返回
`ConfirmedRequirementScope`，终态为 `CONFIRMED|PENDING|BLOCKED`；
`DEFER_TO_ORCHESTRATOR` 返回 `ProposedRequirementScope`，终态为
`READY_FOR_CHECKLIST|PENDING|BLOCKED`。

`PLAN_WRITE` 返回一个 branch-bound `ConfirmedRequirementPlan`：上述范围、每个项目的已验证
`TapdWorkDefinition`、Plan 路径/指纹、任务顺序、验证方式和 `PLAN_READY|PENDING|BLOCKED`。

Plan 写入并读回通过后交回调用方。端到端需求由 `zan-workflows:developing-requirement` 将
`ConfirmedRequirementPlan` 和对应 `TapdWorkDefinition` 交给 `zan-workflows:implementing-work`。

仅评审或仅编写 Plan 的请求不自动授权实施、提交代码、合并或发布；此时交回已确认 Plan 或明确未决事项。
任何实施请求也不自动授权提交、推送、MR、部署或发布，这些操作继续遵循各自门禁。可用时选用
`superpowers:writing-plans`、`superpowers:subagent-driven-development` 和
`superpowers:verification-before-completion`；缺失时直接使用当前 Agent 的规划、实施与验证能力，
保留同样的用户授权与证据要求，不要求为评审安装额外插件。

## 运行能力

本技能自带面板脚本，不依赖 Superpowers 才能运行。只有选择 `PANEL` 时才检查当前环境是否提供
in-app Browser 导航、页面脚本执行（支持注入与调用 API）、DOM 检查和真实用户交互能力；
`DIALOGUE` 模式不以浏览器能力为前置条件。
只有只读 evaluate 时不得假装已完成注入；使用环境正式提供的页面执行能力，例如
浏览器 CDP。浏览器能力不足时列出缺失能力与恢复方式；已完成的只读需求整理可保留，
但不能把它称为完成可视化评审。完整调用协议见
[功能评审运行协议](references/feature-review-runtime.md)。

自动通知使用自带 `scripts/review-wake-bridge.mjs` 和本机 `codex queue`；桥接仅在本轮
评审期间运行，默认 2 小时，不安装系统守护进程。缺少 CLI 能力或浏览器策略阻止连接时
使用人工续接，不能绕过 CSP 或浏览器安全设置。桥接配置与令牌不得进入评审数据或日志。
