---
name: fixing-tapd-bug
description: Use when a TAPD Bug must be taken from a supplied TAPD URL through independently resolved, repaired, reviewed, and submitted result artifacts, with optional direct original-repair-branch-to-master merge only when the user explicitly requests it.
---

# Fix TAPD Bug

Compose the named capability skills into one bounded Bug workflow. This skill
owns handoff, pausing, resumption, optional cleanup, and the final report; it
does not own project routing, repair, review, Wiki, submission, or merge rules.

Read [contracts.md](references/contracts.md), then
[workflow.md](references/workflow.md), and finally
[acceptance-scenarios.md](references/acceptance-scenarios.md) before acting.

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
master-merge request. Do not choose a profile, project, repository, branch,
or master merge by default. Pass project/repository/branch constraints only to
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
Keep each returned artifact intact and retain its source with the final report.

## Orchestration procedure

1. Validate the request shape in [contracts.md](references/contracts.md). If a
   required choice is absent or not exact, pause before calling a capability.
2. Invoke `zan-workflows:resolving-tapd-work` with the TAPD URL, resolver-only
   constraints, and any explicit user increment. Preserve its returned
   `TapdWorkDefinition`. Do not call repair while the resolver result is
   blocked or identifies required user input/confirmation.
3. Invoke `zan-workflows:repairing-tapd-work` with that unchanged
   `TapdWorkDefinition`. Preserve its returned `ReviewedChange`. Do not call
   submission unless the repair result is `REVIEWED` with its producer's
   required evidence and review verdict.
4. Invoke `zan-workflows:submitting-tapd-for-test` with the unchanged
   definition, unchanged reviewed change, and the exact profile supplied by
   the user. Forward `STANDARD` or `NO_WIKI` verbatim. The submitting skill
   exclusively owns Wiki behavior; in particular, this skill must not load,
   draft, inspect, validate, select, or write a Wiki for `NO_WIKI`.
5. If, and only if, the user explicitly requested a master merge, invoke
   `zan-workflows:merging-tapd-work-to-master` after a `SUBMITTED` result. Give
   it that unchanged submission result and the exact original repair branch
   evidenced by the existing handoffs. Do not substitute `develop`, a
   `merge/*` branch, or a reconstructed branch. Without that explicit request,
   record `NOT_REQUESTED` and stop after submission.
6. At every capability boundary, a `BLOCKED` result, non-passing validation,
   changed upstream fact, missing requirement, or pending user authorization
   pauses the workflow immediately. Preserve all completed artifacts and form
   the resume record; do not call a later capability, create compensating
   work, or claim an unperformed effect.
7. Only at the orchestration boundary, produce the final
   `FixingTapdBugReport`. Cleanup is separately optional: identify an eligible
   cleanup target from completed artifacts, show it, obtain specific user
   authorization, perform/read back only the approved cleanup, and record the
   actual outcome. Never hide cleanup inside a capability or make it a
   prerequisite for a truthful report.

## Resumption and response

The word “继续” is not authorization and does not repair or discard a blocked
artifact. Resume from the earliest paused capability using the retained result
objects plus the user's explicit new information; rerun that capability when
its own contract requires fresh facts or authorization. Do not reconstruct a
handoff from memory or advance to a later capability merely because earlier
artifacts exist.

Return one `FixingTapdBugReport` as defined in
[contracts.md](references/contracts.md). It must contain the real result chain,
the first pause/completion point, the next required action when paused, and
the cleanup outcome. Stop after that report.
