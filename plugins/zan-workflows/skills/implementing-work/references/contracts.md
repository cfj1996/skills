# ReviewedChange contract

`ReviewedChange` is the in-memory implementation result. An `IMPLEMENT`
request ends here; a later authorized delivery request may pass a still-current
result to `submitting-for-test` after its current-state checks.

A single Bug or one Story with its selected Tasks may supply `work_definitions`,
retaining every approved single-project `TapdWorkDefinition`. Requirement inputs
must prove the same parent Story and selected scope; grouping grants no sibling
Task access. Multiple project definitions may share the
same canonical repo/origin/fixed-branch key; preserve all their scope and
acceptance, require consistent branch facts, and group execution by that key.
The result is `reviewed_changes`, one ordinary result per unique repository key,
covering all its original definitions rather than overwriting them during grouping.
Single-definition input/output is unchanged. The collection shares one confirmed
scope and required project set. A Bug also shares its status/repair account and
complete repair record; Story/Task has no Bug record/state obligation. This is
not a new persisted schema or a queue of unrelated work items.

## Required content

| Section | Required facts |
| --- | --- |
| Source | TAPD URL/type/short ID and approved scope from the original definition(s); preserve selected Task/step attribution when grouping |
| Execution input | approved scope, concrete risks and the applicable formal Plan/Task contract, in-memory `implementationBrief`, or Bug investigation/implementation summary |
| Repository | expected and actual project, path, Git root, origin, starting/final HEAD |
| Branch | action `CREATE|USE_EXISTING`, expected branch, actual branch, exact approved base ref/SHA when created, and reusable current-conversation confirmation source |
| TAPD status | item type and `WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`; current status/owner, verified repairOwner account/workspace/source/member evidence, combined status+owner target/payload/purpose, authorization source, validation/write/readback only for a Bug `WRITE_ACTIVE` |
| Baseline | before/after status, changed paths, unrelated paths, scope comparison |
| Change | concise summary and exact diff reference available in the current execution |
| Change consistency | per material behavior: approved basis, actual added/changed/removed behavior and diff/call-path evidence, direct/indirect impact, verification/gaps and documentation correction needed; full pending-delivery baseline and last-reviewed delta, including manual edits, under [shared rules](../../../references/change-consistency.md) |
| Verification | each relevant command, exit status, concise result, and any blocker |
| Schedule (only when requested) | optional `scheduleRecommendation`: remaining effort, owner capacity/source, dependencies, proposed dates or conditional workday window, assumptions/risks and `writeState=NOT_WRITTEN`; grants no date/status write authority |
| Review | `REVIEW_PASSED|REVIEW_FAILED|NOT_RUN` and normalized reason |
| Bug repair record | Bug only: exact item/comment account, matching record authorization, created/reused comment IDs and bodies/readbacks for the current round, introduction evidence or explicit unknowns, and actual repair/verification result; Story/Task is not applicable |
| Terminal | `REVIEWED|BLOCKED` and blocker when applicable |

## Invariants

- [多任务实施](parallel-execution.md) governs dependency batches, unique write
  ownership, shared operations and stopped-writer checks. Delegation is an
  execution choice within approved scope, not additional authority or a new
  readiness state. Keep task/path attribution and actual checks in the existing
  Change/Verification/Review sections. Worker reports alone cannot establish
  whole-scope success; all required work, integration and independent review
  must pass before a single or grouped `REVIEWED` handoff.
- A brief contains behavior, exclusions, evidence, ordered steps and verification
  with no material unresolved implementation facts. It reuses the approved
  definition without requiring a formal Plan, Task breakdown or estimate.
  Formal requirement Task/Plan work retains `TASKS_READY` and complete task
  checks. Bug work has no requirement-only Task/Plan gates.
- Verification follows concrete affected risks, including relevant failure paths,
  compatibility and preserved behavior. Scheduling is optional and request-driven.
- Formal Task handoffs retain current independent estimate-review bindings or
  verified unchanged historical hours under [effort estimation](../../breaking-down-requirement/references/effort-estimation.md).
  Scope/total-effort changes reopen only affected assessment and confirmation;
  internal remaining-work predictions never replace the Task value. Completed
  code or budget deviation alone neither authorizes effort writes nor proves
  an estimate was reasonable. User-requested retrospectives reuse actual
  change/impact/verification evidence, without creating a ledger or judging
  work-hour truthfulness from patch size.
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
- Path membership alone does not prove behavioral scope. Review the shared
  change-consistency facts against current requirements and the actual diff;
  preserve still-required behavior and include affected consumers. Refresh only
  checks invalidated by subsequent changes. Existing Wiki/repair records and
  prior review success cannot cover an unseen continuation delta.
- For requirement work, follow [需求任务关联](../../developing-requirement/references/task-linked-delivery.md).
  Formal Task/Plan work reuses the selected Tasks' verified parent Story, project/fixed branch and Plan
  steps from `proposal`/`taskBreakdown`/`records` and `tasks[].tapdTaskKey`.
  Keep available Task/step and F/API/DEP/AC/E/RR references in the existing
  Change, Verification and Review sections; add no required schema or ledger.
  Attribute checks/reviews only to the Tasks, steps and acceptance they actually
  cover. A project lint result or shared MR does not prove every Task accepted
  or the whole Story complete. Gaps name the affected selected Task/step/acceptance
  in existing blocker text, with the responsible party and completion condition.
  Missing IDs or unsaved Plans must not produce invented links or force new
  Tasks, Plans or branches. Associations authorize no Task status, comment,
  estimate, date or description writes; REUSE does not rewrite old descriptions.
  Any write still requires its existing preview, confirmation and readback.
  Brief-based work uses its actual selected Story/Task; absent formal
  taskBreakdown/Plan/step fields are not prerequisites on that path. Apply the
  same scope/evidence attribution limits to whatever facts are actually present.
- Relevant verification must be truthful. Missing or failing required project
  checks block; ordinary project tests may be part of the source change, but no
  workflow evidence files are created.
- `REVIEWED` requires independent review and public
  `review=REVIEW_PASSED`. Review covers requested behavior and engineering
  design/test coupling. The private reviewer line
  is never returned or persisted.
- A required TAPD active-state write requires an exact Chinese state/account
  preview mapping to the verified internal payload, authorization,
  `PRE_STATUS_WRITE=VALIDATION_PASSED`, and matching readback before source
  edits. Final review uses a separate `POST_CHANGE_REVIEW` call.
- In a grouped Bug, verify every required repository definition before the
  first write, then perform the common state/owner operation and start record
  once. Its verified effect replaces the old shared status snapshot for later
  repository steps; it is not external drift or a reason to repeat the write.
  Each repository still receives its own branch, diff, verification and review
  checks. Required cross-repository acceptance belongs to the Bug's complete scope.
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
  This applies to every definition in a grouped requirement; grouping does not
  create Bug records, Task status writes, or a shared status transition.
- Apply [Bug 溯源与修复记录](bug-repair-record.md). A Bug `REVIEWED` requires
  verified start and completion comments (created or safely reused), independent
  of submission/Wiki. Start readback precedes source edits; completion follows
  passing verification/review and precedes handoff. A failed completion readback
  returns `BLOCKED` while retaining the actual code/review result. Unknown
  historical cause/author/time is explicit, never invented or inferred solely
  from the current handler or last modifier. Comment-only recovery may reuse
  a verified complete record covering the current repair without retroactively
  posting a start comment or redoing source work. Story/Task has no such comments.
- Grouped Bug closure requires passing current verification and independent
  review for every required repository plus agreed cross-repository acceptance.
  Revalidate source/diff facts before the single completion comment; refresh
  only invalidated checks. All `reviewed_changes` then share that complete
  record/readback. Missing or blocked repositories cannot be omitted, marked
  `REVIEWED`, or submitted separately to close the Bug. Return `BLOCKED` with
  actual per-repository work until the whole scope and record are verified.
  Resume from verified effects; a comment-only failure does not repeat source
  work, status changes or start comments. No new stage enum or ledger is needed.
- The result grants no commit, push, MR, submission, Wiki, or release authority.
- MR, build and Wiki associations belong to the existing delivery result only
  after they actually exist in a later authorized stage; IMPLEMENT does not
  require them in advance.
- The result contains no run IDs, recovery/history fields, or local record
  paths.
