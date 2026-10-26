---
name: submitting-for-test
description: Use for 直接提测 after implementation or developer inspection; verify the existing change, deliver it to the verified dev/develop branch, run selected test builds and Wiki updates, and register TAPD without repeating implementation.
---

# Submit for Test

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens write gates.

Consume one `TapdWorkDefinition` and matching `ReviewedChange`, or one Bug's
`work_definitions` and `reviewed_changes` collections. Normalize either input
into per-repository delivery rows and one in-memory `TestSubmissionResult`.
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

Accept `submission_phase=PLAN|EXECUTE`. The first invocation is always `PLAN`:
it is read-only and returns the complete plan. Follow the shared
[confirmation-reuse contract](../../references/execution-checklist.md#执行清单的确认复用).
When a Bug/requirement orchestrator supplies its complete execution checklist
and real human confirmation, compare the exact plan to that authority and
continue to EXECUTE without another user turn. For a standalone invocation,
display the plan, ask for its confirmation and stop; only that matching
confirmation permits EXECUTE. A helper's PLAN state is not a mandatory new
human approval when the orchestrator already has matching authority.

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

For standalone use, show the direct-submission 确定清单 with actual change/review
facts, 合并与测试环境 and the requested complete Wiki body/patch, then obtain its
one matching confirmation before EXECUTE. Implementation-only approval never
authorizes delivery. Main-entry matching complete authority is reused unchanged.

## Shared Wiki ownership

Follow [shared-test-wiki.md](../../references/shared-test-wiki.md). One Story
(including its Tasks) or Bug defaults to one Wiki across projects and original
branches. Carry one `sharedWikiPlan` through PLAN/EXECUTE; per-project Git and
deployment plans do not imply separate pages. No Task-title split is permitted
without an explicit user request. Bind owner, repository/branch entries and
all owner/Task comment targets in the consolidated plan.

## Input gate

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

For `EXECUTE`, also require one `PlannedTestSubmission` with
`terminal_state=AWAITING_CONFIRMATION` and authorization covering its exact
operation set: the orchestrator's unchanged complete execution checklist or
the standalone plan's own human confirmation. Repair-only authorization,
implementation completion and a true flag alone are insufficient.

Before the first submission write, require one current-conversation
consolidated authorization binding every displayed submission operation. A
fresh authorization is required only when a bound fact changes.

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

Each source is the original `feature/*` or `fixbug/*` branch. Reuse its
upstream verified and confirmed test target (`dev` or `develop`). For a
standalone invocation, resolve the actual test branch from project policy and
remote refs before displaying the plan. If both names exist without an
authoritative selection, report that gap; never choose by alias. Carry that
exact target through Git, deployment, validation and result; changing it
requires a refreshed confirmation. Never rebuild on the test target or use
`merge/*` as the business source.

## Procedure

1. For each repository row, re-read repository, original source branch/SHA,
   confirmed test-target ref/SHA, current diff and commits. Verify they match
   that row's reviewed change and contain no unrelated paths.
   Match the full pending delivery and continuation delta to the approved
   behavior, impact and verification facts. Stale evidence reopens affected
   checks before any delivery write, including developer edits on the same page.
2. Resolve `deployment_mode` per repository and, for `DEPLOY`, resolve its exact Jenkins Job,
   test environment, release channel, parameters/version identity, and purpose
   through workspace project knowledge and release-safety rules.
3. Under `STANDARD`, pass the resolved `DEPLOY|SKIP` and available parameter
   evidence to `zan-workflows:drafting-wiki`, invoke it read-only, and require
   either one validated target/body plan or a
   `SKIPPED_BY_POLICY` result proven to be `NON_FUNCTIONAL_CONTINUE` with a
   verified owner page/current repository+branch entry and retained exact
   target/body readback. No historical page/entry uses the normal draft path. Under
   `NO_WIKI`, set Wiki to `SKIPPED_BY_POLICY` without loading Wiki capability.
   Reuse the item's current details/comments and the original source branch;
   do not start an independent Wiki search in this skill.
4. Build one consolidated `SubmissionPlan` containing each
   repository's Git/target/deployment selection, applicable shared Wiki/comment
   actions, and one final TAPD registration for the Bug.
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
   will be called. Return `PlannedTestSubmission` with
   `terminal_state=AWAITING_CONFIRMATION`; PLAN itself performs no write.
   Standalone calls display this complete plan, ask and stop. An orchestrator
   instead checks it against the confirmed execution checklist and continues
   when fully covered; keep unchanged technical plans internal and do not turn
   a preview into another approval or end-of-stage user question.
5. In `EXECUTE`, verify the matching standalone confirmation or the
   orchestrator's exact unchanged checklist authority, then re-read each mutable bound fact at its write
   boundary. A changed technical binding stops the stale write and requires a
   fresh accurate plan; compare it to the original authority. Only missing or
   materially changed scope needs user confirmation, not deterministic receipts.
6. For each repository, if already delivered or merge is explicitly disabled,
   first ensure every reviewed change is committed in the bound source SHA,
   with no uncommitted delivery delta. Run merge read-only in `CONTAINMENT_ONLY`
   with that SHA and exact dev/develop target; require `VERIFIED`,
   `operation=VERIFY_CONTAINMENT_ONLY`, containment and zero writes. Use its
   delivered target revision without requiring an MR or claiming a merge.
   Uncommitted, missing or unknown containment blocks before any commit/push;
   never fall through to an unapproved write. Otherwise, before its first Git
   write, validate one `GIT_DELIVERY_BUNDLE` with the
   private [submission-validator.md](agents/submission-validator.md) using
   `PRE_GIT_WRITE`. Bind the complete reviewed diff/file list, repository,
   original branch, target refs, commit/push/MR actions and purpose once.
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
   - `DEPLOY`: validate `JENKINS_TEST_DEPLOY` once, then run
     [run-jenkins-release.mjs](../../scripts/run-jenkins-release.mjs) once with
     the exact confirmed release plan, `completionMode=TRIGGER_ACCEPTED` and
     Job/config fingerprints. It checks the delivered target ref/SHA before
     triggering through `jenkins-mcp` once. An accepted exact Job/queue URL/ID
     returns `BUILD_SUBMITTED` with submitted parameters. Do not wait for queue
     execution or build completion, fetch logs, or require `SUCCESS`/actual SCM
     checkout to continue. Retain the receipt as `deploymentReceipt` for TAPD
     registration. This applies to both main entries and standalone submission,
     including canary package builds. Report “构建任务已提交” and the queue link;
     it proves neither deployment nor publication, and supplies no actual npm version;
   - `SKIP`: make no Jenkins build/deploy/parameter/queue/log call and record
     `SKIPPED_BY_INTENT`. Only a STANDARD Wiki's missing canonical Job URL
     permits the earlier exact read-only metadata lookup. NO_WIKI+SKIP has no
     reason to load or call Jenkins.
   `FAILED|UNKNOWN` blocks every later Wiki/TAPD write.
8. Only after every required repository passes Git containment and
   `BUILD_SUBMITTED|DEPLOYED|SKIPPED_BY_INTENT`, execute the authorized Wiki plan under
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
   consolidated authorization. Validate `WIKI_WRITE_AND_LINK_BUNDLE` once
   before invocation. The script uses `tapd-mcp` to create or update/read back
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
   fields separately. Give the final readbacks to `POST_WRITE`; return
   `SUBMITTED` only on a passing verdict.
   Report the actual readback status in the result, never the checklist's target
   as a completed transition while merge/deployment/Wiki prerequisites remain pending.

## Failure behavior

On a write failure, unknown effect or missing readback, return `BLOCKED` with
actual completed actions and stop this TAPD item. Do not retry automatically
any external mutation, adopt an earlier unknown effect, roll back, or continue
later writes. A PLAN-only parser/input/evidence failure with no mutation
attempt is a read-only preflight problem: correct it and prepare a fresh
read-only preview with a new request ID. It neither authorizes a write nor
requires repeating implementation/review. Present a valid complete plan before
any submission write; never call a read-only failure an unknown write effect.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. A temporary Markdown file used solely to carry the exact
authorized Wiki body into `ensure-test-wiki.mjs` is removed after the call.
The result exists only for the current in-memory handoff.
