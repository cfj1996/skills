# MasterMergeResult contract

`MasterMergeResult` is an in-memory go-live result for original-branch to
`master` deliveries, including the required latest flow for involved tooling
packages and affected consumers.

Here `master` means the verified remote default delivery branch, including
`main` only when remote evidence identifies it as the actual default. Preserve
that exact name through plan, executor, validation and containment checks.

## Required content

| Section | Required facts |
| --- | --- |
| Submission | upstream `SUBMITTED` result with every included repository's original repair branch and exact actual test target; single-project input or a same-Bug aggregate matched by repository/origin/fixed branch; exact related submitted owner/consumer handoffs when tooling dependencies are involved |
| Repository | expected/actual path, Git root, origin, verification result |
| Merge | source/target branches and SHAs, current-round commits, authorization, MR result, merge readback, master containment |
| Tooling latest | `VERIFIED|NOT_APPLICABLE|AWAITING_MERGE|BLOCKED`; exact plan/authorization, latest precheck `VERIFIED_EXISTING|NEEDS_RELEASE|BLOCKED`, package owner delivery, `REUSED_LATEST|PUBLISHED_LATEST` and publication/source/registry evidence, Jenkins result only when a release is needed, affected consumer manifests/locks/resolved versions, upgrade review/checks/delivery, and final latest recheck |
| Related deliveries | per-project repository/original branch/source and target SHA, scoped upgrade diff when used, review/verification, commit/push/MR readbacks and default-branch containment |
| Conflict handoff | exact A/B/C association and ConflictMergeHandoff from submission or delivery, C MR/SHAs and A/C containment in B, upfront conditional cleanup authority, latest retention choice and per-resource outcomes, including already absent resources |
| Wiki | `UPDATED_PENDING_MERGE|ALREADY_PENDING_MERGE|UPDATED_MERGED|ALREADY_MERGED|UPDATED_LATEST|ALREADY_LATEST|SKIPPED_TOOL_PROJECT|SKIPPED_NO_WIKI|BLOCKED|NOT_ATTEMPTED`, matching project/branch entry, project type, before/after type-specific status, target/patch authorization, exact-body readback and intermediate body hash when used |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Local closeout | per completed project `CHECKED|PARTIAL|UNAVAILABLE|NOT_TRIGGERED`; related branch/worktree paths, association and delivery evidence, observed tip/target SHAs, dirty/ignored/occupancy findings, and per-resource `CANDIDATE|RETAIN|VERIFY` with reasons |
| Cleanup | `NO_CANDIDATE|AWAITING_CONFIRMATION|CLEANED|PARTIAL|BLOCKED|NOT_TRIGGERED`; exact plan and confirmation when applicable, final-response cleanup question or no-candidate/blocker reason, refreshed evidence, worktree-removal and local-branch-deletion readbacks, and completed/retained resources |
| Remote cleanup | `NOT_REQUESTED|AWAITING_CONFIRMATION|NO_CANDIDATE|CLEANED|PARTIAL|BLOCKED`; associated remote merge refs may be attached as `CleanupPlan.remoteTemporary` under one explicit combined confirmation; remote development refs default NOT_REQUESTED and require a separate request; retain repository/remote/push URL/full refs/SHAs, own MR targets, protection/shared-use and containment evidence, conditional deletion and per-ref absence readback |
| Terminal | `MERGED|AWAITING_MERGE|BLOCKED`; exact pending MR/read-only continuation when waiting, or blocker when applicable |
| User action | For `AWAITING_MERGE`, `userAction.type=CONTACT_MERGER`, a message naming the exact MR/source/target and asking the user to contact a colleague with merge permission, and `resumePrompt=已合并，继续上线`; surface this in the final response even when the pending Wiki patch blocks |

## Invariants

- `AWAITING_MERGE` is a normal handoff for manual merge, explicit MR
  `user.can_merge=false`, or merge-call HTTP 403. Retain exact MR IID/URL,
  repository/branches/source SHA, completed effects, unfinished stage and
  read-only `resumePlan`; never infer completion or label this a failed merge.
  Show `userAction.message` rather than only a waiting status. Preserve it
  through owner/consumer and orchestrator handoffs, including repeated open-MR
  checks. Manual mode alone does not prove permission denial. The reminder is
  conversational and requires no team hierarchy or external notification.
  Dependent publication, consumer delivery, final merged/latest Wiki updates
  and cleanup require `MERGED`. The only exception is the explicitly authorized
  business status `未合并 → 待合并`, after exact opened-MR/source readback.
  Preserve the MR result separately if that Wiki write fails; never retry an
  unknown write or claim `待合并` without exact-body readback.
- Continuation uses `VERIFY_ONLY` without mutation tools. The user's reply is
  not proof: verify the same MR, unchanged source SHA, required CI and fetched
  target containment. A deleted source branch or unrelated target advancement
  is acceptable only with that proof. An open MR remains waiting; changed
  source/identity, closed MR, bad CI, unknown/read failures or absent proof
  block. Reuse unchanged authority only for unfinished dependent actions.

- `MERGED` requires the original submitted `feature/*` or `fixbug/*` source,
  target exactly the verified remote default (`master` or `main`), matching expected/actual source and target SHAs at
  execution, explicit merge authorization, passing pre-write validation,
  successful merge readback, and containment of every current-round commit.
  If tooling packages are involved, it additionally requires
  `ToolingLatestResult=VERIFIED`, all bound consumers delivered at the current
  registry latest, and applicable Wiki `当前版本：latest` readbacks. Merge
  success alone cannot satisfy the overall delivery result.
- `develop`/`dev` to the default delivery branch, `merge/*`, release branches, or a
  substituted source are always blocked.
  Here source means the original business source. An explicitly confirmed
  [A → C → B conflict](../../../references/conflict-merge.md) retains original
  A and distinct C → B MR evidence; it never passes C as A to the ordinary
  merge executor. Require both reviewed A and C containment in B before
  recording completion. This exception does not permit develop/dev → the default delivery branch.
- A `STANDARD` submission, including `SKIPPED_BY_POLICY`, requires its
  pre-existing exact Wiki target and one uniquely matching source-branch entry.
  An involved tooling package yields `UPDATED_LATEST|ALREADY_LATEST`, with
  exactly one `当前版本：latest` field and no `是否上线` field after the
  release/consumer gates pass. `SKIPPED_TOOL_PROJECT` applies only when no
  publishable tooling package is involved and the valid channel is preserved.
  A `NO_WIKI`
  submission yields `SKIPPED_NO_WIKI` and does not prevent `MERGED`; never
  create a Wiki.
- `UPDATED_MERGED` requires verified master containment, exact Wiki authorization
  for the exact minimal field patch, and a readback of exactly
  `是否上线：已合并`. The authorized patch must replace exactly one
  `是否上线：未合并` field, or a verified `是否上线：待合并` field using the
  explicitly authorized intermediate body hash. Missing or non-current values block; no migration
  or insertion is allowed.
- `UPDATED_PENDING_MERGE` requires a STANDARD business entry, an exact open MR
  on the original source SHA targeting the verified default, explicit conditional
  Wiki-patch authorization, and readback of exactly `是否上线：待合并`. Scope
  the patch by unique entry heading + repository + branch, including shared
  branch names across projects; preserve every other byte. `ALREADY_PENDING_MERGE`
  requires the same exact approved body and performs no write. NO_WIKI and
  TOOLING do not add a pending business status. An already merged entry never
  regresses. A waiting result retains its Wiki outcome and MR continuation.
- `UPDATED_LATEST` requires verified official publication and same-registry latest
  readback for every required package, verified current consuming projects,
  their reviewed upgrade revisions delivered to the default target, exact Wiki
  authorization, and a minimal `当前版本：canary` to `当前版本：latest`
  patch plus exact-body readback. `ALREADY_LATEST` performs no Wiki write but
  requires the same package/consumer gates; the label itself is insufficient.
- Read-only package latest and subsequent consumer-version checks both precede
  any build or dependency write. Retain both checks and the resulting
  `REUSE_ONLY|UPGRADE_ONLY|RELEASE_THEN_RECHECK|BLOCKED` decision.
  `VERIFIED_EXISTING`
  reuses the evidenced current publication without triggering Jenkins;
  `NEEDS_RELEASE` permits a confirmed new build only after consumer versions
  are captured; compare them to the actual new latest before deciding upgrades.
  Unknown source evidence,
  registry/permission failures or a Wiki latest label cannot establish absence
  and must never cause a speculative rebuild. A changed reuse/release decision
  needs an updated actual preview before writes.
- Follow [tooling-latest.md](tooling-latest.md) for package-owner/consumer
  ordering, derived versions and evidence. A manifest range, installed canary,
  stale lockfile, undelivered upgrade or latest-tag drift cannot pass. Only
  consumers in the bound delivery scope are upgraded; incomplete discovery
  cannot prove that no consumer exists.
- Merge, package release, consumer-upgrade and Wiki-patch authority are distinct
  scopes and may share one
  current-conversation confirmation only when the full targets, operation,
  purpose and actual minimal Wiki body/patch were displayed together. Omitted
  or changed scopes need fresh confirmation. Validate the unchanged delivery
  bundle once; the MR and update-only Wiki executors enforce fresh checks and
  readbacks without separate Agent validation between steps. Cleanup remains
  a separately confirmed exact resource set.
- References to `master` use the verified actual default; `main` is permitted
  only after actual remote-default evidence, never an inferred branch alias.
- `ALREADY_MERGED` requires a readback of exactly one matching
  `是否上线：已合并` field and performs no Wiki write.
- The merge-status field denotes current-round commit containment in
  `origin/master`; it does not claim that a production version was published.
  Tooling `当前版本` denotes a verified `canary|official` publication channel;
  master containment cannot change it or prove an official release.
- `SKIPPED_TOOL_PROJECT` has no Wiki patch and requires no Wiki-write
  authorization; it never substitutes for an involved package's latest flow.
  `NO_WIKI` omits only Wiki operations, not release/consumer verification.
- A failed or unknown external result returns `BLOCKED` and truthfully reports
  completed actions; do not perform later writes.
- After verified master delivery, attempt the read-only local closeout check
  before Wiki maintenance. Report it even if the Wiki later blocks. Missing
  local inspection evidence yields `PARTIAL` or `UNAVAILABLE`, independently
  of merge/Wiki success; it does not alone change the terminal state or block
  Wiki maintenance. `NOT_TRIGGERED` applies only before verified delivery.
  Run this check for each completed owner/consumer merge even when a subsequent
  publication or upgrade fails; resources still needed by the latest flow
  remain retained. Cleanup is offered only after all required latest/Wiki gates pass.
- The closeout executor consumes only exact evidenced resources and one fresh
  scoped occupancy snapshot. It batches Git/ref/worktree reads and per-tree
  checks; it has no deletion entry point. Missing/stale occupancy, ignored data
  or ancestry yields partial/verify outcomes, never assumed cleanliness or idle
  resources. Reuse its complete output instead of repeating the same commands.
- Cleanup candidacy requires evidence for the entire current local tip, not
  only the approved current-round commits. A closeout result creates only a
  plan; deletion requires a separate exact current-conversation confirmation
  and a fresh unchanged recheck.
- `NO_CANDIDATE` requires a complete check with no safe candidates. A partial
  or unavailable check yields cleanup `BLOCKED`, never a clean/no-candidate
  claim.
- Every delivery final response includes the cleanup outcome. An
  `AWAITING_CONFIRMATION` result displays the exact plan and ends with
  `是否删除以上本地开发环境？`, offering `确认清理` or `保留开发环境`,
  for local-only scope. A combined plan uses the concise three-row format in
  local-closeout.md, asks `是否清理以上资源（含远程临时分支）？`, and requires
  `确认清理（含远程临时分支）` or equivalent explicit scope. Preserve exact
  evidence in memory; show repository, exact local/remote names and paths,
  retained remote development branches and concise exclusion reasons.
  A state code or generic recommendation cannot replace this question.
  Orchestrators retain the plan and surface one combined question only after
  all required delivery gates pass. Other states explain why cleanup is
  unavailable; they do not request deletion of retained or uncertain resources.
- An immediate cleanup confirmation answers only the unchanged displayed
  plan; `CLEANUP` reuses the prior merge result and rechecks candidates without
  repeating delivery writes. Choosing to retain resources performs no deletion
  and ends the cleanup prompt until a later explicit request.
- Combined confirmation authorizes local cleanup and only its listed associated
  remote `merge/*` refs, never remote feature/fixbug refs. Generic `确认清理`
  is ambiguous for a combined plan and performs no deletion pending scope
  clarification. Validate both scopes before starting; local cleanup precedes
  remote temporary deletion, with no extra confirmation for unchanged scopes.
- A confirmed ACB preview may itself supply exact conditional local/remote C
  and temporary-worktree cleanup authority. Once its own MR and safety checks
  pass, default DELETE_AFTER_MERGE executes only that scope without another
  confirmation; an explicit retention instruction revokes it and persists.
  Keep original development resources outside this authority. Do not re-prompt
  for cleaned/absent or RETAINED_BY_USER resources in later go-live cleanup;
  deferred or failed scope retains its exact authority and reason, never
  triggers a blind retry. This temporary cleanup also applies after C → dev,
  independently of master-delivery completion.
- The local stage of `CLEANUP` may remove only confirmed local worktrees followed by their exact
  local development or temporary test-merge branches. Temporary branches are
  checked against their own merged MR target, including dev/develop, rather
  than requiring integration-only commits in master. Missing association is
  VERIFY. It never removes the current task path/branch, protected
  branches, dirty/active/locked/uncertain resources, remote branches, or any
  resource not classified `CANDIDATE` in the unchanged confirmed plan. The
  remoteTemporary stage uses its separately verified remote evidence and
  explicit combined confirmation. Local NO_CANDIDATE does not discard a
  nonempty remoteTemporary plan; both scopes must be empty for overall NO_CANDIDATE.
- Local cleanup uses ordinary `git worktree remove` and `git branch -d` only;
  a temporary test-merge branch with no configured merge values may use
  command-scoped upstream settings. Existing upstreams must be verified or
  normalized and read back under local-closeout.md, with exact restoration on
  failure when unchanged. Force
  deletion, raw filesystem deletion, broad pruning, branch switching, process
  termination, and remote deletion are forbidden in this local operation. A cleanup failure is
  reported separately and never changes a verified merge into an unmerged one.
- Remote operations follow [remote-cleanup.md](remote-cleanup.md), either as
  the explicitly confirmed remoteTemporary stage or separately requested
  `CLEANUP_REMOTE`. Local-only confirmation, local absence or
  safe local tips cannot authorize or prove safe remote deletion. Bind exact
  remote refs/SHAs, verify their complete tips against their own merged targets,
  protected/default/current-branch and shared-use restrictions, then require
  an explicit remote instruction. Use Git CLI expected-SHA lease deletion with
  `--no-follow-tags` and
  exact absence readback, never GitLab MCP/API or MR auto-delete. Changed or
  unknown evidence blocks; no automatic retry. Keep remote and local outcomes
  separate, including when only one cleanup scope was requested or completed.
- The result may report only evidenced official tooling-package publication;
  it contains no business-application production-deployment claim, runtime/recovery fields,
  persisted local workflow record paths, or private validator response. Inspected
  worktree paths are allowed as read-only closeout evidence.
