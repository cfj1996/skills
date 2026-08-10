---
name: submitting-tapd-for-test
description: Use when a reviewed TAPD Bug, Story, or Task change must be submitted as a single test-delivery transaction using exactly the STANDARD or NO_WIKI policy, including verified merge to develop, TAPD status and test-version write/readback, and optional confirmed Wiki writeback.
---

# Submit TAPD for Test

Produce exactly one `TestSubmissionResult` and stop. This skill executes a
test-submission transaction; it is not a repair, a master merge, or a
production-release workflow.

## Inputs, boundary, and result

Read [contracts.md](references/contracts.md), then
[submission-rules.md](references/submission-rules.md), before any write.
Accept only all of the following:

- an approved `TapdWorkDefinition`;
- a `ReviewedChange` with `terminal_state=REVIEWED` and
  `review.verdict=REVIEW_PASSED`; and
- `profile=STANDARD` or `profile=NO_WIKI` exactly.

This skill has no persistent transaction context and never accepts a hidden or
previous invocation's attempt ledger. If an earlier invocation ended without
returning a result, the next call is a new invocation: rebuild the intended
operation from these immutable inputs and reconcile it from the target
system's current read-only state. Never infer success from an old validation
line, execution ID, conversation summary, or unreturned in-memory event.

The upstream results are evidence, not authorization for a commit, push, MR,
merge, TAPD write, Wiki write, or test-version publication. Missing, changed,
or inconsistent evidence is a blocked result. Never infer a repository,
source branch, target branch, commit, project, service, user confirmation, or
successful external effect.

Use the same isolated, read-only validator described in
[agents/submission-validator.md](agents/submission-validator.md) at every
required phase. Its
only permitted response is `验证通过` or `验证不通过：<原因>`; keep all responses
private and map each response immediately at the producer boundary to
`NOT_RUN`, `VALIDATION_PASSED`, or `VALIDATION_FAILED`. Persist only the mapped
state and a normalized business `failure_reason`; never retain the raw private
line in `TestSubmissionResult` or orchestration history.

- `validation_phase=PRE_FIRST_WRITE` runs before **any** commit, push, MR
  create/update, or MR merge. Run it once for the first planned operation and
  again immediately before every subsequent Git/GitLab write. It validates the
  repository, source/target refs and SHAs, exact reviewed diff/current-round
  commits, the exact operation payload, and the operation's authorization.
  It must not require a commit, push, MR, merge, or readback that has not yet
  happened.
- `validation_phase=PRE_SUBMISSION_WRITE` runs after the develop-merge readback
  and immediately before each applicable Wiki, TAPD-comment, TAPD-status, or
  test-version write. It validates only the profile,
  source/target/current-round commits, current authorization, and the exact
  operation payload; for Wiki it includes the `ValidatedWikiDraft`, target,
  patch, and full-draft confirmation. It must not require a write/readback that
  has not happened.
- Execute each planned write only after its current private phase maps to
  `VALIDATION_PASSED`. Then run
  `validation_phase=POST_WRITE` with actual merge, Wiki, comment, status,
  version, and readback evidence. A post-write failure stops any remaining
  action and returns a truthful partial `BLOCKED` result.

## Common transaction procedure

1. Re-verify the exact repository fingerprint from `ReviewedChange` and read
   the actual source ref, target ref, MR state, current-round commits, and
   `origin/develop` containment using the approved GitLab mapping. The target
   must be exactly `develop`; do not silently substitute `dev`, `release`, or
   another branch. Separate legal inherited-base differences from this round's
   commits. Inherited commits are recorded but neither presented as this
   submission nor used to force a cherry-pick/rebuilt branch.
2. Assemble `GitDeliveryWritePlan` in execution order. Materialize the exact
   payload only for the next operation; mark later required payloads
   `PENDING_MATERIALIZATION` until prior writes produce their immutable IDs or
   SHAs. Before each operation, materialize and show its exact payload: commit
   uses reviewed diff hash/paths and message; push uses actual remote/refspec/
   commit SHAs; MR create/update uses source/target/title/body/source SHA; MR
   merge uses actual MR ID/source SHA/target SHA/target and all merge options.
   Every Git/GitLab payload carries an operation-specific atomic expected-state
   guard: a source-ref expected SHA for commit, an expected remote SHA or
   `ABSENT` lease for push, exact source/target SHAs for MR create/update, and
   exact source/target SHAs for merge. If the provider cannot enforce the
   expected SHA/lease or an equivalent atomic predicate, block before writing.
   Mark
   inapplicable operations explicitly. Obtain every authorization required for
   the now-exact operation; record an evidenced `NOT_REQUIRED` only where
   policy truly requires none.
3. Before the first and every later commit/push/MR/merge operation, re-read the
   repository fingerprint, source and target ref SHAs, reviewed diff hash, and
   exact current-round commits. Run private `PRE_FIRST_WRITE` for the one
   operation and its exact payload/authorization. If any immutable fact or
   payload differs from the validated/authorized snapshot, do not write:
   invalidate the mapped validation state and authorization, redisplay the new
   facts, obtain any required fresh authorization, and revalidate. Commit/push,
   create/update the MR, and merge to `develop` only through these per-operation
   gates. Before validating a new write, read the target system and compare its
   exact current state with the intended effect. If the exact effect is already
   present, show that readback and require explicit confirmation to adopt it as
   `ADOPTED_EXISTING_EFFECT`; do not call the write. If the effect is proved
   absent, validate and execute one new write with the current atomic guard or
   idempotency predicate. If presence or absence is ambiguous, return
   `BLOCKED`. Record only the current invocation's state check, validation,
   execution return, and readback in the returned result; these records are
   audit output, not a cross-invocation recovery store. Then read
   back MR/merge state and `origin/develop` containment of
   every current-round commit. A conflict, failed pipeline, failed merge, or
   missing containment blocks all later submission writes. A planned commit's
   resulting source SHA is expected materialization, not drift: rebuild and
   validate the later push/MR payload from that actual SHA only after commit
   readback proves its actual tree/diff equals the reviewed diff. Any unreviewed
   diff or extra commit is scope drift and blocks rather than becoming
   reauthorizable. The chronologically last validation run before execution
   must pass and match that operation's exact snapshot; a later failed run invalidates
   every older pass in this invocation. A later invocation cannot reuse any
   validation result from this invocation; it must perform the external-state
   check and fresh validation again.
4. Select the profile procedure below. Do not downgrade `STANDARD` to
   `NO_WIKI`, and do not use a missing Wiki to block `NO_WIKI`.
5. Complete the profile preparation. Immediately before each applicable
   `WIKI_WRITE`, `TAPD_COMMENT`, `TAPD_STATUS`, and `TEST_VERSION` operation,
   re-read the repository, source/target, exact current-round commits, profile,
   target, and exact payload; bind them to one snapshot ID, payload hash,
   authorization-binding hash, source/target ref SHAs, reviewed diff hash, and
   timestamp. Run private
   `PRE_SUBMISSION_WRITE` for that one operation and stop unless it maps to
   `VALIDATION_PASSED`. Any change invalidates that operation's validation and
   authorization and requires redisplay, fresh authorization when required,
   and a new run. Execute in dependency order with immediate readback:
   Wiki write/readback, applicable comment write/readback, TAPD status
   write/readback, then test-version publish/readback. Preserve actual IDs,
   values, timestamps, and evidence URLs or errors before considering the next
   operation.
   Each validation/execution pair must share canonical snapshot/facts/payload/
   authorization hashes and a compare-and-swap token. The authorization scope
   includes the snapshot/facts/CAS values. Apply the same external-state check:
   adopt an already-present exact effect only after explicit confirmation;
   otherwise validate one new write, or block when presence is ambiguous. The
   remote request must enforce the CAS/version predicate or an idempotency key;
   if neither is available, block. Preserve the current invocation's ordered
   validation, execution-return, and readback timestamps.
6. After the last readback, hash the complete immutable result/readback bundle
   and run a fresh private `POST_WRITE` validation using that exact hash and
   actual effects. Record the validator run ID/input/final-readback hashes and
   timestamp, then map and discard its raw response. Any later artifact change
   invalidates the POST result. If it maps to `VALIDATION_FAILED`,
   stop and form a truthful partial `BLOCKED` result;
   do not attempt another write to repair, conceal, or complete the transaction.
7. Re-read [acceptance-scenarios.md](references/acceptance-scenarios.md), form
   the complete result with every actual readback, and return the single
   `TestSubmissionResult`. Stop immediately; do not begin a master merge,
   cleanup workflow, or additional write.

## `STANDARD`: mandatory Wiki transaction

After the develop-merge readback and before any Wiki/TAPD write, invoke
`zan-workflows:drafting-tapd-wiki`. It is mandatory and remains read-only:

1. Give it evidenced facts, including the original `feature/*` or `fixbug/*`
   source branch (never a `merge/*` intermediary), any existing Wiki body, and
   preservation context. Require a valid full Markdown draft. A blocked draft
   blocks submission.
2. Determine the Wiki target from TAPD detail and comments, preserve an
   existing TAPD Wiki when present, and read the target before writing. Show
   the **entire final draft/body** and exact write target to the user. Obtain
   explicit authorization for this exact draft/target/Wiki operation. Before
   each later comment, TAPD status, and test-version operation, show and obtain
   authorization for its exact materialized payload. For an existing Wiki ID,
   the exact comment may be confirmed at this point; for Wiki creation, do not
   claim an exact comment yet. A summary, partial body, placeholder comment, or
   a request to “write directly” is not confirmation.
3. Give the evidenced full draft, target, patch, confirmation, and planned
   exact Wiki-write payload to `PRE_SUBMISSION_WRITE(WIKI_WRITE)`. Only a
   `VALIDATION_PASSED` mapped state permits that Wiki write; this phase must
   not demand a successful Wiki,
   comment, status, or version readback because none exists yet.
4. Run `WikiWriteGate`, write the smallest confirmed patch, then read the Wiki
   back. Do not create a replacement Wiki when the TAPD already identifies one.
   If the expected patch is absent after readback, stop before comment or TAPD
   state update. When this operation created the Wiki, use its read-back real
   Wiki ID to materialize the exact comment, display it, obtain separate exact
   authorization, and run `PRE_SUBMISSION_WRITE(TAPD_COMMENT)` before writing.
5. For a Bug, write only the exact comment generated from the final Wiki URL:
   `提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`.
   Record `TAPD_COMMENT_GATE`; any extra text, changed link, or newline blocks
   the comment. Record comment readback. For a Story/Task, record the
   type-appropriate permitted comment/state payload and its readback.

## `NO_WIKI`: policy-isolated transaction

Do **not** load, invoke, inspect, validate, draft, select, read, create,
update, or comment a Wiki. In particular, never load
`zan-workflows:drafting-tapd-wiki`, its validator, or Wiki templates. Do not
ask for a Wiki confirmation and do not treat a missing Wiki as a failure.

After the common merge readback, obtain explicit authorization for the exact
TAPD-status and test-version payloads. Run separate
`PRE_SUBMISSION_WRITE(TAPD_STATUS)` and
`PRE_SUBMISSION_WRITE(TEST_VERSION)` gates immediately before their operations,
without loading or supplying any Wiki material. On each mapped
`VALIDATION_PASSED`, perform only that write and read it back before the next,
then run `POST_WRITE` without requiring or loading Wiki evidence. Set
`wiki.status=SKIPPED_BY_POLICY`, with no Wiki target, draft, write, comment, or
readback evidence. Return the normal result even though its Wiki fields are
skipped.

## Hard stops

- A profile other than the two exact values, a blocked upstream result, wrong
  repository, wrong target, changed current-round commits, missing merge
  authorization, or failed merge/readback is `BLOCKED`.
- Never write TAPD status or publish a test version before the develop merge is
  read back. In `STANDARD`, never write the comment or status before successful
  Wiki readback.
- Never expose validator prose, manufacture readback evidence, mark a partial
  transaction successful, or continue after returning `TestSubmissionResult`.
