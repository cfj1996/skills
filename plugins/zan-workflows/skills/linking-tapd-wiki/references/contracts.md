# TapdWikiLinkResult contract

## Required facts

| Section | Required content |
| --- | --- |
| Item | exact `Bug|Story|Task`, ID, short ID when available, workspace, readback |
| Wiki | exact ID, canonical URL, workspace, page readback, association evidence |
| Comments | complete historical-comment check, same-ID and conflicting targets |
| Plan | exact payload, operation, purpose, phase, confirmation mode/source |
| Execution | validator result, write result, final comment readback |
| Terminal | `AWAITING_CONFIRMATION|ALREADY_LINKED|LINKED|BLOCKED_CONFLICT|BLOCKED` |

## Invariants

- `PLAN` is read-only. Standalone execution requires a later exact confirmation.
- `DEFER_TO_ORCHESTRATOR` accepts only an unchanged confirmed `SubmissionPlan`
  that already includes the exact deterministic comment operation.
- Canonical Wiki ID, not link formatting, determines duplicates and conflicts.
- `ALREADY_LINKED` performs no write and requires readback evidence for the
  existing same-ID comment.
- Any different 提测 Wiki target is `BLOCKED_CONFLICT`; never append a second
  link or silently replace the earlier one.
- `LINKED` requires one successful `tapd-mcp` write and a subsequent comment
  readback containing exactly one canonical target ID.
- No result authorizes or performs Wiki changes, TAPD status/version changes,
  Git delivery, deployment, master merge, or local cleanup.
