---
name: reviewing-page-delivery
description: Use when reviewing a page or cohesive feature module against a PRD, prototype, project rules, API evidence, dependencies, or an existing delivery Plan, especially when Codex must collect decisions through the in-app browser and preserve multi-round review state.
---

# Reviewing Page Delivery

Review a page or independently deliverable module from evidence; do not turn uncertainty into implementation commitments.

## 固定协作流程

对话负责补充和调整功能清单，面板负责查看、逐项确认和提交意见。
以一个页面或可独立开发、对接和验收的内聚功能模块为单位维护同一份 Plan。
主流程为：整理功能清单 → 逐项评审 → 提交意见 → 整理修改 → 复评未决项 → 确认保存。

用户在 Agent 对话中说“漏了某功能”、追加需求或修正原描述时，继续当前评审，
不要求用户到面板手动创建功能，也不要求重新提供整份需求。Agent 对照完整功能清单
识别新增、补充和受影响项，展示增量及影响范围后同步面板；明确的补充直接处理，
只有语义冲突或缺少关键决定时才询问。

未提交时补入当前轮；提交后的补充进入下一轮并保留原提交。保留未受影响功能的
编号、意见和结论，新增项待评审，业务行为改变时重开需求结论；只补技术证据或
实现方案时保留需求结论，并展示技术变更待复核。具体快照、合并与同步步骤见 [对话补充功能](references/feature-review-runtime.md#对话补充功能)。

## 启动确认

1. Read applicable `AGENTS.md`, dependencies, and existing constraints. Do not assume a component system.
2. Resolve unresolved matters from evidence and ask only for missing decisions. If available, `superpowers:brainstorming` may assist; it is optional and must not launch a separate workflow.
3. Confirm the delivery unit is a 页面或模块. Require a module to be independently implementable, integrable, and verifiable; 拒绝项目级“大 Plan”. Remain read-only until 启动确认 passes.

## 产物位置规则

按“自动识别 → 推荐目录或手动指定 → 写入 Agent 文件 → 读取验证”解析产物位置，
不把某个固定目录写死在插件里。先读当前工具适用的 `AGENTS.md` 及其明确委托规则，
规则有效时直接复用；用户本次手动指定的位置优先于已有目录惯例或旧规则。

缺少规则时，依据只读证据检查已有 Plan/Draft 和文档目录，填充候选值并展示完整候选，
给出推荐理由和将写入的 Agent 文件。用户确认完整候选或手动指定明确位置后，
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

## 评审

Read the Plan semantically; scripts must not parse Markdown. Record a Plan 内容指纹. 首次按功能模块与子模块全量整理，页面也是模块；后续默认查看新增、修改和未决项，同时保留完整模块清单。Dynamically inject one Shadow DOM card panel in the in-app 浏览器.

新会话使用 `schemaVersion=2` 的模块卡。每张卡按“职责与范围 → 输入输出 → 行为规则与验收例子 → 待确认问题 → 本次变更”组织，内部实现默认折叠。只有职责、输入输出与验收能够独立说明时才拆子模块；布局、API、权限等技术维度是 Agent 后台检查清单，不再按维度或 API 消费点强制拆卡。

Agent 根据 [API 契约阶段](references/api-contract-stages.md) 建立消费需求清单，对已知消费点分类并开展正式来源搜索，形成接口事实清单。尚未查清的事实进入模块的待确认问题与实现阻塞项，不阻止用户评审已明确的功能行为。Treat 能力归属、运行时范围 and 本次交付关系 as separate facts; never assign an API to a page or module.

For every module card, build the canonical `implementationPlan` from applicable 项目规范、依赖、现有源码、PRD、原型和 API 证据. Use the compact four-block contract in [产物规则与评审卡规范](references/page-review-standard.md). 实现证据不足时设 `implementationPlan.status=blocked` 并说明缺口；需求 `conclusion` 独立，允许需求“已确认”同时实现方案待补充，不自动把需求改为“阻塞”。需要用户决定的行为问题和 Agent 能自行查证的技术问题分别标明责任方。

Keep the page state only as “评审中” or “阻塞” while reviewing. 不得生成 Draft OpenAPI. Use [状态模型](references/status-model.md) for evidence gates and objective counts; never report a single page completion percentage.

## 功能评审运行协议

主动选择本 Skill 即进入功能评审，不再启动第二套流程。启动确认通过后，必须按 [功能评审运行协议](references/feature-review-runtime.md) 打开 Codex in-app Browser、动态注入现有 Shadow DOM 面板、验证挂载并等待统一提交。

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

Review only after the user submits all input together. Show the proposed update, preserve review state, and do not write files. 不得在确认前写 Plan.

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update. This is separate from confirmation of the 产物位置规则.

Use the human-readable [页面交付 Plan 模板](assets/page-delivery-plan-template.md) only after both the project location rule and this update are confirmed. 按模块原样保存需求、验收例子、`reviewConclusion`、实现方案、未决事项与本轮变更。需求已确认但实现 `blocked` 时允许阶段保存，明确缺口且不得标为可实施；`ready` 方案仍须保留一句话摘要、四块实施内容与证据。规范化校验模型使用 `schemaVersion=3`，兼容旧版 `2` 的阶段保存；适用模块仍有未解决 `questions` 时不能进入可实施。Markdown 中不嵌入 JSON。保持同一模块一份 Plan、稳定编号与明确双向关联。用户确认只表示允许写入，Agent 写入并读回核对后调用 `markPlanSaved`，面板才显示“已保存”。

## 交接

评审完成后交回已确认的 Plan 或明确的未决事项；评审请求不自动授权实施、提交代码或发布。
只有用户另行要求进入实施时，才按项目规范继续。可用时选用
`superpowers:writing-plans`、`superpowers:subagent-driven-development` 和
`superpowers:verification-before-completion`；缺失时直接使用当前 Agent 的规划、实施与验证能力，
保留同样的用户授权与证据要求，不要求为评审安装额外插件。

## 运行能力

本技能自带面板脚本，不依赖 Superpowers 才能运行。开始前检查当前环境是否提供
in-app Browser 导航、页面脚本执行（支持注入与调用 API）、DOM 检查和真实用户交互能力。
只有只读 evaluate 时不得假装已完成注入；使用环境正式提供的页面执行能力，例如
浏览器 CDP。浏览器能力不足时列出缺失能力与恢复方式；已完成的只读需求整理可保留，
但不能把它称为完成可视化评审。完整调用协议见
[功能评审运行协议](references/feature-review-runtime.md)。

自动通知使用自带 `scripts/review-wake-bridge.mjs` 和本机 `codex queue`；桥接仅在本轮
评审期间运行，默认 2 小时，不安装系统守护进程。缺少 CLI 能力或浏览器策略阻止连接时
使用人工续接，不能绕过 CSP 或浏览器安全设置。桥接配置与令牌不得进入评审数据或日志。
