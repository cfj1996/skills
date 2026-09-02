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

No scenario publishes a version, changes TAPD, or creates local workflow state.
