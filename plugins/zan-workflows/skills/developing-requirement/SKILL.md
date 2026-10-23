---
name: developing-requirement
description: Use when one TAPD Story or selected Task must be developed from verified scope and a fixed branch through proportionate planning, reviewed implementation, and optional test delivery.
---

# Develop Requirement

Preferred lead model profile: `CRITICAL`。可选模型时使用
[模型路由](../../references/model-routing.md)，可用性不降低门禁。

编排一个准确 Story/Task 的需求开发；按阶段调用现有能力，不重复其写入规则。
普通开发主线：读取需求与缺口 → 准备方案及必要任务 → 确定清单获确认成为执行清单 →
精确任务/Plan 写回与分支 → 实施、验证、独立评审 → 返回实际结果。

## 1. 读取需求与交付边界

要求准确 TAPD Story 或 Task URL，读取相关 PRD、原型、附件和评论。
Task 输入先核实真实父需求，只实施选定任务，不默认扩展到兄弟任务。
只有 PRD/原型时可交 `writing-plans phase=SCOPE_REVIEW` 分析，进入分支绑定或
实施前返回 `PENDING_TAPD_STORY_OR_TASK`，不编造 TAPD 身份。
Bug 使用 `zan-workflows:fixing-bug`。

`delivery_mode=PLAN_ONLY|BRANCH_ONLY|IMPLEMENT|SUBMIT|GO_LIVE` 根据明确请求确定：
仅计划、仅建分支、仅开发验证、提测或上线。普通“开发”默认 SUBMIT，包含
合并实际 dev/develop、构建测试环境和提测 Wiki，仍须当前清单及正式提测计划确认。
明确“只开发/仅验证、不提测”才到 IMPLEMENT 为止；
“合并并构建”表示实际 dev/develop 与项目测试环境，不推导 master/生产。
仅请求分支时不要求将来的实现说明、Task、Plan 或排期就绪。

调用 `zan-workflows:workspace-project-knowledge` 核实实际项目/子项目、
仓库、origin 与依赖；在 source search 前取得项目约束和已验证远端基准。
范围以已核实的远程 `origin/master` 为准，不以偶然检出的本地分支为准。
复用有效 TAPD、原型、项目和基准证据，写前刷新可变事实，不按阶段重新发现。

## 2. 查清范围，准备必要产物

调用 `zan-workflows:writing-plans phase=SCOPE_REVIEW`，传入项目、基准、`delivery_mode` 与
`confirmation_mode=DEFER_TO_ORCHESTRATOR`。先只读取得交付/排除范围、
实施证据、验收及真实缺口，不在子阶段重复请求范围确认。
按 [需求就绪检查](../writing-plans/references/requirement-readiness-checklist.md)
区分需求不完整与实施条件缺失，限定本轮范围，不能用假设填平缺口。
界面/Mock 范围不自动扩大到后端实现；真实集成交付不能自行改成 Mock。

按 [准备深度与验证](../../references/adaptive-workflow.md) 选择实际需要的内容：

- 范围、依赖、实施与验收明确的小改动，用内存 `implementationBrief`
  记录行为、排除项、证据、有序步骤与验证。没有 Task/Plan 不强制创建。
- 明确要求正式 Plan、Task 写入，确需多人/跨模块协调，或继续已有正式 Plan
  时，使用原任务与 Plan 能力。任务存在时读取其真实责任范围与负责人，
  不因展示关联而修改旧任务、补估时或制造正式任务结果。
- 只有实际需要逐项复杂交互或用户选择时才使用 PANEL；其他范围用 DIALOGUE，
  不加载未采用的面板运行时。风险直接落实到验证场景，不另分流程等级。

需要任务准备时，调用 `zan-workflows:breaking-down-requirement phase=PLAN`，
并传 `confirmation_mode=DEFER_TO_ORCHESTRATOR`。核实新建/复用/更新、负责人、
最终预估工时、范围、依赖和验收。Task 输入只检查或调整所选 Task。
保留完整写入内容、旧/新差异和 proposal fingerprint；不展示内部工时算法。
需要正式 Plan 时先准备拟写正文/差异与准确目标，保留稳定任务 key。
任务未创建只显示提案，不伪造 ID 或 TASKS_READY。

需求和任务依照 [任务关联](references/task-linked-delivery.md) 连接项目/分支、
Plan 步骤、接口/依赖、缺口、验收及实际交付结果，不建立额外任务台账。

## 3. 准备分支与一次执行确认

按 [分支规则](references/branch-checklist.md) 为每个仓库解析分支作者、
完整名称、创建/复用动作和准确基准。CONTINUE 复用原分支，不随日期换名。
调用 `zan-workflows:preparing-work` 只读预检，传入已验证范围和分支约束；
不重复广泛路由。Story/Task 必须为 `NOT_APPLICABLE_NON_BUG`，不准备 Bug 状态。

按 [确定与执行清单规范](../../references/execution-checklist.md) 展示 `确定清单`：
先列可包含多个项目的执行项目名称、执行事项、关联记录和本轮目标，再展示主表：

| 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 待决事项 |
| --- | --- | --- | --- | --- | --- |

长内容按全清单 `#01` 备注关联实际 Plan 或同一范围说明；Tasks 较多时把明细
放在交付范围引用的备注中。保留父需求与所选任务，不能只确认数量或 Plan 路径。
本轮 Task 创建/更新、人员、最终工时、Plan 内容/位置放在同一实际写入区块。
合并与测试环境沿用共享规范：普通开发三项默认都需要，确认前展示本次 Wiki 模板；
明确只开发、仅计划、仅建分支时不执行交付，显式关闭某项则只覆盖该项。
不查询未选择的 Jenkins/Wiki，也不单独再问 Wiki 选项。

`requirement_blocker_count=0` 才可确认需求；IMPLEMENT/SUBMIT/GO_LIVE 还需
`implementation_blocker_count=0`。有阻塞先解决或由用户明确调整本轮范围，
不能把等待批准算成缺口。PLAN_ONLY 可保留实施缺口；BRANCH_ONLY 只要求
本轮分支准备条件就绪，不受未来实现缺口阻塞。

适用条件通过后只问 `是否按以上确定清单执行？`，然后等待回答。范围、分支、
Task/Plan 内容合并确认，不另问一轮范围或分支；任务写入须明确在本次授权中。
初始开发请求不批准未展示的清单。确认前不创建分支、保存 Plan、写 Task 或源码。
表格、备注、关联 Plan 和实际写入共同绑定授权；实质变化只重开受影响部分。
取得对当前完整内容的确认后才称 `执行清单`，名称变化不增加确认或第二份文档。
用户调整范围/方案或合并、Wiki、部署选择时，返回确定阶段，复核变化后重新展示完整确定清单：概览、六列主表、
写入和三项意图，需要 Wiki 则附模板，再等待确认。未变化内容也保留供对照；
选项回答不能替代完整执行确认，已有分支/任务/记录等效果只展示、不重复执行。

## 4. 精确写回与分支交接

确认后再次调用 `preparing-work`，只刷新可变事实和授权绑定，取得准确
`TapdWorkDefinition` 与 `READY_FOR_HANDOFF`。固定仓库/分支/基准、范围、
人员或实际写入改变时先展示差异，不能继续沿用过期授权。

需要正式任务/Plan 的实施，先调用 `breaking-down-requirement phase=EXECUTE`
执行已确认任务操作；REUSE 只准确读回，不重写描述。要求所选任务全部
`TaskBreakdownResult.terminal_state=TASKS_READY`。失败/不明或部分写入保留
已成功 ID，核查原记录后补缺，禁止直接重试创建。任务创建不改变原分支身份。
PLAN_ONLY 只有 Task 写入也已明确获准时才执行，未授权则保留任务提案。

本轮需要正式 Plan 时，调用 `writing-plans phase=PLAN_WRITE` 保存并读回，绑定
同一范围、仓库、基准和分支。每个模块可包含多个 Task，每个实施步骤用
`tapdTaskKey` 关联真实 Task；不按每个任务新建 Plan 或分支。
确认已涵盖稳定 taskKey → 准确读回 ID/链接的规则、正文与路径时，可机械
回填系统字段；人员、工时、范围或方案变化必须另展示差异。PANEL 保留
可信 confirmPlan 与保存回执，不能借回填绕过协议。

PLAN_ONLY 在保存读回后返回，阶段 Plan 不宣称可实施。BRANCH_ONLY 只执行
已确认准确分支操作并读回，返回 BRANCH_READY；新建分支使用无 upstream
方式，尚未生成 Plan 不能阻塞单纯分支请求。这两种终点均不改业务源码。
普通小改动跳过 Task/Plan 写入，将同一范围说明直接交给实施能力。

## 5. 实施、验证与独立评审

全部项目先通过预检，写前刷新准确分支、工作区和交接事实。主代理调用
`zan-workflows:implementing-work`，单项目传原 TapdWorkDefinition；跨项目将
同一 Story/所选 Task 的已确认定义作为 `work_definitions` 传入，保留各项目
范围说明或已验证 Task/Plan。该能力按依赖和文件/资源边界分批执行，小改动
直接完成，独立任务按 [多任务实施](../implementing-work/references/parallel-execution.md)
使用子代理。主代理统一控制分支、共享操作与最终评审，不把整个流程重复
派给每个子代理，不重复请求仍匹配的实施授权。
不临时换分支，不包含未选择任务或无关改动。跨项目返回的 `reviewed_changes`
按仓库/分支及所选范围对应回原项目；后续仍用各项目原有提测计划，不因并行
改变 Task 状态、交付授权或共享 Wiki 规则。

正式需求实施必须先通过 TASKS_READY 与 Plan 保存/步骤关联门禁；不能用
简短说明绕过既有正式约定。只在用户要求排期/日期时读取
[实施排期规则](../implementing-work/references/implementation-schedule.md)，
默认不生成 scheduleRecommendation，不写 Task 日期/状态/工时。

按实际行为验证，保留 Mock 与真实集成的局限；项目 lint 通过不能代表所有
Task 验收通过。每个项目只有独立评审为 `REVIEW_PASSED` 才可返回 `REVIEWED`。
首个 BLOCKED 停止依赖执行，真实报告已完成部分；所有项目通过才报告整轮完成。
任务的实际完成范围、验证/评审和遗留项按任务关联规则汇总，不自动标 Task done。
IMPLEMENT 到这里结束，不进入提交、推送、提测或上线。

## 6. 按明确请求交付

仅 SUBMIT/GO_LIVE 读取并调用 `zan-workflows:submitting-for-test`。解析实际
`submission_profile=AUTO|STANDARD|NO_WIKI` 与 `deployment_mode=AUTO|DEPLOY|SKIP`。
沿用当前清单的明确选择；未关闭时含 AUTO 默认 STANDARD 和 DEPLOY，不能覆盖明确的 NO_WIKI/SKIP。
先 `submission_phase=PLAN` 汇总各项目准确提测计划并展示；用户确认当前计划后
才 `submission_phase=EXECUTE`，初始开发清单不能替代其提交/推送/MR/部署授权。
使用 [共享提测 Wiki](../../references/shared-test-wiki.md)，同一 Story 的所选
项目/Tasks 共用一页，全部相关交付门禁通过后再统一写回；不按 Task 新建 Wiki。
准确读回后才关联实际 MR、测试构建和 Wiki，不制造未来链接或扩大登记对象。

只有全部 SUBMITTED 且明确要求上线，才将完整结果及涉及的包/消费项目关系
交 `zan-workflows:going-live`。由其负责独立上线确认、原分支合并、工具包
latest/消费端验证、Wiki 和资源检查；业务应用生产部署不由本入口推导。
AWAITING_MERGE 暂停依赖项目，展示准确 MR、userAction.message 和人工操作
下一步；回复“已合并，继续上线”后只读核实同一 MR，不重复已完成效果。

所有相关项目结束后汇总去重清理候选，委托 going-live 的精确清单与单独
确认；不能提前删除其他项目仍使用的分支/工作树。未发生的交付、清理不报成功。
后续才要求提测时复用仍有效 ReviewedChange，由接收能力刷新准确源码与验证，
不为改变终点重复实施、重建 Task 或换分支。

## 7. 结果与续接

按 [进度与下一步](references/progress-guidance.md) 返回实际完成范围、任务/Plan
链接、验证/评审、真实交付结果与剩余缺口。交接沿用当前能力结果，保留准确
TAPD、仓库/分支、范围和已完成效果；只记录实际经过的阶段，不补假 ID/状态。
不创建 workflow report、运行台账、原始需求 dump 或证据目录。
