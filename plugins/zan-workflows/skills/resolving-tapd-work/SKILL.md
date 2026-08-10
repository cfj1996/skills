---
name: resolving-tapd-work
description: Use when a TAPD Bug, Story, or Task must be understood, scoped, routed to a verified project, constrained to a branch, or safely resumed before any repair or external write.
---

# Resolve TAPD Work

Produce one read-only `TapdWorkDefinition` and stop. This skill establishes what
work exists, where it belongs, and which branch may later be used; it never
edits source, creates `raw.md`, changes TAPD, creates branches/worktrees, or
commits.

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
   `collection-and-resume.md`. Treat a fixed branch as a candidate. Verify local
   and remote refs plus the TAPD association and historical `raw.md`; do not
   create or change a ref. Emit an explicit resume decision even when pending.
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
   `验证不通过`, return the blocked or pending definition with its reason.
9. Set `terminal_state=STOPPED_FOR_HANDOFF` and return the definition. Do not
   advance toward repair or prepare an edit gate.

## Required response shape

Return one fenced YAML or JSON `TapdWorkDefinition`, followed by a compact
`STOPPED_FOR_HANDOFF` line. Include unresolved fields with their explicit
pending state; do not omit them. A downstream repair skill may proceed only
after its own authorization and verification gates, even when this definition
has high confidence.

## Non-negotiable stops

- Multiple equally supported projects: `routing_status=AMBIGUOUS`,
  `resume_decision=PENDING_PROJECT`, request one discriminator, and do no Git
  search.
- Wrong TAPD type, unresolved project, fixed-constraint mismatch, or an
  unverified repository: return `BLOCKED` or `PENDING`, never guess.
- A fixed branch without matching refs and `raw.md`/TAPD-association evidence:
  `NEED_CONFIRMATION` or `PENDING_REPO_VERIFICATION`, never automatic reuse.
- Conflicting historical and current claims: retain both evidence items and
  name the required decision; never overwrite historical context.
- No explicit scope/history confirmation: no pre-edit transition. This skill
  must still stop after the handoff definition.
