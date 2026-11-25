---
name: fixing-bug
description: Use for new or continued TAPD Bug repairs, including batch scope confirmation, a separate execution Wiki and repair record for each Bug, and later authorized implementation and delivery.
---

# Fix TAPD Bug

Preferred lead model profile: `CRITICAL`。见[模型路由](../../references/model-routing.md)。按[工具路由](../../references/tool-routing.md)访问 TAPD、代码仓库、接口与复现页面。

## 新缺陷的默认入口

普通“修复这个 Bug”、小修复与批量 Bug都进入[需求收集](../collecting-requirements/SKILL.md)。先核实范围和功能点，再根据用户意图选择同一份评审稿的输出方式。明确“只在会话看”走 `SESSION`，展示后结束。普通请求默认 `TAPD_PLAN`，默认手动执行，到落盘结束。用户明确立即执行时，在同一次确认中纳入工作位置、分支、提测与构建，保存并读回后直接开工。已有正式页且要求执行时直接进入下一节。两种启动方式按[执行上下文](../executing-tapd-plan/references/execution-context.md)自动推进已选目标。

1. **逐 Bug 查明现状。** 读取 TAPD 原文、附件、相关反馈和原执行文档回链，准确去重并保留输入顺序。描述复现条件/动作、实际与预期结果。按 [workspace-project-knowledge](../workspace-project-knowledge/SKILL.md) 核实每个必要项目、代码入口、现有行为及影响边界。用证据区分已定位原因与待验证假设；尚不能定位的具体疑点保留为有验证动作的调查步骤。
2. **逐项目写修复计划。** 每个 Bug 独立编制 P → M → F。P 固定仓库、基线、分支与规范。按[计划格式](../collecting-requirements/references/plan-format.md)先列修复涉及的接口和缺口。F 写原因、最小改动、步骤、前置 F 及 D 引用。UI 标出影响的交互，TC 给出复现、预期及回归验证。跨仓修复说明各项目产出和联验顺序。启动前核实 Bug 状态、处理人、修复记录时点及本轮提测与构建选择。
3. **把跨 Bug 前置写进各自正文。** 多个 Bug 共用同一仓库和分支时，在每份计划的对应 P 中按实际顺序列出前置 Bug 的完整 ID、工作项链接、已选终点和放行所需的回执。首项写“无前置”。若分支待建，所有相关页都写明首个创建者的 Bug ID/链接、仓库、分支和基线；仅该 Bug 的动作为 `CREATE`，后项写 `USE_EXISTING` 及预期的创建读回。分支已存在则记录实际 ref/SHA，各项均复用。合并清单引用各自正文；首次预览即可使用真实工作项链接，无须预先取得其他 Bug 的 Wiki 链接或未来回执。
4. **TAPD Plan 模式一张合并清单，一次确认。** 批量时先为每个 Bug 做只读 `PLAN`，将准确 Bug、父目录、正式页名、各自待确认版本/指纹与完整稿并列。明确一次确认涵盖的正文，存在业务决定时先解决。确认后逐 Bug `SAVE → READ`，读回同一 Bug 的独立执行 Wiki、版本及原 Bug 唯一回链。一 Bug 一页。部分保存或结果不明时核对已写入效果，仅补缺失项。返回各页、待补项及新会话启动指令；立即执行时同时确认本次动作。

## 按原执行 Wiki 开工

立即执行消费刚确认并保存的版本，新会话中用户明确“按这份计划修复”后，由 [执行 TAPD Plan](../executing-tapd-plan/SKILL.md) 按[开工、验证和交接流程](../executing-tapd-plan/references/executing.md)读取原 Bug 的确认版本、范围、已完成效果及本轮授权。每个 Bug 的全部仓库共用一次 [implementing-work](../implementing-work/SKILL.md) 实施交接，按 F/TC 执行。逐 Bug 复用原分支，各自核实状态/处理人、全部相关仓库的修复和独立评审。共享分支的后项等前项的所选终点就绪后再实施，保留各 Bug 的独立 diff 和交付证据。

## 开发收尾与交付

按[开发收尾](../executing-tapd-plan/references/executing.md#开发收尾)完成实现评审，取得本轮范围的 `REVIEWED` 后报告「开发完成」。

每个 Bug 只产生一份[完整修复记录](../implementing-work/references/bug-repair-record.md)。其发表时点与一条执行页回链分别核验。“先完成代码，我检查后再提测”走 `IMPLEMENT`，直接提测：否，完成评审与所需的单条修复记录后停在人工检查。已选择并授权提测时，把已审变更与草稿交给 [submitting-for-test](../submitting-for-test/SKILL.md)，在适用的交付、提测 Wiki 和回链通过后发表/复用单条记录，最后登记待测试。已评审后单独要求交付则走[直接提测流程](../submitting-for-test/references/direct-submission.md)，尊重当轮构建选择。明确需要上线时再进入 [going-live](../going-live/SKILL.md)。

## 已有资料与窄范围请求

- 仅要求建分支时按 [preparing-work](../preparing-work/SKILL.md) 办理，返回分支结果。仅请求命令时只返回命令。
- 复现、调查或查看计划只做只读核对。测试反馈、已确认的历史修复与原分支用于恢复实际进度。遇到已经待测试的 Bug 保留原处理人。需要独立开工时使用对应 Bug 的正式执行页。对已有独立评审回执、只剩提测或上线的历史修复，按[既有修复的交付与续接](references/legacy-execution.md#4-按请求交付)核对相应终点。

## Execution feedback

新执行 Wiki 的确认前预览只在内存保留阶段信息，取得本次保存或保存并执行授权后才按[执行反馈记录](../../references/execution-feedback.md#attach-to-a-workflow)启动本地诊断并跨能力复用 runId。直接从已确认 Wiki 开工时按实际开工授权启动。诊断失败不阻断业务，正式进度与可续办证据以 Wiki 和实际回执为准；只在用户明确要求时导出或提交反馈。
