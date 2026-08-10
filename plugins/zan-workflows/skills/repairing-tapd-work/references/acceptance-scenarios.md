# Acceptance scenarios

Replay these scenarios before returning a `ReviewedChange`. A blocked outcome
performs no source edit, branch/worktree creation, TAPD status write, commit,
push, MR action, merge, Wiki write, submission, or deployment.

| Scenario | Required result |
| --- | --- |
| The shell is in another repository, or actual Git root/origin differs from the approved fingerprint | `terminal_state=BLOCKED`, fingerprint result `FAIL`; never fall back to CWD or a similarly named repository. |
| A new feature/fix branch was created from `develop` or `dev` | `terminal_state=BLOCKED`, branch result `FAIL`; do not edit or treat the branch as a usable repair branch. |
| Actual branch or absolute worktree path differs from the confirmed expected value | `terminal_state=BLOCKED`, record expected and actual values; no edit until the user confirms a corrected explicit location. |
| The user says “edit first; tests and review later” | Do not emit `PRE_EDIT_GATE: PASS`; return `BLOCKED` with missing planning, TDD, verification, and review gates. |
| The target repository has pre-existing dirty/untracked changes outside approved scope | Preserve the before-status snapshot; exclude those paths or block for scope/location reconciliation. Never attribute them to this repair. |
| A claimed passing test/build has no actual command, exit code, or output, or RED is missing before GREEN | `terminal_state=BLOCKED`; evidence is incomplete or fabricated, not a passing verification. |
| The independent reviewer is unavailable, sees no diff/baseline/evidence bundle, or is asked to self-bypass | `terminal_state=BLOCKED`, `review.verdict=NOT_RUN` or `REVIEW_FAILED`; the implementer cannot self-approve. |
| Reviewer finds fingerprint mismatch, scope drift, unrelated changes, missing tests, or fabricated evidence | `terminal_state=BLOCKED`, `review.verdict=REVIEW_FAILED`, and retain the reviewer reason. |
| The approved fingerprint, scope, branch/worktree, active TAPD status readback, RED→GREEN evidence, verification bundle, baseline comparison, and read-only review all pass | Return `terminal_state=REVIEWED` and `REVIEWED_CHANGE_READY`; include actual facts and residual risks, but do not submit, merge, or publish. |

## GREEN replay of the Task 2 RED baseline

Given the RED case with an expected `order-admin` fingerprint but a current
`admin_menu` shell, a missing fixed branch, dirty unrelated target files, and a
request to postpone testing/review, this skill returns:

```text
REPAIR_BLOCKED: actual fingerprint/branch/location and evidence gates are not satisfied
```

It records the mismatches, missing location confirmation, and `NOT_RUN` TDD and
review checks in `ReviewedChange`; it does not create a branch/worktree, change
TAPD, edit files, or emit a reviewed result.
