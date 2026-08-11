# TestSubmissionResult contract

`TestSubmissionResult` is an in-memory handoff to optional `going-live`.

## Required content

| Section | Required facts |
| --- | --- |
| Inputs | source definition, reviewed change, exact profile |
| Repository | expected/actual path, Git root, origin, verification result |
| Git delivery | original source branch, target `develop`, current-round commits, authorization, commit/push/MR/merge results, develop containment |
| Wiki | `WRITTEN|SKIPPED_BY_POLICY|BLOCKED|NOT_ATTEMPTED`, full draft/target/patch authorization and readback when applicable |
| TAPD | exact status operation, optional exact Bug Wiki-link comment, write/readback results |
| Test version | structured authorized payload, publish result, readback |
| Validation | mapped results for each pre-write operation and final post-write validation |
| Terminal | `SUBMITTED|BLOCKED` and blocker when applicable |

## Invariants

- `SUBMITTED` requires matching upstream inputs, exact repository and original
  source branch, target exactly `develop`, passing authorization and private
  pre-write validation for every executed write, immediate readback, and
  containment of all current-round commits in `origin/develop`.
- The Git sequence is commit when needed, push when needed, MR create/update,
  then MR merge. Each step is displayed, validated, executed, and read back
  before the next.
- `STANDARD` requires a complete in-memory `ValidatedWikiDraft` with
  `terminal_state=VALIDATED`, its full rendered Markdown, exact target/body
  authorization, Wiki write/readback, and for a Bug the exact Wiki-link comment
  write/readback before TAPD status and version publication.
- `NO_WIKI` requires `SKIPPED_BY_POLICY`; every Wiki and Wiki-comment operation
  is omitted. It still requires Git delivery, TAPD status, version, and their
  validation/readbacks.
- TAPD status is written/read back before the test version is published/read
  back.
- Any failed or unknown action returns `BLOCKED`, reports prior completed
  actions truthfully, and performs no later action.
- Private validator responses are discarded after mapping to public pass/fail
  plus a concise reason.
- The result contains no run IDs, attempt IDs, effect/reconciliation ledger,
  recovery/history fields, local record paths, or generated evidence paths.
