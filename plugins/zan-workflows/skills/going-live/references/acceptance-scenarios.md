# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Submitted original branch with valid authorization | Merge that branch directly to `master` and verify containment. |
| Source is `develop`, `merge/*`, or another branch | `BLOCKED` before MR write. |
| Source or master SHA changes after authorization | Stop, display new facts, and require fresh authorization. |
| No existing Wiki is identified | `SKIPPED_NO_WIKI`; merge can still succeed. |
| Existing Wiki marker is separately authorized | Write the minimal `已合并` patch only after merge success and verify readback. |
| Merge/readback/containment fails | `BLOCKED`; do not write the Wiki marker or claim go-live success. |

No scenario publishes a version, changes TAPD, or creates local workflow state.
