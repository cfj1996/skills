---
name: developing-requirement
description: Use for a new TAPD Story, an explicit start from its confirmed execution Wiki, or collection scoped to an existing Task.
---

# Develop Requirement

Preferred lead model profile: `CRITICAL`。见[模型路由](../../references/model-routing.md)。TAPD、GitLab、YApi 与原型取证遵守[工具路由](../../references/tool-routing.md)。

## 新需求的默认入口

普通“开发这个需求”、限定 B 端/前端和小改动都进入[需求收集](../collecting-requirements/SKILL.md)。先核实范围和功能点，再根据用户意图选择同一份评审稿的输出方式。明确“只在会话看”走 `SESSION`，展示后结束。普通请求默认 `TAPD_PLAN`，默认手动执行，到落盘结束。用户明确立即执行时，在同一次确认中纳入工作位置、分支、提测与构建，保存并读回后直接开工。已有正式页且要求执行时直接进入下一节。两种启动方式按[执行上下文](../executing-tapd-plan/references/execution-context.md)自动推进已选目标。

1. **读需求，定项目。** 读取 TAPD Story 正文、关联 PRD/原型和执行文档回链。按 [workspace-project-knowledge](../workspace-project-knowledge/SKILL.md) 用现有代码核实本轮各项目承担的改动、入口、项目规范、分支和基线。前端任务以页面、交互、权限入口和接口消费变化划分范围，服务端数据规则体现为契约和验收结果。已存在正式页时先准确读回，沿原页续办或修订。
2. **先查接口，再写实现。** 按[需求收集与计划格式](../collecting-requirements/SKILL.md)列出功能实际消费的 API，登记复用、接入、拟 Mock 和字段缺口。按 P → M → F 写现状、目标、落点、步骤、前置 F 与产出。UI 写触发与反馈，TC 写可判定结果。通过 D 编号关联调用和缺口，跨项目沿用同一依赖。可查证的问题先查，仍缺的记录受影响步骤和解除条件。
3. **TAPD Plan 模式一次确认。** 由同一技能先执行只读 `PLAN`，展示完整执行稿、实际目标目录及版本指纹，请用户确认该版。获确认后执行 `SAVE → READ`，在原 Story 读回唯一回链和确认版本。手动启动返回正式 Wiki 链接、范围、待补项及新会话开工指令。需要立即执行时，在同一确认中单列当前实施和交付选择。新流程在 Wiki 维护这份计划，无需为它创建 TAPD Task 或项目本地 Plan。

## 按原执行 Wiki 开工

立即执行消费刚确认并保存的版本，新会话中用户明确“按这份计划开发”时，仍由 [执行 TAPD Plan](../executing-tapd-plan/SKILL.md) 按其[开工、验证和交接流程](../executing-tapd-plan/references/executing.md)接续。先核实 Story、正式页、确认版本、实际分支/源码和未完成的 F/TC。仅执行本轮选中的范围，按原步骤逐项验证、独立评审并以真实证据回填。用户仅要求查看或修订计划时留在相应阶段。

尊重本轮交付选择。“先完成代码，我检查后再提测”走 `IMPLEMENT`，直接提测：否，完成开发、验收和独立评审后停在人工检查。用户已选择并授权提测时带完整 ReviewedChange 交给 [submitting-for-test](../submitting-for-test/SKILL.md)，按已选范围和构建选项交付。已有已评审改动，后来单独要求“直接提测”时，走[直接提测流程](../submitting-for-test/references/direct-submission.md)刷新当前证据。仅在明确选择上线并具备对应授权时进入 [going-live](../going-live/SKILL.md)。

## 已有资料与窄范围请求

- 仅要求建分支时按 [preparing-work](../preparing-work/SKILL.md) 办理，返回分支结果。仅请求命令时只返回命令。
- 收到已有 Task 时先核实其父 Story 和所选范围。收集和执行都沿用真实工作项与页内功能映射。旧项目 Plan、分支和已完成结果可只读用作证据；需要独立开工时，从已确认的 TAPD Plan 恢复。

## Execution feedback

新执行 Wiki 的确认前预览只在内存保留阶段信息，取得本次保存或保存并执行授权后才按[执行反馈记录](../../references/execution-feedback.md#attach-to-a-workflow)启动本地诊断并跨能力复用 runId。直接从已确认 Wiki 开工时按实际开工授权启动。诊断失败不阻断业务，正式进度与可续办证据以 Wiki 和实际回执为准；只在用户明确要求时导出或提交反馈。
