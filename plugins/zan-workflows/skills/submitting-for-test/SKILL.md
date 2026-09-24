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
  draft/write/readback, idempotent Wiki-link comment for the originating
  `Bug|Story|Task`, and final TAPD test registration.
- `NO_WIKI`: Git delivery, optional Jenkins test deployment, and final TAPD
  test registration; never load or invoke Wiki capability.

Read [contracts.md](references/contracts.md),
[submission-rules.md](references/submission-rules.md),
[deployment-and-confirmation.md](references/deployment-and-confirmation.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before writing.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.

Accept `submission_phase=PLAN|EXECUTE`. The first invocation is always `PLAN`:
it is read-only, returns the complete plan and stops. `EXECUTE` requires that
exact current plan plus a later current-conversation confirmation.

Carry the `ReviewedChange`, work definition, Git snapshot, TAPD item and Wiki
target through both phases. `PLAN` does not repeat implementation review or
project routing. `EXECUTE` refreshes only mutable facts that bind an authorized
write (source/develop refs, current diff, TAPD state, Wiki body/comment and
deployment target); unchanged skill text, knowledge files and unrelated
history do not need another read. Batch independent read-only checks, then
stop on the first actual mismatch. Never rerun the full Wiki discovery after
the exact target was identified in `PLAN`.

## Input gate

Require:

- definition `READY_FOR_HANDOFF`;
- matching reviewed change `REVIEWED` with `REVIEW_PASSED`;
- exact repository fingerprint and original fixed repair branch;
- one explicit profile `STANDARD|NO_WIKI`; and
- `deployment_mode=AUTO|DEPLOY|SKIP`.

For `EXECUTE`, also require one `PlannedTestSubmission` with
`terminal_state=AWAITING_CONFIRMATION` and confirmation of its exact visible
operation set. Initial repair/scope authorization is not sufficient.

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
3. Under `STANDARD`, pass the resolved `DEPLOY|SKIP` and available parameter
   evidence to `zan-workflows:drafting-wiki`, invoke it read-only, and require
   either one validated target/body plan or a
   `SKIPPED_BY_POLICY` result proven to be `NON_FUNCTIONAL_CONTINUE`. Under
   `NO_WIKI`, set Wiki to `SKIPPED_BY_POLICY` without loading Wiki capability.
   Reuse the item's current details/comments and the original source branch;
   do not start an independent Wiki search in this skill.
4. Build and display one consolidated `SubmissionPlan` containing Git,
   applicable Wiki/comment actions, deployment, and final TAPD actions. Under
   `NO_WIKI`, explicitly list that no Wiki discovery/read/write/comment tool
   will be called. Return `PlannedTestSubmission` with
   `terminal_state=AWAITING_CONFIRMATION` and stop; perform no write.
5. In a later `EXECUTE` invocation, verify the user's confirmation answers the
   exact unchanged plan, then re-read each mutable bound fact at its write
   boundary. If anything changed,
   return the updated plan and stop for fresh confirmation.
6. Immediately before each Git write, re-read its bound facts and call the
   private [submission-validator.md](agents/submission-validator.md) with
   `PRE_GIT_WRITE`. Use local Git CLI for commit/push; use `gitlab-mcp` for
   remote MR create/update/conflict/merge operations. Read back each result and
   prove every current-round commit is contained in `origin/develop`.
7. Resolve the deployment gate through `jenkins-mcp`:
   - `DEPLOY`: validate `JENKINS_TEST_DEPLOY`, trigger the authorized Jenkins
     Job, follow the real queue/build, require terminal `SUCCESS`, and prove the
     build used the expected `origin/develop` SHA;
   - `SKIP`: make no Jenkins call and record `SKIPPED_BY_INTENT`.
   `FAILED|UNKNOWN` blocks every later Wiki/TAPD write.
8. After `DEPLOYED|SKIPPED_BY_INTENT`, execute the authorized Wiki plan under
   `STANDARD` only when the drafter returned `VALIDATED`. For a new child or
   unchanged existing link, run
   [ensure-test-wiki.mjs](scripts/ensure-test-wiki.mjs) once with the exact
   item, original branch, approved title/body file, creator and
   `--expect-target` from the confirmed plan, plus
   `--execute`. Validate the complete
   `WIKI_CREATE_AND_LINK_BUNDLE` once before invoking the script; its
   deterministic internal steps need no separate validator invocation. It uses
   `tapd-mcp` and owns Wiki creation/readback and the
   idempotent comment write/readback in that single invocation. Require
   `LINKED|ALREADY_LINKED`; do not then invoke `zan-workflows:linking-tapd-wiki`
   again. A functional `CONTINUE` that patches an existing Wiki still applies
   the authorized minimal update, then invokes
   `zan-workflows:linking-tapd-wiki` with
   `confirmation_mode=DEFER_TO_ORCHESTRATOR` only if the link is missing.
   For `SKIPPED_BY_POLICY`, perform no Wiki or Wiki-comment operation. A
   conflict or failed readback blocks later TAPD actions. Retain the exact
   final Wiki target for `going-live`.
9. Apply the status policy from the work mode through `tapd-mcp`: write/read `待测试` and the test
   version only when required; for `CONTINUE` already in `待测试`, record
   `SKIPPED_ALREADY_WAITING_TEST` and perform no duplicate writes. Give all
   readbacks to the validator with `POST_WRITE`; return `SUBMITTED` only on a
   passing verdict.

## Failure behavior

On any mismatch, missing authorization, failed validation, failed call, or
missing readback, return `BLOCKED` with actual completed actions and stop this
TAPD item. Do not retry automatically, adopt an earlier unknown effect, roll back,
or continue later writes.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. A temporary Markdown file used solely to carry the exact
authorized Wiki body into `ensure-test-wiki.mjs` is removed after the call.
The result exists only for the current in-memory handoff.
