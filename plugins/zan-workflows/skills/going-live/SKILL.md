---
name: going-live
description: Use when a submitted TAPD change must merge its original fixed repair branch directly to master and then maintain its existing Wiki `是否上线` field from `否` to `是`.
---

# Go Live

Consume one `TestSubmissionResult` and return one in-memory
`MasterMergeResult`. This capability means only: merge the original fixed
repair branch directly to `master`, then maintain the matching existing Wiki
entry as `是否上线：是` after verified master containment.

Read [contracts.md](references/contracts.md) and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before any write.

## Input gate

Require:

- `TestSubmissionResult.terminal_state=SUBMITTED`;
- the exact original `feature/*` or `fixbug/*` repair branch from that result;
- verified repository/source/current-round commit facts; and
- an explicit current-conversation request to go live.

When the upstream profile is `STANDARD`, also require its exact written Wiki
target and readback. A `NO_WIKI` submission has no Wiki maintenance step.

Never substitute `develop`, `dev`, `master`, `merge/*`, a release branch, or a
rebuilt branch as the source.

## Procedure

1. Re-read repository fingerprint, original source ref, `master` ref, existing
   MR state, and current-round commits.
2. Display exact repository, source, target=`master`, source/target SHAs,
   commits, operation, and purpose. Obtain explicit authorization for those
   current facts. A changed fact requires a fresh display and authorization.
3. For a `STANDARD` submission, read its exact Wiki target and uniquely locate
   the entry by the original source branch. Plan only one field transition:
   replace `是否上线：否` with `是否上线：是`, insert `是否上线：是` before `环境`
   for a legacy entry without the field, or record `ALREADY_ONLINE` when it is
   already `是`. Display the minimal patch and resulting body and obtain
   separate exact authorization for a write. Duplicate/conflicting fields or
   ambiguous entries block before the merge. For `NO_WIKI`, record
   `SKIPPED_NO_WIKI`; never create a Wiki.
4. Run the private read-only
   [master-merge-validator.md](agents/master-merge-validator.md) before the
   first write. Map its response to a public validation state, retain only a
   concise failure reason, and discard the private line.
5. Immediately re-read source and `master` SHAs. If they differ from the
   authorized facts, stop and re-authorize. Otherwise create/update and merge
   the direct source-to-master MR. Read back the merge and prove all approved
   current-round commits are contained in `origin/master`.
6. Only after successful merge readback and `origin/master` containment, for a
   `STANDARD` submission re-read the Wiki. If the authorized patch still
   applies, validate that Wiki write, apply it, and read back exactly
   `是否上线：是`; for `ALREADY_ONLINE`, verify the unchanged field instead. If
   the page changed, stop for a fresh patch and authorization; never overwrite
   the changed page. A `NO_WIKI` submission performs no Wiki read or write.
7. Return `MERGED` only when all required readbacks pass; otherwise return
   `BLOCKED` with actual completed effects.

Do not publish a production version, run smoke tests, update TAPD status or
comments, publish a test version, or write local workflow state. No retry or
interruption recovery is built into this skill.

`是否上线：是` means only that every approved current-round commit is verified
in `origin/master`; it is not evidence that a production version was published.
