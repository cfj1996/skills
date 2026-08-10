---
name: merging-tapd-work-to-master
description: Use when an already submitted TAPD change must optionally merge its original repair branch directly to master, with verified readback and an optional confirmed marker on an existing Wiki.
---

# Merge TAPD Work to Master

Return exactly one `MasterMergeResult` and stop. This is an optional, narrow
post-submission transaction. It merges only the original repair branch directly
to `master`; it is not test submission, production publishing, a smoke-test
workflow, or a TAPD-update workflow.

## Inputs, boundary, and result

Read [contracts.md](references/contracts.md), then
[acceptance-scenarios.md](references/acceptance-scenarios.md), before any
write. Accept only all of the following:

- a `TestSubmissionResult` with `terminal_state=SUBMITTED`, whose upstream
  repository fingerprint, review, develop-merge readback, and current-round
  commit containment all passed;
- the original repair branch, exactly matching the submitted source branch; and
- an optional request to mark an already identified Wiki `已合并`.

The original repair branch must be the business `feature/*` or `fixbug/*`
branch from the submitted result. Never substitute a `merge/*` intermediary,
`develop`, `dev`, `master`, a release branch, or a newly rebuilt branch. Never
create a Wiki. Missing Wiki is a normal `SKIPPED_NO_WIKI` outcome, including
when the user requested a marker but no existing Wiki can be identified.

Use [master-merge-validator.md](agents/master-merge-validator.md) as an
isolated, read-only private validator. It may return only `验证通过` or
`验证不通过：<原因>`; keep its response private. Map it immediately at the
producer boundary to `NOT_RUN`, `VALIDATION_PASSED`, or `VALIDATION_FAILED`.
Persist only the mapped state and a normalized business failure reason; never
store the raw private line in `MasterMergeResult` or orchestration history. Run it as
`validation_phase=PRE_WRITE` after facts and every applicable authorization
are collected, but before creating/updating/merging an MR or writing a Wiki.
Do not continue on a non-passing verdict.

## Procedure

1. Re-verify the repository fingerprint against `TestSubmissionResult` and use
   the approved GitLab mapping to read the actual original source ref,
   `master` ref, MR state, and exact current-round commit list. Record
   `expected_source_ref_sha`, `expected_target_master_ref_sha`, and, when
   needed to explain inherited history, `merge_base_sha`. The expected source
   is the supplied original repair branch and the expected target is exactly
   `master`. Record legal inherited-source history separately; never add it to
   this round's commits or promote unrelated `develop` changes.
2. Display `MergeConfirmationGate` with the expected and actual repository,
   source, target, current-round commits, inherited-base differences, planned
   MR/merge operation, purpose, `expected_source_ref_sha`, and
   `expected_target_master_ref_sha`. Obtain explicit current-conversation
   authorization that binds the displayed immutable source and `master` SHA
   facts; record them as `confirmed_source_ref_sha` and
   `confirmed_target_master_ref_sha`. If any displayed fact changes, invalidate
   that authorization, redisplay all actual facts, and obtain a fresh
   authorization.
3. For an existing Wiki marker request, read the identified Wiki first. Display
   its exact target, the smallest `已合并` patch, and the full resulting body.
   Obtain a separate explicit authorization for that exact Wiki update. If no
   existing Wiki is identified, record `SKIPPED_NO_WIKI`; do not draft, create,
   search for a replacement, or treat absence as a failure.
4. Assemble the planned `MasterMergeResult` facts and run private
   `PRE_WRITE` validation. Map and discard the raw response. Only
   `VALIDATION_PASSED` permits execution. This phase checks only evidence and
   planned effects that exist before the first write; it must not require merge
   or Wiki readback that has not happened.
5. Immediately before creating, updating, or merging the MR, re-read the
   actual source and `master` SHA values. Record
   `execution_preflight_source_ref_sha` and
   `execution_preflight_target_master_ref_sha`; both must equal the confirmed
   SHA snapshot. Any source or `master` head change invalidates authorization:
   stop, re-verify, redisplay the new facts, obtain a fresh authorization, and
   re-run `PRE_WRITE` until its mapped state is `VALIDATION_PASSED`. Only then
   create or update the direct source-to-master
   MR as needed and merge it. Read back the MR/merge state,
   `execution_post_master_ref_sha`, and prove that every approved current-round
   commit is contained in `origin/master`. A conflict, failed pipeline or
   merge, wrong source/target/SHA, or incomplete containment is `BLOCKED`;
   preserve actual effects and do not write a Wiki marker.
6. If an existing Wiki marker was separately authorized, run `WikiWriteGate`,
   apply only the confirmed minimal `已合并` patch, and read the same Wiki back.
   If its readback lacks the patch, return a truthful partial `BLOCKED` result;
   do not perform any compensating or unrelated write.
7. Form the complete result with all actual facts, authorization text,
   merge/readback, optional Wiki result, scope exclusions, and public mapped
   validation state. Return the one `MasterMergeResult` and stop immediately.

## Hard stops and exclusions

- `develop -> master` and `dev -> master` are always forbidden. Unrelated
  `develop` commits must never be substituted for the original repair branch.
- Do not publish a production version, run smoke tests, change TAPD status or
  comments, publish a test version, create a Wiki, or start another workflow.
- Missing/blocked upstream submission, a source mismatch, non-`master` target,
  changed commit list, missing authorization, failing validation, failed merge,
  or missing readback returns `BLOCKED` with observed facts and no invented
  effects.
- A Wiki marker is optional and can be written only to an already identified
  Wiki after exact-body confirmation; a marker request never authorizes Wiki
  creation or another TAPD write.
