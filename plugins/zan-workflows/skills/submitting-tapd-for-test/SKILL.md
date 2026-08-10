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

The upstream results are evidence, not authorization for a commit, push, MR,
merge, TAPD write, Wiki write, or test-version publication. Missing, changed,
or inconsistent evidence is a blocked result. Never infer a repository,
source branch, target branch, commit, project, service, user confirmation, or
successful external effect.

Use the same isolated, read-only validator described in
[agents/submission-validator.md](agents/submission-validator.md) twice. Its
only permitted response is `验证通过` or `验证不通过：<原因>`; keep both responses
private:

- `validation_phase=PRE_WRITE` runs after the develop-merge readback but before
  this submission's Wiki, TAPD-status, comment, or test-version write. It
  validates only the profile, source/target/current-round commits, current
  authorization, `ValidatedWikiDraft` when applicable, Wiki target/patch and
  full-draft confirmation when applicable, and the *planned* status/version
  payloads. It must not require a write/readback that has not happened.
- Execute the planned writes only after `PRE_WRITE=验证通过`. Then run
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
2. Show `MergeConfirmationGate` with expected and actual source, target,
   current-round commits, inherited-base differences, and purpose. Obtain an
   explicit user authorization for this exact merge. If any actual value changes
   after display, invalidate the authorization and repeat this step.
3. Commit and push only the reviewed, in-scope change when they are required
   and separately authorized. Create/update the MR, merge it to `develop`, and
   read back the MR/merge state and `origin/develop` containment of every
   current-round commit. A conflict, failed pipeline, failed merge, or missing
   containment blocks all later submission writes.
4. Select the profile procedure below. Do not downgrade `STANDARD` to
   `NO_WIKI`, and do not use a missing Wiki to block `NO_WIKI`.
5. Complete the profile preparation, run the private `PRE_WRITE` validation,
   and stop before any planned submission write unless it returns `验证通过`.
   Write the permitted TAPD state and publish the required test version, then
   read each target back. Preserve actual IDs, status/version values,
   timestamps, and evidence URLs or errors.
6. Run private `POST_WRITE` validation using the actual effects and readbacks.
   If it returns `验证不通过`, stop and form a truthful partial `BLOCKED` result;
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
   explicit authorization for this draft, target, Wiki write, exact TAPD
   comment, TAPD status update, and test-version publication. A summary,
   partial body, or a request to “write directly” is not confirmation.
3. Give the evidenced full draft, target, patch, confirmation, and planned
   TAPD-status/test-version payloads to `PRE_WRITE`. Only a `验证通过` verdict
   permits the first Wiki write; this phase must not demand a successful Wiki,
   comment, status, or version readback because none exists yet.
4. Run `WikiWriteGate`, write the smallest confirmed patch, then read the Wiki
   back. Do not create a replacement Wiki when the TAPD already identifies one.
   If the expected patch is absent after readback, stop before comment or TAPD
   state update.
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
TAPD-status and test-version payloads. Run `PRE_WRITE` without loading or
supplying any Wiki material; it may validate only the common facts and planned
status/version payloads. On `验证通过`, perform only those writes and read them
back, then run `POST_WRITE` without requiring or loading Wiki evidence. Set
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
