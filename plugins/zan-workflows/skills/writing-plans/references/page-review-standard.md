# 页面原型评审规范

先读项目已有约定和原型。PRD 与原型冲突时，保留两方证据、受影响功能和需要决定的行为。将评审结果交给[需求收集](../../collecting-requirements/SKILL.md)。

## 模块与评审卡

按证据优先级核对：适用项目规范与明确委托规范、用户已确认业务事实、正式契约来源、PRD、原型、已有 Plan/Draft 与仓库惯例。仓库惯例只能作为位置规则候选，不是正式规则。无法可靠定位的证据只说明原因，不猜测选择器或事实。

以功能模块为评审对象，页面也是一个模块。一个内聚模块可包含子模块；只有职责、输入输出与验收能够独立说清时才拆分。列、按钮或接口不因技术上独立就自动成为模块。模块树保留完整范围，后续轮次默认突出本次新增、修改、删除、重开和未决项。

新建 ReviewSession 使用 `schemaVersion=3`；旧 `schemaVersion=2` 可读取评审，但缺少外部审查信息时保持 `unreviewed`，不能据旧就绪标记直接进入实施。卡片的 `id` 是模块稳定编号；`module.parentId` 引用同一完整清单中的 `card.id`，顶层为 `null`，不得悬空、自引用或形成环。`module.revision` 是正整数；同一编号的业务内容、实现方案或相关证据改变时递增，编号不重排、不复用。`change.kind` 中的 `added/modified/unchanged` 与 `change.summary` 是轮次描述，其单独变化不要求递增 revision 或重开；进入或退出 `removed` 会改变业务范围，须递增并重开。

每张卡片包含以下 `module` 契约，字段以运行时白名单校验：

| 字段 | 含义 |
|---|---|
| `name`、`purpose` | 模块名称、职责与范围 |
| `parentId` | 父模块稳定编号或 `null` |
| `inputs`、`outputs` | 非空字符串数组，说明触发条件、所需数据和可观察结果 |
| `rules` | 非空字符串数组，说明正常、边界与异常行为 |
| `scenarios` | 验收例子数组，每项为 `{ id, given, when, then }`，例子编号在模块内唯一 |
| `questions` | 需求待确认数组，仅含尚未解决的业务决定；每项为 `{ id, question, impact, owner, recommendation }`；`owner` 为 `user` 或 `agent`，接口/字段契约、凭据配置和环境缺口不得混入；业务问题解决后从此集合移除并记录结论，无问题时为空数组 |
| `change` | `{ kind, summary }`；`kind` 为 `added/modified/removed/unchanged`，`summary` 说明本次变化 |
| `revision` | 模块内容版本，正整数 |

输入输出须说明模块对外的行为约定，输出包括展示、事件、状态变化或业务结果。验收例子用“给定输入 → 触发行为 → 约定输出”描述。待确认项须给出缺口、影响、负责查证或决定的人以及建议；Agent 能查证的先查证，不把全部问题交给用户。
`module.rules/scenarios` 描述产品行为与验收，不等于 `mockModules.scenarios`
的数据场景清单；产品有异常处理要求不自动授权建立异常 Mock 数据或故障开关。
后者按共享 Mock 规范和本轮明确模拟范围确定。

问题按决定依赖顺序提出，先解决会改变后续行为的选择，再问前提已明确的
问题。建议说明对范围、风险或返工的影响；已解决决定保留结论和必要理由，
不重复放入 questions。无需增加问题依赖字段或让用户再填一份决策表。

需求结论 `conclusion` 与 `implementationPlan.status` 独立：允许“需求已确认 · 实现方案待补充”。只有需求范围或行为本身无法决定时使用需求“阻塞”，技术证据不全不能强制改变用户结论。新增模块保持“未评审”。模块职责、父子边界、输入输出、规则、验收例子或业务待确认问题（无论 owner 为 user 还是 agent）改变时，才重置需求结论为“未评审”；只改变技术证据、`implementationPlan` 或外部依赖时保留需求结论，并展示技术变更待复核。用户补充需求不等于确认 Agent 的方案。

## Agent 后台检查与实现依据

下列技术维度是 Agent 后台检查清单，不要求逐维度生成卡片：页面定义、URL、路由与参数、UI 布局、组件与功能实现方案、功能点与业务规则、交互状态、API 设计、Mock 设计、权限与安全、路由、会话及跨页面状态、验收步骤和证据。适用检查分别融入业务行为、需求待确认、外部数据与依赖或折叠实施依据，不重复要求用户确认同一个业务行为。

按 [API 契约阶段](api-contract-stages.md) 建立消费需求清单，拆分消费事实到 API 需求一致的具体消费点。页面内容区、应用壳层、路由守卫、权限入口、跨页面状态和会话级能力分别判断；这个事实粒度不改变用户看到的模块卡粒度。每个消费需求记录判断和证据；每个关联接口记录能力归属、运行时范围、正式来源搜索证据和本次交付关系。

模块层 `apiNeed` 只汇总为 `required/none/unknown`：任一消费点需要接口时为 `required`，相关判断全有证据且均不涉及才为 `none`，尚不能确定时为 `unknown` 并记录实现缺口。`required` 不代表每个内部消费点都依赖接口，可同时包含有证据的本地 `none` 消费点；关联多个 API 时分别保留事实。

API 消费点不单独强制成卡，在相关模块折叠的实现依据中保留事实：`regionAndComponents` 说明具体消费点，`relatedApis` 保存接口事实清单，`sourceEvidence` 保存 API 判断与正式来源搜索证据。API 的能力归属不属于页面或模块；上层能力标为 `继承依赖`，直接绑定标为 `直接消费`，确实改变契约标为 `契约变更`，无关接口不进入 Plan。消费点未分类或正式来源未查清时记录实现缺口，不编造接口结论，不阻止已明确需求的评审。

`implementationPlan` 是模块的实施契约，作为内部实现默认折叠展示：

- `status`：`ready` 或 `blocked`。
- `summary`：一句话实施方案；待补充时如实说明已知范围和主要缺口。
- `structure`：怎么实现；具体组件、组合方式、复用边界和代码落点。
- `linkage`：怎么联动；“触发条件 → 判断/动作 → 状态变化 → 页面反馈”。
- `dataFlow`：数据怎么走；状态归属、API 消费点、参数映射、请求时机和错误反馈，无 API 时说明本地数据流。
- `acceptanceFocus`：怎么验收；聚焦最容易跑偏的场景，与模块验收例子对应。
- `evidenceIds`：引用本卡 `sourceEvidence` 中支撑实施决策的证据编号。
- `blockers`：仍缺少证据或未确定的实施决策。

只有 `structure`、`linkage`、`dataFlow`、`acceptanceFocus` 和 `evidenceIds` 全部齐全且 `blockers` 为空时，`status` 才能为 `ready`。组件体系、代码落点、触发条件或状态变化缺少证据时使用 `blocked` 并明确缺口；已有事实可以保留，未知内容可以为空，不要求先捏造完整方案才能确认需求。项目采用的组件体系必须从项目规范、依赖和源码中发现，“使用弹框”“增加筛选”等通用名词不能作为 ready 方案。

行为规则和关键选择理由属于业务约定；structure、dataFlow 中的路径和组件
引用是基于当前代码的实施导航。两者在同一模块内说明清楚，无需拆成另一份
文档。技术导航变更仍按原版本/证据规则处理，不改变未受影响的业务结论。
acceptanceFocus 同时说明观察行为的入口、预期结果和验证局限；已 mock 的
行为不能声称通过真实集成验证。

## 会话与 Plan 契约

运行时只接受 canonical `ReviewSession`。会话字段为
`schemaVersion`、`sessionId`、`deliveryUnitKey`、`deliveryUnitKind`、`deliveryUnitName`、
`artifactRuleFingerprint`、`artifactRuleResolution`、`reviewRound`、`planFingerprint`、
`submissionVersion`、`mode`、`currentCardIndex`、`viewScope`、`cards`，以及下文四个外部数据字段。
卡片包含 `id`、`module`、`dimension`、`links`、`sourceEvidence`、`reviewGoal`、`design`、
`regionAndComponents`、`interactionStates`、`relatedApis`、`mockScenarios`、
`acceptanceCriteria`、`implementationPlan`、`conclusion`、`userNote`、`reviewResult`、
`reopened`、`evidenceChanged`；普通业务扩展 `telepath` 可选。
`dimension` 使用“功能模块”，不决定拆卡。
`links` 只包含 features/apis/uiStates/dependencies/tasks/evidence 六组编号；
`sourceEvidence` 只包含有类型的 id/kind/label/selector/frameSelector/path。
未知字段不得进入 state、草稿或 submission。`deliveryUnitName` 是交付单元的显示名称，不得从接口能力归属推断。

新面板使用会话级范围评审，按当前模块提交收集意见。历史 ReviewSession 和 PagePlan 的指纹只用于解释旧数据。旧模型 schemaVersion=4 的 features[].module 和 features[].reviewConclusion 分别描述模块行为及评审结论。新 TAPD Plan 以工作项及 P/M/F 编号组织全文，格式见[正式页规范](../../collecting-requirements/references/plan-format.md)。

Agent 在现有内容上检查独立接手能力：没有规划聊天历史的执行者，能否从
所选任务、Plan 与证据理解要做什么、不能改变什么、为什么作关键选择以及
如何证明完成。补齐会迫使执行者猜测的指代和缺口，不另加审批、模板模型
或强制 reviewer。实施步骤在原 Task 内按可验证行为组织，先验证最有可能
推翻方案的贯通路径；不能为了每个行为再创建一个 TAPD Task。

具体实现写到独立接手所需的深度：关键选择理由、复用和代码落点、适用的联动/
数据流、步骤依赖及验收证据与局限。无需逐行代码或操作流水账。初次只在
对话/面板预览，按用户选择在会话中结束或交给需求收集保存 TAPD Plan。
后续实质变化展示受影响差异并按原门禁维护，完成时记录真实验证结果、
未验证项和遗留问题；摘要链接随内容位置核对，不另维护清单详情副本。

阶段 Plan 可以保存已确认需求、待修改需求和未决问题。`implementationPlan.status=blocked` 必须记录 `blockers`，不能据此制造实施承诺或把交付单元设为可实施；`ready` 方案原样保留一句话摘要、四块实施内容和证据引用。`validate-page-plan.js` 校验模块层级、版本、行为例子、需求结论、实现准备度及引用，不再把需求已确认误判为实施已就绪。`questions` 仅表示尚未解决业务问题；本轮选定适用模块的 `questions` 必须为空，且需求确认、实现 ready、当前阶段外部依赖和其他证据门禁均通过，才能进入可实施及其后续状态。问题即使有建议也不算解决；阶段 Plan 仍可保存这些问题。

## 外部数据、Mock 与本轮范围模型

PagePlan v4 与 ReviewSession v3 共用以下顶层字段。记录只保存一份；面板按关联模块展示，
API 契约正文保留在正式来源，`sourceRefs`/`evidenceRefs` 引用它。页面依赖 `dependencies`
仍使用原页面对接状态，不能用它表达凭据或服务环境。

| 字段 | 规范 |
| --- | --- |
| `externalDependencies` | 数组；每项有唯一 `EXT-*` 的 `id`、`kind`、`summary`、`facts[]`、`sourceRefs[]`、`environment`、`status`、`owner`、`completionCondition`、`blockingStages[]`、`featureRefs[]`、`taskRefs[]`、`acceptanceRefs[]`、`evidenceRefs[]` |
| `dependencyReview` | `{ status: unreviewed|reviewed, evidenceRefs: [] }`；`reviewed` 必须有本轮查证证据，空集合不等于已审查 |
| `executionScope` | `{ stage, featureRefs: [], taskRefs: [] }`；选择本轮阶段、功能及步骤，不删除未选的未来事实 |
| `mockModules` | 明确的 Mock 规范记录，字段见下表；不能用卡片 `mockScenarios` 摘要代替 |

`kind` 仅为 `api-contract / field-contract / credential-config / environment / account-permission / external-service`。
`status` 仅为 `unverified / missing / ready / not-applicable`；`ready` 要有已确认 facts，
`ready` 与 `not-applicable` 都必须有来源及可解析证据。`unverified` 不等于已证实缺失；
未就绪记录必须列明实际受影响阶段和可核验补齐条件，不能靠建议清零。

`stage` 与 `blockingStages` 使用 `ui-mock / implementation / integration / acceptance / test-delivery / production`。
只对与本轮 `featureRefs`、所选 `taskRefs` 相关且当前阶段适用的记录计算阻塞。
契约已确认但测试凭据未就绪时，可按证据编写适配代码，而真实调用验收保持阻塞。
仅批准 UI/Mock 时可保留未来真实契约缺口；不能把模块 API need 从 unknown/required
伪改为 none。真实接入仍要求正式机器事实；required API 为“正式契约缺失”时不能通过。

| Mock 字段 | 规范 |
| --- | --- |
| `id`、`marker` | 唯一 `MOCK-*` 编号；固定 `marker=MOCK_ONLY` |
| `status`、`mode` | `active / retired`；实现方式为 `function-data / http-contract / managed-draft` |
| `featureRefs[]`、`taskRefs[]`、`paths[]` | 准确功能/步骤和仓库相对实现路径；必须能识别全部数据、handler、替换入口及启动依赖 |
| `scenarios[]`、`activation`、`realRequestBoundary` | 实际提供的正常业务场景（一个即可）、数据/配置层显式启停及必要重置方式、仍调用真实服务的边界；异常模拟须有明确需求依据 |
| `exitCondition`、`verificationLimits[]` | 真实替换条件及 Mock 不能证明的验收 |
| `authorizationEvidenceRefs[]` | 引用 kind=human-confirmation 的真实人类 Mock 范围依据；主流程核实原文，不能自行以 bool 代替 |
| `exitEvidenceRefs[]` | `active` 可空；`retired` 必须引用真实替换、移除/构建排除及退出验证依据 |

所有编号引用必须能解析，步骤及验收必须属于关联功能。`paths` 不得为绝对路径或含 `..`。
Mock 标记和场景配置属于数据/配置层；默认不在业务页面显示标记或调试控件。
本评审面板如实显示 Mock 范围，不表示产品页面也应添加同类模块。
仅设置 `stage=ui-mock` 不授予实施权限：每个选定功能必须有匹配的 active MOCK_ONLY
记录、有效批准依据及本轮可实施方案。未知机器事实仅允许功能数据 Mock；HTTP/Draft
Mock 必须具备可验证契约。关闭开关不等于 retired；retired 也不证明生产制品已清理。

测试环境批准、生产源码/制品检查由独立交付门禁处理，不能由 Plan 字段或面板保存放行。
接口补齐后更新同一记录；仅技术事实变化保留业务结论，重开受影响实施评审和保存确认。
已批准真实接入且无实质变化时复用授权；原范围仅 Mock 而新增接入/交付时补充准确确认。
详见共享[外部数据规则](../../../references/external-data-dependencies.md)和
[跨项目 Mock 规范](../../../references/mock-development.md)。

外部数据字段经过 normalize、草稿、提交、恢复及保存读回完整传递。恢复内容必须与
当前事实逐项相同；新字段不能被旧白名单静默丢弃。旧数据先保留可读性，再查证补齐，
不为迁移重建 Task、Plan 或分支，也不从未知事实推导外部 ready。

## 轮次与确认

复评时保留原功能编号和已解决决定，业务变化重审受影响模块。用户在面板提交意见后，先读回本次实际提交，再在对应卡片和会话里呈现结论。选择正式输出时交由需求收集保存工作项级 TAPD Plan。
