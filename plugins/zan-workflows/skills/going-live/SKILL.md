---
name: going-live
description: Use when a submitted TAPD change must merge its original fixed repair branch directly to master and then maintain its existing Wiki merge status; tooling projects do not require a master-merge status transition.
---

# Go Live

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens merge gates.

Consume one `TestSubmissionResult` and return one in-memory
`MasterMergeResult`. This capability means only: merge the original fixed
repair branch directly to `master`, then maintain the matching existing Wiki
entry as `是否上线：已合并` after verified master containment. A tooling
project keeps `是否上线：无需上线` and requires no master-merge status
transition.

After verified master delivery, also check associated local branches and
worktrees and report cleanup advice; this skill does not delete them.

Read [contracts.md](references/contracts.md) and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before any write.

## Input gate

Require:

- `TestSubmissionResult.terminal_state=SUBMITTED`;
- the exact original `feature/*` or `fixbug/*` repair branch from that result;
- verified repository/source/current-round commit facts; and
- resolved project category/service type; and
- an explicit current-conversation request to go live.

When the upstream profile is `STANDARD`, require the exact existing Wiki target
and readback retained by submission, whether the submission Wiki state is
`WRITTEN` or `SKIPPED_BY_POLICY`. A policy skip means no test-submission Wiki
write occurred; it does not remove the historical target needed to maintain
`是否上线`. A `NO_WIKI` submission has no Wiki maintenance step.

Never substitute `develop`, `dev`, `master`, `merge/*`, a release branch, or a
rebuilt branch as the source.

## Procedure

1. Re-read repository fingerprint, original source ref, `master` ref, existing
   MR state, and current-round commits.
2. Display exact repository, source, target=`master`, source/target SHAs,
   commits, operation, and purpose. Obtain explicit authorization for those
   current facts. A changed fact requires a fresh display and authorization.
3. For a `STANDARD` submission, read its exact Wiki target and uniquely locate
   the entry by the original source branch. Resolve the project category and
   service type before planning the Wiki operation:
   - for a tooling project, require exactly `是否上线：无需上线` and record
     `SKIPPED_TOOL_PROJECT`; do not write a merge-status transition;
   - for a business project, require current `是否上线：未合并` and plan only
     the transition to `是否上线：已合并`. A missing field or any other value
     blocks; do not migrate an old template. The transition requires verified
     master containment;
   - record `ALREADY_MERGED` when a business entry is already `已合并`.
   For a business entry that needs a patch, display the minimal patch and
   resulting body and obtain separate exact authorization for that Wiki write.
   A tooling entry performs no Wiki write and requires no Wiki-write
   authorization. Duplicate/conflicting fields or ambiguous entries block
   before the merge. For `NO_WIKI`, record `SKIPPED_NO_WIKI`; never create a
   Wiki.
4. Run the private read-only
   [master-merge-validator.md](agents/master-merge-validator.md) before the
   first write. Map its response to a public validation state, retain only a
   concise failure reason, and discard the private line.
5. Immediately re-read source and `master` SHAs. If they differ from the
   authorized facts, stop and re-authorize. Otherwise create/update and merge
   the direct source-to-master MR. Read back the merge and prove all approved
   current-round commits are contained in `origin/master`.
6. After successful merge readback and `origin/master` containment, run the
   read-only [local closeout check](references/local-closeout.md). Retain its
   result even if subsequent Wiki maintenance fails. A partial or unavailable
   local check does not block Wiki maintenance or change the confirmed merge.
7. Only after successful merge readback and `origin/master` containment, for a
   `STANDARD` business submission re-read the Wiki. If the authorized patch
   still applies, validate that Wiki write, apply it, and read back exactly
   `是否上线：已合并`; for `ALREADY_MERGED`, verify the unchanged field instead.
   For `SKIPPED_TOOL_PROJECT`, verify the unchanged
   `是否上线：无需上线` field and perform no Wiki write. If the page changed,
   stop for a fresh patch and authorization; never overwrite the changed page.
   A `NO_WIKI` submission performs no Wiki read or write.
8. Return `MERGED` only when all required merge and Wiki readbacks pass;
   otherwise return `BLOCKED` with actual completed effects. Include the local
   check result separately, with paths/branches, reasons, and cleanup advice.
   If master delivery was not verified, mark the local check `NOT_TRIGGERED`.

Do not publish a production version, run smoke tests, update TAPD status or
comments, publish a test version, or write local workflow state. No retry or
interruption recovery is built into this skill.

`是否上线：已合并` means that the approved current-round commits are verified
in `origin/master`; it does not claim that a production version was published.
`无需上线` means the project is a tooling/library project and has no online
merge status to maintain.
