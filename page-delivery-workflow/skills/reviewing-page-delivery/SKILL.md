---
name: reviewing-page-delivery
description: Use when reviewing a page or cohesive feature module against a PRD, prototype, project rules, API evidence, dependencies, or an existing delivery Plan, especially when Codex must collect decisions through the in-app browser and preserve multi-round review state.
---

# Reviewing Page Delivery

Review a page or independently deliverable module from evidence; do not turn uncertainty into implementation commitments.

## 启动确认

1. Invoke `superpowers:brainstorming` for unresolved matters.
2. Read applicable `AGENTS.md`, dependencies, and existing constraints. Do not assume a component system.
3. Confirm the delivery unit is a 页面或模块. Require a module to be independently implementable, integrable, and verifiable. Remain read-only until 启动确认 passes.

## 产物位置规则

Read Plan and Draft artifact-location rules from the applicable `AGENTS.md`. When rules are absent, propose candidates only; after user confirmation, draft the rule in the nearest shared-scope `AGENTS.md` and reread it to verify. The plugin 不得提供默认目录. Location-rule confirmation and Plan update confirmation are 两道独立门禁.

## 评审

Read the Plan semantically; scripts must not parse Markdown. Record a Plan 内容指纹. Generate the full first round, then include only unresolved items and changed evidence by default. Dynamically inject one Shadow DOM card panel in the in-app 浏览器.

Keep the page state only as “评审中” or “阻塞” while reviewing. 不得生成 Draft OpenAPI.

## 统一提交评审

Review only after the user submits all input together. Show the proposed update, preserve review state, and do not write files. 不得在确认前写 Plan.

## 确认更新 Plan

Write the Plan only after the user explicitly confirms the displayed update. This is separate from confirmation of the 产物位置规则.

## 交接

After review completion, invoke `superpowers:writing-plans`. Use `superpowers:subagent-driven-development` for execution, and invoke `superpowers:verification-before-completion` before declaring completion.
