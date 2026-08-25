# TestSubmissionResult contract

`TestSubmissionResult` is an in-memory handoff to optional `going-live`.

## Required content

| Section | Required facts |
| --- | --- |
| Inputs | source definition, reviewed change, `INITIAL|CONTINUE`, exact Wiki profile, and `AUTO|DEPLOY|SKIP` deployment mode |
| Repository | expected/actual path, Git root, origin, verification result |
| Authorization | one consolidated plan/confirmation, bound facts, deterministic derived values, and any reauthorization reason |
| Git delivery | original source branch, target `develop`, current-round commits, commit/push/MR/merge results, develop containment |
| Deployment | `DEPLOYED|SKIPPED_BY_INTENT|FAILED|UNKNOWN|NOT_ATTEMPTED`, Jenkins job/environment/ref/version/channel/purpose and trigger/readback evidence when applicable |
| Wiki | `WRITTEN|SKIPPED_BY_POLICY|BLOCKED|NOT_ATTEMPTED`, auto-resolved target plan when written or retained for `going-live`, hierarchy evidence, create/update authorizations and readbacks when written, actual final child ID/URL and source-branch identity when available, online-field readback, and final body when applicable |
| TAPD | exact status action, optional exact Bug Wiki-link comment, and write/readback results |
| Test version | `WRITTEN|SKIPPED_ALREADY_WAITING_TEST|BLOCKED|NOT_ATTEMPTED`, structured payload and readback when written |
| Validation | mapped results for each pre-write operation and final post-write validation |
| Terminal | `SUBMITTED|BLOCKED` and blocker when applicable |

## Invariants

- `SUBMITTED` requires matching upstream inputs, exact repository and original
  source branch, target exactly `develop`, passing authorization and private
  pre-write validation for every executed write, immediate readback, and
  containment of all current-round commits in `origin/develop`.
- One consolidated submission authorization covers the unchanged Git, Wiki,
  deployment, comment, and final TAPD plan. Deterministically generated commit,
  MR, Wiki, queue, and build identifiers do not create new confirmation points.
- The Git sequence is commit when needed, push when needed, MR create/update,
  then MR merge. Each step is displayed, validated, executed, and read back
  before the next.
- `STANDARD` requires either a complete in-memory `ValidatedWikiDraft` with
  `terminal_state=VALIDATED`, its full rendered Markdown and calculated minimal
  patch or new-page body, an auto-resolved
  `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD` target plan, exact
  authorization and readback for each Wiki write, and for a Bug the exact
  final-child Wiki-link comment write/readback before TAPD status and version
  publication; or a `SKIPPED_BY_POLICY` draft with
  `skip_reason=NON_FUNCTIONAL_CONTINUE`, no rendered body, and no Wiki/comment
  operation. A newly created entry reads back exactly `是否上线：否`.
- `STANDARD` never requires a Wiki URL from the user. Existing links in
  TAPD details/comments are reused; absent links trigger related-child lookup
  and then month/child creation under root `1150372234001008260` when needed.
- A month page is structural only. The canonical `# 前端` entry body is written
  to the child Wiki, never directly to the `YYYY-MM` page.
- A successful `STANDARD` result retains the exact Wiki target and original
  source branch needed for `going-live` to locate and update the same entry.
- `NO_WIKI` requires `SKIPPED_BY_POLICY`; every Wiki and Wiki-comment operation
  is omitted. It still requires Git delivery, deployment resolution, and
  applicable TAPD registration/readbacks.
- A `STANDARD` `SKIPPED_BY_POLICY` result is allowed only for a proven
  non-functional `CONTINUE`; it omits Wiki and Wiki-comment writes while still
  completing the remaining authorized submission steps.
- `DEPLOY` requires Jenkins terminal `SUCCESS` plus evidence that the expected
  `origin/develop` SHA was built. `SKIP` performs no Jenkins call and records
  `SKIPPED_BY_INTENT`. `FAILED|UNKNOWN` forbids later Wiki/status/version writes.
- `INITIAL` writes `待测试`/test version only after
  `DEPLOYED|SKIPPED_BY_INTENT`. `CONTINUE` already in `待测试` performs no status
  or duplicate test-version write.
- Any failed or unknown action returns `BLOCKED`, reports prior completed
  actions truthfully, and performs no later action.
- Private validator responses are discarded after mapping to public pass/fail
  plus a concise reason.
- The result contains no run IDs, attempt IDs, effect/reconciliation ledger,
  recovery/history fields, local record paths, or generated evidence paths.
