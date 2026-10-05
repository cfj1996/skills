# Local closeout after master merge

Run after successful merge readback and verified `origin/master` containment,
before Wiki maintenance can stop the workflow. This is an automatic read-only
check under the workspace Git rules. It may produce a cleanup plan but never
cleanup authorization.

## Batched executor

Invoke `scripts/check-local-closeout.mjs` from the plugin root with a JSON
stdin plan, no `--execute`. Supply the exact verified default delivery result,
repository/origin, current task path, original branch and only explicitly
associated temporary branches with their own merged MR targets. It reads
worktree registration once, fetches relevant targets once, snapshots exact
refs once and checks per-tree status/ignored paths in parallel. Do not re-run
the same commands in the Agent after receiving a complete result.

By default the executor invokes `collect-local-occupancy.mjs` once for its
exact resources. It reads only scoped `id/cwd/archived/git_branch` fields from
the local Codex SQLite database, with SQLite read-only access, and snapshots
process cwd/open-file paths. No chat text, rollout content, file contents,
environment or process command arguments are read. Nonarchived associated
tasks mean later work may need the resource and are retained; archiving is
never performed by this collector. Missing database/tool support, unreadable
processes or truncated inventories remain unknown, even when some active
resources can already be identified. Platform support is macOS/Linux with
SQLite/ps/lsof; other tools/platforms can supply a verified collector snapshot.

If such a fresh scoped snapshot is already available, pass it directly rather
than collecting twice. For each resource pass branch, exact path (or null), `task=IDLE|ACTIVE|UNKNOWN`,
`process=IDLE|ACTIVE|UNKNOWN`, `needed=true|false`, `source`,
`scopeComplete=true` and UTC Unix `checkedAt` in milliseconds. Only explicit
idle/no-longer-needed evidence at most 60 seconds old permits candidacy;
missing, partial or stale evidence is unknown. Do not infer idle from absence
in a truncated task/process list or from a branch prefix. Refresh only a
genuinely incomplete/stale evidence component, not the whole delivery.

Ignored paths are listed compactly with `--directory` without reading content.
Pass `disposableIgnoredPaths` only when project/human evidence declares those
exact directories rebuildable; arbitrary ignored data requires preservation
or verification. Inspection outcomes remain separate from merge/Wiki results.
The executor has no branch/worktree deletion, switching, pruning or process
termination code. Confirmed cleanup later repeats the candidate check and
uses the existing exact deletion authorization rules below.

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
performed during this check. Do not create local workflow state or change the
merge outcome to `BLOCKED` solely because this inspection could not complete.

## Cleanup plan

After the delivery and required Wiki readbacks succeed, turn only `CANDIDATE`
resources into a user-visible plan. Each row contains repository, current
branch, exact worktree path or `无`, exact local branch, observed local tip,
verified containment target/SHA, intended operations in order, and purpose.

The authorization summary must bind:

- intended operation: remove the listed local worktrees, then delete the listed
  local branches;
- purpose: remove fully delivered, clean and idle local development resources;
- current branch;
- every exact `worktree_to_remove`; and
- every exact `branch_to_delete`.

Ask exactly `是否删除以上本地开发环境？` and stop. The merge confirmation does
not authorize this plan.

## Confirmed cleanup

On a later exact confirmation, repeat the complete candidate check. A changed
fact invalidates the plan and permits no deletion. For each unchanged row:

1. Remove the registered worktree first with ordinary `git worktree remove`;
   never use `--force` or raw filesystem deletion.
2. Verify the worktree path and registration are absent.
3. Delete the exact local branch with ordinary `git branch -d`; never use
   `-D`, and never delete a remote branch.
4. Verify the local ref is absent.

The current task path/branch, protected branches, dirty or occupied worktrees,
unpreserved data, and any `RETAIN|VERIFY` resource are never executable cleanup
targets. Stop on the first failure and report partial effects truthfully.
