---
name: going-live
description: Use when a submitted TAPD change must merge its original fixed branch directly to master, maintain its existing Wiki merge status, and optionally remove the exact verified local development branch and worktree after a separate cleanup confirmation.
---

# Go Live

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens merge gates.

Accept `operation=DELIVER|CLEANUP`. `DELIVER` consumes one
`TestSubmissionResult` and returns one in-memory `MasterMergeResult`: merge the
original fixed branch directly to `master`, then maintain the matching existing
Wiki entry as `是否上线：已合并` after verified master containment. A tooling
project keeps `是否上线：无需上线` and requires no master-merge status
transition.

Here `master` denotes the verified default delivery branch. Use actual `main`
only when remote evidence confirms it as the default; keep that exact name in
the visible plan, executor and containment refs. Never infer it from cwd.

After verified master delivery, `DELIVER` also checks associated local branches
and worktrees and creates an exact `CleanupPlan` for safe candidates. It never
deletes them in the delivery turn. `CLEANUP` consumes the prior merged result
and a separate exact cleanup confirmation, revalidates every candidate, and may
remove only those confirmed local resources.

Read [contracts.md](references/contracts.md) and
[tool-routing policy](../../references/tool-routing.md) before any write.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.
GitLab operations use `gitlab-mcp`; Wiki operations use `tapd-mcp`.
Confirmed local cleanup uses only ordinary local Git CLI commands described
below.

Reuse a live [workflow session](../../scripts/workflow-session.mjs) for merge,
closeout and Wiki actions when available; its MCP pool saves initialization
without caching source refs, occupancy, Wiki state or authorization. Individual
helpers remain the fallback for a standalone action.
Use the pinned helper runtime and wait for `SESSION_READY`; avoid manual TTY
repair. The merge helper verifies supported rule/counter/edition formats and
records approval evidence; an unknown or denied check remains blocking.

## Input gate

For `operation=DELIVER`, require:

- `TestSubmissionResult.terminal_state=SUBMITTED`;
- the exact original `feature/*` or `fixbug/*` repair branch from that result;
- verified repository/source/current-round commit facts; and
- resolved project category/service type; and
- an explicit current-conversation request to go live.

Reuse the exact source branch, project category and Wiki ID from the submitted
result. Read that Wiki by ID; do not rediscover the hierarchy or enumerate
other entries. Refresh source/master refs and the exact Wiki body at their
write boundaries, not the entire submission preflight.

When the upstream profile is `STANDARD`, require the exact existing Wiki target
and readback retained by submission, whether the submission Wiki state is
`WRITTEN` or `SKIPPED_BY_POLICY`. A policy skip means no test-submission Wiki
write occurred; it does not remove the historical target needed to maintain
`是否上线`. A `NO_WIKI` submission has no Wiki maintenance step.

Never substitute `develop`, `dev`, `master`, `merge/*`, a release branch, or a
rebuilt branch as the source.

For `operation=CLEANUP`, require:

- the exact prior `MasterMergeResult.terminal_state=MERGED`;
- `cleanup_state=AWAITING_CONFIRMATION` with one exact displayed `CleanupPlan`;
- a current-conversation confirmation binding `intended_operation`, `purpose`,
  current branch, every `branch_to_delete`, and every
  `worktree_to_remove`; and
- the same verified repository and association evidence used by that plan.

A request to go live, a merge authorization, or a generic earlier “继续” never
authorizes cleanup. `CLEANUP` never repeats the master MR or Wiki operations.

## Delivery procedure

1. Re-read repository fingerprint, original source ref, `master` ref, existing
   MR state, and current-round commits.
2. Prepare one complete delivery checklist with repository, original source,
   exact default target, source/target SHAs, commits, MR actions and purpose.
   Resolve the Wiki action below before showing this checklist. One explicit
   current-conversation confirmation can bind both merge authority and exact
   Wiki-patch authority when both are fully displayed. An omitted scope still
   needs its own confirmation; changed facts require a fresh actual preview.
3. For a `STANDARD` submission, read its exact Wiki target and uniquely locate
   the entry by the original source branch. Resolve the project category and
   service type before planning the Wiki operation:
   - for a tooling project, require exactly `是否上线：无需上线` and record
     `SKIPPED_TOOL_PROJECT`; do not write a merge-status transition;
   - for a business project, require current `是否上线：未合并` and plan only
     the transition to `是否上线：已合并`. A missing field or any other value
     blocks; do not migrate an old template. The transition requires verified
     master containment;
   - record `ALREADY_MERGED` when a business entry is already `已合并`.
   For a business entry that needs a patch, display the minimal patch and
   resulting body and obtain exact authorization for that Wiki write. This is
   a separately identified authority scope in the same complete checklist;
   do not ask a second question when its target/body/purpose were already
   fully shown and confirmed.
   A tooling entry performs no Wiki write and requires no Wiki-write
   authorization. Duplicate/conflicting fields or ambiguous entries block
   before the merge. For `NO_WIKI`, record `SKIPPED_NO_WIKI`; never create a
   Wiki.
4. Run the private read-only
   [master-merge-validator.md](agents/master-merge-validator.md) before the
   first write. Map its response to a public validation state, retain only a
   concise failure reason, and discard the private line.
5. Run [merge-reviewed-branch.mjs](../../scripts/merge-reviewed-branch.mjs)
   once for the exact original-source-to-default-target plan. It checks fresh
   refs/approvals, waits for CI itself, creates or reuses the exact MR, merges
   once and verifies containment. Require `MERGED` plus actual readback and
   containment; pending auto-merge is not completion. Do not repeat whole
   preparation, review, private validation or Agent polling between its steps.
   A real metadata edit or conflict needs its own exact authorized action.
6. After successful merge readback and `origin/master` containment, run the
   read-only [local closeout check](references/local-closeout.md) through
   [check-local-closeout.mjs](../../scripts/check-local-closeout.mjs) once.
   Supply only the original branch and explicitly evidenced related branches
   and current task location. It automatically collects one fresh scoped
   Codex task/process snapshot; a supported external collector snapshot may
   replace that collection when already available.
   It batches target fetch/ref/worktree reads and parallel local inspections;
   unknown occupancy/data yields `VERIFY`, never assumed idle. Do not repeat
   these reads manually or introduce deletion into this check. Retain its
   result even if subsequent Wiki maintenance fails. A partial or unavailable
   local check does not block Wiki maintenance or change the confirmed merge.
7. Only after successful merge readback and `origin/master` containment, for a
   `STANDARD` business submission re-read the Wiki. If the authorized patch
   still applies, reuse the prevalidated exact Wiki authority and invoke
   [ensure-test-wiki.mjs](../submitting-for-test/scripts/ensure-test-wiki.mjs)
   once in `--mode update --execute`, with the existing ID/parent/title,
   original body SHA-256 and approved full resulting body. This mode performs
   only Wiki update/readback, with no item/comment read or write. Require
   `UPDATED|UNCHANGED`, approved final body hash and exactly
   `是否上线：已合并`; for `ALREADY_MERGED`, verify the unchanged field instead.
   For `SKIPPED_TOOL_PROJECT`, verify the unchanged
   `是否上线：无需上线` field and perform no Wiki write. If the page changed,
   stop for a fresh patch and authorization; never overwrite the changed page.
   A `NO_WIKI` submission performs no Wiki read or write. No extra private
   Agent validation is needed for an unchanged fully displayed patch; a changed
   body/patch is a real exception and needs a new preview/authorization.
8. Return `MERGED` only when all required merge and Wiki readbacks pass;
   otherwise return `BLOCKED` with actual completed effects. Include the local
   check result separately, with paths/branches, reasons, and cleanup advice.
   If master delivery was not verified, mark the local check `NOT_TRIGGERED`.
   For a merged result, convert only `CANDIDATE` resources into one exact
   `CleanupPlan`. Use `NO_CANDIDATE` only when the check completed and found no
   safe candidates; use `BLOCKED` when cleanup evidence is partial or
   unavailable. Otherwise set `cleanup_state=AWAITING_CONFIRMATION`, display
   the plan and ask exactly `是否删除以上本地开发环境？`, then stop without
   deleting anything.

## Cleanup procedure

Run only for `operation=CLEANUP` after its exact confirmation:

1. Re-read the repository, current task path and branch, `git worktree list`,
   every planned worktree status/ignored/lock/occupancy fact, local branch tips,
   and refreshed target refs. Re-prove full-tip containment and association.
2. If any path, branch, SHA, dirty state, lock, occupancy, or candidate set
   differs from the confirmed plan, perform no deletion. Return the refreshed
   plan with `AWAITING_CONFIRMATION` or classify the resource
   `RETAIN|VERIFY`; never silently narrow or expand the confirmed target set.
3. Reject protected/baseline branches (`main|master|develop|dev`), the current
   checked-out branch, the current task's worktree, active or locked worktrees,
   dirty/untracked worktrees, unpreserved ignored data, undelivered tips, and
   uncertain occupancy. Remote branches are outside cleanup scope.
4. For each unchanged confirmed candidate, remove its associated worktree first
   with ordinary `git worktree remove <exact-absolute-path>` and no force flag;
   read back that the path and worktree registration are gone. Then delete the
   exact local branch from a safe remaining worktree with
   `git branch -d -- <exact-branch>` and read back that the local ref is absent.
   A branch without an associated worktree skips the first operation.
5. Never use `rm -rf`, `git branch -D`, `git worktree remove --force`, broad
   pruning, branch switching, process termination, or remote branch deletion.
   Stop on the first failure and preserve every unprocessed resource.
6. Return cleanup state `CLEANED` only when every confirmed operation and
   readback succeeds. Otherwise return `PARTIAL|BLOCKED` with completed and
   retained resources separately. Cleanup failure never reverses or disguises
   an already verified `MERGED` delivery.

Do not publish a production version, run smoke tests, update TAPD status or
comments, publish a test version, or write local workflow state. No retry or
interruption recovery is built into this skill.
Remove the transient approved Wiki-body Markdown file after its helper call;
it is only a request carrier, never a workflow record. An explicit version or
environment publication uses `running-release` with its exact release plan.

`是否上线：已合并` means that the approved current-round commits are verified
in `origin/master`; it does not claim that a production version was published.
`无需上线` means the project is a tooling/library project and has no online
merge status to maintain.
