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
- required Bug active-state payload was displayed and authorized in the
  current standalone call or confirmed `fixing-bug` checklist, then privately
  validated/written/read back with both status and verified repair-owner
  `current_owner`; or the evidence-backed status action is
  `NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`;
- Bug `NO_CHANGE` proves both active status and the verified repair handler;
  an already-active Bug still owned by a tester needs an authorized correction.
  A waiting-test continuation preserves both state and owner;
- overlapping pre-existing changes have been reconciled or block the work.

## Direct branch rule

Work in the verified project on the fixed branch. Do not create temporary
branches/worktrees, use a detached HEAD, move the work to another branch, or
stash/reset unrelated user changes. Multiple Bugs may intentionally share the
same branch.

## Change and verification

- Use the shared adaptive profile and independent verification risk. Legacy
  calls without a profile use `STANDARD`. Eligible `QUICK` work can use an
  in-memory behavior/evidence/steps/verification brief, without inventing a
  Plan, Task, estimate or schedule. Existing formal Plan/Task blockers remain
  binding; profile selection cannot evade them.
- Diagnose before changing code and keep the implementation within approved
  scope.
- Implement and verify observable behavior slices. Check the highest-impact
  uncertain assumption early, and observe behavior through the public boundary
  relevant to this change. `HIGH` includes affected exceptional, compatibility
  and preserved-behavior cases even for a narrow `QUICK` change.
- Use project-native formatting, static checks, tests, builds, or focused
  reproduction commands relevant to the change.
- Never claim an unrun check passed. Report unavailable or failing required
  checks as blockers.
- Do not create workflow-owned evidence such as `raw.md`, `raw.json`,
  `__test___/<id>`, `.zan-workflows`, or serialized input/output reports.
- Before review, compare the actual final diff/status with the starting
  baseline and exclude unrelated changes.

## Review boundary

The reviewer receives current in-memory facts and the exact source diff. Its
one-line Chinese response is private. Map the response to a public review state
and discard the raw line after extracting a concise failure reason.
Every profile requires this independent review. Supply the applicable Plan,
brief or Bug investigation summary and risk; examine both requested behavior
and engineering design/test
coupling without requiring a fixed number of reviewers.
