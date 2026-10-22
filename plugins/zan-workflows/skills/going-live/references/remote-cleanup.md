# Explicit remote branch cleanup

Use for a completed go-live delivery or a verified conflict MR, in these scopes:

- `CleanupPlan.remoteTemporary`: the delivery's associated remote `merge/*`
  branches, previewed beside the local temporary branches and worktrees. One
  explicit `确认清理（含远程临时分支）` covers the exact combined plan.
- `operation=CLEANUP_REMOTE`: separately requested exact remote branches,
  including original feature/fixbug branches. These require their own explicit
  remote-development deletion authority.
- `CONFLICT_MERGE`: remote C from the shared
  [A → C → B flow](../../../references/conflict-merge.md), explicitly included
  in its initial confirmation. Its own verified C → B readback/containment is
  sufficient delivery evidence, including B=dev/develop; no master go-live
  result is required. The latest user retention instruction overrides the
  default. This scope never includes original feature/fixbug branches.

`确认清理`, `清理开发环境`, merge confirmation and MR source auto-delete never
authorize remote deletion. Configuring this workflow does not delete actual
branches. Remote development branches default to NOT_REQUESTED; remote temporary
branches are previewed for the combined plan only after the checks below.

## Scope and preview

1. Reuse the exact completed delivery and its associated submission/MR facts,
   or the confirmed conflict scope with exact C → B merged/readback proof.
   Limit candidates to that delivery's original `feature/*`/`fixbug/*` and
   evidenced temporary test-merge `merge/*` branches. Never select by wildcard,
   prefix alone, or all merged branches in a project. A local branch may already
   be absent; inspect the actual remote ref independently.
2. Verify repository identity, remote name, fetch URL and effective push URL
   (`git remote get-url --all` and `git remote get-url --push --all`). Require
   one push destination matching the verified GitLab repository, with no
   mirror mode or ambiguous URL rewrite/configuration. Protect the verified
   default branch, `main`, `master`, `dev`, `develop`, the current checked-out
   branch and every GitLab protected branch. Unknown protection blocks.
3. Read each exact remote `refs/heads/<branch>` and SHA with `git ls-remote`
   against that verified push destination. Through read-only GitLab tools,
   verify its own merged MR identity/source/target, branch protection, and
   absence of open MRs referencing the branch as source or target; complete
   pagination is required. Require evidence that no ongoing teammate or
   release work still needs the branch. Missing shared-use evidence blocks.
4. Fetch the exact branch and target from the same verified repository without
   pruning. Prove the entire current remote tip is contained in the refreshed
   target. For original development branches this is the default master/main;
   for temporary test-merge branches it is their own merged dev/develop target.
   A merged MR or a safe local tip does not prove later remote commits were
   delivered. Squash/cherry-pick or unclear containment needs investigation.
5. Retain one `RemoteCleanupPlan` with repository, remote name/push URL,
   exact full refs, observed source/target SHAs, associated MR URLs, containment,
   protection/shared-use evidence, deletion operation and purpose. Show
   `RETAIN|VERIFY` exclusions with reasons. For the combined scope, store it as
   `CleanupPlan.remoteTemporary` and require every ref to be an associated
   `merge/*` branch; reject feature/fixbug refs before deletion. Show exact
   `remote/branch` names in the concise temporary-branch row, with repository
   and remote identity as context; keep technical evidence in memory. Bind
   `remote_cleanup_state=AWAITING_CONFIRMATION` only for exact safe candidates.

For a combined plan ask once for `确认清理（含远程临时分支）`; this covers only
the listed local resources and listed remote merge refs. Do not ask again at
the remote stage when the exact scope is unchanged. A generic `确认清理` is
ambiguous for that plan: delete nothing until the user selects local-only or
explicitly includes remote temporary branches.
For CONFLICT_MERGE, the complete upfront ACB confirmation already binds exact
remote C deletion and purpose. After merge and fresh checks execute that scope
without a second prompt, unless the user explicitly asked to retain it.

For separate remote-development deletion, ask for an explicit instruction such
as `确认删除以上列出的 origin 远程开发分支`.
Reuse an existing instruction if it already binds the exact unchanged displayed
repository, remote, branches and purpose; do not ask twice. If the user merely
says `清理`, keep remote branches. Without a request, remote development stays
`NOT_REQUESTED`; do not include it in the combined temporary-branch plan or
prompt repeatedly for remote-development deletion.

## Execution and readback

Revalidate the complete plan immediately before deletion. Changed identity,
source SHA, containment, protection, MR or shared-use facts stop execution and
require a new preview. A ref proven already absent by a successful query is
`ALREADY_ABSENT`; perform no deletion for it. A failed query is not absence.

Use Git CLI with the verified push URL as the destination, one exact ref per
request, and an explicit expected-SHA lease:

```bash
git push --porcelain --no-follow-tags \
  --force-with-lease=refs/heads/<exact-branch>:<approved-remote-sha> \
  '<verified-push-url>' ':refs/heads/<exact-branch>'
```

Pass arguments with `execFile` or proper shell quoting; validate each full ref
with `git check-ref-format`. The explicit lease prevents deletion if another
push changed the remote tip after inspection. It is a compare-and-delete
condition, not permission to bypass protection. Never replace it with bare
`--force`, a lease without an explicit SHA, wildcard refspecs, `--mirror`,
`--prune`, GitLab MCP/API deletion, or MR source auto-delete. Do not embed
credentials in the URL or display authentication data.
Keep `--no-follow-tags` explicit even when `push.followTags=true` is configured;
deleting a branch must not publish local tags.

After each push, query that exact ref with `git ls-remote --exit-code --heads`
against the same destination. Exit 2 with no matching ref proves absence;
connection/authentication failures and any remaining ref do not. Stop on the
first failed or unknown write/readback; inspect read-only and report completed,
retained and uncertain resources without automatically retrying. Never recreate
a deleted branch to roll back a partial cleanup.

Return `remote_cleanup_state=CLEANED` only when every authorized ref is proven
absent; otherwise return `PARTIAL|BLOCKED` with per-ref results. A complete
preview with no candidates yields `NO_CANDIDATE`. Keep this outcome independent
of local cleanup and verified delivery. Remote deletion does not remove local
branches, worktrees or remote-tracking refs; those retain their own scope and
authorization. Do not run broad local pruning as a side effect.
