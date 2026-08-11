---
name: going-live
description: Use when a submitted TAPD change must merge its original fixed repair branch directly to master and optionally mark an existing Wiki as merged.
---

# Go Live

Consume one `TestSubmissionResult` and return one in-memory
`MasterMergeResult`. This capability means only: merge the original fixed
repair branch directly to `master`, then optionally mark an already identified
Wiki `已合并`.

Read [contracts.md](references/contracts.md) and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before any write.

## Input gate

Require:

- `TestSubmissionResult.terminal_state=SUBMITTED`;
- the exact original `feature/*` or `fixbug/*` repair branch from that result;
- verified repository/source/current-round commit facts; and
- an explicit current-conversation request to go live.

Never substitute `develop`, `dev`, `master`, `merge/*`, a release branch, or a
rebuilt branch as the source.

## Procedure

1. Re-read repository fingerprint, original source ref, `master` ref, existing
   MR state, and current-round commits.
2. Display exact repository, source, target=`master`, source/target SHAs,
   commits, operation, and purpose. Obtain explicit authorization for those
   current facts. A changed fact requires a fresh display and authorization.
3. If an existing Wiki marker is requested, read the exact supplied Wiki,
   display the minimal patch and resulting body, and obtain separate exact
   authorization. No existing Wiki means `SKIPPED_NO_WIKI`; never create one.
4. Run the private read-only
   [master-merge-validator.md](agents/master-merge-validator.md) before the
   first write. Map its response to a public validation state, retain only a
   concise failure reason, and discard the private line.
5. Immediately re-read source and `master` SHAs. If they differ from the
   authorized facts, stop and re-authorize. Otherwise create/update and merge
   the direct source-to-master MR. Read back the merge and prove all approved
   current-round commits are contained in `origin/master`.
6. Only after successful merge readback, apply an authorized existing-Wiki
   marker and read it back.
7. Return `MERGED` only when all required readbacks pass; otherwise return
   `BLOCKED` with actual completed effects.

Do not publish a production version, run smoke tests, update TAPD status or
comments, publish a test version, or write local workflow state. No retry or
interruption recovery is built into this skill.
