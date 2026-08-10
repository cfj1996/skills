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

Expected: `validation_phase=PRE_WRITE` can return `验证通过` without any Wiki,
comment, status, or version readback. It then permits the first Wiki write.
After all permitted effects, `validation_phase=POST_WRITE` must receive and
validate actual merge/status/version and, for `STANDARD`, Wiki/comment
readbacks; an absent or failed readback returns `验证不通过` and a truthful
partial `BLOCKED` result. In `NO_WIKI`, neither phase loads or requires Wiki
material.

## H. Submission consumes only the public repair-review state

Input: a `ReviewedChange` with `terminal_state=REVIEWED` and the producer-mapped
public `review.verdict=REVIEW_PASSED`, without the private reviewer output.

Expected: the submission validator accepts that upstream review gate as
complete and never requests, loads, parses, or persists the repairing skill's
private verdict. A missing or non-passing public mapping blocks submission.
