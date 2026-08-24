---
name: submitting-for-test
description: Use when one reviewed TAPD change must be delivered to develop, optionally deployed to the test environment, documented when required, and then marked for test.
---

# Submit for Test

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens write gates.

Consume one `TapdWorkDefinition` and one matching `ReviewedChange`, then return
one in-memory `TestSubmissionResult`. Execute exactly one profile:

- `STANDARD`: Git delivery, optional Jenkins test deployment, Wiki
  draft/write/readback, Bug Wiki-link comment when applicable, and final TAPD
  test registration.
- `NO_WIKI`: Git delivery, optional Jenkins test deployment, and final TAPD
  test registration; never load or invoke Wiki capability.

Read [contracts.md](references/contracts.md),
[submission-rules.md](references/submission-rules.md),
[deployment-and-confirmation.md](references/deployment-and-confirmation.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before writing.

## Input gate

Require:

- definition `READY_FOR_HANDOFF`;
- matching reviewed change `REVIEWED` with `REVIEW_PASSED`;
- exact repository fingerprint and original fixed repair branch;
- one explicit profile `STANDARD|NO_WIKI`; and
- `deployment_mode=AUTO|DEPLOY|SKIP`.

Before the first submission write, require one current-conversation
consolidated authorization binding every displayed submission operation. A
fresh authorization is required only when a bound fact changes.

`STANDARD` does not require a user-supplied Wiki URL. Wiki discovery and
creation planning are producer-owned behavior, not an input gate.

The source is the original `feature/*` or `fixbug/*` branch. Target is exactly
`develop`. Never rebuild the change on `develop` or use `merge/*` as the
business source.

## Procedure

1. Re-read repository, source branch/SHA, `develop` SHA, current diff and
   commits. Verify they match the reviewed change and contain no unrelated
   paths.
2. Resolve `deployment_mode` and, for `DEPLOY`, resolve the exact Jenkins Job,
   test environment, release channel, parameters/version identity, and purpose
   through workspace project knowledge and release-safety rules.
3. Under `STANDARD`, invoke `zan-workflows:drafting-wiki` read-only and require
   one validated target/body plan. Under `NO_WIKI`, set Wiki to
   `SKIPPED_BY_POLICY` without loading Wiki capability.
4. Build and display one consolidated `SubmissionPlan` containing Git, Wiki,
   deployment, deterministic comment, and final TAPD actions. Obtain one
   authorization as defined in
   [deployment-and-confirmation.md](references/deployment-and-confirmation.md).
5. Immediately before each Git write, re-read its bound facts and call the
   private [submission-validator.md](agents/submission-validator.md) with
   `PRE_GIT_WRITE`. Commit when needed, push, create/update and merge the MR,
   reading back each result. Prove every current-round commit is contained in
   `origin/develop`.
6. Resolve the deployment gate:
   - `DEPLOY`: validate `JENKINS_TEST_DEPLOY`, trigger the authorized Jenkins
     Job, follow the real queue/build, require terminal `SUCCESS`, and prove the
     build used the expected `origin/develop` SHA;
   - `SKIP`: make no Jenkins call and record `SKIPPED_BY_INTENT`.
   `FAILED|UNKNOWN` blocks every later Wiki/TAPD write.
7. After `DEPLOYED|SKIPPED_BY_INTENT`, execute the authorized Wiki plan under
   `STANDARD`, validating and reading back each create/update. Derived month,
   child, and Wiki IDs do not require another prompt when they follow the plan.
   Materialize, validate, write, and read the deterministic Bug Wiki-link
   comment. Retain the final Wiki target for `going-live`.
8. Apply the status policy from the work mode: write/read `待测试` and the test
   version only when required; for `CONTINUE` already in `待测试`, record
   `SKIPPED_ALREADY_WAITING_TEST` and perform no duplicate writes. Give all
   readbacks to the validator with `POST_WRITE`; return `SUBMITTED` only on a
   passing verdict.

## Failure behavior

On any mismatch, missing authorization, failed validation, failed call, or
missing readback, return `BLOCKED` with actual completed actions and stop this
Bug. Do not retry automatically, adopt an earlier unknown effect, roll back,
or continue later writes.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. The result exists only for the current in-memory handoff.
