---
name: fixing-bug
description: Use when the user asks to fix TAPD Bugs across their required repositories, with fixed branches, one repair record per Bug, and reviewed implementation before optional delivery.
---

# Fix TAPD Bug

Preferred lead model profile: `CRITICAL`。可选模型时使用
[模型路由](../../references/model-routing.md)，可用性不阻塞实际工作。

编排 Bug 修复，复用准备、实施和交付能力；只在进入相应阶段时读取其技能。
读取 [交接约定](references/contracts.md)，异常或回归检查时再读
[验收场景](references/acceptance-scenarios.md)。不在入口复制下游写入流程。
读取或写入外部系统时沿用 [工具路由](../../references/tool-routing.md)。

## 1. 明确本轮范围

接受一个 Bug URL 或有序 URL 列表，以及各仓库的固定项目和修复分支约束。
准确去重并保留顺序；来源可以是用户、当前对话或 TAPD 查询。
以 Bug 为外层、必要仓库为内层。一个 Bug 跨仓库时保留完整修复范围，各仓库
分别绑定定义；同一仓库的多个子项目合并为一次分支操作，不把多项目误判为
只能选择一个项目。用户明确的仓库/范围约束有冲突时先说明，不自动扩大。

- `work_mode=AUTO|INITIAL|CONTINUE`：继续同一 Bug 时复用原项目、仓库和分支，
  不新建“后续修复”分支。先前明确的交付终点仍适用时可复用，本次明确要求优先。
- `branch_mode=AUTO|CREATE|USE_EXISTING`：按准确分支和已核实基准判断；
  已有分支不要求已经包含当前 Bug 的提交、测试或文档。
- `delivery_mode=IMPLEMENT|SUBMIT|GO_LIVE`：普通“修复”默认 `SUBMIT`，包含合并
  实际 dev/develop、构建测试环境和提测 Wiki；清单确认及正式提测计划门禁仍必需。
  明确“只修复验证/只开发、不提测”才选 `IMPLEMENT`；明确上线才选 `GO_LIVE`。
  已有 Wiki、待测试状态、测试反馈不覆盖本轮明确终点。“合并并构建”表示 dev/develop 与项目测试环境。

只在选择提测或上线时解析 `submission_profile=AUTO|STANDARD|NO_WIKI` 和
`deployment_mode=AUTO|DEPLOY|SKIP`。明确需要提测 Wiki（会创建/更新）或未关闭时选 `STANDARD`；
明确不需要提测 Wiki 选 `NO_WIKI`。`AUTO` 默认 Wiki 需要、测试构建/部署 `DEPLOY`，
仍有效的明确选择优先；明确直接提测/跳过发布选 `SKIP`，不另弹 Wiki 选择题。
其余默认和实际交付门禁由 `submitting-for-test` 负责。
不向用户索要 Wiki URL：该能力负责定位或创建 Wiki；缺少用户提供的
Wiki 链接不能进入“待决事项”。只修复时不解析、不询问 Wiki/Jenkins 设置。

## 2. 只读定位与确定清单

1. 为每个 Bug 的每个必要项目调用 `zan-workflows:preparing-work` 只读预检，
   每次仍返回单项目定义。同仓库子项目可保留多份定义，合并执行时保留全部
   原范围和验收，分支事实必须一致，不能按仓库键覆盖掉其中一份。
   复用同一 Bug 的 TAPD、项目、代码和分支证据；
   全部条目预检完成后再合并展示，不逐个确认。
   `PENDING` 预检快照不是可执行交接。
2. 按 [准备深度与验证](../../references/adaptive-workflow.md) 形成可执行的
   范围说明。局部修复直接保留内存 `implementationBrief`；复杂调查按实际
   依赖展开，已有 Plan 则引用同一份内容，不强制 Bug 生成需求 Task 或 Plan。
3. 按 [确定与执行清单规范](../../references/execution-checklist.md) 展示 `确定清单`：
   先列执行项目名称（可多个）、关联缺陷和本轮交付，再展示主表；有本轮明确
   选定 Task 时依共享规范在执行内容前列三列表，不为 Bug 强制创建任务：

   | 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 待决事项 |
   | --- | --- | --- | --- | --- | --- |

   Bug 链接保留在每个项目格；长内容用全清单连续的 `#01` 备注。TAPD 写入和
   合并/测试环境的三项意图沿用共享排版，普通修复默认都需要；需要 Wiki 时先展示
   本次模板预览。不另列分支或验证安排。
4. 每个 Bug 只用一个“TAPD 更新与修复记录”区块，预览准确状态/处理人变化、评论
   账号、开始记录，以及评审通过后补充完整结果的操作。核实修复人使用
   [状态与处理人规则](../implementing-work/references/bug-repair-owner.md)；
   评论内容使用 [Bug 溯源与修复记录](../implementing-work/references/bug-repair-record.md)。
   保留平铺字段，没有关联需求省略该行；历史引入事实未知就如实说明。
5. 有实际需求、闭环、接口/字段或外部条件缺口时先解决或明确排除受影响 Bug。
   等待授权不是缺口，不写“执行确认 1 项”。没有适用缺口写“无”，最后只问
   `是否按以上确定清单执行？`。原始修复请求只选择条目，不批准尚未展示的清单。

确认绑定表格、编号详情、所引 Plan、准确分支/基准、修复人员和实际写入。
完整 SHA、原始 payload 和校验证据保留内部；实质内容变化只重开受影响部分。
同一分支创建后的 CREATE → USE_EXISTING、排版变化不增加确认。
确认当前完整确定清单后，才称 `执行清单` 并按其推进，不为名称变化重复确认。
用户修改范围/方案或合并、Wiki、部署选项时，返回确定阶段，按共享规范重新展示完整确定清单及
需要的 Wiki 模板，再等待执行确认；选项回答或“其余沿用”不能替代完整清单。
已完成效果标明不重复，不重建分支或重发原记录。
确认前只读，不创建分支、改 TAPD、写测试、改源码、提交或推送。

## 3. 修复、验证与独立评审

按确认顺序逐 Bug 执行：

1. 写前为本 Bug 的全部项目定义再次调用 `preparing-work`，按仓库复用 Git 证据，复核可变 refs、状态/处理人及确认绑定，
   不重复广泛定位。只接受 `READY_FOR_HANDOFF`；若返回 `PENDING|BLOCKED`
   或准确仓库、分支、范围、人员/状态变化，暂停整个队列并更新相应事实。
   已核实的本轮分支创建、状态/处理人写入是预期效果，续接复用其读回与
   仍匹配的授权；不把它们当成外部变化或再次发送旧状态 payload。
2. 单一定义交接原 `TapdWorkDefinition`；多项目将同一 Bug 的全部定义放入
   `work_definitions`，连同完整范围说明/Plan 和当前授权，一次交给
   `zan-workflows:implementing-work`。该能力负责各仓库分支操作，以及一次
   Bug 状态/处理人联合写入读回、开始记录、逐仓库源码修改、验证和独立评审。
   顺序必须是开始评论读回后改源码，全部必要仓库验证及独立评审通过后写完成评论；
   有跨仓库验收时一并通过后，才核实一份完整完成记录。
   同一 Bug 内独立步骤可按 [多任务实施](../implementing-work/references/parallel-execution.md)
   并行；主代理统一控制状态和评论，子代理只处理分配的代码及局部验证。
   本节逐 Bug 顺序及共享分支交付等待不因子代理并行而改变。
3. 各仓库第一次成功创建并读回固定分支后，该仓库后续 Bug 使用 `USE_EXISTING`。
   `CONTINUE` 复用仍有效的范围授权；增量范围不明确才询问。
   已待测试的续修使用 `SKIPPED_ALREADY_WAITING_TEST`，保留状态与处理人。
4. 仅部分仓库代码/评审完成不等于 `REVIEWED`：全部必要仓库与跨仓库验收、
   Bug 开始和完成记录也必须核实。多仓库成功交接 `reviewed_changes` 集合，
   每项仍是准确仓库的 `ReviewedChange`，共同引用同一 Bug 完整记录。
   评论失败保留已有代码与评审结果，核查原记录后补缺，不重跑已完成工作。
5. `IMPLEMENT` 在 `REVIEWED` 结束该 Bug，并处理下一个已确认条目。
   不调用 `submitting-for-test`，包括其 PLAN 阶段。
   SUBMIT/GO_LIVE 则在该 Bug REVIEWED 后进入第 4 节；本项交付完成前不因
   共用分支而提前实施下一项，等待准确交付确认或人工合并时暂停队列。

准备失败或共享仓库/分支约束失效时停止所有后续写入。仅当失败明确局限于
某个 Bug，且不使共享分支或已审查改动失效时，才可报告该 Bug 失败并继续
其他已确认 Bug；后续交付仍由下游核对准确 diff，不能夹带失败项。

## 4. 按请求交付

仅 `SUBMIT|GO_LIVE` 进入 `zan-workflows:submitting-for-test`。
将同一 Bug 的全部 `work_definitions` 与 `reviewed_changes` 按仓库准确配对，
单仓库仍传原对象。先用 `submission_phase=PLAN` 展示完整 `SubmissionPlan`，在确认前不提交、
推送、创建 MR、部署或更新 Wiki/TAPD。用户随后确认这份准确计划，才用
`submission_phase=EXECUTE`。初始修复清单不能替代提测计划确认。
该 Bug 全部必要仓库的 Git/部署门禁通过后，才统一写 Wiki 和 TAPD 提测登记；
缺少必要项目结果或交付能力无法聚合时保留待交付，不能先把 Bug 改为待测试。

需要 Wiki 时沿用 [共享提测 Wiki](../../references/shared-test-wiki.md)：
同一 Bug 的项目/原分支共享一页；不同 Bug 不因同分支或关联 Story 合页。
入口不直接调用 `drafting-wiki`，不要求用户准备 Wiki 目标。

只有 `SUBMITTED` 且明确要求上线，才把准确结果交给
`zan-workflows:going-live`，由其负责上线计划确认、合并、涉及的工具包发布、
Wiki 更新和资源检查。`AWAITING_MERGE` 暂停依赖它的队列，展示准确 MR、
`userAction.message` 和“已合并，继续上线”入口；续接先只读核实同一 MR。

将返回的清理候选留到全部相关 Bug 结束后去重展示，不能在逐 Bug 循环中
删除后续仍使用的分支。清理由 `going-live operation=CLEANUP` 按其准确资源
清单和单独确认执行；开发远程分支不能由本地清理授权推导删除。

后续才要求提测时，复用仍有效的 `ReviewedChange`，让接收能力核查当前
仓库、分支、diff 和验证；只补失效证据，不重复激活 Bug 或重新修复。

## 5. 返回结果与续接

按原顺序报告每个 Bug 的实际完成范围、验证/独立评审、修复记录、首个缺口
及下一步。仅列实际发生的交付/清理结果，不把待人工合并写成完成。
交接仅保留当前对话中的能力结果；不创建运行台账、恢复文件、原始数据或
证据目录。中断后先核实已完成效果与剩余范围，不凭隐藏状态重放写入。
