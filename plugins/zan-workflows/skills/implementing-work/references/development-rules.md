# Development rules

## Pre-edit gate

Do not edit until all are true:

- the definition is `READY_FOR_HANDOFF` and scope is confirmed;
- actual canonical repository path, Git root, and origin match the definition;
- starting HEAD, current branch, and `git status --short` are known;
- the exact fixed branch is created or selected according to the definition;
- branch creation, when selected, uses the definition's exact verified base
  ref/SHA;
- current branch equals that fixed branch; and
- required TAPD active-state payload was displayed and authorized in the
  current standalone call or confirmed `fixing-bug` checklist, then privately
  validated/written/read back; or the evidence-backed status action is
  `NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST`;
- overlapping pre-existing changes have been reconciled or block the work.

## Direct branch rule

Work in the verified project on the fixed branch. Do not create temporary
branches/worktrees, use a detached HEAD, move the work to another branch, or
stash/reset unrelated user changes. Multiple Bugs may intentionally share the
same branch.

## Change and verification

- Diagnose before changing code and keep the implementation within approved
  scope.
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
