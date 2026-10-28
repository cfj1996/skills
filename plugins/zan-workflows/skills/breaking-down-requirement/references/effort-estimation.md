# 按实际交付增量估算任务工时

用于新建任务、范围/工时调整及既有任务核对。仅请求开发一个小改动时，继续允许
简短执行说明，不为估时强制建 Task/Plan。对外遵循
[工时展示](../../../references/execution-checklist.md#工时口径)：任务行只有一个 `N 小时`。
本节证据、构成、区间、可信度、评审数据和内部剩余预测不默认显示在清单或 Plan 中。

## 1. 先核实范围和可复用能力

复用 `writing-plans phase=SCOPE_REVIEW` 的当前需求/反馈、准确项目/基准、交付边界和
验收证据。只补会影响判断的源码/项目知识，不重新扫描整个工作区，不提前要求未来 MR。

- 按所选 Task 的实际责任范围估算，区分本轮/历史工作、本人/其他人员、前后端和不同端。
  不凭整个需求标题、页面数量、提交数或代码行数推算工时。共享分支不能全部归给一人。
  Task 工时始终表示其完整范围；续修单独核算新增部分，但不能把它或剩余量当作完整预算。
- 核实当前版本中可复用的页面、组件、公共方法、请求封装和开发参考。已有能力分为
  REUSE（直接使用）、ADAPT（明确适配）、NEW（核实缺口后新建）。每项保留来源及
  真正需要做的增量；“项目有组件库”或“相似需求用过”本身不能证明可直接复用。
- 基准是熟悉当前项目、正常使用已有能力和知识的开发者。普通后台扩展、平台研发、
  迁移兼容和问题定位按各自实际工作判断；不统一按新建页面估算，也不统一压低平台/排障投入。
- 历史案例先核对范围、技术条件和实际责任是否可比；标明是登记工时、参考预算还是
  用户校准假设。参考预算不能冒充实测标准，不为了贴近登记值或用户预期反推构成。
  已校准的最终预算只作同口径对比，不能拿来当正常投入再折算。

### 用户吞吐参考与 Zan 复用校准

用户为当前范围提供吞吐参考时，必须在形成最终小时数前与实际增量交叉核对，
不能只把原估算写上“已复用、已评审”。在既有 `basis`、`analysis.scopeEvidence`、
`analysis.reuse` 和必要风险说明中保留来源、适用阶段、可比范围、比较结论及
偏离原因，不新增校准台账或模型字段；独立 reviewer 同时取得用户原话。

例如当前用户给出“1 天 3 个 CRUD 页面、1 天对接 4 个页面接口”时，它是该用户
提供的经验参考，仅在本轮已核实的 Zan 后台复用条件下用于校准，不是本次实测、
全团队统一标准或所有页面的固定上限。页面开发和接口对接分别比较；先核实表格、
表单、查询、导出、请求和权限等已有能力的实际可用性，普通 CRUD 不重复计框架
搭建、通用组件建设或每页完整探索。复杂交互、资金状态、权限差异及新增工具接入
按具体新增动作、验证和来源单列增量，共享成本仍只计一次。

核对参考表示正常投入还是已校准的最终预算，避免重复折算。日吞吐不自动等于
8 小时/天；只有工作日小时数和参考口径有来源时才做小时换算。缺少换算依据时，
可依据已核实具体工作独立估算小时，并把日吞吐仅作定性对照；若最终工时依赖
该换算则先补齐依据，保留草稿，不能暗用默认日长或反推目标预算。
明显偏离可比参考而没有具体增量证据时，先修订或补证，不能仅以独立评审标志放行。

## 2. 只计算真实投入，公共成本计一次

在原 `estimate.parts` 中描述每项具体工作及所覆盖功能，选择实际需要的理解/分析、
实现、联调、自测修正或定位投入，不强制每个任务都有所有类别或固定加时。
必要验证由行为风险决定；一行关键逻辑也可能需要充分回归。等待接口、评审或发布
属于日历依赖，不计为开发投入；实际执行的排障/协调须说明工作及范围。

同一公共实现或共同验证只归入一个任务的工时；其他任务只计算自己的适配和回归。
用 `sharedKey` 标识本批一次性公共工作，消费者用 `sharedRefs` 和依赖任务引用。
已存在且无需本批实施的能力进入复用证据，不虚构任务或公共工时。不同版本/调用方
确有额外工作时说明具体差异，不能通过换 key 重复计费。

半天到两天只是拆分参考，不能给小调整设半天起步。保持交付内聚，不为整数小时
制造零碎任务或拼接无关工作。CALCULATED 继续使用现有正常投入与最终整数计算规则，
只应用一次；不先按 AI 提效减一次，也不对已有最终工时再次折算。
一般风险给出具体假设和应对；影响范围/复用/必要验证无法判断的关键缺口先补证。
内部参考区间可支持讨论，最终 Task 仍只绑定一个正整数小时值。

## 3. 两种内部取值方式

`estimate.mode=CALCULATED` 用于 CREATE 或实际需要重估的 UPDATE，保留：

| 字段 | 内容 |
| --- | --- |
| `normalHours / factor / hours / basis` | 原计算契约；basis 解释范围、复用和实际增量，不以主观目标工时倒推 |
| `coverage` | FULL_TASK 按完整任务范围估算；INCREMENTAL 仅供 UPDATE，在保留旧完整预算的基础上计算新增投入 |
| `parts[]` | `label, type, work, featureRefs, hours`；type 为 `analysis|implementation|integration|verification|investigation`，work 是具体动作，featureRefs 必须属于当前任务；公共项可带 `sharedKey` |
| `analysis.scopeEvidence / baselineEvidence` | 非空来源数组，说明所选责任范围以及已核实项目/源码基准与版本 |
| `analysis.reuse[]` | 至少一项 `{capability, mode: REUSE|ADAPT|NEW, evidence: [...], delta}`；无可复用能力时用有查证依据的 NEW，不填空白或猜测 |
| `analysis.verification` | 必要验证场景/动作数组，与实际风险相符 |
| `analysis.risks` | `{description, handling, blocking}` 数组；无具体风险用空数组；blocking=true 不能通过就绪校验 |
| `analysis.confidence` | HIGH / MEDIUM / LOW，基于证据完整程度；不是个人能力评分 |
| `sharedRefs` | 可选公共 work key 数组；每项必须由另一个明确前置 Task 唯一计入 |

FULL_TASK 的构成必须覆盖该 Task 完整批准范围；不能只写本轮尚未完成的部分。
INCREMENTAL 同时提供 `retainedBase={taskId,beforeFingerprint,hours,workFingerprint,evidence}`，
来自旧 Task 的准确快照、完整工时和旧工作范围，证明原范围全部保留。此时 parts/
normalHours 只计新增投入；最终 hours 等于旧 hours 加新增投入按原规则计算的整数值。
旧最终值既不反推 normalHours，也不再次折算。原范围删减、替换或原预算需纠正时，
不能机械相加；改用有完整范围依据的 FULL_TASK 并评审，证据不足则先补证。
已完成且仍属于 Task 的范围应保留其预算来源，不因本轮已不需再做而从总预算消失。

`estimate.mode=RETAINED` 用于 REUSE，或仅调整标题/人员/描述而交付工作及工时不变的
UPDATE。只保留 `hours` 和 `retainedFrom={taskId,beforeFingerprint,hours,workFingerprint,evidence}`。
workFingerprint 由 `fingerprintTaskWork` 对读回的旧项目、交付单元、功能、范围、排除项、
验收和依赖计算；旧值来源必须真实，不能从已改变的新范围补造。校验时与当前工作匹配。
不要求历史 normalHours/构成，不反推或重打折。范围/验收/依赖变化时转为 CALCULATED；
纯 REUSE 不申请新的估算评审或写入确认，但准确 Task/人员/工时读回门禁不变。

若 RETAINED 或 CALCULATED+INCREMENTAL 前置 Task 保留的旧预算中已有公共工作且仍待实施，可用可选的
`estimate.sharedWork=[{key,work,featureRefs,evidence}]` 从旧范围/读回中标明共享交付，
不填 hours、不增加或反推构成。新消费者用 sharedRefs + dependsOn 引用；这只证明
公共成本已归属该 Task，不证明能力已经实现。预计使用方的独立评审同时核对该来源。
前置 Task 追加其他工作时仍可保留这些共享归属；旧共享项与新增 parts.sharedKey
统一去重。FULL_TASK 应由本次完整构成的 parts.sharedKey 声明公共投入，不接受 sharedWork。

## 4. 独立评审先于用户确认和任务写入

1. 先固定真实 `estimatorId`，再运行 `validate-task-breakdown.js --prepare-estimate-review`，
   通过 stdin 传原 proposal。
   它校验范围证据、构成、计算和公共成本引用，返回 estimateFingerprint；
   `proposalFingerprint=null`，不是可写入或 TASKS_READY 的凭证。
2. 只要存在 CALCULATED 项，调用只读
   [工时评审代理](../agents/estimate-reviewer.md)。提供原始范围/基准/复用证据、完整提案及
   指纹，由独立上下文核对语义与跨任务成本；不能让估算者自己填通过。
   reviewer 沿用宿主默认模型。子代理不可用时可接受有来源的独立人工评审，否则保留
   草稿并说明缺口；不能降低为自审，不把等待机器评审再变成一次用户审批。
3. 保留预检前的 `estimatorId`，记录 `estimateReview`：`reviewerId` 与估算者不同，`source`
   指向实际评审调用/人工回复；`status=PASSED|REVISE|NEEDS_EVIDENCE`；绑定
   `estimateFingerprint`、全部 CALCULATED 的 `taskKeys`，以及
   `checks.scope/reuse/increment/shared/verification/risk` 各自的
   `{status: PASS|FAIL|UNKNOWN, evidence: [...]}`。
4. REVISE 修订相关任务，NEEDS_EVIDENCE 补具体证据；修改后刷新受影响评审，重新核对
   跨任务公共项，复用仍有效检查。即使小时数没变，范围、基准、复用事实、构成或拟写
   字段改变也使旧指纹失效。所有 CALCULATED 项通过后运行默认完整校验，再将单值
   工时并入原确定清单一次确认。评审不创建任务、不写 Plan，也不替代用户授权。
5. 确认、Task 读回及正式 Plan 的现有校验都要求当前通过的评审；人类确认或写入成功
   不能替代它。全提案指纹包含评审回执，评审指纹仅排除回执本身以避免自引用。

脚本检查结构、计算、重复引用和证据绑定，不能证明文字真实、成员身份或评审独立性。
主代理必须核验来源；禁止编造 reviewer ID、补一个 PASS 或复用旧回执绕过检查。

## 5. 续修与交付复核

开发中按 [变更一致性](../../../references/change-consistency.md) 核实新增范围与影响。
本轮剩余投入仅用于内部安排，不覆盖任务完整工时；仅剩余变化不触发重估或外部写入。
范围或总工时确需调整时回到受影响任务的 CALCULATED 与独立评审，再按原清单确认写回。
仅补技术证据、状态变化、已花时间增加或评审发现预算偏差，均不自动修改 TAPD 工时。

提测时复用最终变更、Wiki 和验证结果核对估算范围。用户要求复盘时，再将真实新增范围、
返工、排障、等待和漏估区分开，保留原预算来源与局限。先独立形成参考预算，再比较
登记值；预算差额不等于虚报，也不是代码缺陷或自动阻断已验证交付的理由。
不新增历史台账、自动填报实际工时或扫描无关人员任务；有证据的可比案例才用于后续校准。
