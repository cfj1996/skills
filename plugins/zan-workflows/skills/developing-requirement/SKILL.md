---
name: developing-requirement
description: Use when one TAPD Story or Task must be developed end-to-end from remote-master scope through confirmed developer-assigned and estimated TAPD Tasks, fixed branches, linked Plans, reviewed implementation, and optional test submission or go-live.
---

# Develop Requirement

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens project, branch,
write, or review gates.

Orchestrate one requirement from evidence to its explicitly requested terminal
stage. This skill coordinates existing Zan skills and does not duplicate or
weaken their contracts.

## Inputs and boundary

Require one exact TAPD Story or Task URL as the workflow identity. Accept its
PRD, prototype, attachments, and comments as requirement evidence.

If only a standalone PRD or prototype is available, route to
`zan-workflows:writing-plans` with `phase=SCOPE_REVIEW` and return
`PENDING_TAPD_STORY_OR_TASK` before a branch-bound Plan or implementation. Do not
advertise the standalone artifact as an end-to-end requirement-development run.

Accept `delivery_mode=PLAN_ONLY|BRANCH_ONLY|IMPLEMENT|SUBMIT|GO_LIVE`,
defaulting from the user's explicit request. A review or planning request is
`PLAN_ONLY`; “创建开发分支” is `BRANCH_ONLY`; “开发/实现” is `IMPLEMENT`;
“提测” is `SUBMIT`; and an explicit “上线/合并 master” request is `GO_LIVE`.
Do not infer a later delivery mode from an earlier-stage request.

For `SUBMIT|GO_LIVE`, also accept
`submission_profile=AUTO|STANDARD|NO_WIKI` and
`deployment_mode=AUTO|DEPLOY|SKIP` under the contracts of
`submitting-for-test`. `GO_LIVE` uses `going-live` for original-branch master
delivery, involved tooling-package latest publication, affected-project
dependency upgrades/verification, and Wiki maintenance. Business application
production deployment remains outside this mode.

Bug repair belongs to `zan-workflows:fixing-bug`. This orchestrator never
performs delivery writes directly: only `submitting-for-test` may own its
confirmed commit/push/MR/deployment/Wiki/TAPD operations, and only
`going-live` may own its separately confirmed master delivery, tooling latest
flow, Wiki maintenance and local cleanup. Package publication uses
`running-release` through Jenkins; this orchestrator does not publish directly.

## Composition contract

Use the skills in this order:

1. `zan-workflows:workspace-project-knowledge`
2. `zan-workflows:writing-plans` with `phase=SCOPE_REVIEW` and
   `confirmation_mode=DEFER_TO_ORCHESTRATOR`
3. `zan-workflows:breaking-down-requirement` with `phase=PLAN` for task
   scope, verified developers and final workload estimates; skip for `BRANCH_ONLY`
4. `zan-workflows:preparing-work` for exact TAPD project and branch binding
5. After the combined checklist confirmation, `breaking-down-requirement`
   with `phase=EXECUTE` only for explicitly approved task writes, then
   `zan-workflows:writing-plans` with `phase=PLAN_WRITE`
6. `zan-workflows:implementing-work` when
   `delivery_mode=IMPLEMENT|SUBMIT|GO_LIVE`
7. `zan-workflows:submitting-for-test` when
   `delivery_mode=SUBMIT|GO_LIVE`
8. `zan-workflows:going-live` only when `delivery_mode=GO_LIVE`

Do not skip ahead because the user supplied a plausible repository or branch.
Exact user constraints are preserved and verified, not replaced.

## Fast path and evidence reuse

- Treat an explicit project, delivery surface and scope boundary as constraints.
  For a request limited to UI and interaction, do not expand into backend
  design, refund-event handling or every possible API contract. Check a live
  field only when the requested display actually consumes it; a user-approved
  Mock/visual state does not require a new backend contract to begin UI work.
- Keep one current in-memory evidence set for the TAPD item, project, prototype,
  remote baseline, branch and scope. Pass those facts to child skills. Do not
  re-read a skill, knowledge file, TAPD item, branch or prototype merely because
  the next stage starts; refresh mutable Git/TAPD facts at the write boundary
  or when an observed change invalidates them.
- Batch independent read-only facts once the item and repository are known.
  Ask for user decisions only after checking available evidence. Bundle related
  unresolved decisions into one question; explicit clarifications update the
  current scope instead of starting discovery again. Never use timed sleep as
  a substitute for a required answer.
- Use `DIALOGUE` for a uniform interaction applied to several pages when there
  is one shared behavior and no independent page decisions. Do not load panel
  runtime, fixtures or browser injection scripts unless `PANEL` was selected.
- A stage boundary does not require a new turn. Continue through all authorized
  read-only work and implementation stages in the same turn while gates pass;
  pause only for a genuinely missing decision or an operation whose exact
  current facts still need authorization.

## 1. Resolve affected projects

Read the requirement and prototype evidence, then invoke
`zan-workflows:workspace-project-knowledge` before live source search. Resolve
the primary project and every affected secondary project with canonical paths,
Git roots, origins, ownership boundaries, and confidence.

For each project, fetch read-only remote refs and record the current
`origin/master` SHA. Use remote master code—not the current local branch—as the
scope baseline. Multiple plausible projects or an unavailable remote baseline
returns `PENDING`; never search the whole workspace and choose by intuition.

## 2. Confirm requirement scope

Invoke `zan-workflows:writing-plans` with `phase=SCOPE_REVIEW`, supplying the
resolved projects and their exact `origin/master` SHAs. It must derive the
function list, current behavior, required changes, exclusions, dependencies,
acceptance criteria, code evidence, and missing decisions.

Require the user-visible
[需求确认前检查清单](../writing-plans/references/requirement-readiness-checklist.md)
covering the business behavior, data fields, API facts, permissions, state and
acceptance that apply to this delivery. `NOT_APPLICABLE` categories need a
short scope-based reason, not a full source search. Continue toward the execution checklist only when
`requirement_blocker_count=0`. Preserve any implementation-only gaps with
`implementation_ready=false`; they do not invalidate confirmed business scope
but they block `IMPLEMENT` until resolved.

Reuse its complexity routing:

- `DIALOGUE` for one bounded project/module with a small, clear function set;
- `PANEL` for multi-project/module work, many independent functions, complex
  states/dependencies, or decisions requiring item-by-item review.

Require `ProposedRequirementScope.terminal_state=READY_FOR_CHECKLIST`. Keep all
unresolved critical conflicts as `PENDING|BLOCKED`; do not turn them into Plan
assumptions. Do not ask for a separate scope confirmation—the orchestrator
combines it with branch and execution facts below.

## 3. Bind development branches

Before branch preflight, except for `BRANCH_ONLY`, invoke
`breaking-down-requirement phase=PLAN` with
`confirmation_mode=DEFER_TO_ORCHESTRATOR` and the reviewed scope. Story input
splits/compares its development Tasks; Task input only verifies or proposes
changes to that selected Task under its actual parent Story. Require verified
TAPD developer accounts and positive estimates calculated under the internal task policy, with
stable module/function/task keys. Missing facts stay draft and block task writes
and implementation. This is read-only and does not independently ask for
confirmation: include its complete task table, payloads, field mapping and
proposal fingerprint in the combined checklist below. Display only final
estimated hours; internal base effort, coefficients, formulas and before/after
calculation details must not appear in conversation, progress, confirmation
tables, TAPD descriptions or formal Plans. Do not echo raw internal proposals
or numerical-policy diagnostics; retain them only in the validation handoff.

`PLAN_ONLY` may retain task proposals without external writes; explicitly show
that Tasks are unconfirmed and implementation is not ready. It does not infer
permission to create Tasks. `IMPLEMENT|SUBMIT|GO_LIVE` requires all selected
Tasks to become `TASKS_READY` before an executable Plan or source edits.

For every proposed project partition, resolve the branch owner with the bundled
`scripts/resolve-branch-owner.mjs` against that repository, then derive the
exact initial Story/Task branch as
`feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>` and complete the read-only
existence/base checks in [需求开发分支与单次确认](references/branch-checklist.md).
Record both the normalized owner and its resolution source. If no safe owner
can be resolved, return `PENDING` instead of inventing or reusing an identity.
For `CONTINUE`, reuse the evidenced original branch instead of generating a
new name. Pass the exact `fixed_branch` with
`branch_mode=AUTO|CREATE|USE_EXISTING`; `preparing-work` verifies the action
but never invents or substitutes the branch name.

Before confirmation, invoke `zan-workflows:preparing-work` read-only with the
exact TAPD URL, proposed scope and branch constraints to obtain preflight facts;
an unconfirmed scope may remain `PENDING` and is not a downstream handoff.
Reuse the same TAPD/project/branch evidence from scope review; do not perform
a second broad project or historical-Wiki discovery.

Build one combined checklist from all project rows using
[需求开发分支与单次确认](references/branch-checklist.md), show one authorization
summary, include requirement/implementation blocker counts and unresolved rows,
ask exactly `是否按此清单执行？`, then stop. Do not ask separately for
scope or branch confirmation. When task writes are proposed, explicitly state
that this question also asks permission to create/update the displayed TAPD
Tasks; a Plan, branch or scope approval alone is not task-write approval.
The initial Story/Task request selects the work;
it does not confirm derived checklist fields.

After confirmation, re-invoke `preparing-work` with the same visible facts and
the current-conversation checklist authorization. Revalidate only mutable
refs/status and facts changed since preflight. Require a validated
`TapdWorkDefinition` with `terminal_state=READY_FOR_HANDOFF`, exact
`CREATE|USE_EXISTING`, fixed branch, repository fingerprint, verified base
ref/SHA when creating, and reusable branch authorization. Any visible change
invalidates the confirmation and returns the updated full checklist.

For `IMPLEMENT|SUBMIT|GO_LIVE`, before Plan writing or branch/source mutation, pass the
unchanged proposal and its current-conversation task-list confirmation to
`breaking-down-requirement phase=EXECUTE`. The child alone owns approved Task
creates/updates and readbacks; this is distinct from downstream delivery writes.
If no Task changes are needed, validate exact REUSE readbacks without a write.
Require `TaskBreakdownResult.terminal_state=TASKS_READY`. A failed/unknown or
partial task write stops implementation and returns known successful Task IDs
without retrying/recreating them. Task creation does not change branch identity:
keep the original Story/selected Task and existing per-project branch binding,
not a new branch for every newly created child Task. For `PLAN_ONLY`, execute
this step only if Task writes were explicitly included and confirmed; otherwise
retain the proposal in a staged Plan without requiring TASKS_READY.

For multi-project requirements, preflight every project before editing and
refresh the definition immediately before each later implementation. Because
this workflow accepts only Story/Task, every definition must carry
`status_action=NOT_APPLICABLE_NON_BUG`; it must not request authorization for,
construct, or write the Bug-only `修复中` status.

For `BRANCH_ONLY`, after refreshed preparation succeeds, execute only the
confirmed branch action. `CREATE` creates the exact branch from the confirmed
`origin/master` SHA without upstream tracking; `USE_EXISTING` selects the exact
verified branch. Read back repository root, current branch, HEAD and status,
return `BRANCH_READY`, and stop before Plan writing or source edits.

## 4. Write the branch-bound Plan

Invoke `zan-workflows:writing-plans` with `phase=PLAN_WRITE`, passing the
confirmed scope and all validated branch definitions. Require one coordinated
Plan set: a cross-project summary plus one or more independently deliverable
page/module Plans for each project. Each project partition records:

- project, repository, origin and `origin/master` SHA;
- fixed development branch and `CREATE|USE_EXISTING` action;
- in-scope functions, exclusions, code entrypoints and dependencies;
- ordered implementation tasks, validation commands, risks and blockers; and
- cross-project execution order when applicable.

Pass the verified `TaskBreakdownResult` as well. Each implementation step binds
one real TAPD Task key/ID; each Task retains its developer, normal and adjusted
estimate, dependency and acceptance. A module Plan can contain several Tasks;
do not make one Plan per Task or re-estimate/discount each step. `PLAN_ONLY`
without approved task writes may save a clearly staged Plan with task proposals
and `implementation_ready=false`; it must not invent real IDs or `TASKS_READY`.

The Plan is executable only after its configured write/readback gate passes
and every project partition remains bound to the same repository, remote
baseline, scope, and branch definition.

For `PLAN_ONLY`, return the confirmed Plan and stop. `BRANCH_ONLY` has already
stopped after branch readback and never enters this phase.

## 5. Execute and review

After Task/Plan readiness passes and before the first source edit, generate and
display one shared `scheduleRecommendation` under
[实施排期推荐](../implementing-work/references/implementation-schedule.md).
Use the selected Tasks' already-adjusted estimates, evidenced remaining scope,
owner capacity and dependencies to recommend start/end dates or a conditional
workday window. Share capacity across project partitions; do not reserve the
same person's full day independently in each project. State capacity/calendar
assumptions and compare with any existing plan without overwriting it.
Task breakdown need not fix dates in advance. This recommendation stays in
dialogue/memory and does not add a new implementation approval gate. Date
writes or formal Plan changes require their own exact displayed changes and
authorization; do not infer those writes from the development request.

For `IMPLEMENT|SUBMIT|GO_LIVE`, preflight all project partitions, then execute
in Task dependency order within the bound project partitions. Require matching
`TASKS_READY` readbacks and Plan links, including the assigned developer and
adjusted estimate; CONTINUE first verifies existing Task IDs instead of
recreating Tasks. A changed scope, developer or estimate returns to the task
diff/confirmation gate before affected implementation. Immediately before each project, refresh its actual
repository, remote baseline, fixed branch, worktree status, TAPD status action,
and preparation validation. Invoke `zan-workflows:implementing-work` with the
matching `TapdWorkDefinition`, that project's Plan tasks, the shared
`scheduleRecommendation`, and the reusable
branch and implementation authorization from the confirmed checklist. Do not
ask again while every visible checklist field still matches.

Collect one `ReviewedChange` per project. Stop on the first `BLOCKED` result and
report any already-completed project changes truthfully; do not roll them into
an unrelated branch or silently continue. Return `REVIEWED` only when every
project is `REVIEWED` with `REVIEW_PASSED` and the combined changed paths remain
within the confirmed Plan.

Report progress and verification against each selected Task and its Plan steps.
Do not implement unselected coworkers' Tasks merely because they share a Plan,
and do not mark a Task done merely because one implementation step passed.
Task status writes need their own explicitly requested operation and approval.

For `IMPLEMENT`, return after all projects are `REVIEWED`. The initial combined
checklist authorizes implementation only; it never authorizes submission,
master merge, Wiki delivery maintenance, or local cleanup.

## 6. Submit reviewed changes

For `SUBMIT|GO_LIVE`, call `submitting-for-test` with
`submission_phase=PLAN` for every `ReviewedChange` in dependency order. Collect
and display every complete current `SubmissionPlan`, set
`AWAITING_SUBMISSION_CONFIRMATION`, and stop before any commit, push, MR,
deployment, Wiki, or TAPD write.

A later confirmation is valid only when it explicitly answers the displayed
unchanged plan set. Then call `submitting-for-test` with
`submission_phase=EXECUTE` for each project in the same order. Re-read bound
facts as required by that capability and stop on the first failed or changed
plan, reporting already completed submissions truthfully. Return `SUBMITTED`
for `SUBMIT` only when every project returns
`TestSubmissionResult.terminal_state=SUBMITTED`.

## 7. Go live and close out

For `GO_LIVE`, after every project is `SUBMITTED`, pass the exact submissions
and affected-package/consumer map to `going-live`. When tooling dependencies
exist, use one bound delivery bundle with the related submissions so the
package latest is checked first and consumer versions second; only then decide
whether to release or upgrade, before consumers receive their final
master merges; do not finalize a consumer first or run the same package release
once per project. Without tooling packages, retain per-project delivery in
dependency order. Its complete merge, official package release, scoped consumer
upgrade and Wiki facts require their own current confirmation; neither the
implementation checklist nor submission confirmation may be reused.
When those exact facts are displayed, set
`AWAITING_GO_LIVE_CONFIRMATION` and stop for that confirmation.

An `AWAITING_MERGE` result pauses dependent project delivery with the exact MR
link, completed effects, business Wiki 待合并 update/readback or its separate
blocker, and `已合并，继续上线` next step. The conditional pending patch must
be included in the confirmed go-live checklist; do not mark 已合并 before proof.
Keep this waiting
stage instead of marking go-live failed or complete. On that reply, use
`going-live`'s read-only exact-MR continuation, then run only unfinished
authorized actions; do not repeat completed publication or merges.

After a project returns `MasterMergeResult.terminal_state=MERGED`, preserve its
local closeout result and any `CleanupPlan`, but do not clean it while another
project still awaits delivery. After every project reaches its truthful
go-live result, de-duplicate the exact cleanup plans. When all required delivery
gates pass and safe candidates remain, display the combined plan and end the
final response with `是否删除以上本地开发环境？`, offering `确认清理` or
`保留开发环境`, then stop at `AWAITING_CLEANUP_CONFIRMATION`. When no safe
candidates exist or inspection is blocked, report that outcome and its reasons
instead of entering a confirmation state without a plan. A later exact cleanup
confirmation invokes
`going-live` with `operation=CLEANUP`; it must revalidate and may remove only
the confirmed local worktree and local branch resources. Never infer cleanup
authorization from `GO_LIVE` or merge confirmation.
`保留开发环境` ends the flow without deletion or a repeated cleanup question.

Return `MERGED` only when every project has a verified master delivery, all
involved tooling packages have verified latest releases, affected projects
resolve the registry's current latest versions, and required Wiki readbacks
include tooling `当前版本：latest`. Cleanup is reported separately as
`NO_CANDIDATE|AWAITING_CONFIRMATION|CLEANED|PARTIAL|BLOCKED` and cannot undo a
verified merge result.

## Progress and next-step guidance

Before every final response, pause, blocker handoff, branch-only completion,
Plan-only completion, or reviewed completion, apply
[需求开发进度与下一步引导](references/progress-guidance.md). Show the current
stage/status and one actionable next step. Use a full completed-stage checklist
only when handing off a blocked or multi-project run; ordinary progress and
small follow-up fixes need a concise delta, not a repeated workflow transcript.

Recommend improving the current stage whenever it is `PENDING|BLOCKED|FAILED`;
recommend the next stage only after the current gate passes. A recommendation
never authorizes the next write-owning workflow.

## Output

Return one in-memory `RequirementDevelopmentResult` containing requirement
identity, affected-project evidence, confirmed scope, review mode, remote-master
SHAs, branch definitions, Plan paths/fingerprints, per-project ReviewedChanges,
task proposal/fingerprint, Task IDs/readbacks, developer/estimate/Plan bindings,
`scheduleRecommendation` when implementation starts,
per-project `TestSubmissionResult` and `MasterMergeResult` values when requested,
cleanup plans/results, verification results, requirement-readiness checklist and blocker counts,
`implementation_ready`, `current_stage`, `stage_status`, `completed_stages`,
`blockers`, `recommended_next_action`, `available_actions`, `resume_prompt`, and
`AWAITING_TASK_CONFIRMATION|TASKS_READY|TASK_WRITE_PARTIAL|BRANCH_READY|PLAN_READY|REVIEWED|AWAITING_SUBMISSION_CONFIRMATION|SUBMITTED|AWAITING_GO_LIVE_CONFIRMATION|AWAITING_MERGE|AWAITING_CLEANUP_CONFIRMATION|MERGED|PENDING|BLOCKED|PAUSED|STOPPED`.

Do not create a workflow report, runtime ledger, raw requirement dump, or
generated evidence directory.
