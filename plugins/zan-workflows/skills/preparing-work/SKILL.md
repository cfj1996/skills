---
name: preparing-work
description: Use when a TAPD Bug, Story, or Task must be understood, scoped, routed to a verified project, constrained to a branch, or safely resumed before any repair or external write.
---

# Resolve TAPD Work

Produce one read-only `TapdWorkDefinition` and stop. This skill establishes what
work exists, where it belongs, and which branch may later be used; it never
edits source, creates `raw.md`, changes TAPD, creates branches/worktrees, or
commits.

## Workflow runtime envelope

When invoked by `fixing-bug`, accept its `run_id` and `invocation_id` only
as execution metadata; they are not business inputs and never alter resolution.
The orchestrator records the exact declared input before this call and the
complete public `TapdWorkDefinition` after it. Read
[workflow-runtime.md](../../references/workflow-runtime.md). A standalone call
may create a `standalone:preparing-work` run before collecting evidence.

## Contract and boundaries

Read [contracts.md](references/contracts.md) before collecting evidence. The
only successful result is a schema-shaped `TapdWorkDefinition`; uncertainty is
a result state, not a reason to guess. Read
[collection-and-resume.md](references/collection-and-resume.md) for collection,
project fingerprint, and local resume rules. Use
[acceptance-scenarios.md](references/acceptance-scenarios.md) to check the
result before returning it.

Inputs:

```text
tapd_url (required)
fixed_project (optional)
fixed_repo_path (optional)
fixed_branch (optional)
branch_mode = AUTO | CREATE | REUSE_FIXED
scope_increment (optional)
```

`fixed_project`, `fixed_repo_path`, and `fixed_branch` constrain selection;
they do not prove a fact or authorize a write. A mismatch is `BLOCKED`, never a
fallback to a different project, repository, or branch.

Valid branch input combinations are:

| `branch_mode` | `fixed_branch` | Allowed outcome |
| --- | --- | --- |
| `AUTO` | absent | Discover all evidenced candidates; choose one only under the normal resume rules, otherwise `FRESH`. |
| `AUTO` | present | Inspect only the exact fixed branch. It may be the exact resumed ref or exact `branch_to_create`; no other ref may substitute. |
| `CREATE` | required | Preserve the exact fixed value as `branch_to_create`. This mode never returns `RESUME`, even when another historical candidate is attractive. |
| `REUSE_FIXED` | required | Inspect and, only when fully proven, resume the exact fixed ref. No other ref may be searched, scored, or selected. |

`CREATE` or `REUSE_FIXED` without `fixed_branch` is an invalid combination and
returns `BLOCKED`. A supplied `fixed_branch` is a hard constraint in every mode.
Use `PENDING` only for unavailable/unfinished evidence or a named user decision
that could still satisfy the constraint. Use `BLOCKED` for an invalid input
combination, proven mismatch, existing ref under `CREATE`, conflicting exact
refs, or another disproven hard constraint. Proven absence of both exact refs
is `ABSENT`, not failure, when `AUTO`/`CREATE` evaluates exact creation.

## Read-only resolution procedure

1. Parse the TAPD URL and use its path to select the correct Bug, Story, or Task
   read operation. If the item is absent or type evidence conflicts, return a
   blocked definition with the evidence and conflict.
2. Collect the item detail, comments, attachments, screenshots, PRD links, and
   dynamic fields. Extract claims as evidence with source locations. Read the
   default visible requirement document for each accessible prototype; preserve
   inaccessible material as a warning rather than inventing its contents.
3. Route named project signals through
   `zan-workflows:workspace-project-knowledge` before searching any repository.
   Keep competing routes in `evidence.conflicts`. Do not use the shell CWD as a
   tiebreaker. A fixed project/repository must match the routing result.
4. Only after one target repository is resolved, verify its fingerprint in that
   repository: absolute Git root, origin remote, repository identity, and any
   fixed path/project constraint. Record expected and actual values. A missing
   or conflicting verification leaves `repo_verification` pending or blocked.
5. In the verified repository only, perform the read-only resume check from
   `collection-and-resume.md`. Record `fixed_branch` as an explicit
   `PASS|FAIL|PENDING` branch constraint whenever supplied. In all modes, a
   fixed branch permits only its exact local/remote ref or the exact same
   `branch_to_create`; never search, score, or select a different ref. `CREATE`
   always keeps `selected_ref=null`, sets the exact `branch_to_create`, and
   returns `FRESH` only when creation eligibility is proven. It never returns
   `RESUME`. Do not create or change a ref. Emit an explicit resume decision
   even when pending.
6. Build context as `PreviousContext + LatestTapdRefresh + UserIncrement`.
   Previous context supplies history, the refresh supplies only current changes,
   and `scope_increment` supplies this request's delta. Never overwrite history
   with a refresh or silently absorb historical work into the new scope.
7. Derive in-scope work, explicit non-scope, historical-content policy, and
   normalized acceptance criteria from evidence. Mark every missing user
   confirmation in `confirmations.missing`; an unconfirmed scope remains
   `PENDING_CONFIRMATION` with `scope_confidence=LOW`.
8. Assign `context_confidence`, `project_confidence`, and `scope_confidence` as
   `HIGH`, `MEDIUM`, or `LOW`, each with reasons and missing evidence. Run the
   private validator in [agents/validator.md](agents/validator.md). If it says
   `验证不通过`, map its reason to a normalized public `blocker_reason` and
   return `PENDING` or `BLOCKED`; do not persist the raw private verdict.
9. Set exactly one authoritative terminal state: `READY_FOR_HANDOFF` only for
   an actionable, confirmed definition; `PENDING` when named user input or
   evidence can resolve the gap; or `BLOCKED` for a hard conflict/invalid
   combination. Do not advance toward repair or prepare an edit gate.

## Required response shape

Return one fenced YAML or JSON `TapdWorkDefinition`, followed by the matching
single marker: `RESOLUTION_READY_FOR_HANDOFF`, `RESOLUTION_PENDING: <reason>`,
or `RESOLUTION_BLOCKED: <reason>`. Include unresolved fields and a normalized
`blocker_reason`; do not omit them. A downstream repair skill may proceed only
from `READY_FOR_HANDOFF` and after its own authorization and verification
gates, even when this definition has high confidence.

## Non-negotiable stops

- Multiple equally supported projects: `routing_status=AMBIGUOUS`,
  `resume_decision=PENDING_PROJECT`, request one discriminator, and do no Git
  search.
- Wrong TAPD type, unresolved project, fixed-constraint mismatch, or an
  unverified repository: use `PENDING` only while evidence is unavailable;
  use `BLOCKED` once a mismatch/conflict is proven. Never guess.
- A fixed branch is an explicit `PASS|FAIL|PENDING` constraint in every mode.
  `AUTO` and `REUSE_FIXED` may select only
  `refs/heads/<fixed_branch>` or `refs/remotes/origin/<fixed_branch>`;
  `CREATE` may retain only that exact value as `branch_to_create` and can never
  select or resume a ref. A `PENDING` check yields terminal `PENDING`; a
  `FAIL`, conflicting SHA, or `ABSENT` required resume ref yields `BLOCKED`.
  Both leave `selected_ref=null` and never select an alternate ref.
- When both exact local and remote refs are valid for resume, they must point
  to the same SHA and `selected_ref` is the remote ref. A SHA mismatch is
  `BLOCKED`; exact-ref selection is deterministic.
- Conflicting historical and current claims: retain both evidence items and
  name the required decision; never overwrite historical context.
- No explicit scope/history confirmation: no pre-edit transition. This skill
  must still stop after the handoff definition.
