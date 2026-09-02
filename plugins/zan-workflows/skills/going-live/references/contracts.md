# MasterMergeResult contract

`MasterMergeResult` is an in-memory result of one direct original-branch to
`master` transaction.

## Required content

| Section | Required facts |
| --- | --- |
| Submission | upstream `SUBMITTED` result and original repair branch |
| Repository | expected/actual path, Git root, origin, verification result |
| Merge | source/target branches and SHAs, current-round commits, authorization, MR result, merge readback, master containment |
| Wiki | `UPDATED_MERGED|ALREADY_MERGED|SKIPPED_TOOL_PROJECT|SKIPPED_NO_WIKI|BLOCKED|NOT_ATTEMPTED`, matching branch entry, project type, before/after merge status, target/patch authorization, and readback when used |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Terminal | `MERGED|BLOCKED` and blocker when applicable |

## Invariants

- `MERGED` requires the original submitted `feature/*` or `fixbug/*` source,
  target exactly `master`, matching expected/actual source and target SHAs at
  execution, explicit merge authorization, passing pre-write validation,
  successful merge readback, and containment of every current-round commit.
- `develop -> master`, `dev -> master`, `merge/*`, release branches, or a
  substituted source are always blocked.
- A `STANDARD` submission, including `SKIPPED_BY_POLICY`, requires its
  pre-existing exact Wiki target and one uniquely matching source-branch entry.
  A tooling project yields `SKIPPED_TOOL_PROJECT` after verifying exactly
  `是否上线：无需上线` and performs no Wiki write. A `NO_WIKI`
  submission yields `SKIPPED_NO_WIKI` and does not prevent `MERGED`; never
  create a Wiki.
- `UPDATED_MERGED` requires verified master containment, separate authorization
  for the exact minimal field patch, and a readback of exactly
  `是否上线：已合并`. The authorized patch must replace exactly one
  `是否上线：未合并` field. Missing or non-current values block; no migration
  or insertion is allowed.
- `ALREADY_MERGED` requires a readback of exactly one matching
  `是否上线：已合并` field and performs no Wiki write.
- The merge-status field denotes current-round commit containment in
  `origin/master`; it does not claim that a production version was published.
  `无需上线` is reserved for tooling/library projects.
- `SKIPPED_TOOL_PROJECT` has no Wiki patch and requires no Wiki-write
  authorization.
- A failed or unknown external result returns `BLOCKED` and truthfully reports
  completed actions; do not perform later writes.
- The result contains no production-publish claim, runtime/recovery fields,
  local record paths, or private validator response.
