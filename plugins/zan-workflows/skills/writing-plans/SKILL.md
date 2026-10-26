---
name: writing-plans
description: Use when a requirement or prototype needs verified project scope and acceptance, with a concise execution brief for bounded work or a branch-bound formal Plan when planning depth requires it.
---

# Writing Plans

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) when selecting a
reviewer or considering escalation; the browser and Plan authorization gates
remain unchanged at every profile.

Turn a requirement or prototype into verified project scope and a branch-bound Plan ready for an implementation workflow. Do not turn uncertainty into implementation commitments.

按实际范围与已有产物选择所需深度，遵守
[执行流程](../../references/adaptive-workflow.md)。范围集中、行为与验收明确、
实施方式有证据且没有阻塞时，返回范围和内存 `implementationBrief`。
用户明确要求正式 Plan、需要 Task 写入或实际多人业务交付协调时，使用正式 Plan；已有
Plan/TaskBreakdown 延续其任务、阻塞和读回要求。不要为简短摘要创建模型、
文件或形式上的 Task，也不通过省略 Plan 绕过已有约束。验证根据实际风险
选择场景与证据，不增加流程档位或风险枚举。

Accept `phase=SCOPE_REVIEW|PLAN_WRITE|AUTO`. `SCOPE_REVIEW` stops after producing
the configured confirmed or proposed scope, `PLAN_WRITE` requires a confirmed scope plus validated branch
definitions, and `AUTO` may proceed to writing only after those definitions
are verified and confirmed. End-to-end requirement implementation is orchestrated by
`zan-workflows:developing-requirement`.
不需要正式 Plan 时，AUTO 在 SCOPE_REVIEW 返回 brief，不进入 PLAN_WRITE、
产物位置设置或 Task 创建。
For an orchestrator's `delivery_mode=BRANCH_ONLY` scope review, collect the
scope and branch-relevant evidence only. Retain implementation-only gaps
without requiring an implementation approach, brief or formal Plan; they do
not block an otherwise valid branch-only handoff.

Accept `confirmation_mode=STANDALONE|DEFER_TO_ORCHESTRATOR`, defaulting to
`STANDALONE`. Deferred mode returns a proposed scope for a combined downstream
checklist and must not ask a separate dialogue scope-confirmation question.

When handing scope or a Plan to an execution workflow, use the shared
[six-column checklist](../../references/execution-checklist.md):
`项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 待决事项`.
Before approval its visible title is 确定清单; only confirmed current content
is called 执行清单. The overview lists all actual execution projects, item,
links and goal. Merge/deployment choices are per project; the Story/Bug has
one Wiki choice and a shared multi-project template. Material changes return
to a complete 确定清单, preserving already-completed effects.
For selected TAPD Tasks, place a three-column `序号 | 标题 | 工时` table before
执行内容. Link real Tasks from their titles; subsequent checklist references
use stable `#F01`/`#F02` display indexes, distinct from detail `#01` and model
feature IDs. Preserve actual Task key/ID and Plan-step bindings internally;
the display indexes neither alter the model nor require new Tasks/estimates.
Prefix titles with the current operation 【新建】/【复用】/【调整】. Display only
one `N 小时` per hours cell, without estimate/remaining labels, multiple values
or before/after arrows. CREATE/UPDATE uses the confirmed final Task value;
REUSE uses its verified readback. Keep old values and remaining predictions
internal. Show only the Task list, with no totals, subtotals or missing-value
counts. Follow the shared checklist's unknown-value rules; predictions do not
overwrite Task estimates, add model fields or trigger date scheduling.
The checklist summarizes the same Plan content; it does not create a second
detail artifact. Long scope/approach/acceptance/decision cells use “详见下方 #01”
with a useful summary. Below the table, use only `### #01`, `### #02` headings,
number continuously across all projects, reuse a detail when appropriate and
leave short content unnumbered. Details can link to accurate locations in the
same existing Plan. Do not repeat 方案/验收/验证安排/分支安排 groups. Without a
Plan, show the brief or proposed body in these details or the existing panel;
never invent a file link or save a Plan before its gates merely to supply one.
Do not create a Plan merely for linking. The branch cell shows
新建/复用, the full target name and base ref; current branch, complete SHAs,
raw payloads and personnel checks stay internal unless needed. Exact branch,
write and readiness binding remains enforced. Necessary Task/Plan material
writes remain visible per project, including developer/hour/scope changes.
No business/implementation decision means 无; final execution approval is
separate. Render endpoint and actual risk in Chinese. The orchestrator also shows the three explicit
“合并与测试环境” choices: ordinary repair/development defaults all three to
需要, with a canonical Wiki template preview. Explicit implementation-only,
plan-only, branch-only or disabled choices override these defaults; unselected
Jenkins/Wiki is not queried. A selected Wiki adds its canonical template preview
before execution confirmation. Material scope/approach or delivery-choice changes
re-display the complete current checklist, writes and choices before confirming.
“合并并构建” means verified dev/develop plus
that project's Jenkins test environment, subject to later delivery write gates.
The main entry's complete confirmed execution checklist is reusable downstream
after exact scope comparison; technical PLAN/validation gates do not require a
new human turn. Standalone skills keep their own concrete-plan confirmation.
Evidence-based Wiki completion/IDs and approved automatic A → C → B handling
follow the shared confirmation-reuse contract without routine reapproval.
For Bugs, append the final TAPD target under 合并与测试环境 according to the shared
checklist; full test delivery targets 待测试, while implementation-only retains 修复中.

Reuse the orchestrator's evidenced TAPD/prototype, exact project,
`origin/master` SHA and scope when supplied. Refresh a mutable fact before a
dependent write or after an observed change; do not restart routing, fetch and
prototype inspection at every `SCOPE_REVIEW` / `PLAN_WRITE` handoff.

## 固定主流程

严格按以下顺序推进，不得先开面板、先定分支或先写 Plan：

1. 根据需求、PRD 或原型确定受影响项目；多项目时区分主项目、协同项目及各自责任边界。
2. 对每个项目获取并验证最新远程 `origin/master`，以远程代码和项目规则为基线收敛需求范围、功能点、现有能力、缺口及排除项；不得用当前本地开发分支替代基线。
3. 生成需求确认前检查清单，区分 `REQUIREMENT_BLOCKER`、`IMPLEMENTATION_BLOCKER` 和 `NON_BLOCKING`。
4. 根据范围复杂度选择评审模式：简单需求直接在对话中确认，复杂需求才开启评审面板。
5. 需求范围和上下文确认后，输出配置对应的 confirmed/proposed scope，交由分支绑定能力确定每个项目的 `CREATE|USE_EXISTING`、固定分支和基准。
6. 需要正式 Plan 时，消费已验证的分支定义，基于确认范围、远程基线和项目上下文编写并确认 Plan。
7. 输出范围与 brief 或 branch-bound Plan；本技能不直接修改业务源码，端到端请求交回 `zan-workflows:developing-requirement` 编排执行。

简短摘要在步骤 5 返回，包含行为、排除项、证据、有序步骤和验证入口/预期/局限，
由编排复用准备/分支门禁后实施；不创建 ReviewSession、PagePlan 或形式上的
TAPD Task，也不报告 PLAN_READY。正式 Plan 才继续步骤 6 及产物规则。

以一个页面或模块为主要交付单元；模块必须具备可独立开发、对接和验收的内聚边界。拒绝项目级“大 Plan”；
跨项目需求允许一个协调范围，但每个项目必须有独立的仓库证据、分支绑定、交付单元 Plan、任务和验证方式。

## 启动确认

1. Read applicable `AGENTS.md`, dependencies, and existing constraints. Do not assume a component system.
2. 使用 `zan-workflows:workspace-project-knowledge` 从需求/原型路由受影响项目；目标明确时读取该项目知识，目标不明确时先完成项目归属判断，禁止全工作区盲搜。
3. 对每个候选仓库验证 Git root、origin 和远程 `master`，执行只读 fetch，并记录实际 `origin/master` SHA。源码搜索只在项目确定后进行。
4. 用 `origin/master` 中与本次交付有关的路由、页面、组件、服务、API、状态与测试证据整理功能清单、排除项和未决问题。UI/交互任务先核对现有页面与数据绑定；只有新增或改变实际网络消费时才展开接口契约搜索。需求或原型描述与代码冲突时显式展示冲突，不自行选边。
5. 展示项目列表、基准 ref、范围摘要和中文评审方式；完整 SHA 留内部，出现差异或用户核查时再披露。Resolve unresolved matters from evidence and ask only for missing decisions. If available, `superpowers:brainstorming` may assist; it is optional and must not launch a separate workflow.

需求问题按依赖推进：先解决会改变后续方案的决定，再问前提已确定的问题。
每题给出推荐与影响，只追问本次交付、风险或返工成本相关的取舍；代码和
接口事实由 Agent 先查证。已明确的决定直接复用，不为填全模板重复提问。
需要运行才能确定的问题应说明待验证假设、探索边界和停止条件，遵守当前
只读/实施边界，不能把待验证方案当成已知事实或跳过实施准备度检查。

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

本节只处理实际需要正式 Plan/Draft 的工作；简短执行摘要不查找或确认新的
产物目录，也不为保存摘要修改 Agent 文件。已有正式 Plan 的约束仍须识别。

仅 `phase=PLAN_WRITE` 可以确认并写入产物位置规则。`SCOPE_REVIEW` 只读取现有规则、
检查已有 Plan/Draft 和文档目录并返回候选位置；不得写 `AGENTS.md`、创建目录或固化规则。
没有正式规则不阻塞只读范围评审：`PANEL` 使用
`artifactRuleResolution.status=unresolved-candidate, source=candidate`，
指纹来自候选信息快照；尚无候选时明确记录无候选快照，不伪造 Agent 规则。
候选状态只能评审范围，不能确认更新 Plan 或保存。

按“自动识别 → 推荐目录或手动指定 → 写入 Agent 文件 → 读取验证”解析产物位置，
不把某个固定目录写死在插件里。先读当前工具适用的 `AGENTS.md` 及其明确委托规则，
规则有效时直接复用；用户本次手动指定的位置优先于已有目录惯例或旧规则。

缺少规则时，依据只读证据检查已有 Plan/Draft 和文档目录，填充候选值并展示完整候选，
给出推荐理由和将写入的 Agent 文件。`SCOPE_REVIEW` 保留候选并继续只读范围评审；
只有进入 `PLAN_WRITE`、范围和分支确认且用户已授权目录规则写入后，
直接将规则固化至最近适用公共作用域的 `AGENTS.md`，随后重新读取并验证位置能够
唯一解析，才能使用 `status=resolved, source=agents`。在该阶段用户确认完整候选
或手动指定即可授权本次目录规则写入；仅在范围评审中指定目录不得提前固化。

首次候选转为正式规则时，按 [运行协议](references/feature-review-runtime.md#从范围评审进入正式保存)
更新同一交付单元的面板会话并复核完整内容。旧提交、结果、确认和保存状态全部失效；
用户须在正式规则与新指纹下重新提交、确认。已有正式规则变化或回退须重新取证并挂载。

推荐按项目实际目录组织，插件不得提供默认目录。Plan 和 Draft 的目录可以分别指定；
用户只给根目录时，Agent 结合项目惯例补齐命名、编号及子目录，并展示最终解析结果。
只有确有多解、作用域冲突或覆盖既有文件风险时才询问缺失信息。
位置规则确定与评审内容保存仍是两道独立门禁，确定目录不自动保存评审内容。
记录 Plan 路径模式、Draft OpenAPI 路径模式、交付单元命名、编号规则、路径变量与既有文件处理方式。
具体写入边界和字段见 [产物规则与评审卡规范](references/page-review-standard.md)。

## 范围与功能点

以下行为、证据和阻塞判断同时适用于简短摘要与正式 Plan。简短摘要以对话和
内存保留适用事实；模块卡、规范化模型和正式 Plan 的结构仅用于对应的评审/产物，
不为一个简短执行摘要启动浏览器或构造完整模型。

Narrowly check for an existing Plan linked to the selected item/module; read it
semantically when present, without scanning unrelated artifact directories.
Scripts must not parse Markdown. An existing formal Plan retains its contract
and Plan 内容指纹. 正式评审首次按功能模块与子模块全量整理，页面也是模块；
后续默认查看新增、修改和未决项，同时保留完整模块清单。

每个功能点至少包含职责与边界、输入、输出、行为规则、验收例子、代码落点或缺口、来源证据和本次变更。
功能清单必须能回答“改哪个项目、为什么改、现有 `origin/master` 已有什么、还要增加什么、明确不改什么”。

正式评审会话只使用 `schemaVersion=2` 的模块卡。每张卡按“职责与范围 → 输入输出 → 行为规则与验收例子 → 待确认问题 → 本次变更”组织，内部实现默认折叠。只有职责、输入输出与验收能够独立说明时才拆子模块；布局、API、权限等技术维度是 Agent 后台检查清单，不再按维度或 API 消费点强制拆卡。

Agent 根据 [API 契约阶段](references/api-contract-stages.md) 只为本次新增或改变的网络消费建立需求清单。纯布局、文案、交互重排或已批准的 Mock 状态，可复用现有数据绑定证据并标记“无新增契约”；不要依次遍历 YApi、OpenAPI、Query Contract 和 Swagger 来证明一个未请求的后端改动。真实数据必须新增字段时，再开展正式来源搜索；未查清的事实进入该消费点的实现阻塞项，不扩展整个 UI 范围。Treat 能力归属、运行时范围 and 本次交付关系 as separate facts; never assign an API to a page or module.

在任何范围确认或 `READY_FOR_CHECKLIST` 输出前，按
[需求确认前检查清单](references/requirement-readiness-checklist.md) 汇总所有已确认、缺失和冲突项。
`REQUIREMENT_BLOCKER` 未清零时范围保持 `PENDING|BLOCKED`；仅有
`IMPLEMENTATION_BLOCKER` 时允许确认需求，但实现方案必须保持 blocked，禁止进入实施。

For formal module cards, build the canonical `implementationPlan` from applicable 项目规范、依赖、现有源码、PRD、原型和 API 证据. Use the compact four-block contract in [产物规则与评审卡规范](references/page-review-standard.md). 实现证据不足时设 `implementationPlan.status=blocked` 并说明缺口；需求 `conclusion` 独立，允许需求“已确认”同时实现方案待补充，不自动把需求改为“阻塞”。需要用户决定的行为问题和 Agent 能自行查证的技术问题分别标明责任方。简短摘要语义核对同样的行为、证据和阻塞，不构造四块对象或调用正式 Plan 校验器。

For a formal review, keep the page state only as “评审中” or “阻塞” while reviewing and use [状态模型](references/status-model.md) for evidence gates and objective counts. 不得生成 Draft OpenAPI；不得报告单一页面完成百分比。简短摘要直接报告范围和验证事实，不创建页面状态模型。

## 评审模式选择

完成项目定位和远程 `master` 范围分析后再选择模式，并记录选择理由：

- `DIALOGUE`：单项目、单一内聚页面/模块，或同一交互模式应用于多个页面；功能点关系清晰，且没有需要逐项收集的多组业务决定。直接在对话中展示范围、功能点、排除项、未决问题和实现摘要，用户一次确认或给出增量修正即可。
- `PANEL`：涉及多项目、多页面间不同的行为决定、较多独立功能点，或存在复杂状态、跨模块依赖、API/权限/路由冲突及多轮独立决策。使用评审面板逐项确认。

不要只因存在原型、API 或多个技术维度就开启面板；也不要为了省事把复杂需求压缩成一次对话确认。
简单模式在范围扩大后可以升级为面板模式，并保留已确认的功能清单和来源证据。

## 简单需求：对话模式

在对话中给出受影响项目与基准 ref、范围、功能点、排除项、实现摘要和中文分支动作；
完整 `origin/master` SHA 留在内部精确校验与授权绑定中，按需披露。
内部完成适用的需求确认前检查清单，对外统一在六列表格的待决事项
与编号备注汇总缺口、影响、责任方、补齐条件和阻塞范围，不重复附长检查表。
不需要正式 Plan 时，保留相同检查与真实阻塞计数，确认后返回范围和 brief。
需要正式 Plan 的 `STANDALONE` 由用户确认该摘要后进入“开发分支与 Plan”；
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

本节只适用于正式 Plan；简短摘要已在范围阶段返回。

### 独立非 TAPD Plan 的分支绑定

非 TAPD 请求直接核实仓库和分支事实，不调用仅接收 TAPD 的 `preparing-work`，
不创建占位 TAPD 身份或 `TapdWorkDefinition`。范围确认后，依项目 Git 规则验证
仓库根、origin、当前分支/HEAD、工作区、精确目标名及本地/远端 refs。
`CREATE` 要求目标两端均不存在，并绑定准确基准 ref/SHA；`USE_EXISTING`
要求目标存在，本地与远端同名时 SHA 一致。继续已有工作时保留原分支。
将范围、仓库、源/基准、目标分支、操作与目的纳入当前对话确认，已有匹配授权
直接复用；缺失时展示准确提案，变化或冲突时停止并说明影响。
这些事实与确认作为内存分支定义交给下方 `PLAN_WRITE`，不增加运行台账或模型。
仅编写 Plan 不创建或切换分支；Plan 绑定已核实的计划动作，不能宣称分支已创建。

### TAPD 开发任务关联

按 [需求任务关联](../developing-requirement/references/task-linked-delivery.md)
复用已选任务、项目/分支、现有 Plan 步骤及接口/依赖/验收引用。需求清单和
进度从这些事实派生，不另存一份 Task 详情台账；项目级检查只能按实际覆盖
范围归属到 Task，后续交付链接仅在真实产生后补充。

TAPD 需求交接复用 `breaking-down-requirement` 的
[任务与 Plan 契约](../breaking-down-requirement/references/contracts.md)。
`SCOPE_REVIEW` 只输出稳定模块/功能编号和拆分依据，不创建任务。
需要 Task 工时评估时，同一范围交接提供实际责任/排除项、准确源码基准、已核实的
复用能力及适配/新增差异、必要验证和具体风险，按
[增量工时规则](../breaking-down-requirement/references/effort-estimation.md) 交任务模块
估算并独立评审。不能按页面数或整个需求名称预填工时，不要求开发前就有未来 MR。
需要新建任务时交给该模块确认并执行，工具统一指向共享
[TAPD 任务创建路由](../../references/tool-routing.md#tapd-任务创建) 的
`create_task`/`create_tasks`；本技能只消费其结果，不直接创建或补建任务。
`PLAN_WRITE` 内部接收 `TaskBreakdownResult`：每个 Task 有真实 ID、经核实人员、
内部估算数据、最终预计工时、依赖及验收，并经过准确读回。对话、确认和
Plan 正文的工时只展示一个 `N 小时`，不加预估/剩余标签，不展示多组时间、
计算系数、内部原始值、公式或折算前后对比。内部剩余预测不替换模型中的任务工时。
以一个页面/模块一份 Plan，同一 Plan 可包含多个 Task；实施步骤用
`tapdTaskKey` 归属一个 Task。不要把步骤编号 `T-*` 当成 TAPD Task ID。

实施 Plan 必须覆盖本项目/交付单元所有选定 Task 的功能，每个步骤不能越出
所归属 Task 的范围。工时在 Task 层保留一次，不分发到每一步重复累加或
再次折算。TAPD 模型附 `tapdRequirement` 绑定父 Story；规范化模型附可选
`taskBreakdown`，由现有校验器调用任务校验
验证真实 ID 读回、人员/工时、项目/模块归属和功能覆盖；字段不在 JSON
台账持久化。Markdown 用关联表和每步归属表达同一事实。
TAPD 模型进入可实施及后续状态时，缺少就绪任务会被校验器拒绝；新估算的独立评审
缺失或过期同样不能用 Plan 保存、用户确认或 Task 写入成功绕过。

Plan 提供任务顺序、已确认工时、依赖与验收，不要求开发起止日期。仅用户
明确要求排期时才读取 [实施排期推荐](../implementing-work/references/implementation-schedule.md)，
内部结合剩余工作量和人员容量计算日期，对外任务工时仍只显示一个 `N 小时`；
未明确要求写入时仅展示推荐日期，不写外部状态。没有排期
日期不阻塞 Plan 或任务创建。

单独编写非 TAPD Plan 无需任务写入。对 TAPD 请求，仅请求 Plan 或尚无任务创建确认时，
可以保留明确标为“任务待确认、不可实施”的阶段 Plan，写入仍走原有 Plan
确认门禁，不伪造 Task ID 或 TASKS_READY；输出 `implementation_ready=false`。
旧 Plan 续接先核对已有 Task，补齐关联后再实施，不能据缺字段自动重新创建。

Plan 细化发现任务范围、人员或工时需变更时，返回受影响任务的旧/新差异，
交回 `breaking-down-requirement phase=PLAN` 展示并确认，完成任务更新和读回
后再确认受影响 Plan。实现证据补充本身不自动改变工作量。编排已携带完整
有效结果时直接消费，不重复拆分或确认。

任务创建前的清单可用稳定 `taskKey` 预览所有 Task/Plan 实质内容，并明确
`taskKey → 准确读回的真实 Task ID/链接` 的回填规则和同一 Plan 的目标路径。
该规则和正文已获确认、proposal 未变化且读回验证通过时，仅系统 ID/链接
可机械回填，不重复询问内容确认；不得重算工时、换人、改范围、改路径或
更换关键方案，也不得把回填当成 TASKS_READY。PANEL 的请求/指纹/保存回执仍
须通过现有协议；运行时不能承载回填时，展示增量并取得所需确认，不能假称支持。

范围与上下文确认后，才处理开发分支和 Plan：

1. `phase=SCOPE_REVIEW` 返回 `ConfirmedRequirementScope` 并停止；不得自行越过分支绑定门禁。
2. `phase=PLAN_WRITE` 消费已验证且获确认的分支定义：TAPD 请求使用 `zan-workflows:preparing-work` 产生的 `TapdWorkDefinition`；非 TAPD 独立请求使用上述仓库/分支事实。写前重新读取项目 Git 规则、实际 origin、最新 `origin/master` SHA 和工作区状态。
3. 要求每个受影响项目都有精确分支动作 `CREATE|USE_EXISTING`、固定分支和基准；不得先创建分支再倒推范围，也不得用推荐分支冒充已验证绑定。
4. 检查已确认范围与分支现有差异是否重叠；冲突、混入无关改动或远程基线变化时停止并重新展示影响。
5. 按产物位置规则生成 Plan，记录项目、仓库、`origin/master` 基线、开发分支、功能点、代码落点、任务顺序、验证方式、风险和未决项。
6. `DIALOGUE` 模式展示精确路径及拟写正文/差异并取得明确确认；已有组合清单完整包含它们时复用有效确认。`PANEL` 模式使用已回填结果和“确认更新 Plan”门禁。写入后读回核对。

### 计划内容的质量检查

写入前按“独立接手”检查内容：只读所选任务、Plan 和引用的项目规则，能否
知道交付行为、排除项、关键选择及理由、真实依赖和完成证据。去掉依赖
“前面讨论”“按原来处理”的指代，补齐实际缺口即可；不新增用户审批或
必跑的独立 Agent。复杂交接可让只读 reviewer 检查容易被误解的部分。

业务行为、关键约束与选择理由是稳定约定；文件位置、组件组合和步骤是
当前基线上的实施导航。保留有用的路径和证据，实施前核对其有效性；技术
导航变化按既有增量规则处理，不自动重开未改变的业务结论。

具体实现按独立接手所需深度记录：组件/服务复用边界和代码落点、关键设计与
理由、适用的交互/数据流、步骤顺序和依赖、验证入口及预期证据/局限。
无需预写逐行代码，不把每次搜索、读文件、命令执行保存成操作流水账。

在既有 Task 内按可验证行为组织步骤，优先跑通最可能推翻方案的完整路径，
再扩展其他场景。每步给出可观察结果和验证入口/预期/局限，不按组件、字段
或技术层机械拆票。保持真实责任边界，不把跨仓库联调承诺成单方已完成。
需要多任务实施时，在原步骤说明中记录前置条件、允许修改路径/唯一负责人、
公共契约与验证资源；仅对已证实独立的步骤注明可并行，未确定时保持串行。
按 [多任务实施](../implementing-work/references/parallel-execution.md) 交接给
实施主代理，不新增调度模型字段或运行台账；子代理的存在不单独触发正式 Plan。

### Plan 的记录时点与持续维护

- 分析及首次执行确认前：在对话或已有面板整理方案，展示六列摘要及必要的编号说明；
  有 Plan 时展示其准确链接和受影响差异，没有时不提前建文件或另建清单详情。
  拟写正文通过编号说明或已有面板展示，不再重复按方案/验收分组。
- 保存：范围、分支、产物位置和内容确认门禁通过后，保存同一正式 Plan 并读回；
  真实 Task ID 按上述已批准映射回填，实施仍须完整任务与实现准备度门禁。
- 实施：范围、人员、工时、路径或关键方案实质变化时展示受影响差异，按原门禁
  确认、更新同一 Plan；既有未受影响结论保留，链接位置随正文更新核对。
- 收尾：依据实际执行记录验收结果、证据、未验证项和遗留问题；按同一 Plan
  写入授权及 PANEL 保存协议维护，不能仅把预计结果改写成“已通过”。

已保存不等于可实施。阶段 Plan 可以保留未决事项，但不能用它或一条详情链接
替代需求确认、TASKS_READY、实现准备度或分支授权。

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update.
The authorization must bind the 产物位置规则 and development branch facts;
standalone and panel confirmation can remain separate when those facts were
not already shown together.

For `DEFER_TO_ORCHESTRATOR`, the combined requirement/branch checklist may also
serve as this Plan-update confirmation only when it already displays the exact
Plan paths and proposed content or diff. Reuse that current-conversation
authorization if the saved content is unchanged apart from the explicitly
approved, verified system-ID/link fill above; do not ask the same question
again just because `PLAN_WRITE` begins. A new location, new module or material
content change requires a fresh preview and confirmation. `PANEL` still uses
its trusted `confirmPlan` and saved-plan receipt protocol.

Use the human-readable [页面交付 Plan 模板](assets/page-delivery-plan-template.md) only after both the project location rule and this update are confirmed. 按模块原样保存需求、验收例子、`reviewConclusion`、实现方案、未决事项与本轮变更。需求已确认但实现 `blocked` 时允许阶段保存，明确缺口且不得标为可实施；`ready` 方案仍须保留一句话摘要、四块实施内容与证据。规范化校验模型只使用 `schemaVersion=3`；适用模块仍有未解决 `questions` 时不能进入可实施。Markdown 中不嵌入 JSON。保持同一模块一份 Plan、稳定编号与明确双向关联。用户确认只表示允许写入，Agent 写入并读回核对后调用 `markPlanSaved`，面板才显示“已保存”。

## 输出契约与交接

`SCOPE_REVIEW` 返回需求身份、受影响项目、每个项目的 origin/master SHA、范围、功能点、
排除项、代码证据、评审模式、风险、未决问题、检查清单、
`requirement_blocker_count`、`implementation_blocker_count` 和 `implementation_ready`。
无需正式 Plan 时附同一份 `implementationBrief`，不伪造 Plan 路径、任务 ID
或就绪状态。
`STANDALONE` 返回
`ConfirmedRequirementScope`，终态为 `CONFIRMED|PENDING|BLOCKED`；
`DEFER_TO_ORCHESTRATOR` 返回 `ProposedRequirementScope`，终态为
`READY_FOR_CHECKLIST|PENDING|BLOCKED`。

`PLAN_WRITE` 的 TAPD 内部交接还保留 task proposal 指纹、Task ID/人员/内部估算与最终工时、
读回证据和 Task→实施步骤关联。阶段 Plan 明确尚未确认的任务及不可实施原因。

`PLAN_WRITE` 返回一个 branch-bound `ConfirmedRequirementPlan`：上述范围、每个项目的已验证
仓库/分支定义、Plan 路径/指纹、任务顺序、验证方式和 `PLAN_READY|PENDING|BLOCKED`。
只有 TAPD 请求附 `TapdWorkDefinition` 与适用任务结果；非 TAPD Plan 不带虚构身份或任务。

上述是内部交接契约；对外按六列及数字详情展示本轮终点、实际风险和必要写入，
不原样输出内部阶段码、完整 SHA、原始 payload 或人员字段核验。

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
能力检查必须覆盖当前会话的完整工具清单，不能只根据某个浏览器控制器（例如 CUA）暴露的
方法判断脚本执行能力缺失。若环境提供 Chrome DevTools/CDP 页面脚本工具，继续检查它能否
定位并执行当前 Codex in-app Browser 中的原型标签页；权限已开启、工具已注册、目标页已接通是
三个不同事实，必须分别验证。只有只读 evaluate 时不得假装已完成注入；使用环境正式提供的页面
执行能力完成注入并验证挂载。浏览器能力不足时准确区分缺失的工具能力和未接通的目标标签页，
列出恢复方式；已完成的只读需求整理可保留，但不能把它称为完成可视化评审。完整调用协议见
[功能评审运行协议](references/feature-review-runtime.md)。

自动通知使用自带 `scripts/review-wake-bridge.mjs` 和本机 `codex queue`；桥接仅在本轮
评审期间运行，默认 2 小时，不安装系统守护进程。缺少 CLI 能力或浏览器策略阻止连接时
使用人工续接，不能绕过 CSP 或浏览器安全设置。桥接配置与令牌不得进入评审数据或日志。
