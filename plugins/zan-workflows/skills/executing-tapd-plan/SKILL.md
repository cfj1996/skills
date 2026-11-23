---
name: executing-tapd-plan
description: 在原会话立即执行或在新会话手动执行已确认的 TAPD Plan，按选定上下文实施 Story 或 Bug，按项目和功能点验证、评审并回填进度。
---

# 执行 TAPD Plan

Preferred lead model profile: `CRITICAL`。见[模型路由](../../references/model-routing.md)。本技能接收正式 Wiki 链接及本轮指令。链接即可还原范围，所需的分支、实现步骤和验收均从该页恢复。

按[立即／手动执行与授权复用](references/execution-context.md)匹配本轮指令。手动执行是启动时机，开工后的 Git 合并、提测和构建与立即执行使用同一规则。

1. **读回正式版本。** 用 [Wiki 存取](../collecting-requirements/references/wiki-storage.md)的 `READ` 核对工作项、父目录、回链和确认版本。仅查看时返回范围、数据对齐和已有回执。未确认稿交[需求收集](../collecting-requirements/SKILL.md)。
2. **确认本轮动作。** 使用已确认的实施范围、分支和步骤。开工前从本轮指令确定功能范围、仅开发验证／提测／提测并构建／仅构建及具体目标，再调用 `START`。用户已给出准确选择时直接复用。读回分支、代码和执行记录，从第一个未完成且就绪的步骤继续。后续需求或实现方案有实质变化时，按[同页修订](references/executing.md#同步需求和实现变更)更新执行文档，再按新版续接。
3. **实施、验证并回填。** 按[逐项实施与交付](references/executing.md)推进。Bug 沿用修复状态、处理人和单条修复记录规则。正式页获准回填时按实际实施、TC 和交付回执调用 `PROGRESS`。会话稿直接执行或明确限定仅本地时，在会话报告进展。
4. **停在本轮终点。** 仅开发时到验证及独立评审。选中提测时把本次执行上下文交给[直接提测](../submitting-for-test/SKILL.md)，仅构建按已选 Job 执行。明确上线时才按[上线流程](../going-live/SKILL.md)推进，完成后记录实际结果。
