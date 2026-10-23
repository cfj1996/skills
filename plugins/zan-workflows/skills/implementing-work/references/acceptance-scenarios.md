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
| Start authorization binds status but omits repair-owner change | Return the complete updated checklist; do not broaden old authorization to personnel writes. |
| Bug is already repairing but still assigned to tester | Use authorized `WRITE_ACTIVE` to set the verified repair account with the same active status, then read back both. |
| Active status readback passes but owner is missing, unchanged or includes another person | `BLOCKED` before source edits; preserve actual effects without automatic retry/rollback. |
| Continue Bug is already `待测试` | Keep the status unchanged and implement on the original branch. |
| Story or Task reaches implementation | Require `NOT_APPLICABLE_NON_BUG`; do not validate or write a Bug `修复中` status. |
| Confirmed Bug repair begins | After diagnosis, create/reuse and read back the original Bug's start record before source edits; complete the final record only after verification/review pass. |
| Last modifier differs from the evidenced introducing author | Use original-change and causal evidence; never assign introduction responsibility from `git blame` or repair ownership alone. |
| Historical author/time/cause cannot be established | State the unknown and evidence gap; continue the approved scoped repair without inventing attribution. |
| Bug has no verified related requirement or involves several projects | Omit the related-requirement line when absent and retain one flat record without project fields/sections. |
| One Bug supplies several repository definitions | Preflight the complete confirmed set, share one state/start-record operation, then implement and independently review every repository; close only after agreed cross-repository acceptance. |
| Two subprojects resolve to the same repository and fixed branch | Combine their scoped work into one repository result; conflicting branch bindings block before writes. |
| The first repository passes but another required repository fails | Return BLOCKED with actual progress; no completion comment, partial REVIEWED result or delivery handoff. |
| Shared state/owner changed through this round's verified write | Reuse its readback for later repositories; do not repeat the old payload or mistake the expected effect for external drift. |
| Grouped Bug resumes after one repository failed | Read back shared comments and source facts, retain valid work/reviews, and complete only missing or invalidated steps. |
| All repositories pass but shared completion readback fails | Preserve each code/review result and return BLOCKED; verify the original comment before any missing write, without rerunning implementation. |
| Reviewed source changes before grouped closure | Reverify/review affected work before publishing a complete record or any REVIEWED result. |
| Start record is already verified for this round | Reuse it; only append the missing completion record, without duplicate start comments. |
| Completed record already covers the current repair and only comment recovery remains | Verify and reuse it without adding a retroactive start record or rerunning the repair. |
| Continued Bug is already waiting for test | Preserve status/owner; still record genuinely new incremental repair with the same comment rules. |
| Start comment fails or cannot be read back | Block source edits, retain actual effects and raw error, then read before retrying a write. |
| Code verification/review passed but completion comment readback fails | Return `BLOCKED` before submission while preserving code/review results; recover only the missing comment/readback. |
| Existing unrelated changes overlap the approved files | `BLOCKED`; do not stash, reset, overwrite, or absorb them. |
| Relevant verification fails | `BLOCKED` with the actual command/result; do not claim review success. |
| Reviewer rejects scope or correctness | Map to `REVIEW_FAILED` and return `BLOCKED`. |
| A presentation-only change removes a still-required behavior with no authorized scope change or reachable replacement | Detect the regression in the final diff and behavior check; return `REVIEW_FAILED` / `BLOCKED`, even when static checks pass. |
| A refactor moves behavior into a shared implementation while callers still reach it and relevant checks pass | Accept equivalent behavior; do not reject solely because the old implementation was deleted. |
| The confirmed request explicitly changes or removes an earlier behavior and verification matches the new requirements | Review against the current confirmed requirements; do not demand restoration of superseded behavior or repeated authorization. |
| All checks and private review pass | Return in-memory `REVIEWED`; do not commit, push, submit, or publish. |
| Small task has no formal Plan and would gain little from delegation | Lead implements directly; no extra Plan, Task, estimate or dispatch confirmation. |
| Same Story has independent approved Tasks across repositories | Verify the selected parent/scope and every project's readiness; lead dispatches bounded work, retains per-repository results and overall acceptance. No sibling-task expansion or Bug record writes. |
| Frontend/backend depend on an unfinished shared contract | Validate the contract first; parallel development starts only when both consumers can use its verified output. |
| Two tasks edit different lines of one file, or a directory includes another task's file | One writer or serial work; do not treat line separation or path aliases as isolation. |
| Source paths are disjoint but tests share a port, output directory or mutable database | Isolate evidenced test resources or serialize those checks; code independence alone is insufficient. |
| A child needs a shared type, lockfile or dependency installation | Child reports the need without expanding writes; lead stops affected writers before reallocating/shared setup. |
| Worker reports success while another required task is blocked | Lead verifies actual changes, pauses dependents and reports partial progress; no whole-scope REVIEWED or Bug completion. |
| Interrupted worker may still have a running write command | Do not reuse its write scope until termination is verified and actual changes are reconciled; no blind duplicate dispatch. |
| All children report success but interface integration fails | Retain local evidence, resolve the integration failure, then reverify affected checks and obtain independent final review. |
| Subagent tools are unavailable | Lead follows the same task/dependency and write boundaries serially. |

No scenario creates a workflow report, recovery state, or generated evidence
directory.
