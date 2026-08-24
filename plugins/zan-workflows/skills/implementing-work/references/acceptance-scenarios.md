# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Existing fixed branch has no current-Bug commits | `USE_EXISTING` remains valid; implement directly after repository/scope checks. |
| Existing branch contains earlier Bugs from the same request | Preserve them and implement the next Bug on the same branch. |
| Current branch differs from the prepared fixed branch | `BLOCKED` before editing. |
| `CREATE` lacks or no longer matches the approved base ref/SHA | `BLOCKED` before branch creation. |
| TAPD active-state write is not exactly authorized or fails pre-write validation/readback | `BLOCKED` before source editing. |
| Confirmed fixing-bug checklist already binds the active-state write | Reuse it and do not ask for another status confirmation. |
| Continue Bug is already `待测试` | Keep the status unchanged and implement on the original branch. |
| Existing unrelated changes overlap the approved files | `BLOCKED`; do not stash, reset, overwrite, or absorb them. |
| Relevant verification fails | `BLOCKED` with the actual command/result; do not claim review success. |
| Reviewer rejects scope or correctness | Map to `REVIEW_FAILED` and return `BLOCKED`. |
| All checks and private review pass | Return in-memory `REVIEWED`; do not commit, push, submit, or publish. |

No scenario creates a workflow report, recovery state, or generated evidence
directory.
