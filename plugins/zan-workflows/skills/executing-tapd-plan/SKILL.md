---
name: executing-tapd-plan
description: 在原会话立即执行或在新会话手动执行已确认的 TAPD Plan，按选定上下文实施 Story 或 Bug，按项目和功能点验证、评审并回填进度。
---

# 执行 TAPD Plan

Preferred lead model profile: `CRITICAL`。见[模型路由](../../references/model-routing.md)。本技能接收正式 Wiki 链接及本轮指令。链接即可还原范围，所需的分支、实现步骤和验收均从该页恢复。

按[立即／手动执行与授权复用](references/execution-context.md)匹配本轮指令。手动执行是启动时机，开工后的 Git 合并、提测和构建与立即执行使用同一规则。

1. **读回正式版本。** 用 [Wiki 存取](../collecting-requirements/references/wiki-storage.md)的 `READ` 核对工作项、父目录、回链和确认版本。仅查看时返回范围、数据对齐和已有回执。未确认稿交[需求收集](../collecting-requirements/SKILL.md)。
2. **确认本轮动作和续接位置。** 从当前指令取得本轮范围、交付选择及具体目标，复用已明确的操作，再调用 `START`。新会话按[新会话从哪里继续](references/executing.md#新会话从哪里继续)核对实际回执，从最早未完成且已就绪的步骤接着做。需求或实现变化时按[同页修订](references/executing.md#同步需求和实现变更)更新正文。
3. **实施、验证并回填。** 按[逐项实施与交付](references/executing.md)推进。Bug 沿用修复状态、处理人和单条修复记录规则。正式页获准回填时按实际实施、TC 和交付回执调用 `PROGRESS`。会话稿直接执行或明确限定仅本地时，在会话报告进展。
4. **开发收尾。** 按[开发收尾](references/executing.md#开发收尾)核对本轮实现、自测和独立评审。各仓及必要联验均通过后，根据 `REVIEWED` 报告「本轮开发完成」，获准时在进入提测前回填证据。仍有阻塞时报告具体功能和缺口。
5. **按本轮终点交付。** 仅开发时返回收尾结果。已选提测时报告「开发完成，开始提测」并直接交给[直接提测](../submitting-for-test/SKILL.md)。只要求构建已有已审版本时，复用其开发回执并走所选 Job。明确上线时才进入[上线流程](../going-live/SKILL.md)。
