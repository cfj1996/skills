# Development rules

## Pre-edit gate

Do not edit until all are true:

- the definition is `READY_FOR_HANDOFF` and scope is confirmed;
- actual canonical repository path, Git root, and origin match the definition;
- starting HEAD, current branch, and `git status --short` are known;
- the exact fixed branch is created or selected according to the definition;
- branch creation, when selected, uses the definition's exact verified base
  ref/SHA;
- branch creation/selection has a matching current-conversation confirmation
  source for repository, scope, source/base, target branch, operation and purpose;
- current branch equals that fixed branch; and
- required Bug state/account changes were displayed in Chinese and authorized in the
  current standalone call or confirmed `fixing-bug` checklist, then checked by
  the lead/helper against actual state/owner/member evidence and exact authority
  (independent scrutiny only for a substantive ambiguity), written/read back with
  both status and verified repair-owner
  `current_owner`; or the evidence-backed status action is
  `NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`;
- the concrete preview maps exactly to the internally verified payload/base;
  raw wire fields and full SHA need not be printed to the user;
- Bug `NO_CHANGE` proves both active status and the verified repair handler;
  an already-active Bug still owned by a tester needs an authorized correction.
  A waiting-test continuation preserves both state and owner;
- for a Bug, the start comment under
  [Bug 溯源与修复记录](bug-repair-record.md) is authorized and read back
  (or verified as already present for the current round); Story/Task skips it;
- overlapping pre-existing changes have been reconciled or block the work.

For one Bug spanning repositories, apply the definition/repository/scope checks
to the whole confirmed `work_definitions` set before the first write. Use one
shared status/owner operation and start-comment readback, then create/select each
repository's fixed branch at its source-work boundary. A failure in one required
repository blocks Bug completion, including when other repositories already passed.

## Direct branch rule

Work in the verified project on the fixed branch. Do not create temporary
branches/worktrees, use a detached HEAD, move the work to another branch, or
stash/reset unrelated user changes. Multiple Bugs may intentionally share the
same branch.

## Change and verification

- For multiple steps, use [多任务实施](parallel-execution.md). The lead completes
  shared branch and applicable Bug writes before delegation, assigns disjoint
  write scopes/resources and validates returned changes; workers do not run the
  whole workflow. Stop and confirm related writers have exited before changing
  ownership, shared setup or branches, or doing integration/final review.
- Use the approved brief or applicable formal Plan/Task result. A brief covers
  behavior, evidence, steps and verification without requiring a Plan, Task or
  estimate. Existing formal Plan/Task blockers remain binding. Load schedule
  guidance only when the user requests scheduling or date handling.
- Diagnose before changing code and keep the implementation within approved
  scope.
- Implement and verify observable behavior slices. Check the highest-impact
  uncertain assumption early, and observe behavior through the public boundary
  relevant to this change. Concrete risks determine exceptional, compatibility
  and preserved-behavior cases, including for a narrow change.
- Follow [本地验证范围与资源预算](../../../references/local-verification.md)
  for project-native checks: affected scope first, explicit reasons for full
  checks, bounded execution and one heavy command at a time across workers.
  A tool wait timeout alone does not terminate a check. Preserve required-check
  blockers; do not retry OOM/timeouts with larger heaps or unchanged commands.
- Never claim an unrun check passed. Report unavailable or failing required
  checks as blockers.
- Do not create workflow-owned evidence such as `raw.md`, `raw.json`,
  `__test___/<id>`, `.zan-workflows`, or serialized input/output reports.
- Before review, compare the actual final diff/status with the starting
  baseline and exclude unrelated changes.
- After every required repository and agreed cross-repository acceptance passes
  verification/review, recheck the reviewed source facts and read back the Bug's complete repair
  comment before handoff. A comment failure retains code/review evidence and
  blocks delivery; it does not trigger another repair or duplicate comment.
  Per-repository progress remains actual progress, not independently eligible
  `REVIEWED` results. The final collection shares one complete record/readback.

## Review boundary

The reviewer receives current in-memory facts and the exact source diff. Its
one-line Chinese response is private. Map the response to a public review state
and discard the raw line after extracting a concise failure reason.
Every implementation requires this independent review. Supply the applicable Plan,
brief or Bug investigation summary and risk; examine both requested behavior
and engineering design/test
coupling without requiring a fixed number of reviewers.
