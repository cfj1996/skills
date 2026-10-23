# TapdWorkDefinition contract

`TapdWorkDefinition` is an in-memory handoff from `preparing-work` to
`implementing-work`. It is not a record file.

## Required content

| Section | Required facts |
| --- | --- |
| Identity | TAPD URL, type, item ID, short ID, title |
| Context | cited requirement facts, conflicts, missing facts, confidence and reasons |
| Execution context | brief or Bug investigation summary for the selected scope; applicable formal Plan/Task result when needed, with current evidence and concrete verification risks |
| Work mode | `INITIAL|CONTINUE`, trigger evidence, reused confirmation facts, and original-branch recovery evidence when applicable |
| Scope | in-scope work, excluded work, acceptance criteria, confirmation state |
| Project | selected project, canonical repository path, Git root, origin remote, verification result |
| Branch | requested mode, fixed branch, action `CREATE|USE_EXISTING`, selected/planned branch, local/remote refs and ancestry evidence, exact selected ref/SHA for existing work, for `CREATE` exact verified base ref/SHA, and matching current-conversation confirmation source |
| TAPD status plan | item type, current status/`current_owner`, `WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`; for applicable Bugs verified `repairOwner={account,workspaceId,source,evidence}`; exact status+owner target/payload/purpose and confirmation source only for a Bug `WRITE_ACTIVE` |
| Validation | public mapped state and normalized failure reason |
| Terminal | `READY_FOR_HANDOFF|PENDING|BLOCKED` and blocker/next decision when needed |

## Branch invariants

- `CREATE` and `USE_EXISTING` require `fixed_branch`.
- `CREATE` requires the exact branch to be absent locally and remotely. The
  definition names it as the planned branch and carries `create_base_ref` plus
  its current verified `create_base_sha`, but does not create it. The base must
  come from explicit input or a named governing workspace policy.
- `USE_EXISTING` requires the exact supplied branch to exist. Equal refs or
  verified local-ahead history covered by confirmed scope or an accepted baseline select the original
  local branch and exact local tip. Remote-ahead or divergent refs block until
  a separate explicit resolution is completed; no push/reset/rebase is implied.
  Missing ancestry or unclear local increment is `PENDING`. With only one ref,
  bind that exact verified tip under the same branch identity and authorization.
  The definition does not require Bug-specific commits as an eligibility gate.
- `AUTO` with an exact fixed branch chooses `USE_EXISTING` when the verified
  branch exists, otherwise `CREATE` when absence is verified. An unavailable
  ref/ancestry check is `PENDING`; remote-ahead or divergent refs are `BLOCKED`.
- No mode may select or plan a branch different from `fixed_branch`.
- The confirmation source binds project/repository, scope, fixed branch,
  source/base ref/SHA (including the selected existing tip), target branch,
  operation and purpose. Existing accepted baseline commits remain separate
  from this work; verify the unpublished increment without absorbing unrelated
  changes into the result. A visible-field
  change invalidates it; the expected post-creation `CREATE` to `USE_EXISTING`
  transition for the same branch does not.
- `CONTINUE` requires `USE_EXISTING` on the recovered original source branch.
  It never yields `CREATE`; missing/competing recovery evidence yields
  `PENDING`.
- Story/Task always uses `NOT_APPLICABLE_NON_BUG`; it carries no `修复中`
  target, payload, authorization, validation, write, or readback.
- Bug status and owner follow
  [修复中状态与处理人](../../implementing-work/references/bug-repair-owner.md).
  `WRITE_ACTIVE` binds the old owner, verified repair account and a single
  status+`current_owner` payload. `NO_CHANGE` requires both values to match;
  `CONTINUE` already waiting preserves both without any repair-owner write.

## Terminal invariants

`READY_FOR_HANDOFF` requires:

- a single verified project and repository fingerprint;
- confirmed scope with no unresolved critical conflict;
- an explicit initial scope or an evidence-backed incremental scope under
  `CONTINUE`;
- one exact branch action and passing branch checks; and
- one matching current-conversation branch/scope confirmation source; and
- one status plan consistent with TAPD type, work mode and current status; and
- private validation mapped to `VALIDATION_PASSED`.

Use `PENDING` only for missing evidence or a named user choice that could make
the definition valid. Use `BLOCKED` for a proven mismatch or conflict. Neither
state advertises an eligible handoff or performs a write.

A brief supplies execution and verification context, not permission or a
formal Plan. Small changes need no TaskBreakdown or Plan solely to validate
this definition. Existing formal Plan/Task requirements remain binding; all
inputs must satisfy the terminal invariants above.

The definition must not include runtime IDs, persistence paths, prior-run
history, generated evidence paths, or private validator output.
