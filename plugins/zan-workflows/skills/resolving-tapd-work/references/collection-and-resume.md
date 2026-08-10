# Collection, routing, and resume

## Collect evidence first

1. Infer `BUG`, `STORY`, or `TASK` from the TAPD URL path and use the matching
   reader. A zero-result response triggers a type check, not a different item
   type by guesswork.
2. Collect detail, comments, attachments, screenshot-derived links, PRD,
   prototype, status, owner, and type-specific fields. Preserve source URLs or
   field names for each claim.
3. For an accessible prototype, read only the default visible requirement
   document and record design intent, flows, constraints, and acceptance clues.
   Record inaccessible or unvisited material as a warning.
4. Normalize supplied `scope_increment` as `UserIncrement`; do not treat it as
   evidence that earlier work is in scope.

## Route before repository access

Call `zan-workflows:workspace-project-knowledge` using TAPD project signals.
Keep every candidate and its supporting evidence. A single winner is required
before executing Git commands. The current shell directory, workspace root,
and a fixed branch are not routing evidence.

After one route is selected, enter that exact repository and read its actual
Git root and `origin` remote. Compare them to `fixed_project` and
`fixed_repo_path` when supplied. If the route is ambiguous, set
`PENDING_PROJECT`; if verification fails or constraints disagree, block without
searching another repository.

## Resume in the verified repository only

Use read-only commands and record their evidence:

1. For `fixed_branch`, check `refs/heads/<branch>` and
   `refs/remotes/origin/<branch>`.
2. Extract branch/MR/commit clues from TAPD comments or linked Wiki, then
   verify them locally.
3. Search local refs for `feature/*` or `fixbug/*` containing the short-id and
   commit trailers `--story=<short-id>`, `--bug=<short-id>`, or
   `--task=<short-id>`. If local evidence is insufficient, `git fetch origin
   --prune` is permitted only as read-only synchronization.
4. For every candidate, inspect `<ref>:docs/<short-id>/raw.md` and
   `__test___/<short-id>` evidence. Do not stop after the first candidate with
   missing raw.

Select decisions as follows:

| Condition | Decision |
| --- | --- |
| Route unresolved or ambiguous | `PENDING_PROJECT` |
| Repository fingerprint not verified | `PENDING_REPO_VERIFICATION` |
| Candidate ref has raw and TAPD association | `RESUME` |
| Fixed branch exists but raw/association is incomplete | `NEED_CONFIRMATION` |
| No fixed branch and every investigated candidate lacks raw | `NEED_CONFIRMATION` |
| No branch, Wiki, MR, trailer, raw, or test anchor exists | `FRESH` |
| Fixed constraint or repository evidence conflicts | `BLOCKED` |

For `RESUME`, compose:

```text
PreviousContext + LatestTapdRefresh + UserIncrement
```

`PreviousContext` is the recovered raw/history; `LatestTapdRefresh` records
only current TAPD changes; `UserIncrement` is the explicit request or feedback.
Preserve historical in/out-of-scope decisions unless the user explicitly
changes them. This resolver records the result but never creates or updates
`raw.md`.
