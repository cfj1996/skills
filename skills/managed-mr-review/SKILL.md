---
name: managed-mr-review
description: 审核用户管辖项目的 GitLab 合并请求，适用于批量检查目标分支为 master 或 main 的 MR、输出“MR（项目名称+id）/结论（是否通过）/主要问题”表格，并在用户明确要求时使用 GitLab MCP 自动合并审核通过的 MR。目标仓库限定为 admin_menu、jbz_admin、kp_admin、order-admin、poster_admin、statistics_admin、store_admin、supplier-admin-web、ledger_admin、weixin-live、zan-projects、zan-devops。
---

# 管辖项目 MR 审核

## 定位

这个技能用于批量审核用户管辖项目的 GitLab MR，并可在明确要求时通过 GitLab MCP 远程合并审核通过项。

默认只做审核和建议；只有用户明确说“自动合并”“合并通过的”“审核通过就合并”等合并意图时，才进入合并阶段。

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

## 工具优先级

1. 优先使用 GitLab MCP 查询项目、MR、diff、讨论、pipeline、approval、mergeability 和执行远程合并。
2. 如果当前会话没有可用的 GitLab MCP 查询能力，先用 `tool_search` 查找 GitLab 相关 MCP 工具。
3. 如果 GitLab MCP 不能列出 MR，但可获取单个 MR，允许用 GitLab REST 或本地仓库只读 ref 作为审核补充来源；合并动作仍优先走 GitLab MCP。
4. 页面抓取只能作为最后补充，不作为合并前的唯一依据。

本地仓库仅用于只读 diff 和上下文检查。不要为了审核切换用户工作区分支；优先 fetch MR refs 或使用 `git show <ref>:<path>`。

## 审核流程

1. 收集候选 MR：
   - `state = opened`
   - `target_branch in ["master", "main"]`
   - 项目名在仓库范围内
2. 对每个候选 MR 收集最少信息：
   - 项目名、MR iid、标题、作者、创建时间、source branch、target branch
   - 当前 HEAD SHA
   - mergeability / conflict 状态
   - changed files 和 diff
   - pipeline、approval、未解决讨论（工具可用时）
3. 做代码审核：
   - 优先检查会阻断上线的问题：权限、数据污染、金额/库存/订单/账务逻辑、接口契约、路由、环境配置、兼容性、构建失败、类型错误、未处理异常。
   - 对大型 MR 先看入口文件、权限边界、核心数据流和跨模块调用，再看样式和低风险细节。
   - 对业务逻辑分支必须验证真实调用链可达性，不要只凭新增代码存在就下结论。
4. 输出表格，表头固定为：

```markdown
| MR（项目名称+id） | 结论（是否通过） | 主要问题 |
| --- | --- | --- |
```

结论建议使用：

- `通过`：未发现阻断问题，且 MR 当前可合并或没有证据显示不可合并。
- `不通过`：存在明确阻断问题、冲突、构建失败、权限/数据风险，或目标分支不符合范围。
- `暂缓`：证据不足、工具不可用、diff 太大未完成关键路径审核、pipeline/讨论状态不明且影响合并判断。

主要问题必须简短具体。没有问题时写 `未发现阻断问题`；不要写泛泛的“建议加强测试”当作主要问题。

## 自动合并

只有在用户明确要求自动合并通过项时才执行本节。审核通过不等于自动合并。

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

先给审核表格，再给简短说明：

- 候选 MR 总数
- 通过数 / 不通过数 / 暂缓数
- 被跳过的 MR 及原因（如范围外、目标分支不是 master/main）
- 如果执行了自动合并，列出合并成功和未合并原因

不要输出长篇代码评审报告，除非用户要求展开某个 MR。对阻断问题需要给出文件路径、函数/区域或 diff 依据；无法定位到具体文件时说明证据来源不足。
