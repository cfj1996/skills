# Acceptance scenarios

Run these as a private checklist before returning a result.

## A. Direct original repair branch excludes unrelated develop work

Input: a `SUBMITTED` result for `fixbug/123`, one approved current-round
commit, unrelated commits on `develop`, and a request to merge to `master`.

Expected: display actual `fixbug/123`, `master`, and the one commit; merge only
that source through the confirmed direct MR. Never substitute or merge
`develop`, and record inherited history separately from current-round scope.

## B. Wrong source blocks before authorization

Input: the submission source is `fixbug/123`, but the supplied branch is
`merge/fixbug-123-to-develop`, `develop`, `dev`, `master`, `release/1`, or a
different feature branch.

Expected: `BLOCKED` before MR creation. A same commit, same title, or previous
develop merge never makes a non-original source acceptable.

## C. Missing or stale merge authorization blocks

Input: “这个 Bug 上线”, a confirmation without source/target/operation/purpose,
or a confirmation followed by a changed source, target, or commit list.

Expected: no merge. Show actual repository/source/`master`/commits and obtain
fresh authorization for the exact direct MR/merge; changed facts invalidate an
earlier authorization.

## C1. Master head SHA is part of authorization

Input: `fixbug/123` and `master` names are displayed, but the target
`master` ref SHA is absent; or the user confirms source SHA `a1` and master SHA
`b1`, then preflight reads master SHA `b2` (or source SHA `a2`).

Expected: the gate displays and binds `expected_source_ref_sha`,
`confirmed_source_ref_sha`, `expected_target_master_ref_sha`, and
`confirmed_target_master_ref_sha` (and `merge_base_sha` when needed). Missing
SHA evidence blocks private `PRE_WRITE` validation. A changed
`execution_preflight_source_ref_sha` or
`execution_preflight_target_master_ref_sha` invalidates prior authorization;
re-read all facts, re-run validation, and obtain a fresh confirmation before
any MR action. Record the confirmed, preflight, and
`execution_post_master_ref_sha` chain in the result.

## D. No Wiki is a normal successful branch

Input: all merge facts/readbacks pass and no existing Wiki is identified, or
the user does not request a marker.

Expected: `wiki.status=SKIPPED_NO_WIKI`, no Wiki lookup beyond identifying the
provided target, no draft/create/write/readback, and a normal `MERGED` result.

## E. Existing Wiki marker is separately bounded

Input: an existing Wiki is identified and the user asks to mark it `已合并`.

Expected: read it, display exact target/full resulting body/minimal patch, get
separate authorization, then update only that page after `PRE_WRITE` passes.
Read back the patch. Missing marker readback returns partial `BLOCKED`; never
create a replacement Wiki or write TAPD status/comment.

## F. Changed facts and incomplete merge readback are terminal

Input: `master` changes after confirmation, the MR targets another branch, the
MR merge succeeds but one approved commit lacks `origin/master` containment,
or the pipeline/conflict fails.

Expected: invalidate authorization when facts change; otherwise preserve actual
effects in `BLOCKED`. Do not write a selected Wiki marker after failed merge
evidence and do not attempt release, smoke tests, TAPD updates, or retries.

## G. PRE_WRITE has a reachable path

Input: submitted upstream evidence, matching original repair source/master/
commits, current merge and optional Wiki confirmations, and planned payloads;
no MR merge or Wiki update has occurred.

Expected: private `validation_phase=PRE_WRITE` returns `验证通过` without
requiring future merge, containment, Wiki write, or Wiki readback evidence.
Only then may the direct MR/merge begin.
