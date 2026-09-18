---
name: developing-requirement
description: Use when one TAPD Story or Task and its PRD or prototype evidence must be developed end-to-end by routing affected projects, scoping against remote master, choosing dialogue or panel review, binding fixed branches, writing branch-bound Plans, and implementing reviewed changes without submitting or releasing them.
---

# Develop Requirement

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens project, branch,
write, or review gates.

Orchestrate one requirement from evidence to reviewed source changes. This
skill coordinates existing Zan skills and does not duplicate or weaken their
contracts.

## Inputs and boundary

Require one exact TAPD Story or Task URL as the workflow identity. Accept its
PRD, prototype, attachments, and comments as requirement evidence.

If only a standalone PRD or prototype is available, route to
`zan-workflows:writing-plans` with `phase=SCOPE_REVIEW` and return
`PENDING_TAPD_STORY_OR_TASK` before a branch-bound Plan or implementation. Do not
advertise the standalone artifact as an end-to-end requirement-development run.

Accept `delivery_mode=PLAN_ONLY|BRANCH_ONLY|IMPLEMENT`, defaulting from the
user's explicit request. A review or planning request is `PLAN_ONLY`; “创建开发
分支” is `BRANCH_ONLY`; do not infer source implementation.

Bug repair belongs to `zan-workflows:fixing-bug`. This skill does not commit,
push, create or merge an MR, submit for test, deploy, publish, update a Wiki, or
merge to master. Those are later explicit workflows.

## Composition contract

Use the skills in this order:

1. `zan-workflows:workspace-project-knowledge`
2. `zan-workflows:writing-plans` with `phase=SCOPE_REVIEW` and
   `confirmation_mode=DEFER_TO_ORCHESTRATOR`
3. `zan-workflows:preparing-work` for exact TAPD project and branch binding
4. `zan-workflows:writing-plans` with `phase=PLAN_WRITE`
5. `zan-workflows:implementing-work` when `delivery_mode=IMPLEMENT`

Do not skip ahead because the user supplied a plausible repository or branch.
Exact user constraints are preserved and verified, not replaced.

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

Reuse its complexity routing:

- `DIALOGUE` for one bounded project/module with a small, clear function set;
- `PANEL` for multi-project/module work, many independent functions, complex
  states/dependencies, or decisions requiring item-by-item review.

Require `ProposedRequirementScope.terminal_state=READY_FOR_CHECKLIST`. Keep all
unresolved critical conflicts as `PENDING|BLOCKED`; do not turn them into Plan
assumptions. Do not ask for a separate scope confirmation—the orchestrator
combines it with branch and execution facts below.

## 3. Bind development branches

For every proposed project partition, derive the exact initial Story/Task
branch as `feature/cfj.<MMDD>.<短ID>.<描述slug>` and complete the read-only
existence/base checks in [需求开发分支与单次确认](references/branch-checklist.md).
For `CONTINUE`, reuse the evidenced original branch instead of generating a
new name. Pass the exact `fixed_branch` with
`branch_mode=AUTO|CREATE|USE_EXISTING`; `preparing-work` verifies the action
but never invents or substitutes the branch name.

Before confirmation, invoke `zan-workflows:preparing-work` read-only with the
exact TAPD URL, proposed scope and branch constraints to obtain preflight facts;
an unconfirmed scope may remain `PENDING` and is not a downstream handoff.

Build one combined checklist from all project rows using
[需求开发分支与单次确认](references/branch-checklist.md), show one authorization
summary, ask exactly `是否按此清单执行？`, then stop. Do not ask separately for
scope or branch confirmation. The initial Story/Task request selects the work;
it does not confirm derived checklist fields.

After confirmation, re-invoke `preparing-work` with the same visible facts and
the current-conversation checklist authorization. Require a validated
`TapdWorkDefinition` with `terminal_state=READY_FOR_HANDOFF`, exact
`CREATE|USE_EXISTING`, fixed branch, repository fingerprint, verified base
ref/SHA when creating, and reusable branch authorization. Any visible change
invalidates the confirmation and returns the updated full checklist.

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

The Plan is executable only after its configured write/readback gate passes
and every project partition remains bound to the same repository, remote
baseline, scope, and branch definition.

For `PLAN_ONLY`, return the confirmed Plan and stop. `BRANCH_ONLY` has already
stopped after branch readback and never enters this phase.

## 5. Execute and review

For `IMPLEMENT`, preflight all project partitions, then execute in dependency
order. Immediately before each project, refresh its actual repository, remote
baseline, fixed branch, worktree status, TAPD status action, and preparation
validation. Invoke `zan-workflows:implementing-work` with the matching
`TapdWorkDefinition`, that project's Plan tasks, and the reusable branch and
implementation authorization from the confirmed checklist. Do not ask again
while every visible checklist field still matches.

Collect one `ReviewedChange` per project. Stop on the first `BLOCKED` result and
report any already-completed project changes truthfully; do not roll them into
an unrelated branch or silently continue. Return `REVIEWED` only when every
project is `REVIEWED` with `REVIEW_PASSED` and the combined changed paths remain
within the confirmed Plan.

## Output

Return one in-memory `RequirementDevelopmentResult` containing requirement
identity, affected-project evidence, confirmed scope, review mode, remote-master
SHAs, branch definitions, Plan paths/fingerprints, per-project ReviewedChanges,
verification results, and `BRANCH_READY|PLAN_READY|REVIEWED|PENDING|BLOCKED`.

Do not create a workflow report, runtime ledger, raw requirement dump, or
generated evidence directory.
