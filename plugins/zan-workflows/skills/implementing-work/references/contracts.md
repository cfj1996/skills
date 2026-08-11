# ReviewedChange contract

`ReviewedChange` is an in-memory handoff to `submitting-for-test`.

## Required content

| Section | Required facts |
| --- | --- |
| Source | TAPD URL/type/short ID and approved scope from the definition |
| Repository | expected and actual project, path, Git root, origin, starting/final HEAD |
| Branch | action `CREATE|USE_EXISTING`, expected branch, actual branch, and exact approved base ref/SHA when created |
| TAPD status | exact target/payload/purpose, authorization, pre-write validation, write, and readback |
| Baseline | before/after status, changed paths, unrelated paths, scope comparison |
| Change | concise summary and exact diff reference available in the current execution |
| Verification | each relevant command, exit status, concise result, and any blocker |
| Review | `REVIEW_PASSED|REVIEW_FAILED|NOT_RUN` and normalized reason |
| Terminal | `REVIEWED|BLOCKED` and blocker when applicable |

## Invariants

- `REVIEWED` requires the actual repository fingerprint to match the prepared
  definition and the actual current branch to equal the fixed branch.
- `CREATE` uses only the definition's verified base ref/SHA; missing or changed
  base evidence blocks before branch creation.
- `USE_EXISTING` does not require prior association with the current Bug. It
  requires only the approved repository/ref identity and a usable scope
  baseline.
- The final changed paths must fit the approved scope. Pre-existing unrelated
  changes remain unrelated and are never attributed to this work.
- Relevant verification must be truthful. Missing or failing required project
  checks block; ordinary project tests may be part of the source change, but no
  workflow evidence files are created.
- `REVIEWED` requires public `review=REVIEW_PASSED`. The private reviewer line
  is never returned or persisted.
- A required TAPD active-state write requires exact display, authorization,
  `PRE_STATUS_WRITE=VALIDATION_PASSED`, and matching readback before source
  edits. Final review uses a separate `POST_CHANGE_REVIEW` call.
- The result grants no commit, push, MR, submission, Wiki, or release authority.
- The result contains no run IDs, recovery/history fields, or local record
  paths.
