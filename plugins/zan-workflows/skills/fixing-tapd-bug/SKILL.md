---
name: fixing-tapd-bug
description: Use when the user asks to carry a TAPD Bug through the managed end-to-end workflow.
---

# Fix TAPD Bug

Compose the named capability skills into one bounded Bug workflow. This skill
owns handoff, pausing, resumption, optional cleanup, and the final report; it
does not own project routing, repair, review, Wiki, submission, or merge rules.

Read [contracts.md](references/contracts.md), then
[workflow.md](references/workflow.md), and finally
[acceptance-scenarios.md](references/acceptance-scenarios.md) before acting.

## Workflow runtime record

Read [workflow-runtime.md](../../references/workflow-runtime.md). For a fresh
request without `run_id`, initialize `workflow=fixing-tapd-bug` before invoking
resolver, persist the exact request, and expose the returned `run_id` in the
first progress update and final report. Before every capability call, create a
`begin-skill` record with its exact function input; after every return, call
`finish-skill` with the complete public output, mapped validation state, and
next skill only when eligible. For `STANDARD`, submission must record the Wiki
drafter with `parent_invocation_id=<submission invocation id>`.

For a resumed request, load `resume --run-id <run_id>` before routing. The
runtime record is the cross-invocation source for completed inputs, outputs,
current skill, next action, and pending external effects. A supplied
`prior_report` is optional compatibility evidence and must match the run when
present; pass it to `resume` for exact validation. It is not required for
recovery because `resume` returns the last persisted public report. Never edit
`run.json` manually.

## Required capability skills

All of these named capabilities must be available before starting. Do not
restate, replace, or bypass their contracts or private validation.

- `zan-workflows:resolving-tapd-work`
- `zan-workflows:repairing-tapd-work`
- `zan-workflows:submitting-tapd-for-test`
- `zan-workflows:drafting-tapd-wiki` (owned and invoked by submission only for
  `STANDARD`; this orchestrator does not invoke it directly)
- `zan-workflows:merging-tapd-work-to-master` (optional, only on an explicit
  request)

## Input and handoff boundary

Accept a TAPD URL, optional resolver-only hard constraints
(`fixed_project`, `fixed_repo_path`, `fixed_branch`, and `branch_mode`), an
exact `submission_profile` of `STANDARD` or `NO_WIKI`, and an explicit optional
master-merge request. A resumed non-resolver authorization may be supplied only
as an exact `authorization_increment` bound to the paused capability/operation;
it is never implied by “继续”. A fresh invocation has `run_id=null`; a resumed
invocation must provide the existing `run_id`. `prior_report` may be null when
the runtime already contains the completed producer outputs.
Do not choose a profile, project, repository, branch, or master merge by
default. Pass project/repository/branch constraints only to
`resolving-tapd-work`; they remain hard constraints rather than hints.

Pass only the declared immutable handoffs:

```text
TapdWorkDefinition
  -> ReviewedChange
  -> TestSubmissionResult
  -> MasterMergeResult (only when explicitly requested)
```

Never make, mutate, or rely on a `TapdTaskContext`, an implicit current
directory, hidden conversation state, or a replacement summary as a handoff.
Use the persisted workflow run as the cross-invocation recovery source. Keep
each returned artifact intact in its invocation output and retain its source
with the final report.

## Orchestration procedure

1. Validate the request shape in [contracts.md](references/contracts.md). If a
   required choice is absent or not exact, an existing `run_id` cannot be
   loaded, its stored request conflicts, or a supplied prior report is not
   compatible with that immutable request identity, persist the blocker and
   pause before calling a capability.
2. Choose exactly one entry route. For `run_id=null`, create the run and start
   with `resolving-tapd-work`. For a resume, route strictly by the runtime's
   `current_skill`, current invocation output, and pending effects using the
   table in [workflow.md](references/workflow.md):
   reuse every earlier unchanged artifact and invoke only the paused producer.
   Do not call resolver or repair merely because they are earlier in the fresh
   sequence. A `request-validation` pause invokes no producer.
3. Rerun resolver only when the prior pause capability is
   `resolving-tapd-work`, or explicit new information changes resolver-owned
   work identity, scope, project, repository, or branch constraints. Pass only
   `tapd_url`, `fixed_project`, `fixed_repo_path`, `fixed_branch`,
   `branch_mode`, and `scope_increment`; never pass `prior_report` or another
   artifact. A changed TAPD URL or other immutable request identity denotes a
   new request, not a silent resume.
4. For a repair pause, reuse the exact eligible definition and invoke only
   `repairing-tapd-work`, forwarding only a matching exact authorization
   increment when supplied. For a submission pause, reuse the exact definition
   and reviewed change and invoke only `submitting-tapd-for-test` with the
   unchanged profile and matching exact authorization increment. For a master
   pause, reuse the exact definition, reviewed
   change, and submission and invoke only `merging-tapd-work-to-master` with
   the exact original repair branch, marker request, and matching exact
   authorization increment. Each producer independently verifies the binding;
   the orchestrator never treats it as proof. No resumed route may
   replay an earlier side-effecting producer whose input artifact is unchanged.
   Submission never receives a prior attempt ledger or hidden transaction
   state. If an earlier submission invocation was interrupted or returned an
   unknown/partial effect, the new submission call reconciles each intended
   effect from GitLab/TAPD/Wiki/version readback and requires exact adoption
   confirmation before treating an existing effect as complete.
5. On a fresh route, or after the routed producer returns an eligible
   replacement, continue only through the affected downstream suffix in
   normal order. If an upstream artifact is replaced, move its old exact value
   and every now-invalid downstream artifact to
   `history.superseded_results`, clear only those affected downstream slots,
   and rerun only that suffix. Reuse all unaffected prefix artifacts. Never
   invalidate the whole chain by default.
6. Submission exclusively owns Wiki behavior. Forward `STANDARD` or
   `NO_WIKI` verbatim; this orchestrator must not load, draft, inspect,
   validate, select, or write a Wiki for `NO_WIKI`. Invoke master only after a
   `SUBMITTED` result and only when explicitly requested; otherwise record
   `NOT_REQUESTED` and stop after submission.
7. At every capability boundary, a `BLOCKED`/`PENDING` result, non-passing validation,
   changed upstream fact, missing requirement, or pending user authorization
   pauses the workflow immediately. Preserve all completed artifacts and form
   the resume record; do not call a later capability, create compensating
   work, or claim an unperformed effect. When explicit new information causes
   a producer to replace an upstream artifact, preserve the old exact artifact
   in `history.superseded_results` with its replacement reason and new result
   slot before considering downstream work. Persist the capability output and
   paused `next_action` before responding to the user.
8. Only at the orchestration boundary, produce the final
   `FixingTapdBugReport`. Cleanup is separately optional: identify an eligible
   cleanup target from completed artifacts, show it, obtain specific user
   authorization, perform/read back only the approved cleanup, and record the
   actual outcome. Never hide cleanup inside a capability or make it a
   prerequisite for a truthful report.
9. Before returning any paused or completed `FixingTapdBugReport`, call
   `record-report` with that exact public report. This makes its result chain,
   superseded history, pause route, cleanup state, and summary available to the
   next invocation even when no `prior_report` is supplied.

## Resumption and response

The word “继续” is not authorization and does not repair or discard a blocked
artifact. Resume only from the supplied `run_id`, its recorded immutable
invocation outputs, and the user's explicit new information, routing by
`current_skill` and reusing all earlier unchanged artifacts. Represent a resolver delta only as
`scope_increment` and a non-resolver authorization only as the exact
`authorization_increment`; do not reconstruct a handoff from memory, rerun
resolver/repair unconditionally, or advance beyond the paused producer.

Producer artifacts and `history.superseded_results` may contain only public
mapped validation states and normalized business reasons. Reject and pause on
any artifact that persists a private raw validator line; never copy such a line
into orchestration history.

Return one `FixingTapdBugReport` as defined in
[contracts.md](references/contracts.md). It must contain the real result chain,
the first pause/completion point, the next required action when paused, and
the cleanup outcome plus `run_id`. Persist that exact report with
`record-report`, then stop.
