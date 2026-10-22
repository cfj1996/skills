# A → C → B conflict handoff and cleanup

Use for an actual conflict in the user's own reviewed development delivery.
`A` is the original feature/fixbug branch, `B` the verified target (dev/develop
or actual default master/main), and `C=merge/<source-slug>-to-<target-slug>` the
one-time conflict branch. Keep A as the business source in every handoff.
Reviewing another author's MR alone does not authorize conflict repair.

## One confirmation, including temporary cleanup

Before creating C, show the exact repository/current branch, A/B and SHAs,
conflicts, C name, temporary worktree path if used, MR actions and purpose.
Resolve the approved work location and .worktrees ignore gate. Abort a local
conflicted merge first; failure blocks. Never resolve conflicts on A or B.

Default `cleanupPolicy=DELETE_AFTER_MERGE`. Include exact local C, remote C,
remote push destination and temporary worktree in this same ACB preview. State
that after C → B is verified and these resources are no longer needed, they
will be deleted, including remote C. The user's subsequent confirmation binds
creation, resolution, MR delivery and this conditional cleanup; no second
cleanup prompt is needed for unchanged scope. A proposal, silence or waiting
grants no authority. Example (substitute actual names/paths):

> 冲突处理：`fixbug/example → merge/example-to-dev → dev`。
> 合并成功且临时资源不再使用后，默认删除中间分支（本地、远程）及临时工作树。
> 原开发分支和远程开发分支保留。
> 确认执行？如需保留，请回复“确认执行，保留中间分支”。

The context must list actual C refs and worktree. Internal authority retains
the exact resources and conditional purpose; C SHAs are read back after
resolution, not invented in advance. Broader changes need new review/preview.

`保留中间分支`, `不清理`, or equivalent instructions at any point revoke the
affected cleanup scope and set `cleanupPolicy=RETAIN_BY_USER`. Plain retention
keeps local/remote C and its worktree; honor a more specific scope if supplied.
Do not revert this choice or ask again at go-live; a later explicit cleanup
request may supersede it. If an earlier ACB confirmation omitted cleanup,
show and authorize only the additional exact cleanup scope rather than treating
the default as retrospective consent. Original A and remote feature/fixbug
deletion are never included in this temporary cleanup authority.

## Resolve and verify

1. Fetch A/B immediately before creating C from B. Merge only the reviewed A
   revision into C and make only conflict-related edits there.
   If C already exists, never reset or overwrite it. Reuse only an evidenced
   continuation of this exact conflict; otherwise retain the old branch and
   preview a fresh exact conflict-branch binding under the workspace naming
   policy. A previously retained C is not reusable disposable state.
2. Review/test the resolved diff and reauthorize changed scope. Push C and
   create/reuse C → B through GitLab MCP, with source auto-delete disabled.
   MR creation/merge authority must name C/B as well as A/B. Closing or
   superseding the original MR is another explicit action if requested.
   Never rename C to feature/fixbug or pass it as A to bypass the ordinary
   merge helper's source restrictions. This explicitly authorized conflict
   path uses exact GitLab MR tools and required CI/approval/discussion gates.
3. Read back that exact MR as merged, require unchanged reviewed C SHA, fetch
   B and prove both reviewed A and delivered C SHAs are contained in B.
   Pending auto-merge or a user's reply is not proof. Changed source, conflict,
   failed CI, missing containment or unknown writes block deletion. For manual
   merging retain the same MR and verify it read-only on continuation; an open
   MR cannot trigger cleanup.

## Default cleanup after verified merge

Apply only the confirmed conditional scope. Recheck the latest retention
instruction first and keep merge/cleanup outcomes separate.

- Verify C's own MR target and full current local/remote tip containment in
  refreshed B; dev-only integration commits need not be in master. Completed
  C → dev/develop cleanup does not require master go-live. Do not fabricate a
  master result to invoke the master-only check-local-closeout executor.
- Reuse the checklist and ordinary commands in
  [local-closeout.md](../skills/going-live/references/local-closeout.md#confirmed-cleanup)
  for C only: exact association, clean tree, preserved ignored data, fresh idle
  task/process evidence, locks and current location/branch protection. The
  [occupancy collector](../scripts/collect-local-occupancy.mjs) supports exact
  C/path resources without master evidence. Release completed caller-owned
  temporary use only through its normal lifecycle; never infer idle, archive
  tasks, stop unrelated work or delete the current task path/branch.
- Apply [remote-cleanup.md](../skills/going-live/references/remote-cleanup.md)
  protection/open-MR/shared-use checks, expected-SHA lease, --no-follow-tags and
  absence readback for remote C. This is a `CONFLICT_MERGE` authority scope
  with exact C → B proof; it also works before master delivery.
- Validate both scopes before starting. Remove the idle temporary worktree,
  delete local C with ordinary -d against verified B, then delete remote C.
  Keep the documented upstream handling and failure behavior. No GitLab API
  deletion, MR auto-delete, forced local deletion or broad pruning.
- If C is still needed by a build, another MR or later stage, return DEFERRED
  with its reason and recheck at the next normal completion point under the
  same unchanged authority; no scheduled monitor. Dirty/current/locked/shared/
  unknown resources remain retained with reasons. A failed/unknown deletion
  stops later writes; inspect without automatically retrying.

Return an in-memory `ConflictMergeHandoff`: repository/origin, original A/B,
exact C, reviewed A/C SHAs, MR IID/URL, target and containment readbacks,
worktree path, original-MR action when any, confirmed cleanup resources,
latest cleanupPolicy, and per-resource `CLEANED|ALREADY_ABSENT|RETAINED_BY_USER|
DEFERRED|BLOCKED|PARTIAL` with actual effects. Carry the association into
submission/go-live even if C was removed. Report briefly, for example:
`中间分支（本地、远程）及临时工作树已清理；开发分支保留。`
Never report success from a proposed command alone.

Go-live must not ask again for already absent C resources or include
RETAINED_BY_USER resources in default cleanup. Preserve deferred/failed scope
and its existing authority separately from the ordinary post-delivery cleanup
confirmation for original development resources.
