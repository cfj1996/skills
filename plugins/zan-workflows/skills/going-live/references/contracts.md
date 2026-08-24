# MasterMergeResult contract

`MasterMergeResult` is an in-memory result of one direct original-branch to
`master` transaction.

## Required content

| Section | Required facts |
| --- | --- |
| Submission | upstream `SUBMITTED` result and original repair branch |
| Repository | expected/actual path, Git root, origin, verification result |
| Merge | source/target branches and SHAs, current-round commits, authorization, MR result, merge readback, master containment |
| Wiki | `UPDATED_ONLINE|ALREADY_ONLINE|SKIPPED_NO_WIKI|BLOCKED|NOT_ATTEMPTED`, matching branch entry, before/after online value, target/patch authorization, and readback when used |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Terminal | `MERGED|BLOCKED` and blocker when applicable |

## Invariants

- `MERGED` requires the original submitted `feature/*` or `fixbug/*` source,
  target exactly `master`, matching expected/actual source and target SHAs at
  execution, explicit merge authorization, passing pre-write validation,
  successful merge readback, and containment of every current-round commit.
- `develop -> master`, `dev -> master`, `merge/*`, release branches, or a
  substituted source are always blocked.
- A `STANDARD` submission requires its pre-existing exact Wiki target and one
  uniquely matching source-branch entry. A `NO_WIKI` submission yields
  `SKIPPED_NO_WIKI` and does not prevent `MERGED`; never create a Wiki.
- `UPDATED_ONLINE` requires verified master containment, separate authorization
  for the exact minimal field patch, and a readback of exactly
  `是否上线：是`. A legacy matching entry may insert that field before `环境`.
- `ALREADY_ONLINE` requires a readback of exactly one matching
  `是否上线：是` field and performs no Wiki write.
- The online field denotes verified current-round commit containment in
  `origin/master`, not production publication.
- A failed or unknown external result returns `BLOCKED` and truthfully reports
  completed actions; do not perform later writes.
- The result contains no production-publish claim, runtime/recovery fields,
  local record paths, or private validator response.
