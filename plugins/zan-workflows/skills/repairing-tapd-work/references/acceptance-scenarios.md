# Acceptance scenarios

Replay these scenarios before returning a `ReviewedChange`. A blocked outcome
performs no source edit, branch/worktree creation, TAPD status write, commit,
push, MR action, merge, Wiki write, submission, or deployment.

| Scenario | Required result |
| --- | --- |
| The shell is in another repository, or actual Git root/origin differs from the approved fingerprint | `terminal_state=BLOCKED`, fingerprint result `FAIL`; never fall back to CWD or a similarly named repository. |
| Actual selected project or canonical repository path is absent or differs from the approved fingerprint | `terminal_state=BLOCKED`; record the missing/mismatched actual value. A differing worktree root is allowed only with the contract's common-Git-directory and origin equivalence facts. |
| A new feature/fix branch was created from `develop` or `dev` | `terminal_state=BLOCKED`, branch result `FAIL`; do not edit or treat the branch as a usable repair branch. |
| Actual branch or absolute worktree path differs from the confirmed expected value | `terminal_state=BLOCKED`, record expected and actual values; no edit until the user confirms a corrected explicit location. |
| The user says “edit first; tests and review later” | Do not emit `PRE_EDIT_GATE: PASS`; return `BLOCKED` with missing planning, TDD, verification, and review gates. |
| The target repository has pre-existing dirty/untracked changes outside approved scope | Preserve the before-status snapshot; exclude those paths or block for scope/location reconciliation. Never attribute them to this repair. |
| A claimed passing test/build has no actual command, exit code, or output, or RED is missing before GREEN | `terminal_state=BLOCKED`; evidence is incomplete or fabricated, not a passing verification. |
| The pre-change “RED” command passes, is lint/build/non-test work, or fails for setup rather than the approved target behavior | `terminal_state=BLOCKED`; it is not `EXPECTED_FAILURE` evidence even if a later command passes. |
| GREEN uses a different test command without an explicit mapping proving it covers the same target behavior | `terminal_state=BLOCKED`; do not treat unrelated passing output as the RED test's recovery. |
| The independent reviewer is unavailable, sees no diff/baseline/evidence bundle, or is asked to self-bypass | `terminal_state=BLOCKED`, public `review.verdict=NOT_RUN` or `REVIEW_FAILED`; the implementer cannot self-approve and no private raw verdict is persisted. |
| Reviewer finds fingerprint mismatch, scope drift, unrelated changes, missing tests, or fabricated evidence | The private one-line failure maps to public `terminal_state=BLOCKED` and `review.verdict=REVIEW_FAILED`; retain only the reason in `review.failure_reason` and `blocker_reason`, not the raw private verdict. |
| Reviewer returns its one-line passing form | Map it at the producer boundary to public `review.verdict=REVIEW_PASSED`; do not persist the private raw verdict. |
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
