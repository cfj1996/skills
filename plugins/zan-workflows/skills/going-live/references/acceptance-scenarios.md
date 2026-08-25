# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Submitted original branch with valid authorization | Merge that branch directly to `master` and verify containment. |
| Source is `develop`, `merge/*`, or another branch | `BLOCKED` before MR write. |
| Source or master SHA changes after authorization | Stop, display new facts, and require fresh authorization. |
| `STANDARD` Wiki has one matching `是否上线：否` entry | After merge containment, update only that field to `是` and verify readback. |
| Matching legacy entry has no online field | After merge containment, insert `是否上线：是` immediately before `环境`. |
| Matching field is already exactly `是` | Record `ALREADY_ONLINE`; perform no Wiki write. |
| Entry match or online field is ambiguous | `BLOCKED` before the master MR write. |
| `NO_WIKI` submission | `SKIPPED_NO_WIKI`; merge can still succeed without creating a Wiki. |
| `STANDARD` submission skipped Wiki because the continue fix was non-functional | Reuse the retained existing Wiki target and maintain `是否上线` after master containment. |
| Merge/readback/containment fails | `BLOCKED`; do not change `是否上线` or claim go-live success. |
| Wiki changes after authorization | Preserve the changed page and require a fresh patch/authorization; report any already completed merge truthfully. |

No scenario publishes a version, changes TAPD, or creates local workflow state.
