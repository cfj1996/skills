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
3. Display the full `MergeConfirmationGate`: expected/actual source and target,
   exact current-round commits, inherited difference, MR impact, and purpose.
   Obtain explicit authorization. Any post-confirmation change invalidates it.
4. Only after the gate may an authorized commit/push/MR/merge proceed. Read
   merge state and every current-round commit from `origin/develop`. Stop before
   TAPD, version, or Wiki writes on any failed containment/readback.

## Standard Wiki rule

`STANDARD` must invoke `zan-workflows:drafting-tapd-wiki` after merge readback.
It must pass factual input, retain the full resulting Markdown, and treat a
blocked draft as a submission blocker. Locate the existing Wiki from TAPD
detail/comments first; preserve it and append rather than replacing or
duplicating it. The original business source must be one evidenced
`feature/*`/`fixbug/*` branch, never `merge/*`.

Show the complete final Markdown and write target, then obtain a confirmation
covering exact Wiki body/target, exact one-line Bug comment, TAPD status, and
test-version payload. Before the first Wiki write, call the private validator
with `validation_phase=PRE_WRITE`. It checks the confirmed draft/target/patch
and planned status/version payloads, but must not require Wiki/comment/status/
version readback that does not exist. Only `验证通过` permits the write. Use
`WikiWriteGate`: target, mode, before hash, expected patch, after hash, and a
readback proving the patch. A failed readback prevents the comment and state
write. After all permitted writes/readbacks, call the same validator with
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

Still require the merge gate/readback plus exact TAPD-status and test-version
authorization, write, and readback. `PRE_WRITE` and `POST_WRITE` both omit all
Wiki material and never load a Wiki capability. A user request to create or
validate a Wiki conflicts with this profile: stop and ask them to choose
`STANDARD`.

## Status, version, and partial failures

Use the TAPD operation matching the work type. Do not claim the desired status
until the post-write item readback has the expected actual value. Publish only
the explicitly authorized test-version payload and read the release/version
back by its real identifier. If a later write fails after an earlier one
succeeds, return `BLOCKED` with every completed effect and truthful evidence;
do not invent success, erase history, or continue another write.
