# 需求开发分支与单次确认

所有新建工作分支先遵守工作区 `git-safety.md` 的命名规则，包括仓库维护、
文档和工具优化。关联真实 TAPD 项时带展示短 ID；无 TAPD 时仅省略整个 ID
段，作者、日期和中文描述要求一致，不编造编号。普通无 TAPD 工作不进入本
Story/Task 编排；本技能仍要求真实 TAPD 身份。已有分支和 CONTINUE 不因此改名。

## 初始 Story/Task 分支名

新分支固定为：

```text
feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>
```

- `branch-owner`：为每个目标仓库运行本技能自带的
  `scripts/resolve-branch-owner.mjs --cwd <仓库根目录>`，使用其返回的
  `branchOwner`。当前工具用户级提示词中有非空 `USER_NAME` 时，必须通过
  `--user-name <USER_NAME>` 传入；也可用 `--user-prompt-file <当前工具实际用户提示词文件>`
  精确读取（支持 init 确认过的自定义路径），不得扫描其他工具的提示词。
  脚本依次尝试用户级提示词 `USER_NAME`、当前仓库生效的 `git config user.name`、
  本机用户名，不使用 Git 邮箱前缀。保留中文姓名，英文字母转小写，空格及
  不安全分隔符替换为单个 `-`。清单同时记录脚本返回的 `source`；全部候选都无法生成安全值时
  必须 `PENDING` 并让用户给出分支作者标识，不得猜测或沿用其他人的名字。
- `MMDD`：生成确认清单当日的 Asia/Shanghai 月日，固定四位；清单确认后日期变化不重算。
- `短ID`：TAPD 展示短 ID，不使用完整长 ID。
- `中文描述`：从需求标题提炼的简短中文描述，必须包含中文，不翻译为英文或拼音；可保留必要的英文字母、数字和单个 `-`，移除空白及其余标点，去掉首尾分隔符。生成后使用 `git check-ref-format --branch <完整分支名>` 验证。
- Story/Task 使用 `feature/`；Bug 不进入本技能，由 `fixing-bug` 处理。
- `CONTINUE` 必须复用已证实的原始分支，不按当前日期重新生成。
- 用户显式指定的新分支也必须符合该格式；不符合时在清单中标记待确认，不静默改名。

示例：

```text
feature/alice.0918.1080800.供应商分账限制
```

## 只读预检

在任何写入前完成：

1. 验证项目、仓库、origin、当前本地分支和工作区状态。
2. fetch 并记录 `origin/master` SHA。
3. 解析并记录当前仓库的 `branch-owner` 与来源，生成精确分支名，检查本地与远程同名分支。
4. 同名分支存在且本地/远程 SHA 一致时使用 `USE_EXISTING`；两端不一致时 `BLOCKED`；均不存在时使用 `CREATE`，基准为已验证的 `origin/master` SHA。
5. 仅形成预检快照，不创建或切换分支、不写 Plan、不改源码。

## 单次确认清单

沿用已解析的 `workflow_profile` 和 `verification_risk`，含义见
[按工作规模选择流程](../../../references/adaptive-workflow.md)。所有档位使用
同一精确范围/分支授权；QUICK 省去未请求的任务和正式 Plan 写入。

最终请求执行确认时，**必须用 Markdown 表格展示执行主清单**，适用于
QUICK/STANDARD/FULL、对话/面板及单项目/多项目；单项目也保留一行。
不能用项目、分支、基准的散列项或一段摘要替代表格，字段/功能表也不能代替执行主表。

表前用简短共同摘要说明准确 TAPD 链接、交付终点、流程档位、验证风险及
分支作者/来源；不同项目取值不同时，在对应行或按项目的补充表中分别写清。
将范围与分支合并为以下主表，每个项目/仓库/分支绑定一行：

| 项目/仓库 | 本轮范围/排除项 | 当前分支 | 目标分支/动作 | 基准 ref/SHA | 本轮执行 | 需求确认/实施准备 | 待确认 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<项目A / 仓库路径A>` | `<范围A；排除项A>` | `<实际当前分支A>` | `CREATE`：`<完整目标分支A>` | `<已核实基准refA>@<完整SHA_A>` | `<本轮获准操作A>` | `READY/0` / `READY/0` | 无 |
| `<项目B / 仓库路径B>` | `<范围B；排除项B>` | `<实际当前分支B>` | `USE_EXISTING`：`<完整目标分支B>` | `<范围基准refB>@<完整SHA_B>`；`<复用分支ref>@<完整SHA>` | `<本轮获准操作B>` | `READY/0` / `READY/0` | 无 |

以上是占位示例，实际回复只使用已核实事实，不能照填 READY 或“无”。

- 项目列包含可唯一识别的项目/子项目及实际仓库路径；同名分支在不同仓库
  仍分别列出，不能共用一个基准 SHA。同仓库多个子项目可分行，但须注明共用
  的分支操作只执行一次，不为每个子项目重复创建分支。
- 完整目标分支、CREATE/USE_EXISTING 和基准 ref/SHA 必须留在对应行，不能只写
  “同上”“沿用前述”。实际值过长可用单元格换行，不能截短影响身份核对的字段。
- 本轮执行写明创建/复用分支、实施、Task/Plan 写入等实际操作和边界；未获准的
  提交/推送/提测/上线等后续动作不混入本轮授权。
- QUICK 的有序步骤、验收入口/预期/局限可紧随主表展示；较长的 Task 写入或
  Plan 内容另用关联项目的补充表，不把所有细节挤入主表，也不为表格补造产物。
- 这是最终确认清单，不是执行完成报告。格式调整不增加确认轮次，也不使未确认
  的操作自动获准；仍有效的既有确认继续复用，只重开内容确实变化的范围。

- `需求确认`：显示 `READY|BLOCKED` 及 `requirement_blocker_count`。
- `实施准备`：显示 `READY|BLOCKED` 及 `implementation_blocker_count`；缺口行来自需求确认前检查清单。
- `requirement_blocker_count > 0` 时不得询问执行确认；先解决或修改需求范围。
- `implementation_blocker_count > 0` 时可确认范围或生成阶段 Plan，但 `IMPLEMENT` 必须保持阻塞。
- 本次执行为 `IMPLEMENT` 且 `implementation_blocker_count > 0` 时，不问“是否按此清单执行”；改为引导解决技术缺口，或由用户明确将本次执行改成 `PLAN_ONLY`。

清单后展示一次授权摘要，必须包含：

- intended operation：`PLAN_ONLY|BRANCH_ONLY|IMPLEMENT|SUBMIT|GO_LIVE` 以及实际 `CREATE|USE_EXISTING`；
- purpose：实现清单内已确认的 Story/Task 范围；
- source branch/base：精确 `origin/master` ref 与 SHA，或已存在分支 ref/SHA；
- target branch：精确 `feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>`；
- Story/Task 状态：`NOT_APPLICABLE_NON_BUG`，无 TAPD Bug 状态写入。
- 本次 `workflow_profile`、`verification_risk` 及简短理由；风险不由档位推导。
- QUICK 且本轮包含实施：准确的所选 Story/Task、范围与 `implementationBrief`，说明行为、
  排除项、证据、有序步骤、验证入口/预期/局限；既有 Task 保留其范围和人员
  归属，不扩大到未选任务。本轮不创建/更新 Task、不补估时、不写正式 Plan。
- `BRANCH_ONLY` 只展示所需范围/分支事实，不为将来实施补 brief、任务、排期
  或实现证据；已有实施缺口可以保留，不能据此阻塞范围明确的分支准备。
- `STANDARD|FULL` 且非 `BRANCH_ONLY` 时，附完整 TAPD 任务拆分表、字段映射、拟写入描述/必填
  字段和 proposal 指纹：逐项展示 CREATE/REUSE/UPDATE、真实旧 ID、项目/模块/
  功能编号、开发人员 TAPD 账号及核实来源、预估工时、依赖、验收及旧/新值。
  仅汇总最终预估工时；内部正常工时、计算系数和公式不进入会话或拟写入描述。
- 本轮需创建/更新任务时，授权摘要明确包含这些 TAPD 操作；初始需求或
  范围/Plan 确认不能单独替代任务清单确认。人员、预计工时或必填字段未补齐
  时保持草稿，不询问创建确认、不创建空任务。PLAN_ONLY 可保留任务提案但
  不因此授权外部写入；STANDARD/FULL 需求实施前必须 TASKS_READY。
  QUICK 不伪造该状态；已有正式 Plan/TaskBreakdown 的阻塞和读回要求不能用
  QUICK 绕过。需要任务写入或正式 Plan 时先升级并展示对应变更。
- 如本轮要写 Plan：列出精确路径和拟写入内容或差异。该内容已完整展示且
  确认后未变时，同一次清单确认可用于 Plan 写入；若仅列路径而未展示内容，
  写入前仍须展示实际 Plan 变更并确认。

只问一次：`是否按此清单执行？`

用户确认后，该确认同时绑定范围、项目/仓库、远程基准、分支身份、分支动作、用途和本次执行模式，以及实际展示的 brief、Plan 写入或 TAPD 任务创建/更新清单；没有展示的写入不在授权中。即使模式为 `SUBMIT|GO_LIVE`，该确认也只授权到实现与评审，后续提测、合并 master、Wiki 和本地清理仍使用各自产生后的精确确认。
任何可见字段变化都会使确认失效，必须展示更新后的整张清单；`CREATE` 完成后同一分支转为 `USE_EXISTING` 是预期执行状态变化，不要求重复确认。

执行 `CREATE` 时使用等价于
`git switch --no-track -c <目标分支> <已验证 origin/master ref/SHA>` 的无 upstream
创建方式，随后读回当前分支、HEAD 和工作区状态。不得先设置 upstream 再移除。
