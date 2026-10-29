# Test deployment and confirmation

## Wiki choice

Reuse a still-valid explicit choice from the current checklist; otherwise use
`STANDARD` by default, including `AUTO`; ordinary repair/development defaults
to test delivery with merge, test build/deploy and Wiki all selected. Respect
explicit implementation-only, plan-only, branch-only or disabled choices.
Show “是否需要提测 Wiki：需要/不需要” with merge and test-build
choices in the same complete checklist, without a separate preference prompt.
Before confirmation, label it 确定清单; approved current content is 执行清单.
Its overview lists all selected projects. Show merge/deployment per project,
with one Story/Bug Wiki choice and the applicable multi-project template.
For `STANDARD`, show the canonical template preview before the implementation
confirmation. A confirmed complete execution checklist may authorize filling
that template from reviewed implementation/actual delivery facts and writing
the scoped final body/patch. The template alone grants no authority and cannot
claim future success. Standalone submission still displays its complete body
and operation plan for its own confirmation.

## Deployment mode

Resolve exactly one mode without creating a separate prompt when user intent is
clear:

| Mode | Trigger | Result requirement |
| --- | --- | --- |
| `DEPLOY` | “发布测试环境”“发布版本”“部署并提测” or a named project policy requiring deployment | Reuse a currently verified matching selected operation, or submit its exact confirmed test build and continue on `BUILD_SUBMITTED` |
| `SKIP` | “不构建”“跳过发布”“不发测试环境” | No build/deploy/parameter/poll calls; allow only missing canonical Wiki Job metadata lookup; record `SKIPPED_BY_INTENT` |
| `AUTO` | No explicit override within selected test delivery | Select `DEPLOY`; preserve an explicit `SKIP` or overall non-delivery scope |

“直接提测” follows [direct-submission.md](direct-submission.md): it starts
existing-change delivery with the normal DEPLOY default, and never implies SKIP.
Explicit “直接提测，不构建” preserves SKIP. A prior IMPLEMENT endpoint does not
silently disable this newly requested delivery.

Never silently downgrade an explicit `DEPLOY` request. If the user changes from
`DEPLOY` to `SKIP` before Jenkins is triggered, update the choice and show the
complete current plan again, then wait for its confirmation; do not treat the
changed option as approval of an undisplayed operation set. Retain actual
completed effects rather than replaying them. This uses the same confirmation
question, not a separate deployment preference prompt.

## Consolidated submission authorization

沿用[执行清单的确认复用](../../../references/execution-checklist.md#执行清单的确认复用)。
`ReviewedChange` 通过后，首次提测写入前准备一份完整 `SubmissionPlan`。
`submission_phase=PLAN` 始终只读，返回 `AWAITING_CONFIRMATION`；该技术状态
本身不要求新增一轮人工确认。授权分为两条路径：

- 由 `fixing-bug` / `developing-requirement` 编排：接收完整执行清单、真实人工
  确认和当前交接结果，逐项比较所选操作及派生事实是否属于原授权范围。
  准确计划校验通过且完全覆盖时，直接调用 `submission_phase=EXECUTE`，不重新
  展示未变化的完整计划，也不再询问“是否执行正式提测计划”。
- 独立调用本技能：展示完整、准确的操作计划和正文，请求确认后停下，等待用户
  对这份内容作出匹配的明确确认，才可进入 `EXECUTE`。仅提及此前修复、提供
  true 标志或已有实施结果，不能证明具备主编排的完整授权。

适用的已确认清单或独立计划必须覆盖：

- 仓库、已评审路径和差异标识、原始源分支、已核实的测试目标（`dev` 或
  `develop`），以及提交、推送、创建或更新 MR、合并的操作意图。
- `STANDARD|NO_WIKI`、Wiki 归属、层级与条目范围，以及主编排确认中的模板和
  基于证据补全内容的规则，或独立确认中的准确最终正文或补丁。
- `DEPLOY|SKIP`；选择 `DEPLOY` 时，覆盖目标项目、发布目标、测试环境、
  Jenkins Job、准确且已确认的测试目标 ref/SHA 标识、版本或构建参数、测试
  发布通道及目的。
- 内容可确定的 `Bug|Story|Task` Wiki 链接评论，以及最终 TAPD 状态、处理人、
  测试版本操作，包括有明确边界的版本文本派生规则。
- `work_mode` 对应的状态处理行为。

写入前仍须计算并校验评审后的准确差异与 SHA、最终 Wiki 正文、补丁和指纹、
发布参数及元数据绑定。业务范围获准不代表可以猜测未来差异，也不授权部署目标
中的无关提交。保留已评审版本与源码的准确包含关系检查及可变事实核对；派生
技术字段只能依据证据填写。

计划面向用户展示“需要提测 Wiki”或“不需要提测 Wiki”，内部映射到
`STANDARD|NO_WIKI`，不能只展示“标准流程”或原始配置代码。`NO_WIKI` 须明确
列出不执行 Wiki 查找、读取、创建、更新和评论。

仅修复或仅实施的确认、“修复完成就提测”、默认选项或未确认的清单，均不能
授权尚未覆盖的交付操作。主执行清单已明确覆盖这些操作时复用其授权，不能仅因
确认发生在实施前就拒绝复用。

范围和已授权操作的含义不变时，原授权继续有效。按已授权规则派生的提交 SHA、
MR ID、Wiki 及月份页、子页 ID、Jenkins 队列或构建 ID、已核实的实施结果和
模板补全，不要求再次确认。仅刷新技术绑定时，仍须停止使用旧绑定写入，并准备
一份更新、准确且校验通过的计划，但不会自动触发新的人工审批。按
[完整计划评审](submission-rules.md#whole-plan-review)，将所有完整操作包和 Wiki
草稿纳入一次独立 `PRE_SUBMISSION_PLAN` 评审；脚本仍逐项检查写入并读回，无须
为每一步再调用 Agent。

项目或仓库、业务范围或关键方案、源或目标分支、操作集合、Wiki 归属或正文
语义、Jenkins Job、环境、通道或参数含义、TAPD 目标或人员、操作目的超出或
改变已批准范围时，必须重新取得授权。自动 A → C → B 冲突处理复用主清单中
已包含的条件范围；未覆盖时，展示并确认这部分准确新增范围。`master` 操作
必须有明确的源分支、目标分支和目的授权，不能从测试交付推导。清理仍须保留
其单独要求的授权。

上述事实或合并、Wiki、部署选择变化后，先重新展示完整当前清单和提测操作
集合，包括适用的 Wiki 正文或补丁，再请求确认。用户只调整偏好并不授权剩余
写入；对未变有效计划的明确肯定回复直接用于执行，不再循环询问。沿用共享的
[用户调整后的重新展示规则](../../../references/execution-checklist.md#用户调整后的重新展示)。

## Execution order

Prepare and validate the exact Wiki draft before its write, but defer Wiki/TAPD writes until
every included repository's deployment gate is resolved:

```text
Each repository: Git commit/push/MR -> confirmed test-target containment
  -> DEPLOY: reuse verified matching predecessor, or submit exact Jenkins queue (BUILD_SUBMITTED)
     SKIP: no Jenkins deployment call + SKIPPED_BY_INTENT
All required repositories pass:
  -> one shared Wiki create/update/readback when STANDARD
  -> idempotent Bug/Story/Task Wiki-link comment when applicable
  -> one Bug registration with waiting-test/test-version writes when required
```

For `DEPLOY`, first apply
[completed delivery reuse](../../../references/execution-checklist.md#已完成交付的复用).
Match each original receipt to its own repository, current containment/delivered
SHA, Job, environment, channel, parameters and purpose. Read back the current
source/deployment or actual package contents needed for that gate. Keep these
facts in the existing consolidated plan; no new persisted ledger or success flag.
Reuse `BUILD_SUBMITTED` only as accepted submission, `DEPLOYED` with its verified
deployment/source, or `RELEASED` only for that package provider with real package
availability. Do not relabel a publication as a consumer deployment. A mismatch
reopens affected evidence/planning; UNKNOWN never causes a retry. Explicit repeat
requests retain their own exact selected action and authorization.

When a new selected build remains necessary, resolve the exact Job and preview
its parameters/fingerprints once.
Use the [scripted delivery executors](../../../references/scripted-delivery.md)
with `completionMode=TRIGGER_ACCEPTED` in both PLAN and EXECUTE, reusing the
unchanged consolidated authority. The helper refreshes symbolic ref/SHA before
triggering once; pin the delivered merge SHA when supported. A changed source
blocks rather than silently including later commits. Package adapter/version/
whole-project scope checks remain required before submission.

An accepted response must identify the exact Job and a valid queue URL/ID on
the same instance. Retain the helper's `BUILD_SUBMITTED` receipt, including
submitted params and planned source identity, in `prerequisites.deploymentReceipt`.
Do not poll the queue/build, wait for startup or terminal SUCCESS, or fetch logs.
Unknown/missing receipts block later writes; do not retry the trigger. Report
“构建任务已提交” with its queue link. Actual deployment, checkout and package
versions remain unverified; a source SHA must never become a package version.
For tooling Wiki entries preserve an evidenced current channel or use
`当前版本：待发布` if none exists; do not infer publication from queue acceptance.
Standalone/official releases and go-live keep `BUILD_TERMINAL` and their full
source/publication verification; this shortcut belongs only to test submission.

Deployment states are:

```text
BUILD_SUBMITTED | DEPLOYED | RELEASED | SKIPPED_BY_INTENT | FAILED | UNKNOWN | NOT_ATTEMPTED
```

- `BUILD_SUBMITTED` permits later Wiki/TAPD writes with the exact queue receipt.
- `DEPLOYED` permits later Wiki/TAPD writes only after `SUCCESS` and ref/SHA
  proof.
- `RELEASED` retains an original package `BUILD_TERMINAL` receipt with exact
  build/queue/Job/source identity, `sourceVerified=true`, original `writes=1`,
  matching current Git delivery and verified real package/version/content.
  It satisfies only the corresponding tooling row, not a consumer/service row.
- `SKIPPED_BY_INTENT` permits direct提测 but the result must say the test
  environment was not published.
- `FAILED|UNKNOWN` blocks later Wiki/TAPD status/test-version writes; keep the
  Bug's existing status and report any completed Git effects truthfully.

## TAPD status policy

- `INITIAL`: after `BUILD_SUBMITTED`, `DEPLOYED`, `RELEASED` or `SKIPPED_BY_INTENT`, write/read `待测试`, the
  waiting-test owner and the test-version field exactly once.
- `CONTINUE` while already `待测试`: use
  `SKIPPED_ALREADY_WAITING_TEST`; do not write `修复中`, `待测试`, or the same
  test-version field again; leave the current owner unchanged.
- `CONTINUE` while still `修复中`: write `待测试` once after the deployment gate
  and Wiki steps complete, assigning its waiting-test owner at the same time.
- Any other current state requires an explicit policy/user decision; do not
  guess a transition.

Run `register-test-submission.mjs` once after the other gates pass. The
read-only preview resolves actual workflow labels/transitions and native or
enabled writable custom version fields. For each Bug status transition, set
`current_owner` to non-empty `te` (测试人员), otherwise `reporter` (创建人).
Missing both blocks; never fall back to the old developer/owner. Bind the
selected owner and old `te`/`reporter`/`current_owner` values; changes before
execution require a fresh plan. The resolved owner satisfies a required
`current_owner` field; other required fields still need existing values.
The preview checks required values and
fingerprints metadata. Validate the resolved preview once; do not manually
reinterpret the same mapping. Execute consumes those exact facts and the same consolidated
authorization, combining applicable status/owner/version writes and readback.
Owner readback must match the selected TAPD account(s). A mismatch blocks
with actual completed effects and no automatic retry or rollback.
No item/metadata rediscovery or private Agent call is needed between fields.
