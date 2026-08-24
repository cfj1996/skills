# TapdWorkDefinition contract

`TapdWorkDefinition` is an in-memory handoff from `preparing-work` to
`implementing-work`. It is not a record file.

## Required content

| Section | Required facts |
| --- | --- |
| Identity | TAPD URL, type, item ID, short ID, title |
| Context | cited requirement facts, conflicts, missing facts, confidence and reasons |
| Work mode | `INITIAL|CONTINUE`, trigger evidence, reused confirmation facts, and original-branch recovery evidence when applicable |
| Scope | in-scope work, excluded work, acceptance criteria, confirmation state |
| Project | selected project, canonical repository path, Git root, origin remote, verification result |
| Branch | requested mode, fixed branch, action `CREATE|USE_EXISTING`, selected/planned branch, local/remote ref facts, and for `CREATE` exact verified base ref/SHA |
| TAPD status plan | current status, `WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST`, exact target/payload/purpose when writing, and confirmation source |
| Validation | public mapped state and normalized failure reason |
| Terminal | `READY_FOR_HANDOFF|PENDING|BLOCKED` and blocker/next decision when needed |

## Branch invariants

- `CREATE` and `USE_EXISTING` require `fixed_branch`.
- `CREATE` requires the exact branch to be absent locally and remotely. The
  definition names it as the planned branch and carries `create_base_ref` plus
  its current verified `create_base_sha`, but does not create it. The base must
  come from explicit input or a named governing workspace policy.
- `USE_EXISTING` requires the exact supplied branch to exist. When both local
  and remote refs exist, their SHAs must match. The definition selects that
  same branch and does not inspect Bug-specific history as an eligibility gate.
- `AUTO` with an exact fixed branch chooses `USE_EXISTING` when the verified
  branch exists, otherwise `CREATE` when absence is verified. An unavailable
  ref check is `PENDING`; conflicting refs are `BLOCKED`.
- No mode may select or plan a branch different from `fixed_branch`.
- `CONTINUE` requires `USE_EXISTING` on the recovered original source branch.
  It never yields `CREATE`; missing/competing recovery evidence yields
  `PENDING`.

## Terminal invariants

`READY_FOR_HANDOFF` requires:

- a single verified project and repository fingerprint;
- confirmed scope with no unresolved critical conflict;
- an explicit initial scope or an evidence-backed incremental scope under
  `CONTINUE`;
- one exact branch action and passing branch checks; and
- one status plan consistent with work mode/current TAPD status; and
- private validation mapped to `VALIDATION_PASSED`.

Use `PENDING` only for missing evidence or a named user choice that could make
the definition valid. Use `BLOCKED` for a proven mismatch or conflict. Neither
state advertises an eligible handoff or performs a write.

The definition must not include runtime IDs, persistence paths, prior-run
history, generated evidence paths, or private validator output.
