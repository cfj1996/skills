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

For successive preview/execution/helper actions, use one live
[workflow-session.mjs](../../scripts/workflow-session.mjs) session and its lazy
MCP pool; individual CLI helpers remain available for standalone actions.
Send each authorized action separately, retain no workflow file, and refresh
mutable facts inside its executor. Session reuse caches connections, not
authorization, item state, refs or deployment evidence.

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
   applicable Wiki/comment actions, deployment, and final TAPD actions.
   Preview registration to automatically resolve actual state labels,
   transitions, required-field values and native/custom test-version mapping;
   bind the returned codes, old values and metadata hashes. Resolve applicable
   Job parameters through its adapter, showing a metadata-only Job binding
   or pipeline-computed version policy explicitly when used. Under
   `NO_WIKI`, explicitly list that no Wiki discovery/read/write/comment tool
   will be called. Return `PlannedTestSubmission` with
   `terminal_state=AWAITING_CONFIRMATION` and stop; perform no write.
5. In a later `EXECUTE` invocation, verify the user's confirmation answers the
   exact unchanged plan, then re-read each mutable bound fact at its write
   boundary. If anything changed,
   return the updated plan and stop for fresh confirmation.
6. Before the first Git write, validate one `GIT_DELIVERY_BUNDLE` with the
   private [submission-validator.md](agents/submission-validator.md) using
   `PRE_GIT_WRITE`. Bind the complete reviewed diff/file list, repository,
   original branch, target refs, commit/push/MR actions and purpose once.
   Commit/push through local Git only when needed, checking actual bound facts
   and reading back the derived SHA without another Agent validator. Run
   [merge-reviewed-branch.mjs](../../scripts/merge-reviewed-branch.mjs) once for
   exact MR reuse/create, CI waiting, fresh ref/approval checks, merge readback
   and containment. It uses `gitlab-mcp`; never manually poll or validate each
   GET. Reuse the final result and delivered target revision for deployment;
   the source branch SHA is not automatically the target merge commit SHA.
   A genuine metadata update or conflict needs its exact authorized action,
   not a new broad preparation/review run.
7. Resolve the deployment gate through `jenkins-mcp`:
   - `DEPLOY`: validate `JENKINS_TEST_DEPLOY` once, then run
     [run-jenkins-release.mjs](../../scripts/run-jenkins-release.mjs) once with
     the exact confirmed release plan and Job/config fingerprints. It triggers
     through `jenkins-mcp` once, tracks the exact queue/build itself, and
     requires `SUCCESS`, actual parameters and target-repository SCM SHA.
     Record its narrowly scoped GET-only API read fallback for fields missing
     from MCP. No Agent polling, repeated console fetch, routing or per-poll
     validation. A verified package `RELEASED` maps to the existing deployment
     gate `DEPLOYED` while retaining `releaseKind=package`; report package
     publication accurately rather than claiming an application deployment;
   - `SKIP`: make no Jenkins call and record `SKIPPED_BY_INTENT`.
   `FAILED|UNKNOWN` blocks every later Wiki/TAPD write.
8. After `DEPLOYED|SKIPPED_BY_INTENT`, execute the authorized Wiki plan under
   `STANDARD` only when the drafter returned `VALIDATED`. For creation,
   functional `CONTINUE` supplementation, or unchanged reuse, run
   [ensure-test-wiki.mjs](scripts/ensure-test-wiki.mjs) once with the exact
   item, original branch and approved complete body file. Copy the confirmed
   target into `--expect-target`; for an existing Wiki pass its exact
   `--expected-wiki-id`, `--expected-month-id`, approved title and
   `--expected-body-sha256`; for creation pass the fixed `--month`, title,
   creator and any existing month ID. Add `--execute` only under the unchanged
   consolidated authorization. Validate `WIKI_WRITE_AND_LINK_BUNDLE` once
   before invocation. The script uses `tapd-mcp` to create or update/read back
   the approved body and ensure/read back its comment. Independent initial
   reads run in parallel; it refreshes the exact body immediately before an
   update and comments after a Wiki write. No separate Agent validation or
   confirmation is needed between its deterministic steps. Require
   `LINKED|ALREADY_LINKED`, exact Wiki ID, approved final `bodySha256`, and
   `wikiState=CREATED|UPDATED|UNCHANGED`. Do not invoke
   `zan-workflows:linking-tapd-wiki` again after this bundle.
   For `SKIPPED_BY_POLICY`, perform no Wiki or Wiki-comment operation. A
   conflict or failed readback blocks later TAPD actions. Retain the exact
   final Wiki target for `going-live`.
9. Apply the status policy from the work mode through one validated
   `TAPD_REGISTRATION_BUNDLE`, then invoke
   [register-test-submission.mjs](../../scripts/register-test-submission.mjs)
   once with the exact item, work mode, approved status/version policy,
   automatically resolved workflow/field mappings and metadata fingerprints.
   Reuse the consolidated authorization and successful Git/deployment/Wiki
   prerequisites. Through `tapd-mcp` it refreshes the bound facts, sends one
   combined update for status and version, and reads both back. `CONTINUE`
   already in `待测试` returns `SKIPPED_ALREADY_WAITING_TEST` without duplicate
   writes. Story/Task never receives a Bug status; version-only registration
   requires its explicit policy. Do not manually repeat reads or validate the
   two fields separately. Give the final readbacks to `POST_WRITE`; return
   `SUBMITTED` only on a passing verdict.

## Failure behavior

On any mismatch, missing authorization, failed validation, failed call, or
missing readback, return `BLOCKED` with actual completed actions and stop this
TAPD item. Do not retry automatically, adopt an earlier unknown effect, roll back,
or continue later writes.

No run/attempt/effect ledger, input/output JSON, report file, or interruption
recovery is created. A temporary Markdown file used solely to carry the exact
authorized Wiki body into `ensure-test-wiki.mjs` is removed after the call.
The result exists only for the current in-memory handoff.
