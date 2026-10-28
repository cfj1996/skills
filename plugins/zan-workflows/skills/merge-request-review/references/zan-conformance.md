# Zan System MR 合规审核

本参考只定义 Zan 审核方法；规范正文按项目正式采用的来源/版本读取，项目事实和命令从目标仓库核实。
公司项目使用 centralized `project-knowledge` 中的适用标准；该知识库或旧管辖配置不是普通审核的前置条件。

## 接入状态分类

先检查审核 HEAD 上的根和受影响路径适用的 `AGENTS.md`、继承的 Zan 声明和 Adoption
范围，再按该范围的文件事实运行 `scripts/review-policy.mjs classify-adoption`。
monorepo 按实际受影响子项目分类；某子项目采用 Zan 不能使未采用的同仓库路径自动受约束。
保留各范围结果，按主流程汇总模式和阻断；文件确认不存在与读取失败必须分开。

分类输入将文件事实与范围适用性分开：

- `agentDocument`、`adoptionDocument` 保留实际文件状态，`adoptionDeclared` 保留文件中的真实声明。
  不能为了排除子项目把存在的根 Adoption 标为 missing，或把已声明改成 false。
- `adoptionScope=applicable|not-applicable|unknown` 表示该声明对当前受影响范围是否适用。
  monorepo 必须显式传入；省略时保留单项目旧调用的 `applicable` 行为，不代表已验证范围。
- `not-applicable` 必须同时给非空字符串数组 `scopeEvidence`，引用当前审核版本的范围声明、
  继承关系及实际改动/受影响消费者。脚本只验证证据结构，主代理仍须核实内容。
  有可靠独立依据排除该范围时，无关 Adoption 的存在或损坏不传播到当前子项目。
- 范围未查清、相互冲突或依据不可读时传 `unknown`。`unknown` 或无有效证据的
  `not-applicable` 返回 `unknown` 并保留治理阻断；非法范围枚举报错。

例如根 Adoption 明确只覆盖 `apps/admin`，本次仅影响 `packages/cli`，仍保留
`agentDocument=present`、`adoptionDocument=valid`、`adoptionDeclared=true`，另传
`adoptionScope=not-applicable` 和核实后的 `scopeEvidence`，得到普通审核。
同 MR 涉及管理端时，对管理端范围另传 `applicable`，不能把 CLI 的排除结论用于整个 MR。
范围依据与对应 source/target SHA 保留在 preflight packet；依据或受影响范围变化时重新分类。

| Zan 状态 | 识别条件 | 审核方式 | 合并影响 |
| --- | --- | --- | --- |
| `not-adopted` | 有证据确认当前范围不适用；或未声明 Zan 且 Adoption 不存在 | 完整普通审核 | 未接入/不适用本身不阻断 |
| `adopted` | `AGENTS.md` 与有效 `StandardAdoption` 同时存在 | 普通审核 + Zan 增强审核 | `MUST fail/unknown` 阻断 |
| `misconfigured` | 已声明/部分接入，但文件、schema 或命令配置无效 | 普通审核继续，报告治理异常 | 治理异常单独阻断 |
| `unknown` | 范围未知、排除依据缺失，或工具/权限/读取失败导致无法分类 | 普通审核继续，报告证据缺口 | 状态确认前阻断 |

代码结论不能被 Zan 状态覆盖。即使 `misconfigured/unknown`，仍要完成可完成的 diff、调用链和运行风险审核并独立输出 `通过/不通过/未完成`。

## 路由

本节只适用于 `adopted`。`not-adopted` 不做 changed-file Zan 路由，也不生成占位 `unknown` 矩阵。

对采用范围内每个 changed file 建立一条记录；范围外文件继续普通审核：

```text
changed file → path/diff signals → task-routing route id → Rule / Capability / Binding / Recipe
```

匹配输入必须包括文件路径、扩展名、changed hunk 中的符号/import/调用点，以及目标仓库 `AGENTS.md` 声明的适用范围。优先使用 `manifests/task-routing.yaml` 中的现有 `signals` 和 route；一个文件可以命中多个 route。没有命中 route 时写 `unknown: no task route`，不得凭经验补写一套规则。

每个命中的 route 都要读取其 `read` 列出的资源，并保留资源路径。涉及项目接入或合规时至少读取 `rules/core.yaml`、`rules/project-agent-document.md`、`adoptions/README.md` 和 `governance/conformance.md`；不得只依赖观察到的源码或 Graphify 结果推断采用标准。

## 项目文件与命令

`adopted` 按以下顺序读取目标项目：

1. 根及受影响路径适用的 `AGENTS.md`，确认继承关系、Zan 入口、采用范围、Adoption 文件和真实验证命令。
2. 声明的 Adoption 文件；单项目默认根 `standard-adoption.yaml`，校验 `kind: StandardAdoption` 及其实际范围。
3. `StandardAdoption.spec.configuration` 与有效 `exceptions`，确认 typecheck/test/conformance 命令和退出条件。

Zan 合规只运行项目声明的命令。命令不存在、无法执行、输出不可获得或没有覆盖 changed files 时，对应结果为 `unknown`。不要用 package scripts 冒充 Zan 声明命令。

普通审核可以使用项目自身明确、只读且与改动相关的验证证据，例如项目文档、CI 配置或清晰命名的安全测试/typecheck script。没有可执行验证时如实记录“未运行”，除非项目策略明确要求，否则不能仅因此把代码判为不通过。

## 合规结论

每个 MR 输出一张矩阵：

| Rule ID | Level | Changed evidence | Exception | Result | Verification |
| --- | --- | --- | --- | --- | --- |
| `ZAN-...` | `MUST` / `SHOULD` | `path:line` 或 diff hunk | ID/none | `pass` / `fail` / `warning` / `unknown` | command/output/ref |

- `MUST` 违反为 `fail`；有效 Exception 必须同时有规则 ID、原因、负责人、失效时间/退出条件和替代控制措施。
- `SHOULD` 违反为 `warning`；没有有效 Exception 时仍应明确记录。
- `unknown` 不得变成 `pass`。在 `adopted` 模式中缺少路由、声明命令或证据时，Zan 合并门禁不通过，但代码结论保持独立。
- 行号必须对应审核 HEAD 的文件；如果只能定位到 diff，写 `file:diff hunk`，不能伪造行号。

安全检查单独保持最高优先级：develop 来源或历史、目标分支、HEAD SHA、pipeline、approval、未解决讨论和 mergeability 结论必须继续输出。Zan 合规矩阵不能覆盖安全违规，也不能因合规暂缓而跳过安全检查。

`pipeline = none` 与 `pipeline = failed` 必须区分。已识别状态中，失败的 pipeline，或项目明确要求但缺失/未完成的 pipeline，构成合并阻断；无法识别或读取失败属于证据不足，不能按无 pipeline 放行。

## 合并判断输入

`scripts/review-policy.mjs evaluate-merge` 接收已核实、归一化的状态，返回
`mergeAllowed` 和结构化 `blockers`。未知枚举或显式 `null` 不能当作通过：

- `codeReview`：`pass` / `blocker` / `incomplete`；只有 `pass` 通过。
- `safety` 只有 `pass`、`mergeability` 只有 `mergeable` 通过。
- `pipeline`：`success` / `failed` / `pending` / `none`。`pipelineRequired`
  必须为布尔值；为 `true` 时只有 `success` 通过，为 `false` 时允许
  `success`、`pending`、`none`。原始 GitLab 状态须根据证据归一化，不能把读取失败当成 `none`。
- `approval`：`approved` / `not-required` / `required-missing`；前两项通过，
  `not-required` 必须有项目规则依据。
- `mergePermission`：`allowed` / `denied` / `unknown`，仅 `allowed` 通过；省略或非法值
  同样阻断 `merge-permission`。来自执行账号对准确 MR/受保护目标的当前有效权限，
  不是角色名称、MR 审批状态或人类操作授权。详细证据见 [交接约定](contracts.md)。
- `unresolvedDiscussions` 必须明确为 `false` 才通过。
- `zanStatus` 使用上表四种状态；只有 `adopted` / `not-adopted` 可继续，
  且 `adopted` 还要求 `zanMust = pass`。
- `changeReview` 和当前只读事实 `currentChange` 遵循
  [变更与文档一致性](../../../references/change-consistency.md)；绑定 source/target SHA、
  实际范围依据/适用文档条目指纹，并包含有证据的 scope/impact/documentation 结论。
  这项对所有模式适用，省略、unknown、fail 或过期绑定都不能放行。明确文档豁免仅
  免除文档要求，不免除范围与影响核对。

其余省略字段沿用脚本默认值；调用方必须先核实项目门禁，不能用默认值替代未知证据。
`mergeAllowed` 只表示当前合并资格；任何批准/合并写入仍遵守
[执行规则](merge-rules.md)，不由 helper 返回值自动授权。
批准专用 `evaluate-approve` 额外要求 `approvePermission=allowed`，允许已核实的
`approval=required-missing`，其余门禁相同；它返回 `approvalAllowed`，不返回 `mergeAllowed`。
批准后读回实际审批，再以 `evaluate-merge` 判断合并，不能复用批准资格放行。
