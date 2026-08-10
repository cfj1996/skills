# Acceptance scenarios

Replay these composition scenarios before returning a final report. They test
only orchestration boundaries; producer skills remain the authority for their
own rules.

| Scenario | Required orchestration result |
| --- | --- |
| Project evidence is ambiguous, `fixed_branch=feature/order-refactor`, `submission_profile=NO_WIKI`, no master merge request | Invoke only resolver with the fixed constraint. Preserve its blocked/pending definition and return `PAUSED`; do not select a project, call repair/submission/drafter/master, or create/read/write a Wiki. |
| First invocation has no `prior_report`; project evidence is ambiguous | Return a schema-shaped `PAUSED` report containing the resolver artifact and an empty `history.superseded_results`; no later capability is invoked. |
| Fresh invocation receives that complete immutable `prior_report` and only “继续” | All immutable identity fields must equal the prior request; only `scope_increment` may differ. Call resolver only with its declared request fields and `scope_increment`; keep the prior artifact in the orchestrator and request the resolver's missing evidence/confirmation. Do not reinterpret “继续” as authorization or advance the chain. |
| Fresh invocation receives `prior_report` plus an explicit project-selection `scope_increment` | Call resolver only with `tapd_url`, fixed constraints, branch mode, and `scope_increment`. After its new definition returns, compare it in the orchestrator with the prior current definition; when replaced, append the old exact definition with its reason and `replaced_by` slot to `history.superseded_results`. Do not invoke repair until the new definition is eligible. |
| Definition is eligible, repair returns `REVIEWED`, submission profile is `NO_WIKI`, and no master request exists | Forward `NO_WIKI` verbatim to submission, then report `NOT_REQUESTED` with `master_merge.result=null`. The orchestrator never directly invokes the Wiki drafter or master capability. |
| Definition is eligible, repair is `BLOCKED` or validation fails | Preserve the definition and blocked reviewed-change result; return `PAUSED` at repair. Do not submit, merge, clean up, or claim a reviewed change. |
| Submission is `BLOCKED` after an observed partial write | Preserve actual submission facts and return `PAUSED` at submission. Do not roll back, compensate, call master, or hide the partial effect. |
| Submission is `SUBMITTED` and the user explicitly requests master merge | Call master capability with the exact submitted original repair branch, not `develop`, `dev`, a `merge/*` ref, or a rebuilt branch. Report its result without adding release, smoke test, TAPD, test-version, or Wiki-creation work. |
| Submission is `SUBMITTED` but no explicit master request exists | Finish at submission. A later generic “继续” does not request master merge. |
| A capability result changes after a pause | Retain the old artifact in `history.superseded_results` with its reason and replacement slot, resume from its owning capability with the explicit new information, and wait for its new eligible handoff before downstream work. |
| Cleanup is not requested | Report `cleanup.status=NOT_REQUESTED`; no branch, worktree, file, Wiki, or remote resource is removed. |
