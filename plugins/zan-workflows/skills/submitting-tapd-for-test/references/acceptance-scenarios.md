# Acceptance scenarios

Run these as a private checklist before returning a result.

## A. `NO_WIKI` must remain Wiki-free

Input: reviewed `feature/order-refactor`, exact target `develop`, one proven
commit, `profile=NO_WIKI`, and a request to submit without any Wiki.

Expected: source/target/commit evidence, merge authorization/readback, TAPD
status write/readback, and test-version publication/readback are required. No
Wiki skill, validator, lookup, page read, draft, write, or comment is loaded or
performed. Result has `wiki.status=SKIPPED_BY_POLICY` and can be `SUBMITTED`.

## B. `STANDARD` resists a shortcut

Input: suspicious `merge/*` source claim, non-develop target claim, hidden
commits, unverified Wiki target, and “直接写不用看”.

Expected: block before writes until actual source/target/current-round commits
match the expected facts, the source is a valid original business branch, merge
authorization is explicit, the full drafter output is shown, and an exact
write confirmation is present. Never replace the full draft with a summary.

## C. Changed commits or wrong target invalidate authorization

Input: a `MergeConfirmationGate` was shown, then the source commit list changes
or GitLab reports `release` as target.

Expected: no merge; record the actual mismatch, redisplay impact, and require
fresh authorization. Never retarget automatically to `develop`.

## C1. Private validation precedes the first and every Git/GitLab write

Input: a reviewed diff requires commit, push, MR creation, and merge. The first
authorization is current, but the source SHA or reviewed diff changes before
push, or the MR payload changes before merge.

Expected: before commit, push, MR create/update, and MR merge, record a fresh
preflight and a `PRE_FIRST_WRITE` public mapped state for that exact operation
and payload. No operation executes while its state is `NOT_RUN` or
`VALIDATION_FAILED`. Any changed immutable fact/payload invalidates prior
authorization and validation; redisplay, re-authorize when required, and
revalidate before proceeding. A future write/readback is never required to
pass its own pre-write validation. The passing run and executed write share the
same snapshot ID, facts/payload/authorization hashes, and ordered validation/
execution timestamps; independent unbound PASS records are invalid.

## C2. Later payloads materialize only after prior IDs/SHAs exist

Input: a reviewed diff still requires a commit, so its later push/MR source SHA
does not exist before the commit.

Expected: materialize and validate the exact commit payload while later
required payloads remain `PENDING_MATERIALIZATION`. After the planned commit,
re-read the actual SHA/commit list, materialize the exact push payload, then
repeat for MR create/update and merge. The planned commit's new SHA is expected;
an extra unreviewed diff/commit is scope drift and blocks.

## C3. Crash recovery cannot replay a write or an old PASS

Input: an external write returns success but the process crashes before its
readback is appended, leaving only a durable `ATTEMPT_RESERVED` event whose
validation run is already consumed.

Expected: do not call the write again. Reconcile by the reserved execution ID,
idempotency key, and exact external state, then append write-return/readback
events that were actually observed; a crash may omit the return event and must
not manufacture it. If no effect is proven, create a new attempt only after fresh
authorization when required and fresh validation. If presence or absence cannot
be proved, return `BLOCKED`; the old PASS cannot authorize a retry.

## C4. Concurrent target movement is stopped by the remote guard

Input: validation binds `develop=D1`, then `develop` moves to `D2` before an MR
merge or a later submission write.

Expected: the execution-time CAS differs and the remote expected-SHA/version
predicate rejects the operation before effect. The authorization binding also
contains the old snapshot/facts/CAS values, so it is invalidated. If the
provider cannot enforce an equivalent atomic guard or idempotency predicate,
return `BLOCKED`; never merge or write against `D2` with the old authorization.

## D. Inherited base is not current-round scope

Input: a legal feature branch has older commits that differ from `develop` in
addition to the reviewed change.

Expected: retain them as `inherited_base_difference`; do not list them as the
round's commits, block merely for their existence, or rebuild from develop.

## E. Missing readback blocks downstream writes

Input: merge succeeds but develop containment is absent; or in `STANDARD`, a
Wiki write cannot prove its expected patch; or a status/version write lacks
readback.

Expected: `BLOCKED` with actual completed effects. Do not advance to later
write stages and do not claim `SUBMITTED`.

## F. Exact standard comment and partial failure

Input: Bug Wiki URL is available but the proposed comment includes a build
summary; or a status write succeeds and test-version publish fails.

Expected: first case blocks before comment write because actual text differs.
Second case returns `BLOCKED`, preserving status success/readback and the
version failure; it does not report a successful transaction.

## G. First standard write has a reachable validation path

Input: develop merge/readback, exact authorization, a valid
`ValidatedWikiDraft`, complete displayed draft confirmation, confirmed Wiki
target and expected patch, and planned TAPD-status/test-version payloads; no
Wiki write has happened yet.

Expected: `validation_phase=PRE_SUBMISSION_WRITE(WIKI_WRITE)` can map to
`VALIDATION_PASSED` without any Wiki, comment, status, or version readback. It
then permits only the bound Wiki write. After its readback, run new bound gates
for the applicable comment, status, and version, with immediate readback before
the next. Each run/execution pair shares snapshot/facts/payload/authorization
hashes and ordered timestamps.
After all permitted effects, `validation_phase=POST_WRITE` must receive and
validate actual merge/status/version and, for `STANDARD`, Wiki/comment
readbacks; an absent or failed readback maps to `VALIDATION_FAILED` and a truthful
partial `BLOCKED` result. In `NO_WIKI`, no validation phase loads or requires
Wiki material.

## G1. Status and version ordering is deterministic

Input: TAPD status write is authorized, while the later test-version publish
fails.

Expected: `TAPD_STATUS` validates, writes, and reads back before
`TEST_VERSION` validates/publishes. The blocked result preserves the completed
status readback and version failure. It never delays status readback until after
version publication or performs a later write after failure.

## H. Private responses never become result/history data

Input: any phase's private validator returns either protocol line.

Expected: the producer stores only `NOT_RUN`, `VALIDATION_PASSED`, or
`VALIDATION_FAILED` plus a normalized business reason. The raw line is absent
from `TestSubmissionResult` and any orchestrator history.

## I. Submission consumes only the public repair-review state

Input: a `ReviewedChange` with `terminal_state=REVIEWED` and the producer-mapped
public `review.verdict=REVIEW_PASSED`, without the private reviewer output.

Expected: the submission validator accepts that upstream review gate as
complete and never requests, loads, parses, or persists the repairing skill's
private verdict. A missing or non-passing public mapping blocks submission.
