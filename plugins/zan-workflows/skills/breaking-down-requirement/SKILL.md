---
name: breaking-down-requirement
description: Use when a TAPD Story must be split into development Tasks, or existing requirement Tasks need scoped changes, with verified developers, final workload estimates, user confirmation before TAPD writes, and links to implementation Plans.
---

# Break Down Requirement

写入阶段采用 `CRITICAL`，只读草稿采用 `BALANCED`；需要选择模型或委派时
读取共享 [模型路由](../../references/model-routing.md)，不为切换模型额外启动 Agent。

把一条 TAPD Story 的已分析范围拆成可分配、可估时、可验收的开发任务。
本技能只负责任务清单及其确认后的 TAPD 创建/更新，不绑定分支、编写正式
Plan、改业务代码、流转任务状态或交付代码。

本能力用于实际需要的任务拆分/更新及正式 TAPD Plan。小改动可直接复用
准确条目和简短执行说明，无需仅为实施调用本技能。用户要求拆任务或改任务
时执行本技能的完整确认和读回；已有正式任务结果保留其要求与未解决缺口。

## Inputs and handoff

接受精确 Story URL、PRD/原型和人员约束，以及可复用的
`ProposedRequirementScope|ConfirmedRequirementScope`。接受
`phase=PLAN|EXECUTE`，默认 `PLAN`；接受
`confirmation_mode=STANDALONE|DEFER_TO_ORCHESTRATOR`（默认 STANDALONE）。
DEFER_TO_ORCHESTRATOR 只返回完整提案，交编排统一展示并确认，不另行提问。
EXECUTE 包含 CREATE/UPDATE 时必须携带当前对话中对完整拟写入任务
清单的明确确认。全部为 REUSE 且无拟写入字段时，只读核对所选任务即可，
不申请创建/更新授权；实施范围与分支的确认仍由对应能力负责。
独立调用先经 `workspace-project-knowledge` 和
`writing-plans phase=SCOPE_REVIEW` 取得项目、origin/master、范围和验收证据。
复用有效证据，不重新启动评审。需求阻塞未清零时只整理草稿。

输入是已有 Task 时，读取其所属 Story 和该 Task；默认只校验/补齐所选 Task，
不能扩大成整个 Story、创建子 Task 或重新拆分他人任务。只有用户明确要求
拆整个需求时才扩大范围。Bug 交回 `fixing-bug`。

读取 [任务与 Plan 交接契约](references/contracts.md)；使用工具前读取共享
[工具路由](../../references/tool-routing.md)。终态为
`DRAFT|AWAITING_TASK_CONFIRMATION|TASKS_READY|PARTIAL|BLOCKED`。
输出内存 `TaskBreakdownProposal` 和实际写入/读回后的 `TaskBreakdownResult`，
不生成需求原始数据、运行记录或本地 JSON 台账。

## 拆分与估时

按项目 → 内聚页面/模块 → 人员责任拆分，每个 Task 明确交付结果和验收。
不同仓库或不同负责人分别建任务；同一模块可对应多个 Task。正常工作量
半天到两天可作为粒度参考，不能为了凑时长拆零碎任务。组件、字段和事件
等实施细节留在 Plan；必要自测归入对应任务，独立联调/公共能力有独立
交付和实际工作量时才单列。不能为已有未改动能力制造任务。

每个任务记录稳定 `key`、项目、`deliveryUnitKey`、功能编号、范围/排除项、
验收、依赖、开发人员 TAPD 账号、正常工时构成、估算依据和最终预估。
人员来自用户分配或经核实的既有责任人；团队身份映射仅作线索，Git 作者
或分支作者不等于 TAPD 开发人员。写入前用空间成员/可分配账号证据核实。
缺少人员或工时可展示草稿，但不能确认执行、创建空任务后补填或进入实施。

```text
正常工时 = 需求理解 + 编码 + 必要联调 + 自测及修正
最终预估工时 = 正常工时 × 0.8（仅一次），四舍五入到整数小时
```

以上计算属于内部规则。对话、进度更新、确认清单、排期建议、TAPD 描述和
正式 Plan 只展示最终“预估工时”及任务工作范围，不展示系数、公式、原始
工时、折算前后对比或“折算/打折后”等提示。正常工时、构成、系数和计算
校验结果仅留在内存契约中，不原样输出 Proposal/estimate 或内部错误详情。
既有描述如含内部计算，在会话中只摘要业务范围，不原样贴出计算内容；
不为此自动修改历史任务。本次新拟写入描述遵守相同显示规则。
无需在会话中解释这条显示规则。

按正常开发投入和现有能力的实际增量估时，不能先按 AI 提效折算再乘系数。
等待接口、等待评审单列排期依赖，不计开发投入。未知项说明假设和可信度。
最终预估工时统一为正整数小时，按 1 小时为单位四舍五入；即使实际字段
支持小数，也不生成或接受小数预估。对外展示、TAPD payload、读回和 Plan
均使用该整数工时；舍入为 0 时重新处理任务粒度，不能提交零工时。保留正常估算及构成，更新时从正常
工时重新计算，不能对已有最终预估再次乘 0.8。先校验再展示确认清单：

```bash
# JSON 仅为 stdin 内存输入，不从 Markdown 解析、不写流程文件
node <skill-dir>/scripts/validate-task-breakdown.js
```

调用方通过 stdin 发送契约对象并关闭输入，不需要临时文件。
该校验器验证清单/指纹/Plan 关联，不调用 TAPD，也不能证明账号、字段或
人类确认真实；这些事实由 Agent 从当前会话与实际工具读回核实。

## PLAN：只读准备与确认

1. 读取准确 Story、现有 Task 和相关 PRD/验收；按该 Story 全部分页查询任务，
   保留任务 ID、当前字段快照和稳定关联标记。标题相似只作候选，不能直接复用。
2. 从实际工具能力与空间字段配置解析任务的父需求、开发人员、预计工时字段、
   单位、精度及其它必填字段；先查自定义字段配置再用字段名。预计工时与实际
   工时是不同字段，不能把工时仅写进描述或伪造字段配置。日单位只有实际
   工作日小时数已核实并展示换算时才可适配；规范化清单仍以小时计。
3. 按共享 [TAPD 任务创建路由](../../references/tool-routing.md#tapd-任务创建)
   核实 `create_task`/`create_tasks`、准确更新/读取及成员校验能力。仅 REUSE
   不要求创建/更新能力，只读草稿也不以写能力为前提。新增方法缺失时先核对
   版本与连接；仍不可用或不支持必填字段时返回 `BLOCKED_TASK_WRITE_CAPABILITY`，
   保留只读草稿，不在本流程改走其它创建路径。
4. 根据范围与工作量形成 `CREATE|REUSE|UPDATE` 清单。已有任务符合已确认
   范围、人员、工时和关联时 REUSE；需修改时展示旧/新值；歧义需先解决。
   移除范围只列“取消建议”，本技能不删除、关闭或覆盖已有任务。
5. 展示下表、总预估工时、任务范围与依赖、字段映射、完整拟写入
   描述和其它必填字段。创建/更新的描述含独立完整标记 `zan-task:<Story完整ID>:<key>`；
   查重按完整标记匹配，不接受 key 前缀。无标记或空描述旧任务可凭准确 ID、
   父需求与范围/工时证据 REUSE，保留已读回的描述，不强制重写。
   清单指纹覆盖全部拟写入内容。明确任务写入授权与分支/Plan/实施授权的边界。

| 动作/稳定编号 | 现有任务 ID | 项目/模块/功能编号 | 标题/范围/排除项 | 开发人员（TAPD 账号） | 预估工时 | 依赖/验收 | 旧值→拟写入值 |
| --- | --- | --- | --- | --- | --- | --- | --- |

纯 REUSE 清单直接完成只读准确读回；结果一致时返回 TASKS_READY，不询问
创建/更新确认，也不调用写工具。若核对发现范围、人员或工时等需要修改，
转为 UPDATE 提案并执行下述写入确认，不能把不同事实作为 REUSE 接受。

只有清单包含 CREATE/UPDATE，且人员、工时、范围、必填字段及能力均已核实才询问：
`是否按此拆分清单创建或更新 TAPD 任务？`
然后返回 `AWAITING_TASK_CONFIRMATION`，等待用户回答。最初“开发需求”、
评审面板提交、Plan 确认或超时均不是该任务清单的确认。编排可将此表与范围/
分支清单一次完整展示并统一确认，但必须明确包含 TAPD 任务创建/更新。

## EXECUTE：确认后的写入与读回

CREATE/UPDATE 的确认必须绑定未变化的清单指纹。范围、人员、工时、目标、字段映射或任何
拟写入内容变化时，展示差异并重新确认。只读刷新 Story、字段、成员和已有
Task；被他人改动或出现相同关联标记时停止，先核对，不直接覆盖/重复创建。

CREATE 按上述共享路由调用 `create_task` 或 `create_tasks`，参数绑定已确认
payload；UPDATE 使用准确现有 ID 的 `update_story_or_task`，REUSE 只读。
读回使用 `get_stories_or_tasks`。创建结果仍进入原 `TaskBreakdownResult`，
不新增另一份任务结果或台账。

批量调用不是事务。按返回的 index 在本批发送列表中绑定稳定 key 和实际 ID；
逐项检查 state、id、task 与全部获准字段，尤其 description 中的范围和完整
关联标记，工具自带成功标记不能替代这些比对。遇到 partial、failed、unknown
或 skipped 时保留已有 ID、已成功及未执行项，停止后续批次和其它写入，按下述
恢复流程核对，不能重放整批或把已有 ID 的任务再次创建。

按依赖顺序执行，只写各项获准字段；单项或每批返回后立即核对准确 ID 的
实际读回，包括父 Story、人员、预计工时、标题、描述/稳定标记及其它获准字段。
工具读回未包含所需字段时按准确 ID 补读，REUSE 同样需要准确读回。
各项实际 ID 与结果绑定在内存 `TaskBreakdownResult`。批量返回后发现额外
字段不符时，按真实结果核对整批，不能假定其它项尚未创建。
任一失败、读回不符或结果不明即停止后续调用，返回已成功项、失败/未知项
与 `PARTIAL|BLOCKED`；不自动重试创建、不撤销成功项。恢复时完整查询关联
标记并核实唯一匹配；未能证明失败写入未生效前不得再创建。确需重试时
展示剩余清单和恢复证据并确认，不重放已成功项。

全部必要任务准确读回才返回 `TASKS_READY`。它授权后续消费这些任务，
不授权分支、Plan 写入、实施、任务状态流转、评论、提交或部署。

## Plan 与增量衔接

沿用 [需求任务关联](../developing-requirement/references/task-linked-delivery.md)
把准确父 Story/所选 Task、项目/分支、Plan 步骤、依赖缺口与验收证据串联。
本技能只返回已有契约中的任务事实；后续实际 MR、构建和 Wiki 由对应能力
产生后关联，不预造链接，也不因此更新任务状态、评论或历史描述。

开发起止日期不是任务创建或开始实施的默认要求。仅在用户请求排期或日期
处理时加载 [实施排期推荐](../implementing-work/references/implementation-schedule.md)，
结合剩余工作量、人员容量和依赖给建议；沿用最终工时，不重复折算。推荐
默认不写 TAPD，不能以缺少日期阻塞任务创建或已授权实施。

内部交给 `writing-plans` 的是稳定 key、真实 Task ID、人员、正常/最终工时、
功能编号、依赖、验收及读回证据。一个页面/模块一份 Plan，可包含多个
TAPD Task；一个 Task 可对应多个 `T-*` 步骤，每个步骤归属一个 TAPD Task，
不强制一 Task 一 Plan，不另建 JSON 台账。

Plan 细化发现范围或工作量变化时，返回受影响任务差异，先重新确认并更新
任务，再确认受影响 Plan；无关 key、Task ID 和功能编号保持稳定。
仅补技术证据不自动改估时。开发读取所选 Task 及关联步骤、校验依赖并执行；
步骤完成不等于任务验收完成，本技能不自动将 Task 写为 done。
