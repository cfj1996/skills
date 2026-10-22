# ReviewedChange contract

`ReviewedChange` is the in-memory implementation result. An `IMPLEMENT`
request ends here; a later authorized delivery request may pass a still-current
result to `submitting-for-test` after its current-state checks.

## Required content

| Section | Required facts |
| --- | --- |
| Source | TAPD URL/type/short ID and approved scope from the definition |
| Execution input | resolved `workflow_profile=QUICK|STANDARD|FULL`, independent `verification_risk=NORMAL|HIGH`, and the applicable formal Plan/Task contract, eligible in-memory `implementationBrief`, or Bug investigation/implementation summary |
| Repository | expected and actual project, path, Git root, origin, starting/final HEAD |
| Branch | action `CREATE|USE_EXISTING`, expected branch, actual branch, exact approved base ref/SHA when created, and reusable current-conversation confirmation source |
| TAPD status | item type and `WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`; current status/owner, verified repairOwner account/workspace/source/member evidence, combined status+owner target/payload/purpose, authorization source, validation/write/readback only for a Bug `WRITE_ACTIVE` |
| Baseline | before/after status, changed paths, unrelated paths, scope comparison |
| Change | concise summary and exact diff reference available in the current execution |
| Verification | each relevant command, exit status, concise result, and any blocker |
| Schedule (formal requirement Task/Plan only) | shared or standalone `scheduleRecommendation`: current remaining effort, owner capacity/source, dependencies, proposed dates or conditional workday window, assumptions/risks, and `writeState=NOT_WRITTEN`; a recommendation grants no date/status write authority. Pure QUICK brief and Bug flows do not require estimates or scheduling. |
| Review | `REVIEW_PASSED|REVIEW_FAILED|NOT_RUN` and normalized reason |
| Terminal | `REVIEWED|BLOCKED` and blocker when applicable |

## Invariants

- Omitted profile means legacy `STANDARD`. An eligible `QUICK` brief contains
  `behaviors`, `exclusions`, `evidence`, `steps` and `verification`, with no
  material unresolved implementation facts; it reuses the approved definition.
  It does not require a formal Plan, Task breakdown, estimate or schedule.
  An existing formal Plan/Task breakdown retains its checks and blockers in
  every profile. `STANDARD|FULL` requirement work requires `TASKS_READY`;
  Bug work never gains requirement-only Task/Plan gates from a profile.
- Profile never reduces authorization or risk verification. `HIGH` checks the
  affected failure paths, compatibility and preserved behavior even in `QUICK`.
- `REVIEWED` requires the actual repository fingerprint to match the prepared
  definition and the actual current branch to equal the fixed branch.
- `CREATE` uses only the definition's verified base ref/SHA; missing or changed
  base evidence blocks before branch creation.
- Branch creation/selection requires the definition's matching confirmation
  source. A changed visible project, scope, base, branch, operation or purpose
  blocks; matching facts must not trigger another prompt.
- `USE_EXISTING` does not require prior association with the current Bug. It
  requires only the approved repository/ref identity and a usable scope
  baseline.
- The final changed paths must fit the approved scope. Pre-existing unrelated
  changes remain unrelated and are never attributed to this work.
- Relevant verification must be truthful. Missing or failing required project
  checks block; ordinary project tests may be part of the source change, but no
  workflow evidence files are created.
- `REVIEWED` requires independent review in every profile and public
  `review=REVIEW_PASSED`. Review covers requested behavior and engineering
  design/test coupling. The private reviewer line
  is never returned or persisted.
- A required TAPD active-state write requires exact display, authorization,
  `PRE_STATUS_WRITE=VALIDATION_PASSED`, and matching readback before source
  edits. Final review uses a separate `POST_CHANGE_REVIEW` call.
- Apply [修复中状态与处理人](bug-repair-owner.md): the write and readback must
  include both status and `current_owner`. Already-active state alone cannot
  select `NO_CHANGE`; verify the handler too. Missing/incorrect/partial owner
  readback blocks source edits without an automatic retry or rollback.
- A matching current-conversation `fixing-bug` checklist authorization is
  reusable and must not trigger another prompt. `CONTINUE` with current status
  `待测试` performs no status write; `NO_CHANGE`/skip states require current
  status evidence but no write authorization.
- Story/Task requires `NOT_APPLICABLE_NON_BUG` and has no Bug status payload,
  authorization, validation, write, or readback.
- The result grants no commit, push, MR, submission, Wiki, or release authority.
- The result contains no run IDs, recovery/history fields, or local record
  paths.
