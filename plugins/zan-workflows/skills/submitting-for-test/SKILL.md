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
4. Under `STANDARD`, invoke `zan-workflows:drafting-wiki` with supplied factual
   inputs and consume its complete in-memory `ValidatedWikiDraft`. Require
   `terminal_state=VALIDATED`, then show its complete rendered Markdown and
   exact Wiki target, then
   obtain authorization. Before Wiki write, call the validator with
   `PRE_SUBMISSION_WRITE`. Write/create/update only the authorized page and
   read back the expected patch. For a Bug, materialize the exact Wiki-link
   comment from the real Wiki ID, display it, authorize it separately when the
   ID was not known earlier, validate, write, and read back.
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
