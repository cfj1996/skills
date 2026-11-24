---
name: submitting-for-test
description: Use for 直接提测 after implementation or developer inspection; verify the existing change, deliver it to the verified dev/develop branch, run selected test builds and Wiki updates, and register TAPD without repeating implementation.
---

# Submit for Test

## 用户说明

独立调用本技能时同样遵守[限制与确认说明](../../references/execution-checklist.md#限制与确认说明)。
面向中文用户时，限制、确认理由与阻塞原因均用中文说明；解释确认出处时，
链接本技能并引用下方中文确认条款。用户未要求核对英文原文时，不附英文
规则引文；机器字段、枚举、代码、命令和路径保持原样。

## Mock test-delivery gate

Before any selected commit/push/MR/merge, build, Wiki/comment or TAPD registration,
apply [Mock development](../../references/mock-development.md) and the unified
[Mock safety helper](../../scripts/mock-safety.mjs). Carry a freshly verified complete
Mock inventory for every required repository, including explicit evidenced no-Mock
results; absent/unknown is not none. Bind current source/diff contents and exact target.

Active Mock is local-only by default. The full checklist must explicitly show each
MOCK-* / MOCK_ONLY scope, paths/scenarios, remaining real calls, test branch/environment,
validation limits, purpose, exit conditions and the allowed selected writes. Actual human
approval of that content permits those test operations only. Ordinary development,
直接提测, confirmed=true, or default DEPLOY does not include Mock permission. Reuse
matching full-checklist authority without another prompt; inventory/content/target or
purpose changes reopen affected authorization. Apply this gate even for NO_WIKI, SKIP,
CONTAINMENT_ONLY, already-waiting registration, standalone helpers and workflow sessions.

Record 含 Mock and real acceptance gaps in the Wiki/current test result; do not claim
whole-requirement or real-chain acceptance. Production/default-branch delivery is
forbidden while the selected production scope carries Mock implementations or lacks
verified source/artifact exclusion. A test approval can never authorize production.


Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens write gates.

Consume one `TapdWorkDefinition` and matching `ReviewedChange`, or one Bug's
or one verified Story/selected Tasks' `work_definitions` and `reviewed_changes`
collections. Normalize either input
into per-repository delivery rows and one in-memory `TestSubmissionResult`.
Use the [same checklist](../../references/execution-checklist.md#围绕同一清单编排)
as the shared scope/authority source; this phase derives exact technical inputs,
not another business plan. A precursor output or partial provider review cannot
replace the required complete reviewed set for formal submission.
An immediate or manually started execution Wiki is an orchestrated handoff. Its current start instruction incorporates its verified branch, purpose and selected Git, Wiki and Jenkins operations. Follow the [execution context](../executing-tapd-plan/references/execution-context.md) for automatic delivery.
Reuse the checklist's current explicit choices. Without overrides, resolve
`STANDARD` and `DEPLOY` by default, including incoming `AUTO`: merge to the
verified test target, build/deploy its test environment and include Wiki.
An explicit `NO_WIKI`/`SKIP` remains authoritative. Bind the exact plan and Wiki
draft for internal review. Defaults guide preparation. The current human request
or its referenced authorization must cover the selected writes.
If the user says there is no Bug, resolve any verified Story/Task independently
of the selected Wiki action. For a request without a TAPD item, deliver the
requested Wiki text and identify any verified page target separately.

Execute exactly one profile:

- `STANDARD`: Git delivery, optional Jenkins test deployment, Wiki
  draft/write/readback, idempotent Wiki-link comment for the originating
  `Bug|Story|Task`, the Bug's separate final repair record, and final TAPD test registration.
- `NO_WIKI`: Git delivery, optional Jenkins test deployment, the Bug's final
  repair record, and TAPD test registration; never load or invoke Wiki capability.

Use the [continuous submission contract](references/continuous-submission.md)
for ordinary application delivery. Reuse applicable rules and verified facts
from the handoff. Use [change consistency](../../references/change-consistency.md)
for the reviewed delta and select the relevant sections of
[contracts](references/contracts.md), [submission rules](references/submission-rules.md),
[deployment and confirmation](references/deployment-and-confirmation.md), and
[tool routing](../../references/tool-routing.md) for the remaining decisions.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.

For successive preview/execution/helper actions, use one live
[workflow-session.mjs](../../scripts/workflow-session.mjs) session and its lazy
MCP pool; individual CLI helpers remain available for standalone actions.
Use the pinned helper runtime and wait for `SESSION_READY`; the session owns
its TTY mode. Approval-format compatibility stays inside the merge helper;
do not expand a missing `rules` field into manual endpoint probing.
Send the reviewed continuous submission as one request. For a specialized flow,
send each selected helper action and use its receipt before calling the next.
Keep the plan in memory and refresh mutable facts at the executor boundary.
After the last selected helper result, send `action=finish, phase=PLAN` and
require `SESSION_CLOSED` with verified cleanup before returning. Close before
long human/reviewer waits; the default idle limit is five minutes. Request
timeouts/unknown writes require actual-effect inspection, never automatic
replay. Follow the linked session reference for timing and budget flags.

## 提测指令与结果

接口接受 `submission_phase=PLAN|EXECUTE`。先只读准备计划，再按当前用户指令决定是否执行。需求、Bug 编排和单独运行共用以下规则。

- 用户说「提测」「直接提测」时，把这条执行指令与当前上下文中的工作项、仓库、源和测试目标分支、交付目的、Git/MR 操作、所选构建、Wiki 及登记逐项对应。可只读核实的技术细节由执行方补齐。操作和目标明确，或已有覆盖本次交付的开工确认时，主代理核对只读预检，直接在同一轮进入 `EXECUTE`，最后汇总实际回执。
- 常规交付新增独立评审次数为零。提交和推送核对已审内容与远端，合并核对 MR、CI、权限和实际包含关系，构建核对 Job、参数、源码和队列回执。合并冲突、人工改动或失效证据使业务行为发生变化时，只复核该增量及实际使用方。适用项目明定的审批和必检仍按其要求办理。
- 用户说「先看看」「只预览」「等我确认」时，展示计划后停在只读阶段。交付目标有歧义、需要业务取舍或新增操作未获授权时，只问具体缺项。Mock 测试放行、生产发布等仍需各自的明确授权。
- 已发起提测后，用户明确接受某项非必需修复为已知问题时，保留该决定及验收限制，接着办原提测。沿用与当前内容匹配的实现评审、lint、契约和浏览器记录；缺哪个场景就补哪个。独立评审仍未通过时，只把受影响的结论和新依据交回评审者。

Carry the `ReviewedChange`, work definition, Git snapshot, TAPD item and Wiki
target through both phases. `PLAN` does not repeat implementation review or
project routing. `EXECUTE` refreshes only mutable facts that bind an authorized
write (source/confirmed-target refs, current diff, TAPD state, Wiki body/comment and
deployment target); unchanged skill text, knowledge files and unrelated
history do not need another read. Batch independent read-only checks, then
stop on the first actual mismatch. Never rerun the full Wiki discovery after
the exact target was identified in `PLAN`.

## Direct submission after developer inspection

Use [直接提测](references/direct-submission.md) when the user asks “直接提测”,
“代码确认了，提测” or returns after IMPLEMENT to request delivery. It is also the
standalone entry for existing reviewed work. “直接提测” selects delivery, not SKIP;
only an explicit “不构建/跳过发布/不发测试环境” disables the build. Re-resolve this
new delivery request instead of inheriting a previous IMPLEMENT endpoint.

Reuse the original definition(s), branches and still-current `ReviewedChange`.
Refresh refs, current diff and pending commits before PLAN. If the developer
changed content after review, verify the affected delta and refresh independent
`POST_CHANGE_REVIEW` evidence before treating it as REVIEWED. Never manufacture
review evidence from human inspection or rerun implementation/Task/Plan/branch
creation solely to deliver. Missing trustworthy handoffs need scoped read-only
reconstruction; unresolved evidence blocks, not invented READY/REVIEWED flags.
Direct submission does not authorize business-source edits or Bug reactivation.
For Bugs, refresh the single reviewed repair-record draft with current code and
verification under [record rules](../implementing-work/references/bug-repair-record.md).
The normal REVIEWED handoff carries this draft, not a required published comment.
PLAN includes the exact account/body and late create/reuse action; EXECUTE publishes
only after Git, deployment and applicable Wiki/link gates. Submission-preflight
rework refreshes affected code checks/review and the draft before any publication.

独立直接提测沿用上面的[提测指令与结果](#提测指令与结果)。单纯完成实施或通过代码评审时，仍等待用户发起交付。

## Shared Wiki ownership

Follow [shared-test-wiki.md](../../references/shared-test-wiki.md). One Story
(including its Tasks) or Bug defaults to one Wiki across projects and original
branches. Carry one `sharedWikiPlan` through PLAN/EXECUTE; per-project Git and
deployment plans do not imply separate pages. No Task-title split is permitted
without an explicit user request. Bind owner, repository/branch entries and
all owner/Task comment targets in the consolidated plan.

## Input gate

All selected build parameters follow [fixed Jenkins contracts](../../references/frozen-jenkins-parameters.md).
Read project-knowledge's complete local definitions/defaults/choices and exact environment
profile in both preparation and execution; explicitly submit resolved defaults and reject
actual values conflicting with fixed selectors. Missing/unavailable/ambiguous records block.
Do not call Jenkins parameter-definition APIs or infer definitions from XML during this
workflow. Changes require separate parameter maintenance, not an automatic live fallback.
No Job XML read is needed. Apply current source/Mock-authorization checks for test
delivery; official project-script/artifact checks belong to the actual official release
stage and cannot be claimed complete by a test queue receipt.

Require:

- each definition `READY_FOR_HANDOFF`;
- each matching reviewed change `REVIEWED` with `REVIEW_PASSED`;
- exact repository fingerprint and original fixed repair branch;
- one explicit profile `STANDARD|NO_WIKI`; and
- `deployment_mode=AUTO|DEPLOY|SKIP`.

For a Bug, require a reviewed complete repair-record draft bound to the current
source/verification and exact record authority. Its publication/readback is a
later execution result, not a PLAN or code-REVIEWED prerequisite. Missing code
review, required repositories, record evidence or acceptance still blocks PLAN;
unknown introducing cause/author/time stays explicit and does not alone block repair.

A [confirmed execution Wiki](../executing-tapd-plan/references/executing.md)
can supply the approved scope for a Story or Bug. Verify the correct item type
and ID, its own execution-page link and confirmed revision, every required
repository, and the P/F/TC actually covered by current review and verification.
Reconstruct missing definitions from the original item/branch readbacks. Retain
the complete Bug repair-record draft and a verified previous comment when present.
Use the work item's separate test Wiki and an empty Task-link set.

进入 `EXECUTE` 须有本次准确的 `PlannedTestSubmission`、仍有效的实现评审和覆盖实际操作的用户指令。`PREPARED` 表示只读准备完成。

首次提测写入前，须有当前对话中覆盖本次提测操作的统一授权。绑定事实
变化时，先停止旧计划写入并核对原授权；仅缺失或实质变化的授权范围需要重新
确认，按[统一提测授权](references/deployment-and-confirmation.md#consolidated-submission-authorization)处理。

`STANDARD` does not require a user-supplied Wiki URL. Wiki discovery and
creation planning are producer-owned behavior, not an input gate.
An unspecified Wiki choice is resolved to the stated default before this gate,
not returned as a missing user decision. A template preview alone is not a
final draft or write authority. An approved complete checklist can authorize
evidence-based completion and writing of that template; resolve and validate
the exact final body/patch before writing without a routine second question.

For a multi-repository Bug, group all `work_definitions` by verified canonical
repository/root, origin and fixed branch, and match each group to its one
`reviewed_changes` entry, never by array position. Retain coverage of every
original subproject definition; grouping must not overwrite scope or acceptance.
Require the same Bug identity, every
necessary repository, per-repository review evidence, cross-repository
acceptance and the shared reviewed repair-record draft. Missing or mismatched
required rows return `BLOCKED`; do not silently submit a partial Bug.
Apply the same repository pairing/completeness rules to grouped requirement work,
also verifying the exact parent Story and selected Task/Plan coverage where
Tasks are selected. Story execution Wiki handoffs retain their P/F/TC attribution.
Do not add
sibling Tasks or a Bug repair-record/state gate. One successful row does not
complete the whole selected requirement. Story/Task registration uses only its
explicit applicable version policy, never Bug status/owner or automatic Task done.

Each source is the original `feature/*` or `fixbug/*` branch. Reuse its
upstream verified and confirmed test target (`dev` or `develop`). For a
standalone invocation, resolve the actual test branch from project policy and
remote refs before displaying the plan. If both names exist without an
authoritative selection, report that gap; never choose by alias. Carry that
exact target through Git, deployment, validation and result; changing it
requires a refreshed confirmation. Never rebuild on the test target or use
`merge/*` as the business source.

## Procedure

同一 Bug 或 Story/所选 Tasks 的普通单仓和跨仓应用测试交付优先使用
[连续提测入口](references/continuous-submission.md)。该入口消费完整已审范围。
主代理对照已确定的字段、配置和交付终点核实预检。用户要求预览时再展示清单。
一条只读 PLAN 并行准备各仓及共享 Wiki，绑定实际参数、正文指纹和所选任务。
一条匹配确认的 EXECUTE 按真实回执推进。目标增量、人工合并和 Wiki 变化按返回的暂停位置续跑。
会话关闭后，原 Git 和构建回执齐全时用连续提测的跨会话续接，只读核实后完成 Wiki 或登记。
Story/Task 无状态及版本动作时在计划中标为不适用。Bug 绑定已审的最终记录草稿，在 Git、
所选构建及 Wiki/回链通过后发表或复用并精确读回，随后登记待测试。涉及包发布、
START 的 workflow=CONTINUOUS_SUBMIT 使用上述连续提测；DELIVERY_STEPS（例如同仓多 Job、金丝雀包或多仓各有交付目的）直接按下方操作束合并及构建，逐仓复用本轮执行上下文，再汇总回执。A → C → B 冲突处理沿用已选条件分支。

Apply the [delivery checks](references/submission-rules.md#whole-plan-review) once.
The lead checks the prepared operations and Wiki against the current authorization
and implementation evidence. The executors verify writes and read back their results.

1. For each repository row, re-read repository, original source branch/SHA,
   confirmed test-target ref/SHA, current diff and commits. Verify they match
   that row's reviewed change and contain no unrelated paths.
   Match the full pending delivery and continuation delta to the approved
   behavior, impact and verification facts. Stale evidence reopens affected
   checks before any delivery write, including developer edits on the same page.
2. Resolve `deployment_mode` per repository. For `DEPLOY`, resolve the
   [registered test Job](references/deployment-and-confirmation.md#registered-test-job)
   and its frozen parameters for the delivery object. Application deployments and
   tooling canaries both run the selected Job as configured.
   First check the same checklist's completed predecessor receipts under
   [delivery reuse](../../references/execution-checklist.md#已完成交付的复用).
   Bind each reusable receipt to its own row and current target/source,
   Job/environment/channel/parameters and availability readback in this plan.
   Missing or drifted facts reopen only affected checks; UNKNOWN is not replayable.
3. Under `STANDARD`, pass the resolved `DEPLOY|SKIP` and available parameter
   evidence to `zan-workflows:drafting-wiki`. For a `SKIP` row without a
   verified primary Job link, use the [numbered Wiki heading without a link](../drafting-wiki/references/wiki-template.md#job-heading).
   Invoke the drafter read-only and require either one complete prepared
   target/body plan for the check in step 4 or a
   `SKIPPED_BY_POLICY` result proven to be `NON_FUNCTIONAL_CONTINUE` with a
   verified owner page/current repository+branch entry and retained exact
   target/body readback. No historical page/entry uses the normal draft path. Under
   `NO_WIKI`, set Wiki to `SKIPPED_BY_POLICY` without loading Wiki capability.
   Reuse the item's current details/comments and the original source branch;
   do not start an independent Wiki search in this skill. Keep prepared Wiki facts
   internal until the lead verifies the Wiki target, preservation and its content
   against the actual reviewed change. Reuse a current validated draft.
4. Build one consolidated `SubmissionPlan` containing each
   repository's Git/target/deployment selection, applicable shared Wiki/comment
   actions, the Bug's separate `BUG_REPAIR_RECORD` with exact account/reviewed body
   after those gates, and final TAPD registration targets/policies. A Bug registers
   once; Story/Task has only its explicitly applicable actions, without Bug status
   or inferred Task/parent completion. Preserve each selected target separately.
   MR descriptions include accurate work-item links, actual change/impact and
   any already-verified Wiki link under the shared change-consistency rules.
   A first submission with no page yet uses the work-item link for later
   discovery; do not invent a Wiki URL or mutate an existing MR without authority.
   Existing per-project handoffs retain their original structure; no new workflow ledger is needed.
   Preview registration to automatically resolve actual state labels,
   transitions, required-field values and native/custom test-version mapping.
   For a Bug, show `TAPD 状态：待测试（提测交付完成后流转）` under 合并与测试环境,
   separate from the actual current status; an already-waiting continuation states 保持不变.
   For a Bug transition, read `te`, `reporter` and `current_owner`; assign the
   waiting-test owner to non-empty `te`, otherwise `reporter`, and bind these
   old values and the selected owner in the preview. Missing both blocks;
   bind the returned codes, old values and metadata hashes. Resolve applicable
   Job parameters through its adapter, showing a metadata-only Job binding
   or pipeline-computed version policy explicitly when used. Under
   `NO_WIKI`, explicitly list that no Wiki discovery/read/write/comment tool
   will be called. The lead cross-checks the complete operation set and the
   applicable Wiki criteria once. Unknown future IDs remain derivations. Refer
   only unresolved material findings or an explicitly required review to the
   [submission validator](agents/submission-validator.md), with its precise
   scope. Apply the current request under [提测指令与结果](#提测指令与结果).
5. 在 `EXECUTE` 中核对覆盖准确操作的提测指令或开工确认，
   并在每次写入边界重新读取可变绑定事实。技术绑定变化时停止旧计划写入，
   生成准确的新计划并核对原授权；仅缺失或实质变化的范围需要用户确认，
   按已授权规则确定产生的回执不新增确认。
6. For each repository, if already delivered or merge is explicitly disabled,
   first ensure every reviewed change is committed in the bound source SHA,
   with no uncommitted delivery delta. Run merge read-only in `CONTAINMENT_ONLY`
   with that SHA and exact dev/develop target; require `VERIFIED`,
   `operation=VERIFY_CONTAINMENT_ONLY`, containment and zero writes. Use its
   delivered target revision without requiring an MR or claiming a merge.
   Uncommitted, missing or unknown containment blocks before any commit/push;
   never fall through to an unapproved write. Otherwise, before its first Git
   write, require the plan-reviewed `GIT_DELIVERY_BUNDLE`. Bind the complete
   reviewed diff/file list, repository, original branch, target refs,
   commit/push/MR actions and purpose once. Run the read-only
   [commit preflight](../../references/commit-readiness.md) for its exact message
   and environment before the first commit; blocked Hooks/runtime/message stop
   that write without installing a new linter or disabling Hooks.
   Commit/push through local Git only when needed, checking actual bound facts
   and reading back the derived SHA without another Agent validator. Run
   [merge-reviewed-branch.mjs](../../scripts/merge-reviewed-branch.mjs) once for
   exact MR reuse/create, CI waiting, fresh ref/approval checks, merge readback
   and containment. It uses `gitlab-mcp`; never manually poll or validate each
   GET. Reuse the final result and delivered target revision for deployment;
   the source branch SHA is not automatically the target merge commit SHA.
   A genuine metadata update or conflict needs its exact authorized action,
   not a new broad preparation/review run. Conflicts use the shared
   [A → C → B flow](../../references/conflict-merge.md): reuse the main checklist's
   conditional resolution authority or the same terms in a standalone execution
   request. Obtain only missing conflict-resolution authority. Cleanup consumes only explicitly covered exact resources,
   otherwise retain them and give next-step advice without another question. Keep A as the
   business source and retain the complete ConflictMergeHandoff, association
   and cleanup/retention/deferred outcomes in TestSubmissionResult for go-live.
7. Resolve every repository's deployment gate through `jenkins-mcp`:
   - `DEPLOY` with a completed, still-matching selected operation: reuse its
     original `BUILD_SUBMITTED|DEPLOYED|RELEASED` receipt after the plan's current
     identity/readback checks. Do not trigger again. `RELEASED` satisfies only
     the package provider's gate, with real package/version/content availability;
     it never replaces a consumer deployment or service-readiness proof. Retain
     the original terminal semantics and `deploymentReceipt`, not a fabricated
     new submission. An explicit repeat deployment/publication remains a new
     accurately authorized action.
   - `DEPLOY` still requiring a new selected build: consume the plan-reviewed `JENKINS_TEST_DEPLOY`, then run
     [run-jenkins-release.mjs](../../scripts/run-jenkins-release.mjs) once with
     the exact confirmed release plan, `completionMode=TRIGGER_ACCEPTED` and
     Job-identity and frozen-parameter fingerprints, plus applicable project-check
     evidence. It checks the delivered target ref/SHA before
     triggering through `jenkins-mcp` once. An accepted exact Job/queue URL/ID
     returns `BUILD_SUBMITTED` with submitted parameters. Do not wait for queue
     execution or build completion, fetch logs, or require `SUCCESS`/actual SCM
     checkout to continue. Retain the receipt as `deploymentReceipt` for TAPD
     registration. This applies to both main entries and standalone submission,
     including canary package builds. Report “构建任务已提交” with the verified `jobUrl`
     as the user-facing link. Keep `queueId`/`queueUrl` only as internal acceptance
     evidence; do not use a queue URL as the Job/build link, invent a `buildUrl`,
     or retrigger a build to correct a displayed link. Queue acceptance proves neither
     deployment nor publication, and supplies no actual npm version;
   - `SKIP`: make no Jenkins build/deploy/parameter/queue/log call and record
     `SKIPPED_BY_INTENT`. Only a STANDARD Wiki with a known Job and missing
     canonical URL permits the earlier exact read-only metadata lookup.
     NO_WIKI+SKIP has no reason to load or call Jenkins.
   `FAILED|UNKNOWN` blocks every later Wiki/TAPD write.
8. Only after every required repository passes Git containment and
   `BUILD_SUBMITTED|DEPLOYED|RELEASED|SKIPPED_BY_INTENT`, execute the authorized Wiki plan under
   `STANDARD` only when the drafter returned `VALIDATED`. For creation,
   functional `CONTINUE` supplementation, or unchanged reuse, run
   [ensure-test-wiki.mjs](scripts/ensure-test-wiki.mjs) once with the exact
   item, `entryRepoUrl`, original branch and approved complete shared body file.
   Copy preview `wikiOwner` into `expectedOwnerType/expectedOwnerId` for a Task,
   and confirm every returned `commentOperations` target, including its parent
   Story anchor. For a multi-project batch, finish all included Git/deployment
   gates before writing the page once; then link each delivered Task to that
   exact ID/hash without another page write. Copy the confirmed
   target into `--expect-target`; for an existing Wiki pass its exact
   `--expected-wiki-id`, `--expected-month-id`, approved title and
   `--expected-body-sha256`; for creation pass the fixed `--month`, title,
   creator and any existing month ID. Add `--execute` only under the unchanged
   consolidated authorization. Consume the plan-reviewed `WIKI_WRITE_AND_LINK_BUNDLE`
   without another Agent invocation. The script uses `tapd-mcp` to create or update/read back
   the approved body and ensure/read back its comment. Independent initial
   reads run in parallel; it refreshes the exact body immediately before an
   update and comments after a Wiki write. No separate Agent validation or
   confirmation is needed between its deterministic steps. Require
   `LINKED|ALREADY_LINKED`, exact Wiki ID, approved final `bodySha256`, and
   `wikiState=CREATED|UPDATED|UNCHANGED`. Do not invoke
   `zan-workflows:linking-tapd-wiki` again after this bundle.
   For `SKIPPED_BY_POLICY`, perform no Wiki or Wiki-comment operation. A
   conflict or failed readback blocks later TAPD actions. Retain the exact
   final Wiki target for `going-live`.
9. For a Bug only, after all required Git/deployment gates and the applicable
   shared Wiki/link gate pass, consume the plan-reviewed `BUG_REPAIR_RECORD`.
   Follow [record rules](../implementing-work/references/bug-repair-record.md):
   refresh current source/review/draft bindings and relevant comments, reuse a
   verified record covering this round or create the single authorized complete
   record, then read back its exact ID/item/account/body. Keep it separate from
   the Wiki-link comment. NO_WIKI skips only Wiki/link steps, not this record.
   Set execution `prerequisites.repairRecord={commentId, author, bodySha256}` from
   that verified readback; hash the actual returned HTML, not the pre-write draft.
   Do not require another Agent for unchanged reviewed content. Any failure or
   unknown effect blocks registration while retaining earlier Git/build/Wiki
   receipts; continuation verifies/reuses them and the original comment before
   finishing only missing work. Story/Task skips this step.
10. After all required repository gates, applicable Wiki/link and Bug repair-record
   readbacks pass, apply the status policy from the work mode through one validated
   `TAPD_REGISTRATION_BUNDLE`, then invoke
   [register-test-submission.mjs](../../scripts/register-test-submission.mjs)
   once with the exact item, work mode, approved status/version policy,
   automatically resolved workflow/field mappings and metadata fingerprints.
   Reuse the consolidated authorization and successful Git/deployment/Wiki
   prerequisites, including that exact repair-record evidence for Bugs. The
   executor freshly reads the comment and checks identity/account/body before
   reading current Bug state/assignment; missing or mismatched evidence blocks
   before any update, including an already-waiting CONTINUE. Story/Task has no
   repair-record requirement or comment read. Through `tapd-mcp` it refreshes the bound facts, sends one
   combined update for status, waiting-test owner and version, and reads all
   written fields back. The owner uses `te` first, otherwise `reporter`;
   verify it through `current_owner`. `CONTINUE`
   already in `待测试` returns `SKIPPED_ALREADY_WAITING_TEST` without duplicate
   writes. Story/Task never receives a Bug status; version-only registration
   requires its explicit policy. Do not manually repeat reads or validate the
   fields separately. If a grouped requirement explicitly includes several
   applicable registration targets, apply this atomic bundle only to those exact
   targets under the same plan; no new Bug/Task status or sibling target is inferred.
   The lead checks final readbacks once against `POST_WRITE`
   criteria without another routine Agent invocation; return `SUBMITTED` only
   after that check passes. Ambiguous evidence gets scoped review, never a
   guessed receipt or continued dependent write.
   Report the actual readback status in the result, never the checklist's target
   as a completed transition while merge/deployment/Wiki prerequisites remain pending.
   按项目汇总实际提交、MR/合并、已受理的测试构建和链接、Wiki、TAPD 结果及已知问题。部分完成时列出已完成步骤、当前阻塞及未执行项。

## Failure behavior

On a write failure, unknown effect or missing readback, return `BLOCKED` with
actual completed actions and stop this TAPD item. Do not retry automatically
any external mutation, adopt an earlier unknown effect without reliable exact
readback, roll back, or continue dependent writes in the blocked execution.
On a later authorized continuation, first inspect the original operation's exact
target, fields/content/source and receipts read-only. Only authoritative matching
facts can turn an unknown effect into verified completed work; preserve it without
replaying the mutation, refresh the normal plan/gates and finish only missing
authorized actions. Insufficient/ambiguous readback stays BLOCKED. Do not clear a
poisoned session's write barrier or treat a new session as recovery evidence.
A PLAN-only parser/input/evidence failure with no mutation
attempt is a read-only preflight problem: correct it and prepare a fresh
read-only preview with a new request ID. It neither authorizes a write nor
requires repeating implementation/review. Verify the corrected plan before
the affected writes and proceed under the current matching authorization.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. A temporary Markdown file used solely to carry the exact
authorized Wiki body into `ensure-test-wiki.mjs` is removed after the call.
The result exists only for the current in-memory handoff.

## Execution feedback

按 [执行反馈记录](../../references/execution-feedback.md#attach-to-a-workflow) 在顶层
任务开始时创建本地诊断 runId，能力切换复用同一编号；实际发生时记录阶段、确认
事项、人工纠正及最终结局。传给公共交付会话以关联脚本事件，未接入步骤标明缺口。
诊断不保存业务 Plan/result、不作为授权或恢复依据；失败不阻断原工作。只在用户
明确要求提交/导出时调用 report-execution，不在任务结束时自动上传。
