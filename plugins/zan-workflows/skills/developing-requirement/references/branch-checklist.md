# 需求开发分支与单次确认

## 初始 Story/Task 分支名

新分支固定为：

```text
feature/cfj.<MMDD>.<短ID>.<描述slug>
```

- `MMDD`：生成确认清单当日的 Asia/Shanghai 月日，固定四位；清单确认后日期变化不重算。
- `短ID`：TAPD 展示短 ID，不使用完整长 ID。
- `描述slug`：从需求标题提炼的简短小写 ASCII kebab-case，只保留 `a-z`、`0-9` 和单个 `-`，去掉首尾分隔符。
- Story/Task 使用 `feature/`；Bug 不进入本技能，由 `fixing-bug` 处理。
- `CONTINUE` 必须复用已证实的原始分支，不按当前日期重新生成。
- 用户显式指定的新分支也必须符合该格式；不符合时在清单中标记待确认，不静默改名。

示例：

```text
feature/cfj.0918.1080800.supplier-split-bill-restrictions
```

## 只读预检

在任何写入前完成：

1. 验证项目、仓库、origin、当前本地分支和工作区状态。
2. fetch 并记录 `origin/master` SHA。
3. 生成精确分支名，检查本地与远程同名分支。
4. 同名分支存在且本地/远程 SHA 一致时使用 `USE_EXISTING`；两端不一致时 `BLOCKED`；均不存在时使用 `CREATE`，基准为已验证的 `origin/master` SHA。
5. 仅形成预检快照，不创建或切换分支、不写 Plan、不改源码。

## 单次确认清单

将范围与分支合并为一张表，每个项目一行：

| TAPD | 项目/仓库 | `origin/master` | 当前分支 | 需求范围/排除项 | 需求确认 | 实施准备 | 目标开发分支 | 动作与基准 | 本次执行 | 待确认 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

- `需求确认`：显示 `READY|BLOCKED` 及 `requirement_blocker_count`。
- `实施准备`：显示 `READY|BLOCKED` 及 `implementation_blocker_count`；缺口行来自需求确认前检查清单。
- `requirement_blocker_count > 0` 时不得询问执行确认；先解决或修改需求范围。
- `implementation_blocker_count > 0` 时可确认范围或生成阶段 Plan，但 `IMPLEMENT` 必须保持阻塞。
- 本次执行为 `IMPLEMENT` 且 `implementation_blocker_count > 0` 时，不问“是否按此清单执行”；改为引导解决技术缺口，或由用户明确将本次执行改成 `PLAN_ONLY`。

清单后展示一次授权摘要，必须包含：

- intended operation：`PLAN_ONLY|BRANCH_ONLY|IMPLEMENT` 以及实际 `CREATE|USE_EXISTING`；
- purpose：实现清单内已确认的 Story/Task 范围；
- source branch/base：精确 `origin/master` ref 与 SHA，或已存在分支 ref/SHA；
- target branch：精确 `feature/cfj.<MMDD>.<短ID>.<描述slug>`；
- Story/Task 状态：`NOT_APPLICABLE_NON_BUG`，无 TAPD Bug 状态写入。

只问一次：`是否按此清单执行？`

用户确认后，该确认同时绑定范围、项目/仓库、远程基准、分支身份、分支动作、用途、Plan 写入和本次执行模式。
任何可见字段变化都会使确认失效，必须展示更新后的整张清单；`CREATE` 完成后同一分支转为 `USE_EXISTING` 是预期执行状态变化，不要求重复确认。

执行 `CREATE` 时使用等价于
`git switch --no-track -c <目标分支> <已验证 origin/master ref/SHA>` 的无 upstream
创建方式，随后读回当前分支、HEAD 和工作区状态。不得先设置 upstream 再移除。
