# Zan System MR 合规审核

本参考只定义审核方法；规范正文、项目事实和项目命令仍以 centralized `project-knowledge` 与目标仓库为准。

## 接入状态分类

先检查审核 HEAD 上的根 `AGENTS.md`、其 Zan 声明和 Adoption 文件，再运行 `scripts/review-policy.mjs classify-adoption`：

| Zan 状态 | 识别条件 | 审核方式 | 合并影响 |
| --- | --- | --- | --- |
| `not-adopted` | 未声明 Zan，Adoption 不存在；两份文件都不存在也属于此状态 | 完整普通审核 | 未接入本身不阻断 |
| `adopted` | `AGENTS.md` 与有效 `StandardAdoption` 同时存在 | 普通审核 + Zan 增强审核 | `MUST fail/unknown` 阻断 |
| `misconfigured` | 已声明/部分接入，但文件、schema 或命令配置无效 | 普通审核继续，报告治理异常 | 治理异常单独阻断 |
| `unknown` | 工具、权限或读取失败导致无法分类 | 普通审核继续，报告证据缺口 | 状态确认前阻断 |

代码结论不能被 Zan 状态覆盖。即使 `misconfigured/unknown`，仍要完成可完成的 diff、调用链和运行风险审核并独立输出 `通过/不通过/未完成`。

## 路由

本节只适用于 `adopted`。`not-adopted` 不做 changed-file Zan 路由，也不生成占位 `unknown` 矩阵。

对每个 changed file 建立一条记录：

```text
changed file → path/diff signals → task-routing route id → Rule / Capability / Binding / Recipe
```

匹配输入必须包括文件路径、扩展名、changed hunk 中的符号/import/调用点，以及目标仓库 `AGENTS.md` 声明的适用范围。优先使用 `manifests/task-routing.yaml` 中的现有 `signals` 和 route；一个文件可以命中多个 route。没有命中 route 时写 `unknown: no task route`，不得凭经验补写一套规则。

每个命中的 route 都要读取其 `read` 列出的资源，并保留资源路径。涉及项目接入或合规时至少读取 `rules/core.yaml`、`rules/project-agent-document.md`、`adoptions/README.md` 和 `governance/conformance.md`；不得只依赖观察到的源码或 Graphify 结果推断采用标准。

## 项目文件与命令

`adopted` 按以下顺序读取目标项目：

1. 根 `AGENTS.md`，确认 Zan 入口、适用路径、Adoption 文件和真实验证命令。
2. 根 `standard-adoption.yaml`；若 `AGENTS.md` 声明了其它路径，读取该路径并校验 `kind: StandardAdoption`。
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

`pipeline = none` 与 `pipeline = failed` 必须区分。只有失败的 pipeline，或项目明确要求但缺失/未完成的 pipeline，才构成合并阻断。
