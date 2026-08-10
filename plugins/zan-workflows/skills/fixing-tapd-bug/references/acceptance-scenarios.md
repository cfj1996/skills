# Acceptance scenarios

Replay these composition scenarios before returning a final report. They test
only orchestration boundaries; producer skills remain the authority for their
own rules.

| Scenario | Required orchestration result |
| --- | --- |
| Project evidence is ambiguous, `fixed_branch=feature/order-refactor`, `submission_profile=NO_WIKI`, no master merge request | Invoke only resolver with the fixed constraint. Preserve its blocked/pending definition and return `PAUSED`; do not select a project, call repair/submission/drafter/master, or create/read/write a Wiki. |
| First invocation has no `prior_report`; project evidence is ambiguous | Return a schema-shaped `PAUSED` report containing the resolver artifact and an empty `history.superseded_results`; no later capability is invoked. |
| Fresh invocation receives a resolver-paused immutable `prior_report` and only “继续” | Reuse history, route only to resolver, and request its missing evidence/confirmation. Do not reinterpret “继续” as authorization or advance the chain. |
| Fresh invocation receives `prior_report` plus an explicit project-selection `scope_increment` | Call resolver only with `tapd_url`, fixed constraints, branch mode, and `scope_increment`. After its new definition returns, compare it in the orchestrator with the prior current definition; when replaced, append the old exact definition with its reason and `replaced_by` slot to `history.superseded_results`. Do not invoke repair until the new definition is eligible. |
| Definition is eligible, repair returns `REVIEWED`, submission profile is `NO_WIKI`, and no master request exists | Forward `NO_WIKI` verbatim to submission, then report `NOT_REQUESTED` with `master_merge.result=null`. The orchestrator never directly invokes the Wiki drafter or master capability. |
| Definition is eligible, repair is `BLOCKED` or validation fails | Preserve the definition and blocked reviewed-change result; return `PAUSED` at repair. Do not submit, merge, clean up, or claim a reviewed change. |
| Submission is `BLOCKED` after an observed partial write | Preserve actual submission facts and return `PAUSED` at submission. Do not roll back, compensate, call master, or hide the partial effect. |
| A resumed report is paused at submission authorization and definition/reviewed change are unchanged | Require an exact matching `authorization_increment`, reuse both exact upstream artifacts, and invoke only submission with that increment. Do not call resolver or repair, and do not duplicate their side effects. A generic “继续” or stale/mismatched binding invokes no producer. |
| Submission is `SUBMITTED` and the user explicitly requests master merge | Call master capability with the exact submitted original repair branch, not `develop`, `dev`, a `merge/*` ref, or a rebuilt branch. Report its result without adding release, smoke test, TAPD, test-version, or Wiki-creation work. |
| A resumed report is paused at master authorization and definition/review/submission are unchanged | Require an exact matching `authorization_increment`, reuse all three exact upstream artifacts, and invoke only master with that increment. Do not rerun resolver, repair, or submission. A stale/mismatched binding invokes no producer. |
| Submission is `SUBMITTED` but no explicit master request exists | Finish at submission. A later generic “继续” does not request master merge. |
| A capability result changes after a pause | Retain the old artifact and every now-invalid downstream artifact in `history.superseded_results`, reuse the unchanged prefix, clear only affected suffix slots, and recompute only that suffix after the new eligible handoff. |
| An explicit resolver-owned scope/identity change arrives while paused downstream | Route resolver, require the actual delta in `scope_increment`, preserve the old definition as replaced and only its dependent downstream slots as invalidated, and rerun only the affected suffix. An undeclared immutable request mismatch pauses at request validation instead. |
| Any result/history artifact contains a raw private validator line | Pause as invalid input; do not retain or propagate the line. Accept only producer-owned public mapped states and normalized reasons. |
| Cleanup is not requested | Report `cleanup.status=NOT_REQUESTED`; no branch, worktree, file, Wiki, or remote resource is removed. |
