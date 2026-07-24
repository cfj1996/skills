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

Use [产物规则与评审卡规范](references/page-review-standard.md) for the required candidate fields, evidence priority, eleven dimensions, and review-round gates. The stable candidate structure is: Plan 路径模式、Draft OpenAPI 路径模式、交付单元命名、编号规则、路径变量、既有文件. Do not fill in any field value until the project confirms it.

## 评审

Read the Plan semantically; scripts must not parse Markdown. Record a Plan 内容指纹. Generate the full first round, then include only unresolved items and changed evidence by default. Dynamically inject one Shadow DOM card panel in the in-app 浏览器.

Keep the page state only as “评审中” or “阻塞” while reviewing. 不得生成 Draft OpenAPI. Use [状态模型](references/status-model.md) for evidence gates and objective counts; never report a single page completion percentage. Use [API 契约阶段](references/api-contract-stages.md) for formal-source discovery and the later planning-only Draft gate.

## 统一提交评审

Review only after the user submits all input together. Show the proposed update, preserve review state, and do not write files. 不得在确认前写 Plan.

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update. This is separate from confirmation of the 产物位置规则.

Use the human-readable [页面交付 Plan 模板](assets/page-delivery-plan-template.md) only after both the project location rule and this update are confirmed. Keep one Plan per page or cohesive module, stable IDs, and explicit bidirectional links; never embed JSON or create another long-term record.

## 交接

After review completion, invoke `superpowers:writing-plans`. Use `superpowers:subagent-driven-development` for execution, and invoke `superpowers:verification-before-completion` before declaring completion.
