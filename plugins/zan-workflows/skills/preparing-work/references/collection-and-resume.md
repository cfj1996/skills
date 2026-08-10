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

1. Validate the mode/branch combination first. `CREATE` and `REUSE_FIXED`
   require `fixed_branch`; otherwise block. When `fixed_branch` is supplied in
   any mode, record one explicit branch constraint and inspect only
   `refs/heads/<fixed_branch>` and `refs/remotes/origin/<fixed_branch>`. Do not
   search, score, or select alternate refs.
2. For `AUTO` with a fixed branch or `REUSE_FIXED`, inspect the exact fixed refs
   for TAPD association,
   `<ref>:docs/<short-id>/raw.md`, and `__test___/<short-id>` evidence. Set the
   constraint for reuse to `PASS` only when `local_ref`, `remote_ref`,
   `tapd_association`, `raw_md`, and `test_evidence` all pass. Otherwise retain
   `selected_ref=null`. When both exact refs are proven `ABSENT` under `AUTO`,
   preserve the fixed name as `branch_to_create` only after creation eligibility
   passes. Any `PENDING` required check yields `NEED_CONFIRMATION`/terminal
   `PENDING`; any `FAIL`, one-sided `ABSENT`, or mismatched exact SHA yields
   `BLOCKED`. Never fall back to another ref.
3. For `CREATE`, do not perform candidate discovery and never select or resume
   an existing ref. Prove that the exact fixed branch can be created, set
   `branch_to_create=<fixed_branch>`, retain `selected_ref=null`, and return
   `FRESH`. If the exact ref already exists, return `BLOCKED`; if creation
   eligibility is uncertain, return `NEED_CONFIRMATION`/terminal `PENDING`. An historical candidate
   cannot replace the requested branch-to-create.
4. Only for `AUTO` without `fixed_branch`, extract branch/MR/commit clues
   from TAPD comments or linked Wiki, then verify them locally. Search local
   refs for `feature/*` or `fixbug/*` containing the short-id and commit
   trailers `--story=<short-id>`, `--bug=<short-id>`, or `--task=<short-id>`.
   If local evidence is insufficient, `git fetch origin --prune` is permitted
   only as read-only synchronization.
5. Only for `AUTO` without `fixed_branch`, inspect every candidate ref for
   `<ref>:docs/<short-id>/raw.md` and `__test___/<short-id>` evidence. Do not
   stop after the first candidate with missing raw.

Select decisions as follows:

| Condition | Decision |
| --- | --- |
| Route unresolved or ambiguous | `PENDING_PROJECT` |
| Repository fingerprint not verified | `PENDING_REPO_VERIFICATION` |
| `CREATE` or `REUSE_FIXED` without `fixed_branch` | `BLOCKED`, invalid combination |
| `CREATE` with both exact refs proven `ABSENT` and creation eligibility passing | `FRESH`, `selected_ref=null`, `branch_to_create=<fixed_branch>` |
| `CREATE` with any attractive historical candidate | Never `RESUME`; ignore it for selection and preserve the exact branch-to-create constraint |
| `AUTO` with exact fixed local/remote refs at the same SHA and complete resume evidence | `RESUME`, selecting the remote exact ref |
| `AUTO` with both exact refs proven `ABSENT` and creation eligibility proven | `FRESH`, `selected_ref=null`, `branch_to_create=<fixed_branch>` |
| `AUTO` with fixed-branch evidence unavailable/incomplete while another candidate looks reusable | `NEED_CONFIRMATION` with terminal `PENDING`, never select the alternate ref |
| `REUSE_FIXED` and exact fixed ref passes every required check | `RESUME`, with `selected_ref` equal to that fixed ref |
| `REUSE_FIXED` has an unavailable/incomplete required check | `NEED_CONFIRMATION` with terminal `PENDING`, `selected_ref=null` |
| `REUSE_FIXED` has a failed/mismatched required check, absent required ref, or conflicting local/remote SHA | `BLOCKED` with terminal `BLOCKED`, `selected_ref=null` |
| `AUTO` without a fixed branch has a candidate ref with raw and TAPD association | `RESUME` |
| `AUTO` without a fixed branch and every investigated candidate lacks raw | `NEED_CONFIRMATION` |
| `AUTO` without a fixed branch and no branch, Wiki, MR, trailer, raw, or test anchor exists | `FRESH` |
| Fixed constraint or repository evidence conflicts | `BLOCKED` |

Terminal mapping is deterministic: `PENDING_PROJECT`,
`PENDING_REPO_VERIFICATION`, and `NEED_CONFIRMATION` use
`terminal_state=PENDING`; a `BLOCKED` resume decision uses
`terminal_state=BLOCKED`; an eligible `RESUME`/`FRESH` plus confirmed scope uses
`READY_FOR_HANDOFF`. A later scope-confirmation wait changes only the terminal
state to `PENDING`; it does not rewrite the evidenced resume decision.

For `RESUME`, compose:

```text
PreviousContext + LatestTapdRefresh + UserIncrement
```

`PreviousContext` is the recovered raw/history; `LatestTapdRefresh` records
only current TAPD changes; `UserIncrement` is the explicit request or feedback.
Preserve historical in/out-of-scope decisions unless the user explicitly
changes them. This resolver records the result but never creates or updates
`raw.md`.
