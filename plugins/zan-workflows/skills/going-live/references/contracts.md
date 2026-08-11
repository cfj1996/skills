# MasterMergeResult contract

`MasterMergeResult` is an in-memory result of one direct original-branch to
`master` transaction.

## Required content

| Section | Required facts |
| --- | --- |
| Submission | upstream `SUBMITTED` result and original repair branch |
| Repository | expected/actual path, Git root, origin, verification result |
| Merge | source/target branches and SHAs, current-round commits, authorization, MR result, merge readback, master containment |
| Wiki | `MARKED|SKIPPED_NO_WIKI|BLOCKED|NOT_ATTEMPTED`, target/patch authorization and readback when used |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Terminal | `MERGED|BLOCKED` and blocker when applicable |

## Invariants

- `MERGED` requires the original submitted `feature/*` or `fixbug/*` source,
  target exactly `master`, matching expected/actual source and target SHAs at
  execution, explicit merge authorization, passing pre-write validation,
  successful merge readback, and containment of every current-round commit.
- `develop -> master`, `dev -> master`, `merge/*`, release branches, or a
  substituted source are always blocked.
- No Wiki request or no identified existing Wiki yields
  `SKIPPED_NO_WIKI` and does not prevent `MERGED`.
- `MARKED` requires a pre-existing exact Wiki, separate authorization for the
  minimal patch, and successful readback after the master merge.
- A failed or unknown external result returns `BLOCKED` and truthfully reports
  completed actions; do not perform later writes.
- The result contains no production-publish claim, runtime/recovery fields,
  local record paths, or private validator response.
