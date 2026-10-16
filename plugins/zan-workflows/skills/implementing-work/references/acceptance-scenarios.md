# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Existing fixed branch has no current-Bug commits | `USE_EXISTING` remains valid; implement directly after repository/scope checks. |
| Existing branch contains earlier Bugs from the same request | Preserve them and implement the next Bug on the same branch. |
| Current branch differs from the prepared fixed branch | `BLOCKED` before editing. |
| `CREATE` lacks or no longer matches the approved base ref/SHA | `BLOCKED` before branch creation. |
| Confirmed checklist matches project, scope, base and fixed branch | Reuse it for branch creation/selection and implementation; do not ask again. |
| A visible checklist field changed | `BLOCKED` before branch action and return the updated checklist for confirmation. |
| TAPD active-state write is not exactly authorized or fails pre-write validation/readback | `BLOCKED` before source editing. |
| Confirmed fixing-bug checklist already binds the active-state write | Reuse it and do not ask for another status confirmation. |
| Continue Bug is already `待测试` | Keep the status unchanged and implement on the original branch. |
| Story or Task reaches implementation | Require `NOT_APPLICABLE_NON_BUG`; do not validate or write a Bug `修复中` status. |
| Existing unrelated changes overlap the approved files | `BLOCKED`; do not stash, reset, overwrite, or absorb them. |
| Relevant verification fails | `BLOCKED` with the actual command/result; do not claim review success. |
| Reviewer rejects scope or correctness | Map to `REVIEW_FAILED` and return `BLOCKED`. |
| A presentation-only change removes a still-required behavior with no authorized scope change or reachable replacement | Detect the regression in the final diff and behavior check; return `REVIEW_FAILED` / `BLOCKED`, even when static checks pass. |
| A refactor moves behavior into a shared implementation while callers still reach it and relevant checks pass | Accept equivalent behavior; do not reject solely because the old implementation was deleted. |
| The confirmed request explicitly changes or removes an earlier behavior and verification matches the new requirements | Review against the current confirmed requirements; do not demand restoration of superseded behavior or repeated authorization. |
| All checks and private review pass | Return in-memory `REVIEWED`; do not commit, push, submit, or publish. |

No scenario creates a workflow report, recovery state, or generated evidence
directory.
