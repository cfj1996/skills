---
name: managed-mr-review
description: 管理用户管辖项目的 GitLab MR 三段式流程：1. 获取需要用户合并的 open MR，2. 对这些 MR 或指定 MR 做 code review 并输出审核报告，重点详细展开不通过/暂缓 MR 的打回理由，且根据 MR 数量自动启用 code-reviewer 角色的 Codex native subagents 并行审核，3. 对已审核通过的 MR 或指定 MR 使用 GitLab MCP 远程合并。仅处理目标分支为 master 或 main 的 MR，仓库限定为 admin_menu、jbz_admin、kp_admin、order-admin、poster_admin、statistics_admin、store_admin、supplier-admin-web、ledger_admin、weixin-live、zan-projects、zan-devops。
---

# 管辖项目 MR 审核

## 定位

这个技能用于管理用户管辖项目的 GitLab MR，固定分成三步：

1. 获取有哪些需要用户合并的 MR。
2. 对这些 MR 或用户指定的 MR 做 code review，输出审核报告。
3. 对已审核的 MR 或用户指定的 MR 做远程合并。

三步可以串联执行，也可以单独执行。不要把“发现 MR”“审核 MR”“合并 MR”混成一个隐式动作。

默认只执行用户明确要求的步骤。只有用户明确说“合并”“自动合并”“合并通过的”“审核通过就合并”等合并意图时，才进入第 3 步。

## 仓库范围

只处理以下仓库，其他仓库必须列为“范围外”并跳过：

- `admin_menu`
- `jbz_admin`
- `kp_admin`
- `order-admin`
- `poster_admin`
- `statistics_admin`
- `store_admin`
- `supplier-admin-web`
- `ledger_admin`
- `weixin-live`
- `zan-projects`
- `zan-devops`

只处理目标分支为 `master` 或 `main` 的 open MR。目标分支不是 `master` / `main` 的 MR 必须跳过，并在结果说明中写明原因。

“需要我合并”的判定：

- 优先读取 GitLab 当前用户、reviewer、assignee、approval、maintainer/owner 权限和项目成员信息。
- 如果 GitLab 工具不能判断当前用户身份或权限，则以本技能的仓库白名单作为管辖范围，列出这些仓库中目标分支为 `master` / `main` 的 open MR，并在结果里标注“按管辖仓库范围判定”。
- 如果用户指定了 MR，则只处理指定 MR；范围外或目标分支不符的指定 MR 仍需明确标注原因。

## 工具优先级

1. 优先使用 GitLab MCP 查询项目、MR、diff、讨论、pipeline、approval、mergeability 和执行远程合并。
2. 如果当前会话没有可用的 GitLab MCP 查询能力，先用 `tool_search` 查找 GitLab 相关 MCP 工具。
3. 如果 GitLab MCP 不能列出 MR，但可获取单个 MR，允许用 GitLab REST 或本地仓库只读 ref 作为审核补充来源；合并动作仍优先走 GitLab MCP。
4. 页面抓取只能作为最后补充，不作为合并前的唯一依据。

本地仓库仅用于只读 diff 和上下文检查。不要为了审核切换用户工作区分支；优先 fetch MR refs 或使用 `git show <ref>:<path>`。

## 第 1 步：获取待合并 MR

触发语义包括“有哪些需要我合并的 MR”“获取待合并 MR”“列一下管辖项目 MR”等。

收集候选 MR：

- `state = opened`
- `target_branch in ["master", "main"]`
- 项目名在仓库范围内
- 如工具支持，优先保留和当前用户 reviewer / assignee / approver / maintainer 权限相关的 MR

对每个候选 MR 至少读取：

- 项目名、MR iid、标题、作者、创建时间
- source branch、target branch
- 当前 HEAD SHA
- mergeability / conflict 状态
- pipeline、approval、未解决讨论摘要（工具可用时）

输出表格：

```markdown
| MR（项目名称+id） | 标题 | 作者 | 目标分支 | 状态 | 需要我处理的依据 |
| --- | --- | --- | --- | --- | --- |
```

状态建议使用：

- `待审核`：可进入第 2 步 code review。
- `暂缓`：缺少必要状态、冲突、pipeline/讨论状态不明，或工具不可用。
- `跳过`：范围外、目标分支不是 `master` / `main`、不是 open MR。

第 1 步只负责发现和归类，不输出“审核通过/不通过”结论，除非用户同时明确要求进入第 2 步。

## 第 2 步：Code Review 审核

触发语义包括“审核这些 MR”“review 指定 MR”“对上面 MR 做 code review”“输出审核报告”等。

输入来源可以是：

- 第 1 步得到的候选 MR。
- 用户明确指定的 MR，例如 `project!123`、MR URL、项目名 + iid。
- 用户说“这些 MR”时，沿用当前对话中最近一次第 1 步结果。

审核每个 MR 前重新读取 MR 最新状态和 HEAD SHA；如果和第 1 步记录不一致，仍可审核，但必须在报告里注明“发现后有新提交，以最新 SHA 审核”。

对每个 MR 收集：

- changed files 和 diff
- 关键上下文文件
- pipeline、approval、未解决讨论、mergeability（工具可用时）
- 当前 HEAD SHA

### 并行审核策略

根据本轮需要审核的 MR 数量自动选择执行方式：

- 1 个 MR：主代理直接审核。
- 2-3 个 MR：优先为每个 MR 启动一个 `code-reviewer` 角色的 Codex native subagent 并行审核；如果该角色不可用，使用最接近的 code review / reviewer 角色；如果 subagent 不可用，主代理按风险顺序串行审核。
- 4 个及以上 MR：最多同时启动 6 个 `code-reviewer` 角色的 Codex native subagents。按 MR 粒度分配；如果 MR 数量超过 6 个，先分配高风险或改动最大的 MR，其他 MR 在第一批返回后继续分配。

并行审核要求：

- 每个 subagent 必须以 code review 为唯一职责，只负责自己分配到的 MR，不合并、不 approve、不修改文件。
- 分配任务时提供项目名、MR iid、target branch、source branch、HEAD SHA、changed files/diff 获取方式和必要上下文；不要把其他 MR 的结论泄漏给它。
- 子代理输出必须包含：`MR（项目名称+id）`、`结论（通过/不通过/暂缓）`、`主要问题`、`证据`、`审核使用的 HEAD SHA`、`是否可合并建议`。如果结论不是 `通过`，还必须输出可直接作为 GitLab 打回理由的详细说明。
- 主代理负责汇总、去重、解决结论冲突，并输出最终审核报告表。
- 如果同一个 MR 有多个审核结论，以更保守结论为准：`不通过` 优先于 `暂缓`，`暂缓` 优先于 `通过`。
- 如果 subagent 超时或失败，对应 MR 标记为 `暂缓：子代理审核未完成`，除非主代理已经完成等价审核。

审核重点：

- 优先检查会阻断上线的问题：权限、数据污染、金额/库存/订单/账务逻辑、接口契约、路由、环境配置、兼容性、构建失败、类型错误、未处理异常。
- 对大型 MR 先看入口文件、权限边界、核心数据流和跨模块调用，再看样式和低风险细节。
- 对业务逻辑分支必须验证真实调用链可达性，不要只凭新增代码存在就下结论。
- 对阻断问题给出具体文件路径、函数/区域或 diff 依据；证据不足时写明缺口。

审核报告表头固定为：

```markdown
| MR（项目名称+id） | 结论（是否通过） | 主要问题 |
| --- | --- | --- |
```

结论建议使用：

- `通过`：未发现阻断问题，且 MR 当前可合并或没有证据显示不可合并。
- `不通过`：存在明确阻断问题、冲突、构建失败、权限/数据风险，或目标分支不符合范围。
- `暂缓`：证据不足、工具不可用、diff 太大未完成关键路径审核、pipeline/讨论状态不明且影响合并判断。

主要问题必须简短具体。没有问题时写 `未发现阻断问题`；不要写泛泛的“建议加强测试”当作主要问题。

### 不通过 / 暂缓详情

审核报告必须重点展开 `不通过` 和 `暂缓` 的 MR，因为这些内容会作为打回理由使用。

每个 `不通过` / `暂缓` MR 后追加详情块：

```markdown
#### <项目名>!<iid> 打回理由

- 结论：不通过 / 暂缓
- 审核 HEAD：<sha>
- 阻断问题：
  1. <问题标题>
     - 证据：<文件路径:行号 或 diff 区域 / pipeline / discussion / mergeability>
     - 风险：<为什么会影响上线、数据、权限、订单、账务、接口契约或构建>
     - 建议：<需要作者怎么改，尽量具体到校验/分支/字段/调用链>
- 可贴到 GitLab 的说明：
  <一段简洁中文，说明为什么当前不能合并，以及作者需要修改什么>
```

详情要求：

- `不通过` 必须至少有一个明确阻断问题和证据；证据不足时应标为 `暂缓`，不能强行判 `不通过`。
- 打回理由优先写真实风险，不写空泛建议；例如“可能有问题”不够，必须说明触发条件和影响面。
- 能定位文件时必须给文件路径和行号或 diff 区域；不能定位时说明证据来自 pipeline、未解决讨论、mergeability 或工具限制。
- 对同一 MR 的多个问题按严重程度排序，只保留足以支撑打回的关键问题，避免噪音。
- `通过` MR 可以只保留总表摘要，不需要展开详情，除非用户要求完整报告。

审核报告后补充摘要：

- 审核 MR 总数
- 通过数 / 不通过数 / 暂缓数
- 跳过项及原因
- 可进入第 3 步合并的 MR 列表

## 第 3 步：合并 MR

触发语义包括“合并审核通过的”“合并这些 MR”“合并指定 MR”“自动合并通过项”等。

合并输入可以是：

- 第 2 步审核结论为 `通过` 的 MR。
- 用户明确指定的 MR。

审核通过不等于自动合并。只有用户明确要求第 3 步时才执行合并。

如果用户指定 MR 但当前对话没有该 MR 的审核结论，先执行第 2 步的最小审核和第 3 步合并前检查；除非用户明确要求“跳过审核直接合并”，否则不要直接合并未审核 MR。

合并前必须逐个 MR 重新读取最新状态：

- 最新 HEAD SHA 必须与审核时记录的 SHA 一致；如果变了，停止合并该 MR 并标记为 `暂缓：审核后有新提交，需重新审核`。
- 目标分支仍必须是 `master` 或 `main`。
- 状态仍必须是 open。
- 结论必须是 `通过`。
- mergeability 不能显示 conflict / cannot merge。
- 工具可见的 unresolved discussion 或 failed pipeline 如果会阻断合并，不能合并。

合并动作优先使用 GitLab MCP：

1. 如可用，先调用 approve/review 通过接口。
2. 再调用 merge 接口，传入当前 SHA（工具支持时）、`auto_merge: true`（需要等待 pipeline 时）、`should_remove_source_branch: true`。
3. 以 GitLab 返回的 `state: merged`、`merged_at`、`merge_commit_sha` 作为成功证据。

如果 GitLab MCP 不可用或合并接口失败，不要声称已合并；在合并结果表中写明阻塞原因。只有用户明确允许等效 GitLab API fallback 时，才用 REST 合并。

自动合并后追加一个结果表：

```markdown
| MR（项目名称+id） | 合并结果 | 证据/原因 |
| --- | --- | --- |
```

## 输出要求

根据用户要求的步骤输出对应表格：

- 第 1 步：输出待合并 MR 发现表，不给审核通过结论。
- 第 2 步：输出审核报告表，再给通过 / 不通过 / 暂缓摘要。
- 第 3 步：输出合并结果表，再给成功 / 未合并摘要。
- 如果用户要求三步一起执行，按第 1 步、第 2 步、第 3 步顺序分段输出。

不要输出长篇代码评审报告，除非用户要求展开某个 MR。对阻断问题需要给出文件路径、函数/区域或 diff 依据；无法定位到具体文件时说明证据来源不足。
