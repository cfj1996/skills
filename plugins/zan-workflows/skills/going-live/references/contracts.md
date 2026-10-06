# MasterMergeResult contract

`MasterMergeResult` is an in-memory go-live result for original-branch to
`master` deliveries, including the required latest flow for involved tooling
packages and affected consumers.

## Required content

| Section | Required facts |
| --- | --- |
| Submission | upstream `SUBMITTED` result and original repair branch; exact related submitted owner/consumer handoffs when tooling dependencies are involved |
| Repository | expected/actual path, Git root, origin, verification result |
| Merge | source/target branches and SHAs, current-round commits, authorization, MR result, merge readback, master containment |
| Tooling latest | `VERIFIED|NOT_APPLICABLE|BLOCKED`; exact plan/authorization, latest precheck `VERIFIED_EXISTING|NEEDS_RELEASE|BLOCKED`, package owner delivery, `REUSED_LATEST|PUBLISHED_LATEST` and publication/source/registry evidence, Jenkins result only when a release is needed, affected consumer manifests/locks/resolved versions, upgrade review/checks/delivery, and final latest recheck |
| Related deliveries | per-project repository/original branch/source and target SHA, scoped upgrade diff when used, review/verification, commit/push/MR readbacks and default-branch containment |
| Wiki | `UPDATED_MERGED|ALREADY_MERGED|UPDATED_LATEST|ALREADY_LATEST|SKIPPED_TOOL_PROJECT|SKIPPED_NO_WIKI|BLOCKED|NOT_ATTEMPTED`, matching branch entry, project type, before/after type-specific status, target/patch authorization, and exact-body readback when used |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Local closeout | per completed project `CHECKED|PARTIAL|UNAVAILABLE|NOT_TRIGGERED`; related branch/worktree paths, association and delivery evidence, observed tip/target SHAs, dirty/ignored/occupancy findings, and per-resource `CANDIDATE|RETAIN|VERIFY` with reasons |
| Cleanup | `NO_CANDIDATE|AWAITING_CONFIRMATION|CLEANED|PARTIAL|BLOCKED|NOT_TRIGGERED`; exact plan and confirmation when applicable, final-response cleanup question or no-candidate/blocker reason, refreshed evidence, worktree-removal and local-branch-deletion readbacks, and completed/retained resources |
| Terminal | `MERGED|BLOCKED` and blocker when applicable |

## Invariants

- `MERGED` requires the original submitted `feature/*` or `fixbug/*` source,
  target exactly `master`, matching expected/actual source and target SHAs at
  execution, explicit merge authorization, passing pre-write validation,
  successful merge readback, and containment of every current-round commit.
  If tooling packages are involved, it additionally requires
  `ToolingLatestResult=VERIFIED`, all bound consumers delivered at the current
  registry latest, and applicable Wiki `当前版本：latest` readbacks. Merge
  success alone cannot satisfy the overall delivery result.
- `develop -> master`, `dev -> master`, `merge/*`, release branches, or a
  substituted source are always blocked.
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
  `是否上线：未合并` field. Missing or non-current values block; no migration
  or insertion is allowed.
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
  `是否删除以上本地开发环境？`, offering `确认清理` or `保留开发环境`.
  A state code or generic recommendation cannot replace this question.
  Orchestrators retain the plan and surface one combined question only after
  all required delivery gates pass. Other states explain why cleanup is
  unavailable; they do not request deletion of retained or uncertain resources.
- An immediate cleanup confirmation answers only the unchanged displayed
  plan; `CLEANUP` reuses the prior merge result and rechecks candidates without
  repeating delivery writes. Choosing to retain resources performs no deletion
  and ends the cleanup prompt until a later explicit request.
- Cleanup may remove only confirmed local worktrees followed by their exact
  local branches. It never removes the current task path/branch, protected
  branches, dirty/active/locked/uncertain resources, remote branches, or any
  resource not classified `CANDIDATE` in the unchanged confirmed plan.
- Cleanup uses ordinary `git worktree remove` and `git branch -d` only. Force
  deletion, raw filesystem deletion, broad pruning, branch switching, process
  termination, and remote deletion are forbidden. A cleanup failure is
  reported separately and never changes a verified merge into an unmerged one.
- The result may report only evidenced official tooling-package publication;
  it contains no business-application production-deployment claim, runtime/recovery fields,
  persisted local workflow record paths, or private validator response. Inspected
  worktree paths are allowed as read-only closeout evidence.
