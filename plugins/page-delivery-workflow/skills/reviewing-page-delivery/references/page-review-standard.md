# 页面交付评审规范

## 项目规范发现、启动与规则门禁

先从启动锚点识别项目、App 或模块，并读取目标路径适用的最近 `AGENTS.md` 及其明确委托的规范。显式业务上下文优先；项目规范、用户结论和已有事实冲突时，必须展示冲突，不得静默选择。PRD 与原型存在冲突时，必须单独识别、报告并等待确认，不得任选其一作为实现基线。

项目级范围必须拒绝：候选范围若包含没有共同独立实施、对接和验收边界的多个页面或模块，要求按该边界拆分为一个或多个页面/内聚模块 Plan。

产物位置按自动识别、推荐目录、手动指定三种入口汇合到同一条流程：

1. 自动识别：先读取当前工具适用的 `AGENTS.md` 和明确委托的规则，再检查目标项目
   中已有 Plan、Draft 与文档目录。已写明且唯一有效的规则直接复用，不重复询问。
   已有文件布局是推荐依据，不能仅凭文件存在就当成正式规则。
2. 推荐目录：没有有效规则时，结合实际项目结构给出一个推荐及理由，必要时给出
   少量备选。展示具体解析路径、命名编号规则和将修改的 Agent 文件；不得提供默认目录，
   也不能因为没有旧规范就停止整理候选。
3. 手动指定：用户可以接受推荐、改选其他目录，或直接给出根目录/完整文件路径。
   明确指定优先于旧规则，不再要求额外确认推荐。相对路径相对消费项目根目录解析；
   根目录下的 Plan/Draft 文件名与编号根据项目惯例补齐并展示。完整文件路径只绑定
   对应产物，不擅自推广为全项目模板；尚无明确位置的其他产物仅在实际需要时补齐。
4. 用户确认完整候选或手动指定后，直接将已确定的规则固化至最近适用公共作用域的
   `AGENTS.md`，随后重新读取并验证当前产物位置能够唯一解析，才能继续使用正式规则。
   指定本身授权这次规则写入，不再询问“是否写入 Agent 文件”。未经用户确认不得固化，
   明确指定视为确认。只对路径多解、冲突范围或覆盖风险询问缺失信息。
5. 写入目标限定在消费项目内：项目已有适用 `AGENTS.md` 时维护其中的产物规则段；
   没有时在项目根目录创建 `AGENTS.md`。模块专属规则写入该模块适用文件，不修改
   工作区公共规则或其他工具的配置。保留文件中的其他指令，不整文件覆盖；若已明确
   委托其他规则文件，则维护该规则来源并从 Agent 入口重新验证。

规则至少记录当前产物的确定位置及命名依据；完整候选字段为：

```markdown
## 页面交付产物规则

- Plan 路径模式：<自动识别后复用或用户指定的模式/当前绑定路径>
- Draft OpenAPI 路径模式：<已确定的位置；尚未涉及则标明在生成前解析>
- 交付单元命名：<页面和模块命名规则>
- 编号规则：<序号来源和格式>
- 路径变量：<项目、App、业务域等变量来源>
- 既有文件：<复用或迁移门禁>
```

通过一次确认完成目录选择与规则写入；确认位置规则不等于确认更新 Plan。
不得自动迁移已有文件。启动确认前的只读限制不阻止用户明确指定后写入产物规则，
但不因此创建 Plan、生成 Draft 或修改业务代码。位置写入失败应报告实际文件和错误，
不能伪装成已解析规则。Draft 暂未涉及时不要求先确定其路径才能评审，生成 Draft 前
再按同一流程补齐；保存 Plan 时仅校验当前需要的产物位置。

## 模块与评审卡

按证据优先级核对：适用项目规范与明确委托规范、用户已确认业务事实、正式契约来源、PRD、原型、已有 Plan/Draft 与仓库惯例。仓库惯例只能作为位置规则候选，不是正式规则。无法可靠定位的证据只说明原因，不猜测选择器或事实。

以功能模块为评审对象，页面也是一个模块。一个内聚模块可包含子模块；只有职责、输入输出与验收能够独立说清时才拆分。列、按钮或接口不因技术上独立就自动成为模块。模块树保留完整范围，后续轮次默认突出本次新增、修改、删除、重开和未决项。

新 ReviewSession 使用 `schemaVersion=2`，仍接受旧 `schemaVersion=1`。新卡片的 `id` 是模块稳定编号；`module.parentId` 引用同一完整清单中的 `card.id`，顶层为 `null`，不得悬空、自引用或形成环。`module.revision` 是正整数；同一编号的业务内容、实现方案或相关证据改变时递增，编号不重排、不复用。`change.kind` 中的 `added/modified/unchanged` 与 `change.summary` 是轮次描述，其单独变化不要求递增 revision 或重开；进入或退出 `removed` 会改变业务范围，须递增并重开。

每张新卡片包含以下 `module` 契约，字段以运行时白名单校验：

| 字段 | 含义 |
|---|---|
| `name`、`purpose` | 模块名称、职责与范围 |
| `parentId` | 父模块稳定编号或 `null` |
| `inputs`、`outputs` | 非空字符串数组，说明触发条件、所需数据和可观察结果 |
| `rules` | 非空字符串数组，说明正常、边界与异常行为 |
| `scenarios` | 验收例子数组，每项为 `{ id, given, when, then }`，例子编号在模块内唯一 |
| `questions` | 待确认数组，每项为 `{ id, question, impact, owner, recommendation }`；`owner` 为 `user` 或 `agent`，仅保存尚未解决事项，问题解决后从此集合移除并记录结论，无问题时为空数组 |
| `change` | `{ kind, summary }`；`kind` 为 `added/modified/removed/unchanged`，`summary` 说明本次变化 |
| `revision` | 模块内容版本，正整数 |

输入输出须说明模块对外的行为约定，输出包括展示、事件、状态变化或业务结果。验收例子用“给定输入 → 触发行为 → 约定输出”描述。待确认项须给出缺口、影响、负责查证或决定的人以及建议；Agent 能查证的先查证，不把全部问题交给用户。

需求结论 `conclusion` 与 `implementationPlan.status` 独立：允许“需求已确认 · 实现方案待补充”。只有需求范围或行为本身无法决定时使用需求“阻塞”，技术证据不全不能强制改变用户结论。新增模块保持“未评审”。模块职责、父子边界、输入输出、规则、验收例子或需要用户决定的行为问题改变时，才重置需求结论为“未评审”；只改变技术证据、`implementationPlan` 或 `owner=agent` 的查证问题时保留需求结论，并展示技术变更待复核。用户补充需求不等于确认 Agent 的方案。

## Agent 后台检查与实现依据

下列技术维度是 Agent 后台检查清单，不要求逐维度生成卡片：页面定义、URL、路由与参数、UI 布局、组件与功能实现方案、功能点与业务规则、交互状态、API 设计、Mock 设计、权限与安全、路由、会话及跨页面状态、验收步骤和证据。适用检查融入模块的行为、待确认问题或折叠实现依据，不重复要求用户确认同一个业务行为。

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

## 会话与 Plan 契约

运行时只接受 canonical `ReviewSession`。会话字段为
`schemaVersion`、`sessionId`、`deliveryUnitKey`、`deliveryUnitKind`、`deliveryUnitName`、
`artifactRuleFingerprint`、`artifactRuleResolution`、`reviewRound`、`planFingerprint`、
`submissionVersion`、`mode`、`currentCardIndex`、`viewScope` 和 `cards`。
卡片沿用 `id`、`dimension`、`links`、`sourceEvidence`、`reviewGoal`、`design`、
`regionAndComponents`、`interactionStates`、`relatedApis`、`mockScenarios`、
`acceptanceCriteria`、`implementationPlan`、`conclusion`、`userNote`、`reviewResult`、
`reopened`、`evidenceChanged`，新版本增加上述 `module`；普通业务扩展 `telepath` 可选。
`dimension` 是兼容标记，新模块卡使用“功能模块”，不再决定拆卡。
`links` 只包含 features/apis/uiStates/dependencies/tasks/evidence 六组编号；
`sourceEvidence` 只包含有类型的 id/kind/label/selector/frameSelector/path。
未知字段不得进入 state、草稿或 submission。`deliveryUnitName` 是交付单元的显示名称，不得从接口能力归属推断。

Plan 与面板使用同一模块结构和稳定编号。Agent 语义读取 Markdown 后构造临时规范化模型，禁止脚本解析 Markdown。新模型为 `schemaVersion=3`，`features[].module` 使用相同模块契约，`features[].reviewConclusion` 独立记录需求结论；旧 `schemaVersion=2` 保留原字段结构并允许带明确 blockers 的阶段 blocked 保存，无需迁移到模块模型；非评审阶段仍执行实现准备度门禁，不无声改写历史。

阶段 Plan 可以保存已确认需求、待修改需求和未决问题。`implementationPlan.status=blocked` 必须记录 `blockers`，不能据此制造实施承诺或把交付单元设为可实施；`ready` 方案原样保留一句话摘要、四块实施内容和证据引用。`validate-page-plan.js` 校验模块层级、版本、行为例子、需求结论、实现准备度及引用，不再把需求已确认误判为实施已就绪。V3 的 `questions` 均表示尚未解决事项；适用模块的 `questions` 必须为空，且需求确认、实现 ready 及其他证据门禁均通过，才能进入可实施及其后续状态。问题即使有建议也不算解决；阶段 Plan 仍可保存这些问题。

## 轮次与确认

首次全量生成模块与子模块；后续复评默认仅处理新增、修改、未评审、待修改、阻塞、重开项和证据变化项，已确认或不适用项保留结论。统一提交评审后，冻结本轮输入、核对证据并展示冲突、拟处理方式和 Plan 变更摘要；用户逐卡核对后，仍须单独点击确认更新 Plan 才能一次性回写同一 Plan。

这是两阶段确认：产物位置规则确认与确认更新 Plan 相互独立。确认更新 Plan
必须先由用户在最终结果卡上进行浏览器可信点击，生成绑定 session、submission
版本、独立 submissionId 和双指纹的一次性内部请求；脚本触发的 click/dispatchEvent、缺失请求、
过期请求、跨 session/version/fingerprint 请求和重复消费都必须拒绝。
pending 请求不得通过 state 或 submission 暴露；Agent 通过 `getPlanConfirmationRequest()` 只读获取身份元数据，该读取不能创建或消费许可。请求在新结果、重新挂载、销毁
或身份变化后失效。写入前重新读取 Plan 并比对 Plan 内容指纹和产物位置规则
指纹；任一变化或冲突均停止覆盖、展示冲突并等待用户决定。

结果回填契约：每项 `id` 唯一，`cardIds` 为本轮卡片 ID 数组，所有结果须覆盖本轮全部卡片；`conclusion`、非空 `summary` 与 `planChangeSummary` 必填。`submissionId` 必须匹配当前提交。具体调用、错误恢复、等待和确认回写见 [功能评审运行协议](feature-review-runtime.md)。

保存状态独立：`confirmPlan()` 只表示“已确认，待保存”。Agent 通过校验、写入并读回文件后调用 `markPlanSaved()`，成功后显示“已保存”。保存不改变需求结论或实现准备度；未决事项可随阶段 Plan 一起保存。
