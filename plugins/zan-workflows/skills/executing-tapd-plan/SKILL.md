---
name: executing-tapd-plan
description: 在原会话立即执行或在新会话手动执行已确认的 TAPD Plan，按选定上下文实施 Story 或 Bug，按项目和功能点验证、评审并回填进度。
---

# 执行 TAPD Plan

Preferred lead model profile: `CRITICAL`。见[模型路由](../../references/model-routing.md)。本技能接收正式 Wiki 链接及本轮指令。链接即可还原范围，所需的分支、实现步骤和验收均从该页恢复。

按[立即／手动执行与授权复用](references/execution-context.md)匹配本轮指令。手动执行是启动时机，开工后的 Git 合并、提测和构建与立即执行使用同一规则。

1. **读回正式版本。** 仅查看时使用[Wiki 存取](../collecting-requirements/references/wiki-storage.md)的 `READ`，明确执行时使用 `START`，两者均从 Wiki 链接读回。核对工作项、父目录、唯一回链和版本确认。只粘贴链接且没有指定执行技能，或明确要求查看时，返回范围、数据对齐、已完成与待办项，到此结束。会话稿或旧的未确认 Wiki 可交回[需求收集](../collecting-requirements/SKILL.md)进行确认。
2. **确定本轮起点。** 显式调用 `$executing-tapd-plan <Wiki 链接>` 或说「执行这份 Plan」即为本轮开工指令。使用本次 START 读回的执行上下文，沿用页上已确认的范围、分支和步骤，选取获准的 P/M/F 和关联的 D/UI/TC。将范围限制映射到 START 的 selectedProjects / selectedModules / selectedFeatures。没有限定时采用 Plan 本轮纳入的范围。NO_ACTION 表示这次没有获准的对应动作，直接结束。读回项目分支、代码和已完成回执，从第一个未完成且前置条件已满足的步骤继续。范围、契约或验收有实质变化时，交回收集技能修订同一页。
3. **实施、验证并回填。** 按[逐项实施与交付](references/executing.md)推进。Story 按页内功能实施。每个 Bug 的全部项目共同遵守修复状态、处理人和单条修复记录规则。开工时按 Plan 回填同页进度，用户明确限定只做本地实施时在会话返回回执。获准回填时按真实 TC 结果和可复核证据用 `PROGRESS` 更新同一页，重复执行时复用已有结果。
4. **停在本轮终点。** 仅开发时到验证及独立评审。若计划选择提测，自动把本轮执行上下文交给[直接提测](../submitting-for-test/SKILL.md)，仅构建时按已选测试 Job 执行。明确上线时才按[上线流程](../going-live/SKILL.md)推进。只有真实上线证据才更新为「已上线」。
