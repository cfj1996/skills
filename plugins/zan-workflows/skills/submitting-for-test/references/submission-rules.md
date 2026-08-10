# Submission rules

## Before writing

1. Accept only a reviewed handoff and one exact policy. Re-check the exact
   upstream project fingerprint; the current shell, a matching folder name, or
   a branch label is not proof.
2. Use the approved GitLab mapping to read source, target, MR, commits, merge
   state, and `origin/develop` containment. The only target is `develop`.
   Record legal source-history divergence separately as
   `inherited_base_difference`; never include it in this round or create a
   develop-based replacement branch because of it.
3. Display `GitDeliveryWritePlan` in order. Materialize only the next exact
   operation payload; later required operations remain
   `PENDING_MATERIALIZATION` until the prior result supplies exact IDs/SHAs.
   Display repository, expected/actual source and target, ref SHAs, reviewed
   diff hash, exact current-round commits, inherited difference, next payload,
   and purpose. Obtain each required authorization; record a policy-evidenced
   `NOT_REQUIRED` only when applicable.
4. Immediately before every commit/push/MR/merge, re-read the immutable facts
   and run private `PRE_FIRST_WRITE` for that exact operation. A changed fact
   or payload invalidates validation and authorization and requires redisplay,
   fresh authorization when required, and revalidation. Only a passing public
   mapped state permits that one write. Require a provider-enforced expected
   SHA/ref lease (or equivalent atomic predicate) in the exact payload. Before
   validating a new write, read the target system. If the exact intended effect
   is already present, display the readback and require an exact confirmation to
   adopt it as `ADOPTED_EXISTING_EFFECT`; do not write again. If it is proved
   absent, run the fresh validation and perform one guarded write. If its
   presence is ambiguous, block. Current-invocation validation/execution records
   are returned audit output only and are never loaded as cross-invocation
   recovery state. Read merge state and every current-round
   commit from `origin/develop`. Stop before TAPD, version, or Wiki writes on
   any failed containment/readback.

## Standard Wiki rule

`STANDARD` must invoke `zan-workflows:drafting-wiki` after merge readback.
It must pass factual input, retain the full resulting Markdown, and treat a
blocked draft as a submission blocker. Locate the existing Wiki from TAPD
detail/comments first; preserve it and append rather than replacing or
duplicating it. The original business source must be one evidenced
`feature/*`/`fixbug/*` branch, never `merge/*`.

Show the complete final Markdown and write target, then obtain a confirmation
covering the exact Wiki body/target plus the materialized TAPD status and
test-version payloads. When updating an existing Wiki whose real ID is already
known, the same display may include the exact one-line Bug comment. When
creating a Wiki, the pre-Wiki confirmation does **not** cover a placeholder or
future comment: after write/readback returns the real Wiki ID, materialize and
display the exact comment, obtain a separate authorization, and validate it
before comment write. Before the first Wiki write, call the private validator
with `validation_phase=PRE_SUBMISSION_WRITE`. It checks the confirmed draft/target/patch
and planned status/version payloads, but must not require Wiki/comment/status/
version readback that does not exist. Only a mapped `VALIDATION_PASSED` permits
the write. Bind the fresh facts, payload, authorization, validation run, and
execution using matching snapshot/payload/authorization hashes and ordered
timestamps. The submission preflight includes exact source/target ref SHAs and
reviewed diff hash; authorization binds that snapshot/facts/CAS tuple. Require
a remote resource-version/CAS predicate or idempotency key. Before authorizing
a new write, reconcile the exact intended effect from the external system:
confirm and adopt an exact existing effect without writing, proceed with a
freshly validated write only when absence is proved, and block on an
ambiguous state. Immediately before execution, re-read the immutable repository,
source/target/commit/profile/target/payload snapshot; any change invalidates
authorization and validation and requires redisplay and revalidation. Use
`WikiWriteGate`: target, mode, before hash, expected patch, after hash, and a
readback proving the patch. A failed readback prevents the comment and state
write. Apply the same fresh `PRE_SUBMISSION_WRITE` binding immediately before
the exact comment, status, and version operations. Execute/read back each one
before the next: Wiki, applicable comment, status, then version. After all
permitted writes/readbacks, call the same validator with
`validation_phase=POST_WRITE`; a non-passing verdict records partial failure
and forbids further writes.

For a Bug, generate and compare exactly:

```text
提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})
```

Do not add MR, build, implementation, verification, or newline text. Record
the exact expected/actual strings and comment readback.

## No-Wiki rule

`NO_WIKI` is an explicit policy, not a failed `STANDARD`. Do not load or use
the Wiki drafter, Wiki validator, Wiki template, target discovery, page read,
create/update call, Wiki comment, or Wiki confirmation. Set
`wiki.status=SKIPPED_BY_POLICY` and all other Wiki evidence to null or
`NOT_ATTEMPTED`; set TAPD comment fields to `NOT_APPLICABLE`.

Still require the merge gate/readback plus exact TAPD-status and structured
test-version authorization, write, and readback. Run separate fresh
`PRE_SUBMISSION_WRITE` gates and immediate readbacks for status, then version.
All validation phases omit Wiki material and never load a Wiki capability. A user request to create or
validate a Wiki conflicts with this profile: stop and ask them to choose
`STANDARD`.

## Status, version, and partial failures

Use the TAPD operation matching the work type. Do not claim the desired status
until the post-write item readback has the expected actual value. Publish only
the explicitly authorized test-version payload and read the release/version
back by its real identifier. If a later write fails after an earlier one
succeeds, return `BLOCKED` with every completed effect and truthful evidence;
do not invent success, erase history, or continue another write.
