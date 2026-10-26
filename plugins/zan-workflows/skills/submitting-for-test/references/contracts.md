# TestSubmissionResult contract

`TestSubmissionResult` is an in-memory handoff to optional `going-live`.

`submission_phase=PLAN` returns an in-memory `PlannedTestSubmission` with the
complete `SubmissionPlan` (visible for standalone confirmation or material changes), bound-fact fingerprint, exact
`STANDARD|NO_WIKI`, resolved `DEPLOY|SKIP`, and
`terminal_state=AWAITING_CONFIRMATION`. It has effects `NONE` and is not a
`TestSubmissionResult`.

## Required content

| Section | Required facts |
| --- | --- |
| Inputs | one source definition/reviewed change pair or a Bug's `work_definitions`/`reviewed_changes` collections matched by canonical repository/root, origin and fixed branch; shared Bug identity/repair-record readbacks and all required repository evidence;  `INITIAL|CONTINUE`, exact Wiki profile, and `AUTO|DEPLOY|SKIP` deployment mode |
| Repository | expected/actual path, Git root, origin, verification result |
| Authorization | complete execution checklist and actual human confirmation from a main entry, or the standalone plan's own confirmation; current scope-coverage comparison, exact technical plan/bound facts, deterministic derivations, and any reauthorization reason |
| Git delivery | per repository: original source branch/SHA, verified confirmed test target (`dev` or `develop`), current-round commits, commit/push/MR/merge results, actual-target containment |
| Conflict handoff | when A → C → B was used, exact ConflictMergeHandoff including original A/B, C MR/revisions/containment, temporary resources, upfront cleanup authority, latest retention policy and per-resource cleanup/deferred outcome; retain it even if C is absent |
| Deployment | `BUILD_SUBMITTED|DEPLOYED|SKIPPED_BY_INTENT|FAILED|UNKNOWN|NOT_ATTEMPTED`, Jenkins job/environment/ref/version/channel/purpose and trigger/readback evidence when applicable |
| Shared Wiki | `sharedWikiPlan`, `wikiOwner` (workspace/type/ID), owner/Task relationship readback, one target per Story/Bug, repository+branch entry identities, complete combined body/hash, all comment targets and included project gates; same final page ID in every participating result |
| Wiki | `WRITTEN|SKIPPED_BY_POLICY|BLOCKED|NOT_ATTEMPTED`, auto-resolved target plan when written or retained for `going-live`, hierarchy evidence, create/update authorizations and readbacks when written, actual final child ID/URL and source-branch identity when available, business merge-status or tooling current-version/channel readback, and final body when applicable |
| Change consistency | current reviewed behavior/basis/impact/verification and full delivery delta under [shared rules](../../../references/change-consistency.md); STANDARD draft/readback coverage of content, impact and verification, scoped corrections or evidenced unchanged result; exact TAPD and available Wiki links for MR descriptions |
| TAPD | exact status action, waiting-test owner and source (`te` or `reporter`) for Bug transitions, owner write/readback result, exact `Bug|Story|Task` Wiki-link result when applicable, duplicate/conflict evidence, and write/readback results |
| Test version | `WRITTEN|SKIPPED_ALREADY_WAITING_TEST|BLOCKED|NOT_ATTEMPTED`, structured payload and readback when written |
| Validation | mapped results for each pre-write operation and final post-write validation |
| Terminal | `SUBMITTED|BLOCKED` and blocker when applicable |

## Direct-submission continuation

Apply [direct-submission.md](direct-submission.md) for independently requested
existing-change delivery. Reuse original scope/branches and still-current
verification/review; refresh invalidated checks and independent review after
human edits. A previous IMPLEMENT endpoint is not this new request's deployment
choice or delivery authority. “直接提测” does not imply SKIP. Show the actual
standalone delivery checklist and obtain its matching confirmation before writes;
never rerun business implementation or invent a missing READY/REVIEWED handoff.

## Invariants

- Direct Bug record-only refresh follows `direct-submission.md`: when manual
  edits invalidate the old completion record, PLAN may carry a reviewed
  corrected body after all current code/repository/acceptance checks pass.
  This is a read-only preview, not a complete REVIEWED handoff. The same exact
  checklist confirms the Bug/account/body and append/reuse action; at EXECUTE
  write/reuse and read back that one record first, then refresh every matching
  ReviewedChange before any delivery write. Other missing evidence still blocks.
  A valid current record is reused. Failure blocks delivery without repeating
  code work, status activation, start comments or unknown comment writes.

- Explicit checklist choices are preserved. Without overrides, selected test
  delivery defaults to merge plus `STANDARD` and `DEPLOY`, including `AUTO`;
  defaults do not authorize writes or override explicit non-delivery scope.
  No separate preference question is needed. The initial checklist shows all three
  choices, with a canonical template preview when Wiki is requested. That
  preview alone is not `ValidatedWikiDraft` or write authority. A confirmed
  complete checklist can authorize its evidence-based completion and the
  scoped Wiki/comment writes; exact body/patch validation remains required.
  The visible pre-approval/revised checklist is 确定清单; only its confirmed
  current content is 执行清单. Per-project merge/deploy choices and one shared
  Story/Bug Wiki choice remain distinct.
- Material scope/approach/operation or merge/Wiki/deployment changes require
  the complete current checklist/plan and applicable Wiki content to be shown
  again before execution confirmation. Retain completed effects and omit their
  repeated writes. Unchanged approvals and deterministic receipts retain their
  original reuse rules.
- `PLAN` performs no commit, push, MR, deployment, Wiki, TAPD, status or test
  version write. Its `AWAITING_CONFIRMATION` result is a read-only technical
  preview. A standalone call displays it and waits for its own human approval.
  In a main workflow, the orchestrator may immediately consume existing matching
  complete execution-checklist authority and proceed without another user turn.
- `EXECUTE` requires the exact current `PlannedTestSubmission` and either that
  confirmed complete execution checklist or a matching standalone confirmation.
  Apply [confirmation reuse](../../../references/execution-checklist.md#执行清单的确认复用);
  repair-only authorization, completion, an old summary or a true flag alone
  cannot establish submission authority. No new runtime state/model is needed.

- `SUBMITTED` requires every necessary repository's matching upstream inputs,
  exact repository/original source and confirmed test target (`dev` or
  `develop`), passing authorization and private pre-write validation for every
  executed write, immediate readback, and containment of all current-round
  commits in that repository's exact remote target. Never replace an upstream
  confirmed `dev` with `develop`, or the reverse.
- For one Bug across repositories, normalize the existing singular inputs or
  `work_definitions`/`reviewed_changes` collections into delivery rows; match
  canonical repository/root, origin and fixed branch, never array order.
  Several subproject definitions may share that key; retain every definition's
  scope/acceptance while using one reviewed result and one Git operation per key.
  Missing required repositories, mismatched Bug identity or missing review/
  cross-repository acceptance/shared completion-record readback block the plan.
  One `SubmissionPlan` binds each row's independent source SHA, actual target
  and deployment choice. Execute existing helpers per repository; only after
  every selected Git/deployment gate passes write the shared Wiki/comments and
  register the Bug once. A first successful repository cannot mark it waiting
  for test while another required repository is incomplete.
- One consolidated submission authorization covers the unchanged Git, Wiki,
  deployment, comment, and final TAPD plan. Deterministically generated commit,
  MR, Wiki, queue, and build identifiers do not create new confirmation points.
- The Git sequence is commit when needed, push when needed, MR create/update,
  then MR merge. Include every step in the displayed validated bundle, perform
  its fresh bound checks, execute and read back before the next.
  For a test target already containing the reviewed source, a merge helper
  `VERIFIED`/`VERIFY_CONTAINMENT_ONLY` receipt with exact refs/SHA, containment
  and writes=0 satisfies Git delivery without an MR or merge readback. A
  disabled merge uses read-only `CONTAINMENT_ONLY`; missing/unknown containment
  blocks, never authorizes a merge. Bind its actual target `deliveredSha` for
  testing and do not use this receipt as a master MR/cleanup proof.
- A conflict covered by the confirmed main execution checklist, or its own
  standalone ACB confirmation, uses the shared
  [A → C → B flow](../../../references/conflict-merge.md). A remains the
  original business branch; C's exact MR and A/C containment in B are distinct
  evidence, not a substituted business source. Standalone ACB confirmation
  includes default local/remote C and temporary-worktree cleanup; a main
  checklist's automatic resolution alone does not grant deletion. When exact
  conditional cleanup was explicitly covered, verified
  merge and safety checks trigger that unchanged scope without another prompt.
  User retention revokes the affected deletion authority and survives go-live.
  Preserve exact related-branch association and cleanup outcomes in the handoff.
- One displayed `GIT_DELIVERY_BUNDLE` and pre-write validation cover that
  unchanged sequence; internal fresh checks/readbacks remain mandatory without
  per-step Agent validators. The merge executor supplies the actual delivered
  merge revision and observed target tip; deployment must not confuse the
  original feature SHA with the target merge SHA. Jenkins executes one trigger
  with `completionMode=TRIGGER_ACCEPTED`, checks the exact accepted queue URL/ID,
  and returns `BUILD_SUBMITTED`; retain Job, source ref/SHA and submitted params
  as `deploymentReceipt`. No queue/build/log polling is performed. Report only
  build submission, including for canary packages, never completed deployment,
  publication, actual checkout SHA or an invented package version.
- `STANDARD` requires either a complete in-memory `ValidatedWikiDraft` with
  current change/impact/document coverage, checked before any delivery write,
  `terminal_state=VALIDATED`, its full rendered Markdown and calculated minimal
  patch or new-page body, an auto-resolved
  `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD` target plan, exact
  authorization and readback for each Wiki write, and for the originating
  `Bug|Story|Task` the exact final-child Wiki-link `LINKED|ALREADY_LINKED`
  result before TAPD status and version publication; or a `SKIPPED_BY_POLICY` draft with
  `skip_reason=NON_FUNCTIONAL_CONTINUE`, a verified owner page and each included
  repository/branch entry with exact target/body readback, no rendered body,
  and no Wiki/comment operation. A newly created entry reads back the exact status derived from
  project type: `是否上线：未合并` for a business project, or
  `当前版本：canary|latest|待发布` for a tooling/library project.
  An accepted tooling build is not publication evidence: preserve an evidenced
  current channel, or use `当前版本：待发布` when none exists. Only verified
  publication may update the channel. `SKIP` keeps its existing evidence rules.
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
  An existing same-title page without owner-link evidence blocks; a matching
  repository/branch alone never authorizes automatic reuse.
- A month page is structural only. The canonical `# 前端` entry body is written
  to the child Wiki, never directly to the `YYYY-MM` page.
- A successful `STANDARD` result retains the exact Wiki target and original
  source branch needed for `going-live` to locate and update the same entry.
- `NO_WIKI` requires `SKIPPED_BY_POLICY`; every Wiki and Wiki-comment operation
  is omitted. It still requires Git delivery, deployment resolution, and
  applicable TAPD registration/readbacks.
- A Wiki update or valid link does not prove scope or impact correctness. Both
  remain separately reviewed, including manual and continuation changes. Fix
  stale content in the matching entry; do not merely append an already-listed
  page name. NO_WIKI exempts only document operations, not these code checks.
- A `STANDARD` `SKIPPED_BY_POLICY` result is allowed only for a proven
  non-functional `CONTINUE` with a verified existing owner page/current entries
  and exact retained readback; it omits Wiki and Wiki-comment writes while still
  completing the remaining authorized submission steps. Missing history uses
  the normal draft path; unresolved evidence blocks before delivery writes.
- `DEPLOY` uses `completionMode=TRIGGER_ACCEPTED` and requires the exact accepted
  Jenkins queue receipt for the confirmed delivered test-target ref/SHA and
  parameters. `BUILD_SUBMITTED` permits Wiki/TAPD without waiting for a build.
  A missing/failed/unknown trigger blocks and must never be retried automatically.
  `DEPLOYED` remains valid only with terminal SUCCESS and actual SCM proof.
  `SKIP` performs no Jenkins build/deploy or
  parameter/poll call; exact metadata-only canonical Wiki Job lookup is the
  sole read-only exception. It records
  `SKIPPED_BY_INTENT`. `FAILED|UNKNOWN` forbids later Wiki/status/version writes.
- `INITIAL` writes `待测试`/waiting-test owner/test version only after
  `BUILD_SUBMITTED|DEPLOYED|SKIPPED_BY_INTENT`. `CONTINUE` already in `待测试` performs no status
  or owner write, or duplicate test-version write.
- Status, waiting-test owner and test version use one
  `TAPD_REGISTRATION_BUNDLE`: exact item,
  work mode, automatically resolved workflow/field mappings, current metadata
  hashes and expected old values are confirmed together. Bug transitions set
  `current_owner` from non-empty `te`, otherwise `reporter`; missing both blocks.
  The preview binds old owner/tester/reporter values; drift requires a fresh
  plan. One update and one readback cover the written fields; no per-field
  Agent validator is needed. Partial readback retains actual successful
  status/owner/version facts without rollback or retry. Story/Task never
  receives Bug workflow states.
- Any failed or unknown action returns `BLOCKED`, reports prior completed
  actions truthfully, and performs no later action.
- Private validator responses are discarded after mapping to public pass/fail
  plus a concise reason.
- The result contains no run IDs, attempt IDs, effect/reconciliation ledger,
  recovery/history fields, local record paths, or generated evidence paths.
