# Local closeout after master merge

Run after successful merge readback and verified `origin/master` containment,
before Wiki maintenance can stop the workflow. This is an automatic read-only
check and reminder under the workspace Git rules, not cleanup authorization.

## Scope and evidence

1. Use the verified repository and original source branch from the submission.
   Read `git worktree list --porcelain` to locate associated worktrees. Include
   temporary branches only when submission/MR/session evidence links them to
   this delivery. Names and `merge/*` prefixes alone do not establish ownership.
   Report missing association evidence instead of guessing or scanning the
   whole workspace.
2. Refresh the relevant remote refs with `git fetch origin` and retain the
   observed SHAs. Compare the current local development tip with
   `origin/master` using `git merge-base --is-ancestor <local-tip> <target-tip>`.
   Exit 0 proves containment; exit 1 needs investigation; other failures mean
   the check is unavailable. The MR's merged source SHA alone does not prove
   that the latest local tip was delivered. For each evidenced temporary
   conflict branch, check its own merged MR and actual target (`dev`/`develop`
   when applicable); do not require integration-only commits in master.
3. In each associated worktree, inspect
   `git status --porcelain=v1 --untracked-files=all`, ignored files with
   `git ls-files --others --ignored --exclude-standard`, and worktree lock/prune
   metadata. Do not read or print secret file contents. Distinguish disposable
   build/dependency output from local configuration or other data worth keeping;
   unknown ignored data needs verification.
4. Check available task/process evidence for use of those paths. Preserve the
   current task's working location and branch, baseline branches, locked or
   active worktrees, and resources still needed by unfinished delivery work.
   If occupancy cannot be established, report it as unknown. Never switch a
   branch, stop a process, prune a stale entry, or remove a worktree to complete
   this check.

## Results

Overall status: `CHECKED`, `PARTIAL`, or `UNAVAILABLE`; use `NOT_TRIGGERED` only
when master delivery has not been verified. `CHECKED` means the inspection
completed, not that all resources can be removed. An inaccessible/missing
repository or stale worktree entry is not a clean or empty result.

For each related resource retain path, branch, observed tip/target SHAs,
association and delivery evidence, dirty/ignored/occupancy findings, and one
disposition:

- `CANDIDATE` / 可清理候选: delivery is proven and the resource is clean, idle,
  no longer needed, and contains no unpreserved local data. Still requires
  explicit confirmation and a fresh check before any deletion.
- `RETAIN` / 需保留: known uncommitted/untracked work, undelivered commits,
  protected/current/active/locked resources, or local data worth preserving.
- `VERIFY` / 待核实: uncertain association, occupancy, ignored data, or delivery.
  Squash/cherry-pick and ancestry failure must not be treated as safe cleanup;
  distinguish proven undelivered commits from inconclusive history.

In the final response, summarize the findings with concrete paths/branches and
reasons, separately from merge/Wiki status. When candidates exist, remind the
user they can confirm cleanup of that exact list. If none exist after a complete
check, say there are no related cleanup candidates. For incomplete checks, state
what was checked and what remains unknown. Always make clear no deletion was
performed. Do not create local workflow state or change the merge outcome to
`BLOCKED` solely because this inspection could not complete.
