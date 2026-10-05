# TestSubmissionResult contract

`TestSubmissionResult` is an in-memory handoff to optional `going-live`.

`submission_phase=PLAN` returns an in-memory `PlannedTestSubmission` with the
complete visible `SubmissionPlan`, bound-fact fingerprint, exact
`STANDARD|NO_WIKI`, resolved `DEPLOY|SKIP`, and
`terminal_state=AWAITING_CONFIRMATION`. It has effects `NONE` and is not a
`TestSubmissionResult`.

## Required content

| Section | Required facts |
| --- | --- |
| Inputs | source definition, reviewed change, `INITIAL|CONTINUE`, exact Wiki profile, and `AUTO|DEPLOY|SKIP` deployment mode |
| Repository | expected/actual path, Git root, origin, verification result |
| Authorization | one consolidated plan/confirmation, bound facts, deterministic derived values, and any reauthorization reason |
| Git delivery | original source branch, target `develop`, current-round commits, commit/push/MR/merge results, develop containment |
| Deployment | `DEPLOYED|SKIPPED_BY_INTENT|FAILED|UNKNOWN|NOT_ATTEMPTED`, Jenkins job/environment/ref/version/channel/purpose and trigger/readback evidence when applicable |
| Wiki | `WRITTEN|SKIPPED_BY_POLICY|BLOCKED|NOT_ATTEMPTED`, auto-resolved target plan when written or retained for `going-live`, hierarchy evidence, create/update authorizations and readbacks when written, actual final child ID/URL and source-branch identity when available, business merge-status or tooling current-version/channel readback, and final body when applicable |
| TAPD | exact status action, exact `Bug|Story|Task` Wiki-link result when applicable, duplicate/conflict evidence, and write/readback results |
| Test version | `WRITTEN|SKIPPED_ALREADY_WAITING_TEST|BLOCKED|NOT_ATTEMPTED`, structured payload and readback when written |
| Validation | mapped results for each pre-write operation and final post-write validation |
| Terminal | `SUBMITTED|BLOCKED` and blocker when applicable |

## Invariants

- `PLAN` performs no commit, push, MR, deployment, Wiki, TAPD, status or test
  version write. It always returns and stops at `AWAITING_CONFIRMATION`.
- `EXECUTE` requires the exact current `PlannedTestSubmission` plus a later
  confirmation that answers its visible plan. Initial repair authorization or
  implementation completion cannot be reused as submission authorization.

- `SUBMITTED` requires matching upstream inputs, exact repository and original
  source branch, target exactly `develop`, passing authorization and private
  pre-write validation for every executed write, immediate readback, and
  containment of all current-round commits in `origin/develop`.
- One consolidated submission authorization covers the unchanged Git, Wiki,
  deployment, comment, and final TAPD plan. Deterministically generated commit,
  MR, Wiki, queue, and build identifiers do not create new confirmation points.
- The Git sequence is commit when needed, push when needed, MR create/update,
  then MR merge. Include every step in the displayed validated bundle, perform
  its fresh bound checks, execute and read back before the next.
- One displayed `GIT_DELIVERY_BUNDLE` and pre-write validation cover that
  unchanged sequence; internal fresh checks/readbacks remain mandatory without
  per-step Agent validators. The merge executor supplies the actual delivered
  merge revision and observed target tip; deployment must not confuse the
  original feature SHA with the target merge SHA. Jenkins executes one trigger
  and verifies its exact queue/build, actual parameters and target SCM source.
  A verified package `RELEASED` maps to `DEPLOYED` with its release kind retained
  and no claim that an application environment was deployed.
- `STANDARD` requires either a complete in-memory `ValidatedWikiDraft` with
  `terminal_state=VALIDATED`, its full rendered Markdown and calculated minimal
  patch or new-page body, an auto-resolved
  `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD` target plan, exact
  authorization and readback for each Wiki write, and for the originating
  `Bug|Story|Task` the exact final-child Wiki-link `LINKED|ALREADY_LINKED`
  result before TAPD status and version publication; or a `SKIPPED_BY_POLICY` draft with
  `skip_reason=NON_FUNCTIONAL_CONTINUE`, no rendered body, and no Wiki/comment
  operation. A newly created entry reads back the exact status derived from
  project type: `是否上线：未合并` for a business project, or
  `当前版本：canary|latest` for a tooling/library project.
  Tooling `DEPLOY` requires the successful actual release channel to match
  the draft before Wiki writes; `SKIP` uses existing release evidence or
  preserves a valid existing current-version field, never an inferred publication.
- Wiki creation and functional supplementation plus their comment are one
  `WIKI_WRITE_AND_LINK_BUNDLE` with one pre-invocation validation. Its internal
  readbacks satisfy the per-write invariant without extra Agent validators.
  Bind existing ID/parent/title/original SHA-256 or the new planned month/title.
  Require exact item/branch/Wiki, approved final `bodySha256` and separate
  `wikiState`/`commentState`. `ALREADY_LINKED` describes the comment and may
  accompany successful `wikiState=UPDATED` supplementation.
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
  `origin/develop` SHA was built. `SKIP` performs no Jenkins build/deploy or
  parameter/poll call; exact metadata-only canonical Wiki Job lookup is the
  sole read-only exception. It records
  `SKIPPED_BY_INTENT`. `FAILED|UNKNOWN` forbids later Wiki/status/version writes.
- `INITIAL` writes `待测试`/test version only after
  `DEPLOYED|SKIPPED_BY_INTENT`. `CONTINUE` already in `待测试` performs no status
  or duplicate test-version write.
- Status and test version use one `TAPD_REGISTRATION_BUNDLE`: exact item,
  work mode, automatically resolved workflow/field mappings, current metadata
  hashes and expected old values are confirmed together. One update and one
  readback cover both fields; no per-field Agent validator is needed. Partial
  readback retains actual successful status/version facts without rollback or
  retry. Story/Task never receives Bug workflow states.
- Any failed or unknown action returns `BLOCKED`, reports prior completed
  actions truthfully, and performs no later action.
- Private validator responses are discarded after mapping to public pass/fail
  plus a concise reason.
- The result contains no run IDs, attempt IDs, effect/reconciliation ledger,
  recovery/history fields, local record paths, or generated evidence paths.
