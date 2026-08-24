# Zan System MR 合规审核

本参考只定义审核方法；规范正文、项目事实和项目命令仍以 centralized `project-knowledge` 与目标仓库为准。

## 路由

对每个 changed file 建立一条记录：

```text
changed file → path/diff signals → task-routing route id → Rule / Capability / Binding / Recipe
```

匹配输入必须包括文件路径、扩展名、changed hunk 中的符号/import/调用点，以及目标仓库 `AGENTS.md` 声明的适用范围。优先使用 `manifests/task-routing.yaml` 中的现有 `signals` 和 route；一个文件可以命中多个 route。没有命中 route 时写 `unknown: no task route`，不得凭经验补写一套规则。

每个命中的 route 都要读取其 `read` 列出的资源，并保留资源路径。涉及项目接入或合规时至少读取 `rules/core.yaml`、`rules/project-agent-document.md`、`adoptions/README.md` 和 `governance/conformance.md`；不得只依赖观察到的源码或 Graphify 结果推断采用标准。

## 项目文件与命令

按以下顺序读取目标项目：

1. 根 `AGENTS.md`，确认 Zan 入口、适用路径、Adoption 文件和真实验证命令。
2. 根 `standard-adoption.yaml`；若 `AGENTS.md` 声明了其它路径，读取该路径并校验 `kind: StandardAdoption`。
3. `StandardAdoption.spec.configuration` 与有效 `exceptions`，确认 typecheck/test/conformance 命令和退出条件。

只运行项目声明的命令。命令不存在、无法执行、输出不可获得或没有覆盖 changed files 时，对应结果为 `unknown`。不要从 `package.json`、历史记录或记忆中猜测替代命令。

## 合规结论

每个 MR 输出一张矩阵：

| Rule ID | Level | Changed evidence | Exception | Result | Verification |
| --- | --- | --- | --- | --- | --- |
| `ZAN-...` | `MUST` / `SHOULD` | `path:line` 或 diff hunk | ID/none | `pass` / `fail` / `warning` / `unknown` | command/output/ref |

- `MUST` 违反为 `fail`；有效 Exception 必须同时有规则 ID、原因、负责人、失效时间/退出条件和替代控制措施。
- `SHOULD` 违反为 `warning`；没有有效 Exception 时仍应明确记录。
- `unknown` 不得变成 `pass`。缺少 `AGENTS.md`、有效 Adoption、路由、命令或证据时，MR 为 `暂缓`，不可合并。
- 行号必须对应审核 HEAD 的文件；如果只能定位到 diff，写 `file:diff hunk`，不能伪造行号。

安全检查单独保持最高优先级：develop 来源或历史、目标分支、HEAD SHA、pipeline、approval、未解决讨论和 mergeability 结论必须继续输出。Zan 合规矩阵不能覆盖安全违规，也不能因合规暂缓而跳过安全检查。
