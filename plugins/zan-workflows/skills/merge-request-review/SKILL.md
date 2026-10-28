---
name: merge-request-review
description: Help merge-authorized GitLab users discover pending merge requests, review their code and merge readiness, and execute explicitly authorized approvals or merges to master/main.
---

# 合并请求 Review

主代理模型配置按阶段动态路由：发现阶段默认 `BALANCED`；高风险审核和所有合并决策使用
`CRITICAL`。reviewer 子代理的模型由运行环境默认分配。选择 reviewer 子代理前读取共享
[model-routing policy](../../references/model-routing.md)。
所有 GitLab 读写遵循共享 [tool-routing policy](../../references/tool-routing.md)：
GitLab MCP 优先，浏览器不是默认降级路径。

面向具有合并权限的人员，协助判断哪些 MR 需要处理、改动是否可靠、当前能否合并，
并执行已授权的远程操作。保留三个可独立使用的动作：发现 MR → 审核 MR → 合并 MR。
仅运行用户要求的动作；“审核”“判断能否合并”均不授权 approve 或 merge。

## 1. 确定对象、账号和本轮动作

使用当前会话已明确的 MR URL、`project!iid`、项目路径或项目范围；无足够上下文时只补问
一个必要的范围信息。不默认遍历账号全部可访问项目，不使用旧管辖名单或 B 端白名单。
“当前项目”从已核实 remote 解析；简称、多 remote、多 host 或账号歧义先查证。

通过 GitLab 读回 host、当前连接账号、project id/path、MR iid 和 source/target。
用户具备合并权限是使用定位，不替代执行账号对当前受保护目标分支的有效权限。
分别保留本人处理关系、merge 能力和 approve 能力；角色级别不能单独证明当前权限。
权限不足或未知仍可完成只读审核，合并资格保留 `merge-permission` 阻断。

只处理目标为 `master` 或 `main` 的 open MR。指定对象不符合时明确列为跳过。
`develop` 包含工作区约定的 `dev`：禁止其作为源分支或携带其合并历史进入任何目标；
审核发现该问题时独立报告 `safety`，不把历史违规直接判成代码缺陷。
本地仓库仅作只读 diff/上下文检查；使用 fetch MR refs、`git show <ref>:<path>` 等方式，
不要为审核切换用户工作区分支或顺带修代码。

## 2. 发现待处理 MR

请求“有哪些需要我合并的 MR”“列一下这个项目的 MR”等时，收集本次范围内的候选：

- 明确项目或 MR：列出该范围内的 open master/main 候选，不按 reviewer/assignee 丢弃对象。
- “需要我处理/合并”：以当前账号的 reviewer、assignee、待本人审批或明确交办关系为依据。
  有 merge 权限只证明可处理，不自动把项目所有 MR 变成个人待办。
- 身份或处理关系不可核实时，在已明确项目内保留候选和缺口；无项目范围时补问。
  查询失败不报告“没有待处理 MR”。

“这个项目需要我处理的 MR”同时给出项目和个人条件时，保留项目候选，但按处理关系
区分本轮个人清单；无关系项单列为“项目候选，非本人待办”，不混入个人待办数量。

对每个候选读取标题、作者、source/target、HEAD SHA、处理关系、当前目标的合并权限，
以及工具可见的 conflict、draft、pipeline、approval 和讨论摘要。
安全违规项显式标注；不要静默隐藏。结果区分待审核、暂缓与跳过。
发现阶段不做完整源码清查，不输出代码通过或可合并结论，也不执行远程写入。
按 [报告格式](references/report-format.md#发现结果) 返回；若用户同时要求审核则进入下一步。

## 3. 审核改动与合并资格

读取 [交接约定](references/contracts.md) 和 [检查清单](references/review-checklist.md)。
对每个 MR 重新读取 source/target SHA 和当前状态，使用当前完整 diff；发现后有新提交
须说明实际审核版本。按 host/project 复用稳定 preflight，按 MR 构造独立 review packet。

### 项目规则与修改依据

核实审核版本上受影响路径的项目规则、修改依据、验收/排除范围、实际行为及消费者，
按 [变更与文档一致性](../../references/change-consistency.md) 检查范围、影响和适用文档。
不能仅从 diff 倒推获准范围，也不强制普通项目补建 TAPD/Wiki。
文档缺失、权限缺口和治理异常保持为独立门禁，只有已确认代码缺陷才判代码不通过。

公司项目需要知识补充时调用 [workspace-project-knowledge](../workspace-project-knowledge/SKILL.md)，
传 canonical 项目/子项目、审核问题和 `purpose: review`，复用有效 `KnowledgeContext`。
未登记或 Hub 不可用不单独阻断普通审核；规则、Adoption、实时 refs 和关键源码仍从
权威来源精确核实，缺少关键正确性证据时标未完成。reviewer 不重复发现公共上下文。

按实际采用范围执行 `scripts/review-policy.mjs classify-adoption`：

- `ordinary / not-adopted`：完整普通审核，不强制 Zan 检查。
- `zan-enhanced / adopted`：额外核对适用 Zan 规则、矩阵及声明命令，`MUST fail/unknown` 阻断。
- `ordinary-with-zan-warning / misconfigured|unknown`：继续代码审核，治理异常单独阻断。

Adoption 判定读取 [Zan 检查方法](references/zan-conformance.md)。
受影响范围没有声明和 Adoption 时判未接入；monorepo 不传播无关子项目的规则或异常。
分类显式保留 `adoptionScope/scopeEvidence` 和真实文件事实，未知范围不能冒充不适用。
项目明确的 CI、审批和文档要求适用于所有模式；未采用 Zan 不是作者需要修复的问题。

### 风险与独立审核

从 MR 元数据、changed hunk 和实际行为分类，不仅凭“订单”等业务域名称升级：

- `HIGH`：改动鉴权/租户隔离、敏感数据、支付/订单/账务/库存/结算计算、破坏性写入、
  持久化迁移、关键并发/重试、关键 payload/schema、公开包 API/导出、环境/部署行为，
  或需要跨模块数据流推理的大型 diff。
- `ROUTINE`：边界清晰的 UI、文案、样式或局部逻辑，且未改变上述关键行为。

按风险选择对应角色：`ROUTINE` 使用 `agents/mr-code-reviewer.md`；
`HIGH` 使用 `agents/mr-critical-reviewer.md`。
启动 reviewer 子代理时不指定 `model` 或 `reasoning_effort`，角色文件也不绑定模型；
审核深度和证据门槛由风险决定。单个 MR 有子代理能力时同样委派；不可用则主代理等价审核。
多个 MR 按 MR 粒度并行，最多 6 个 reviewer；优先 HIGH 和较大改动，不因并发或成本降级。

reviewer 只读自己分配的 MR，消费 packet 并按共享契约返回结果；不 approve、merge、
发评论或改文件。普通角色遇真实高风险信号升级；高风险角色追踪关键路径、边界和恢复。
主代理汇总去重并保守处理冲突；超时/失败且未完成等价审核时标 `code-review-incomplete`。

### 统一裁决

代码结论为通过 / 不通过 / 未完成，来自代码、调用链和必要验证证据。
合并资格为可合并 / 不可合并，由技术、安全、治理和当前账号的目标合并权限共同决定。
没有 pipeline 仅在项目明确要求时阻断；必要契约不可见且影响正确性判断时才判未完成。

所有项目适用 [Mock 生产禁令](../../references/mock-development.md)。没有当前完整源码清查
不能给可合并结论；普通 CI、无 Zan/TAPD、关闭开关或 retired 标签均不豁免。
复用同 Plan/brief 的现有 inventory，检查完整 source/target 范围、运行入口和构建隔离；
源码检查不等于未来制品检查，测试 Mock 授权不覆盖 master/main。

按 [当前变更和 Mock 复核](references/merge-rules.md#当前变更和-mock-复核) 准备
`currentChange/changeReview`、当前 `mergePermission` 和 Mock 证据，运行
`scripts/review-policy.mjs evaluate-merge` 并等待真实异步结果。
该命令复用共享 change-consistency / mock-safety 检查；缺项、unknown、失败或过期证据
不能放行。可合并结论不构成写入授权，reviewer 建议也不替代主代理的实时门禁。

按 [审核报告格式](references/report-format.md#审核结果) 返回结论及精确阻断。
只审核到此结束；不自动执行批准、合并、Wiki、部署或清理。

## 4. 执行已授权的批准或合并

只有明确要求“合并”“审核通过就合并”“批准”等操作时，读取
[合并执行规则](references/merge-rules.md)，核实准确操作、source/target 和目的。
已有匹配授权继续使用，不为同一操作重复确认；缺少审核时先完成当前版本审核。
“合并”不附送独立 approve 写入，“批准”不隐含合并。

每次写前刷新执行账号/有效权限、MR open/draft、source/target SHA、统一门禁和对应授权。
source 变化先更新审核；target、规则、权限或文档变化刷新受影响检查。
批量合并逐项读取当前目标，不能直接沿用上一个 MR 合并前的 SHA。
当前能力、技术/治理门禁和操作授权全部满足后，才调用准确远程操作。
批准前使用 `evaluate-approve` 及独立 `approvePermission`，允许本次批准所需的
`approval=required-missing`；批准调用必须携带已审核 source SHA，写后读回同一 MR
的 SHA 和真实审批状态。SHA 不匹配时刷新受影响审核，不自动重试批准；合并仍须通过
`evaluate-merge`。

使用 GitLab MCP，merge 时按工具支持传当前 SHA、`auto_merge: false`、
`should_remove_source_branch: false`。以准确 MR 的 merged 状态、时间及 merge commit
读回确认成功；超时或结果未知先查状态，不盲目重试或声称完成。
冲突、失败、API fallback 和授权变化的处理按执行规则，不顺带修复或替换他人的 MR。
按 [操作结果格式](references/report-format.md#批准与合并结果) 返回实际完成与阻断。

## Execution feedback

按 [执行反馈记录](../../references/execution-feedback.md#attach-to-a-workflow) 在顶层
任务开始时创建本地诊断 runId，能力切换复用同一编号；实际发生时记录阶段、确认
事项、人工纠正及最终结局。传给公共交付会话以关联脚本事件，未接入步骤标明缺口。
诊断不保存业务 Plan/result、不作为授权或恢复依据；失败不阻断原工作。只在用户
明确要求提交/导出时调用 report-execution，不在任务结束时自动上传。
