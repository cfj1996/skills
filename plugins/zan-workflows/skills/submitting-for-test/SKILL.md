---
name: submitting-for-test
description: Use when one reviewed TAPD change must be committed, merged to develop, marked for test, and optionally written to a validated Wiki.
---

# Submit for Test

Consume one `TapdWorkDefinition` and one matching `ReviewedChange`, then return
one in-memory `TestSubmissionResult`. Execute exactly one profile:

- `STANDARD`: Git delivery, Wiki draft/write/readback, Bug Wiki-link comment
  when applicable, TAPD status update, and test-version publication.
- `NO_WIKI`: Git delivery, TAPD status update, and test-version publication;
  never load or invoke Wiki capability.

Read [contracts.md](references/contracts.md),
[submission-rules.md](references/submission-rules.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before writing.

## Input gate

Require:

- definition `READY_FOR_HANDOFF`;
- matching reviewed change `REVIEWED` with `REVIEW_PASSED`;
- exact repository fingerprint and original fixed repair branch;
- one explicit profile `STANDARD|NO_WIKI`; and
- current-conversation authorization for each displayed external write that
  requires it.

`STANDARD` does not require a user-supplied Wiki URL. Wiki discovery and
creation planning are producer-owned behavior, not an input gate.

The source is the original `feature/*` or `fixbug/*` branch. Target is exactly
`develop`. Never rebuild the change on `develop` or use `merge/*` as the
business source.

## Procedure

1. Re-read repository, source branch/SHA, `develop` SHA, current diff and
   commits. Verify they match the reviewed change and contain no unrelated
   paths.
2. Display the next required Git operation and exact facts/payload. Obtain
   explicit authorization when required. Immediately before each commit, push,
   MR create/update, and MR merge, re-read the relevant facts and call the
   private [submission-validator.md](agents/submission-validator.md) with
   `PRE_GIT_WRITE` for that one operation. Only `验证通过` permits it. Discard
   the raw line after mapping the result.
3. Execute only the validated operation, then immediately read it back before
   continuing. After merge, prove every current-round commit is contained in
   `origin/develop`.
4. Under `STANDARD`, invoke `zan-workflows:drafting-wiki` with the work
   definition, reviewed change, delivery facts, TAPD identity, and original
   source branch. Consume its complete in-memory `ValidatedWikiDraft` and
   require `terminal_state=VALIDATED`. Show the complete target plan, Markdown,
   and exact create/update payloads, then obtain authorization. Validate each
   Wiki write with `PRE_SUBMISSION_WRITE`:

   - `REUSE_EXISTING`: update only the calculated minimal patch;
   - `CREATE_CHILD`: create the child under the verified existing month;
   - `CREATE_MONTH_AND_CHILD`: create/read back the month under root
     `1150372234001008260`, then display and authorize the child payload with
     the real month ID before creating it.
   Never put the entry body in the month page. Read back the final child and
   require the expected body including `是否上线：否`. Retain its real Wiki ID,
   URL, source branch, body, and readback in `TestSubmissionResult` for
   `going-live`. For a Bug, materialize the fixed Wiki-link comment from the
   final child ID; when that ID was created during this run, display and
   authorize the materialized comment before validating, writing, and reading
   it back.
5. Under `NO_WIKI`, set Wiki to `SKIPPED_BY_POLICY`. Do not load, draft, locate,
   validate, create, update, comment on, or read a Wiki.
6. Display and authorize the exact TAPD status operation and structured test
   version payload. Validate each operation with `PRE_SUBMISSION_WRITE`, write
   it, and read it back before the next operation.
7. Give all final readbacks to the private validator with `POST_WRITE`. Return
   `SUBMITTED` only on a passing verdict and complete required readbacks.

## Failure behavior

On any mismatch, missing authorization, failed validation, failed call, or
missing readback, return `BLOCKED` with actual completed actions and stop this
Bug. Do not retry automatically, adopt an earlier unknown effect, roll back,
or continue later writes.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. The result exists only for the current in-memory handoff.
