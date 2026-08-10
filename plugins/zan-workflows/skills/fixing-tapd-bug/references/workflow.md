# Composition workflow

This is the orchestration routing table, not a restatement of capability
business rules. Read the linked producer contract whenever the table refers to
a producer state or gate.

| Order | Invoke | Exact input | Continue only when | Pause/result ownership |
| --- | --- | --- | --- | --- |
| 0 | runtime only | `FixingTapdBugRequest`, including a new null `run_id` or existing `run_id` | TAPD URL and exact profile are present; named skills are available; stored request identity and optional prior report match | Persist request/progress first; return `PAUSED` at `request-validation` when invalid. |
| 1 | `zan-workflows:resolving-tapd-work` | Only `tapd_url`, `fixed_project`, `fixed_repo_path`, `fixed_branch`, `branch_mode`, and `scope_increment`, plus runtime envelope | Its producer permits an actionable handoff | Preserve `TapdWorkDefinition` as the invocation output; resolver owns blocked/pending evidence and requested confirmation. |
| 2 | `zan-workflows:repairing-tapd-work` | unchanged `TapdWorkDefinition` | `ReviewedChange.terminal_state=REVIEWED` and its review passes | Preserve definition and change; repair owns location, planning, TDD, verification, and review decisions. |
| 3 | `zan-workflows:submitting-tapd-for-test` | unchanged definition, unchanged reviewed change, exact profile | `TestSubmissionResult.terminal_state=SUBMITTED` | Preserve all three results; submission owns develop, Wiki policy, authorization, writes, and readbacks. |
| 4 | `zan-workflows:merging-tapd-work-to-master` | unchanged submitted result, exact original repair branch, optional existing-Wiki mark request | `MasterMergeResult.terminal_state=MERGED` | Invoke only for an explicit master request. Preserve all results; master capability owns its authorization and readbacks. |
| 5 | none | complete result chain | reporting is formed | The orchestrator owns optional cleanup handling and the final report only. |

## Profile routing

Forward the request profile exactly once to submission:

| Request profile | Orchestrator action | Submission-owned behavior |
| --- | --- | --- |
| `STANDARD` | Invoke submission with `STANDARD`; do not draft a Wiki itself. | Submission invokes `zan-workflows:drafting-tapd-wiki` under its own contract. |
| `NO_WIKI` | Invoke submission with `NO_WIKI`; do not load any Wiki material or capability. | Submission records its producer-defined skip result. |

## Pause and resume

1. Stop at the first capability that is blocked, has a failing validation, or
   is waiting for authorization/required user input.
2. Persist the already-produced artifacts and `next_action`, then return them
   unchanged in `FixingTapdBugReport` with `run_id`. Call runtime
   `record-report` with that exact report before responding.
3. A later invocation must provide that `run_id`, plus any explicit
   `scope_increment` or schema-shaped `authorization_increment`. `prior_report`
   is optional compatibility evidence. Do not read hidden conversation state.
   Route exactly by runtime `current_skill` and the matching pause; invoke only that paused producer
   and reuse all earlier unchanged artifacts.
4. Rerun resolver only for a resolver pause or an explicitly declared change
   to resolver-owned work identity, scope, project, repository, or branch
   constraint. Call it with only its declared input fields. Do not call resolver
   or repair before resuming submission/master when their upstream artifacts
   are unchanged.
5. When any producer replaces an artifact, preserve the old exact artifact and
   every downstream artifact whose input depended on it in
   `history.superseded_results`. Clear and recompute only that affected suffix;
   retain the unaffected prefix unchanged.

| Runtime `current_skill` / last pause | Reuse unchanged | Invoke now | Never replay by default |
| --- | --- | --- | --- |
| `request-validation` | Complete prior report | none | every producer |
| `resolving-tapd-work` | request/history only | resolver | repair/submission/master until eligible |
| `repairing-tapd-work` | definition | repair | resolver |
| `submitting-tapd-for-test` | definition + reviewed change | submission | resolver + repair |
| `merging-tapd-work-to-master` | definition + reviewed change + submission | master | resolver + repair + submission |

For a repair, submission, or master authorization pause, forward only an
`authorization_increment` whose capability, operation, exact confirmation,
timestamp, and scope hash match that paused producer's requested gate. The
producer still re-reads facts and validates the authorization; the orchestrator
does not authorize on its behalf. A generic “继续”, stale binding, or capability
mismatch stays at `request-validation` and invokes no producer.

Pass only the public runtime effect record needed to reconcile an interrupted
submission: effect ID, operation, exact target/payload hashes, status, and any
actual/readback evidence. Never pass a private validator line. An interrupted
submission resumes the same owning invocation when its effect is
`EXECUTING|UNKNOWN`; it reads external state, marks `VERIFIED` only on proven
readback, and otherwise blocks. It may adopt a separately planned exact existing
effect only after explicit bound confirmation.

When invalidating a suffix, identify the first invalid business result and let
the runtime derive its root capability. A nested drafter's root is its owning
submission invocation, so draft changes invalidate and rerun submission rather
than preserving a submission output that consumed the old draft. Never request
suffix invalidation while it contains an `EXECUTING`, `APPLIED`, or `UNKNOWN`
effect; reconcile that external result first.

An explicit resolver-owned upstream change overrides the table only by routing
to resolver and invalidating the affected downstream suffix. It never justifies
replaying an unchanged prefix producer. Put the actual change in
`scope_increment`; `upstream_change.fields/reason` only selects this route.

## Cleanup boundary

The workflow has no implicit deletion or branch/worktree cleanup. After a
terminal chain or a pause, cleanup may be requested as a separate orchestration
action. First identify the exact target from the existing results, display the
planned operation, obtain user authorization, perform it, read it back, and
record the observed result. A refusal, absent authorization, or failed
readback remains visible in `FixingTapdBugReport` and never changes capability
results.
