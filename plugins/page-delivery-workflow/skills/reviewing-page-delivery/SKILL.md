---
name: reviewing-page-delivery
description: Use when reviewing a page or cohesive feature module against a PRD, prototype, project rules, API evidence, dependencies, or an existing delivery Plan, especially when Codex must collect decisions through the in-app browser and preserve multi-round review state.
---

# Reviewing Page Delivery

Review a page or independently deliverable module from evidence; do not turn uncertainty into implementation commitments.

## 启动确认

1. Read applicable `AGENTS.md`, dependencies, and existing constraints. Do not assume a component system.
2. Invoke `superpowers:brainstorming` for unresolved matters.
3. Confirm the delivery unit is a 页面或模块. Require a module to be independently implementable, integrable, and verifiable; 拒绝项目级“大 Plan”. Remain read-only until 启动确认 passes.

## 产物位置规则

Read Plan and Draft artifact-location rules only from the applicable `AGENTS.md` or its explicit delegation. When rules are absent or conflict, propose a complete candidate. 未经用户确认不得固化。用户确认完整候选后，必须固化至最近适用公共作用域的 `AGENTS.md`，随后重新读取该规则，并验证 Plan 和 Draft 位置能够唯一解析，才能继续启动确认。 The plugin 不得提供默认目录. Location-rule confirmation and Plan update confirmation are 两道独立门禁.

Use [产物规则与评审卡规范](references/page-review-standard.md) for the required candidate fields, evidence priority, eleven dimensions, and review-round gates. The stable candidate structure is: Plan 路径模式、Draft OpenAPI 路径模式、交付单元命名、编号规则、路径变量、既有文件. 必须先依据只读证据填充候选值并向用户展示完整候选；确认前不得固化，也不得视为正式规则。

## 评审

Read the Plan semantically; scripts must not parse Markdown. Record a Plan 内容指纹. Generate the full first round, then include only unresolved items and changed evidence by default. Dynamically inject one Shadow DOM card panel in the in-app 浏览器.

Before generating review cards, build the 消费需求清单 and complete the API evidence gate in [API 契约阶段](references/api-contract-stages.md): classify each concrete consumer's API need, search formal sources for every required need, then produce the 接口事实清单. Treat 能力归属、运行时范围 and 本次交付关系 as separate facts; never assign an API to a page or module.

For every feature card, build the canonical `implementationPlan` from applicable 项目规范、依赖、现有源码、PRD、原型和 API 证据. It must give a concrete project-specific solution rather than a generic UI noun: exact discovered components and code landing, trigger-to-feedback linkage, state/API data flow, and focused acceptance. Use the compact four-block contract in [产物规则与评审卡规范](references/page-review-standard.md). When any required implementation decision lacks evidence, keep the implementation status and review conclusion as `blocked` / `阻塞`.

Keep the page state only as “评审中” or “阻塞” while reviewing. 不得生成 Draft OpenAPI. Use [状态模型](references/status-model.md) for evidence gates and objective counts; never report a single page completion percentage.

## 功能评审运行协议

主动选择本 Skill 即进入功能评审，不再启动第二套流程。启动确认通过后，必须按 [功能评审运行协议](references/feature-review-runtime.md) 打开 Codex in-app Browser、动态注入现有 Shadow DOM 面板、验证挂载并等待统一提交。

原型来源可以是远程 HTTPS 页面、现有 loopback 页面或本地文件。远程原型直接在
in-app Browser 打开；本地文件才启动临时 loopback 服务。使用运行协议中的来源
安全门禁、登录态恢复和跨域 iframe 降级规则，不得把原型 URL 写入 ReviewSession
或 Plan。

消费项目 dev server、build 和运行态验收不是功能评审前置条件。没有当前 Browser、host、Shadow Root、临时 API 和当前提交证据时，只能报告“评审阻塞”，不得用独立 HTML、静态代码评审、截图或文字结论替代面板。

## 统一提交评审

Review only after the user submits all input together. Show the proposed update, preserve review state, and do not write files. 不得在确认前写 Plan.

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update. This is separate from confirmation of the 产物位置规则.

Use the human-readable [页面交付 Plan 模板](assets/page-delivery-plan-template.md) only after both the project location rule and this update are confirmed. Preserve every confirmed feature's `ready` implementation contract in the Plan as its one-line summary, four compact implementation blocks, and evidence references; a blocked or incomplete contract must not be written as implementable work. Keep one Plan per page or cohesive module, stable IDs, and explicit bidirectional links; never embed JSON or create another long-term record.

## 交接

After review completion, invoke `superpowers:writing-plans`. Use `superpowers:subagent-driven-development` for execution, and invoke `superpowers:verification-before-completion` before declaring completion.
