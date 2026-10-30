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
Reuse the checklist's current explicit choices. Without overrides, resolve
`STANDARD` and `DEPLOY` by default, including incoming `AUTO`: merge to the
verified test target, build/deploy its test environment and include Wiki.
An explicit `NO_WIKI`/`SKIP` remains authoritative. Show the complete plan and
Wiki preview before confirmation; defaults never authorize writes, and no
separate Wiki preference question is needed.

Execute exactly one profile:

- `STANDARD`: Git delivery, optional Jenkins test deployment, Wiki
  draft/write/readback, idempotent Wiki-link comment for the originating
  `Bug|Story|Task`, and final TAPD test registration.
- `NO_WIKI`: Git delivery, optional Jenkins test deployment, and final TAPD
  test registration; never load or invoke Wiki capability.

Read [contracts.md](references/contracts.md),
[change consistency](../../references/change-consistency.md),
[submission-rules.md](references/submission-rules.md),
[deployment-and-confirmation.md](references/deployment-and-confirmation.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before writing.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.

For successive preview/execution/helper actions, use one live
[workflow-session.mjs](../../scripts/workflow-session.mjs) session and its lazy
MCP pool; individual CLI helpers remain available for standalone actions.
Use the pinned helper runtime and wait for `SESSION_READY`; the session owns
its TTY mode. Approval-format compatibility stays inside the merge helper;
do not expand a missing `rules` field into manual endpoint probing.
Send each authorized action separately, retain no workflow file, and refresh
mutable facts inside its executor. Session reuse caches connections, not
authorization, item state, refs or deployment evidence.
After the last selected helper result, send `action=finish, phase=PLAN` and
require `SESSION_CLOSED` with verified cleanup before returning. Close before
long human/reviewer waits; the default idle limit is five minutes. Request
timeouts/unknown writes require actual-effect inspection, never automatic
replay. Follow the linked session reference for timing and budget flags.

接受 `submission_phase=PLAN|EXECUTE`。首次调用始终进入 `PLAN`，只读准备并
返回完整计划，遵守[执行清单的确认复用](../../references/execution-checklist.md#执行清单的确认复用)：

- 独立提测时，先展示完整计划，询问是否确认并等待回复；只有用户对该计划的
  匹配确认，才允许进入 `EXECUTE` 执行。
- 由 Bug 或需求主流程调用时，若完整执行清单及真实用户确认已覆盖本次准确
  操作，核对匹配后直接进入 `EXECUTE`，无需再次询问。辅助脚本返回 `PLAN`
  技术状态，本身不构成新的人工确认节点。

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
For a Bug whose completion record became stale, follow the record-only refresh
in [direct-submission.md](references/direct-submission.md#人工改动后的-bug-完成记录):
review the corrected proposed body with the current diff. PLAN may preview the
record correction and delivery after current code checks/review pass; do not
claim a complete REVIEWED handoff yet. Confirm that exact comment action/body
with the same delivery checklist, then append/reuse and read it back before
any delivery write. Refresh the existing ReviewedChange only after the record
gate passes; failed/unknown comments block all later writes without replay.

独立直接提测时，展示包含实际变更与评审事实、合并与测试环境，以及所选完整
Wiki 正文或补丁的确定清单，取得一次匹配确认后才进入 `EXECUTE`。仅实施授权
不包含提测交付；主流程已有匹配的完整执行清单授权时，继续复用，不重复确认。

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

The sole PLAN-only exception is the direct Bug record-only correction above:
current code verification/independent review and the proposed corrected record
must already pass, with exact repository/branch/scope and historical evidence.
Its missing completion readback remains explicit. At EXECUTE, perform only the
confirmed record action first, obtain its readback, and then require all normal
READY_FOR_HANDOFF/REVIEWED gates before any commit/push/MR, build, Wiki or final
registration. Missing code review, required repositories, history or acceptance
is not this exception and still blocks PLAN.

进入 `EXECUTE` 还须有一份 `PlannedTestSubmission`，其
`terminal_state=AWAITING_CONFIRMATION`，且准确操作集已获授权：来源可以是
主流程未变化的完整执行清单确认，也可以是独立提测计划的真实用户确认。
仅修复授权、实现完成或设为真的确认字段，均不能代替提测授权。

首次提测写入前，须有当前对话中覆盖每项已展示提测操作的统一授权。绑定事实
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
acceptance and the shared completion-record readback. Missing or mismatched
required rows return `BLOCKED`; do not silently submit a partial Bug.
Only the explicitly scoped record-only PLAN exception may defer the corrected
completion readback; it never defers repository coverage, code review or
cross-repository acceptance, and EXECUTE must restore the record gate first.
Apply the same repository pairing/completeness rules to grouped requirement work,
also verifying the exact parent Story and selected Task/Plan coverage. Do not add
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

Use the [whole-plan review](references/submission-rules.md#whole-plan-review):
one independent `PRE_SUBMISSION_PLAN` covers the complete plan and its prepared
Wiki. The lead and executors own subsequent fresh checks/readbacks; routine
stage transitions do not start new private validators.

1. For each repository row, re-read repository, original source branch/SHA,
   confirmed test-target ref/SHA, current diff and commits. Verify they match
   that row's reviewed change and contain no unrelated paths.
   Match the full pending delivery and continuation delta to the approved
   behavior, impact and verification facts. Stale evidence reopens affected
   checks before any delivery write, including developer edits on the same page.
2. Resolve `deployment_mode` per repository and, for `DEPLOY`, resolve its exact Jenkins Job,
   test environment, release channel, parameters/version identity, and purpose
   through workspace project knowledge and release-safety rules.
   First check the same checklist's completed predecessor receipts under
   [delivery reuse](../../references/execution-checklist.md#已完成交付的复用).
   Bind each reusable receipt to its own row and current target/source,
   Job/environment/channel/parameters and availability readback in this plan.
   Missing or drifted facts reopen only affected checks; UNKNOWN is not replayable.
3. Under `STANDARD`, pass the resolved `DEPLOY|SKIP` and available parameter
   evidence to `zan-workflows:drafting-wiki`, invoke it read-only, and require
   either one complete prepared target/body plan for the joint review in step 4 or a
   `SKIPPED_BY_POLICY` result proven to be `NON_FUNCTIONAL_CONTINUE` with a
   verified owner page/current repository+branch entry and retained exact
   target/body readback. No historical page/entry uses the normal draft path. Under
   `NO_WIKI`, set Wiki to `SKIPPED_BY_POLICY` without loading Wiki capability.
   Reuse the item's current details/comments and the original source branch;
   do not start an independent Wiki search in this skill. Keep prepared Wiki facts
   internal with validation `NOT_RUN`; do not claim `VALIDATED` until the joint
   review passes. A still-current independently validated draft is reusable.
4. Build one consolidated `SubmissionPlan` containing each
   repository's Git/target/deployment selection, applicable shared Wiki/comment
   actions, and the exact final TAPD registration targets/policies. A Bug registers
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
   will be called. Review this complete plan once with the private
   [submission-validator.md](agents/submission-validator.md), phase
   `PRE_SUBMISSION_PLAN`, including the Wiki validator's document criteria
   only under STANDARD with a prepared body; NO_WIKI loads no Wiki capability.
   Require a mapped pass for the plan and, under STANDARD, the complete draft
   before the first delivery write. Unknown future IDs remain derivations,
   not successful effects. Then return `PlannedTestSubmission` with
   `terminal_state=AWAITING_CONFIRMATION`; PLAN itself performs no write.
   独立调用时展示这份完整计划，询问是否确认并等待回复。主流程调用则核对
   已确认执行清单，完整覆盖时连续执行；未变化的技术计划保留在内部，不把
   预览变成新的审批或阶段结束时的询问。
5. 在 `EXECUTE` 中核对独立提测的匹配确认，或主流程未变化的准确清单授权，
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
   conditional resolution authority; standalone or missing scope still confirms
   its exact ACB plan. Cleanup consumes only explicitly covered exact resources,
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
     `SKIPPED_BY_INTENT`. Only a STANDARD Wiki's missing canonical Job URL
     permits the earlier exact read-only metadata lookup. NO_WIKI+SKIP has no
     reason to load or call Jenkins.
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
9. After all required repository gates and the shared Wiki/comment gate pass,
   apply the status policy from the work mode through one validated
   `TAPD_REGISTRATION_BUNDLE`, then invoke
   [register-test-submission.mjs](../../scripts/register-test-submission.mjs)
   once with the exact item, work mode, approved status/version policy,
   automatically resolved workflow/field mappings and metadata fingerprints.
   Reuse the consolidated authorization and successful Git/deployment/Wiki
   prerequisites. Through `tapd-mcp` it refreshes the bound facts, sends one
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
requires repeating implementation/review. Present a valid complete plan before
any submission write; never call a read-only failure an unknown write effect.

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
