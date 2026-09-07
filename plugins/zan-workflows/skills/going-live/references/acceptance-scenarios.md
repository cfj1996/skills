# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Submitted original branch with valid authorization | Merge that branch directly to `master` and verify containment. |
| Source is `develop`, `merge/*`, or another branch | `BLOCKED` before MR write. |
| Source or master SHA changes after authorization | Stop, display new facts, and require fresh authorization. |
| `STANDARD` Wiki has one matching business entry with `是否上线：未合并` | After merge containment, update only that field to `已合并` and verify readback. |
| Matching business field is already exactly `已合并` | Record `ALREADY_MERGED`; perform no Wiki write. |
| Matching business entry is missing the status or contains a non-current value | `BLOCKED`; do not migrate or rewrite an old template. |
| Matching entry belongs to a tooling project | Verify `是否上线：无需上线`, record `SKIPPED_TOOL_PROJECT`, and perform no Wiki write or Wiki-write authorization. |
| Entry match or merge-status field is ambiguous | `BLOCKED` before the master MR write. |
| `NO_WIKI` submission | `SKIPPED_NO_WIKI`; merge can still succeed without creating a Wiki. |
| `STANDARD` submission skipped Wiki because the continue fix was non-functional | Reuse the retained existing Wiki target and maintain its business merge status after master containment, or verify the tooling status without writing. |
| Merge/readback/containment fails | `BLOCKED`; do not change `是否上线` or claim go-live success. |
| Wiki changes after authorization | Preserve the changed page and require a fresh patch/authorization; report any already completed merge truthfully. |
| Master delivery is verified and associated resources are clean, idle, and fully delivered | Run local closeout automatically; report `CANDIDATE` resources and cleanup reminder without deleting anything. |
| MR is open, auto-merge is pending, or only dev was merged | Local closeout is `NOT_TRIGGERED`; do not claim master completion. |
| Local source gained an undelivered commit after the MR merged | Report `RETAIN`; old merged-source evidence does not cover the new local tip. |
| Associated worktree has edits, untracked files, valuable ignored configuration, or is current/active/locked | Report `RETAIN` with reason; do not switch branches or remove files/worktrees. |
| Occupancy, ignored data, or squash/cherry-pick containment is uncertain | Report `VERIFY`; do not label the resource safe to delete. |
| A recorded conflict branch was merged to dev and contains integration-only commits | Verify its own merged MR and current-tip containment in the actual dev target; do not require those commits in master. |
| Another branch merely shares the feature name or merge prefix | Do not infer association or include it as a cleanup candidate. |
| Repository, fetch, worktree, or occupancy evidence is unavailable | Report `PARTIAL` or `UNAVAILABLE` with the gap; preserve merge/Wiki outcomes and perform no cleanup. |
| Wiki maintenance fails after verified master delivery | Report the completed merge, Wiki blocker, and retained local closeout result separately. |
| Complete inspection finds no related local resources | Report `CHECKED` with no related candidates; perform no workspace-wide search. |

No scenario publishes a version, changes TAPD, or creates local workflow state.
