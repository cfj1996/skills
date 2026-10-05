# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Submitted original branch with valid authorization | Merge that branch directly to `master` and verify containment. |
| One complete checklist displays merge and exact Wiki patch | One confirmation binds both distinct scopes; validate once and run the merge and update-only executors without another question. |
| Wiki patch was omitted or materially changed | Obtain its exact new preview/authorization before write; never inherit merge authority alone. |
| CI is running for the exact approved MR | Let the executor wait with bounded backoff; no Agent/rule/reviewer loop. |
| Verified actual default is main | Use the actual main target/ref and its containment proof; do not silently target a different master branch. |
| Source is `develop`, `merge/*`, or another branch | `BLOCKED` before MR write. |
| Source or master SHA changes after authorization | Stop, display new facts, and require fresh authorization. |
| `STANDARD` Wiki has one matching business entry with `是否上线：未合并` | After merge containment, update only that field to `已合并` and verify readback. |
| Matching business field is already exactly `已合并` | Record `ALREADY_MERGED`; perform no Wiki write. |
| Matching business entry is missing the status or contains a non-current value | `BLOCKED`; do not migrate or rewrite an old template. |
| Delivery involves a tooling package and a consuming business project | Check package latest, then consumer versions; decide needed publication/upgrades only after both checks, deliver scoped changes, and verify Wiki latest. |
| Registry latest and publication source already cover this delivery, but consumer/Wiki are still canary | `VERIFIED_EXISTING` and `REUSED_LATEST`; no Jenkins trigger, continue consumer upgrade and Wiki update. |
| Successful reads prove latest is absent or its source predates this delivery | `NEEDS_RELEASE`; still inspect consumer versions before deciding/confirming a release, then compare them to the actual new latest before upgrades. |
| Package latest covers this change and every consumer already resolves it | `REUSE_ONLY`; skip Jenkins publication and dependency edits, while still verifying Git/Wiki delivery. |
| Package latest covers this change but only one of two projects is outdated | `UPGRADE_ONLY`; no package release and edit only the outdated project's dependencies. |
| Consumer version check fails after package is classified `NEEDS_RELEASE` | Block before Jenkins trigger; the first check alone cannot authorize execution. |
| Registry read fails or publication/source provenance is unknown | `BLOCKED`; never interpret uncertainty as absence and trigger a build. |
| Confirmed reuse precheck changes at the release boundary | Refresh the actual decision/plan; never silently turn reuse into a Jenkins trigger. |
| Tooling category has no involved publishable package | Verify the valid channel, record `SKIPPED_TOOL_PROJECT`, and perform no Wiki write. |
| Tooling owner merged but official publication failed or is unknown | Report the completed merge and retained local check, block later consumer/Wiki writes, and preserve canary; never retrigger automatically. |
| Wiki is already `当前版本：latest` | Record `ALREADY_LATEST` only after publication/source, registry latest and consumer-version checks; the label cannot skip those gates. |
| Manifest range permits latest but the affected lock importer still resolves canary | Upgrade the dependency/lockfile and actual resolution; do not record `ALREADY_CURRENT`. |
| Manifest, lockfile and actual consumer resolution already match verified latest | Record `ALREADY_CURRENT` with evidence; do not create a dependency-only commit. |
| Consumer has a newer local upgrade but its final master revision still uses the old dependency | Block final delivery; prove the reviewed upgraded revision and delivered manifest/lockfile. |
| Registry latest moves after upgrade | Block the final current-version/Wiki claim and prepare an updated version plan. |
| Dependency upgrade invalidates the submitted source SHA/review | Review and verify the scoped delta, deliver its actual new original-branch revision; do not reuse the stale reviewed SHA. |
| Consumer upgrade/build/review fails after successful package publication | Report the released version and unresolved consumers, stop later writes, and do not mark Wiki latest or offer cleanup. |
| One confirmed plan covers owner merges, official releases, derived versions, consumers and Wiki patches | Execute unchanged scoped stages without another per-stage confirmation; new project/package/ref/payload facts need a fresh actual preview. |
| Entry match or merge-status field is ambiguous | `BLOCKED` before the master MR write. |
| `NO_WIKI` submission with tooling packages | `SKIPPED_NO_WIKI`; still require latest publication and consumer verification, never create a Wiki. |
| `STANDARD` submission skipped Wiki because the continue fix was non-functional | Reuse the retained existing target and maintain business merge status or the involved tooling latest field after its required gates. |
| Merge/readback/containment fails | `BLOCKED`; do not change `是否上线` or claim go-live success. |
| Wiki changes after authorization | Preserve the changed page and require a fresh patch/authorization; report any already completed merge truthfully. |
| Master delivery is verified and associated resources are clean, idle, and fully delivered | Run local closeout automatically; build the exact cleanup plan, set `AWAITING_CONFIRMATION`, and delete nothing in the delivery turn. |
| User confirms the exact unchanged cleanup plan | Recheck every candidate, remove its worktree without force, delete its local branch with `git branch -d`, and verify both readbacks. |
| Cleanup candidate facts changed after confirmation | Delete nothing; return the refreshed plan or classify the resource `RETAIN|VERIFY`. |
| Worktree removal or local branch deletion fails | Stop remaining cleanup, report `PARTIAL|BLOCKED`, and preserve the verified merge/Wiki outcome. |
| Cleanup targets a protected/current branch, current/active/locked worktree, remote branch, or unconfirmed resource | `BLOCKED`; do not switch, force-delete, prune broadly, stop processes, or use raw filesystem deletion. |
| MR is open, auto-merge is pending, or only dev was merged | Local closeout is `NOT_TRIGGERED`; do not claim master completion. |
| Local source gained an undelivered commit after the MR merged | Report `RETAIN`; old merged-source evidence does not cover the new local tip. |
| Associated worktree has edits, untracked files, valuable ignored configuration, or is current/active/locked | Report `RETAIN` with reason; do not switch branches or remove files/worktrees. |
| Occupancy, ignored data, or squash/cherry-pick containment is uncertain | Report `VERIFY`; do not label the resource safe to delete. |
| A recorded conflict branch was merged to dev and contains integration-only commits | Verify its own merged MR and current-tip containment in the actual dev target; do not require those commits in master. |
| Another branch merely shares the feature name or merge prefix | Do not infer association or include it as a cleanup candidate. |
| Repository, fetch, worktree, or occupancy evidence is unavailable | Report local closeout `PARTIAL|UNAVAILABLE` and cleanup `BLOCKED` with the gap; preserve merge/Wiki outcomes and perform no cleanup. |
| Wiki maintenance fails after verified master delivery | Report the completed merge, Wiki blocker, and retained local closeout result separately. |
| Complete inspection finds no related local resources | Report `CHECKED` with no related candidates; perform no workspace-wide search. |

Official tooling publication is executed only through Jenkins by `running-release`.
No scenario deploys a business application to production, changes TAPD, or creates
local workflow state.
