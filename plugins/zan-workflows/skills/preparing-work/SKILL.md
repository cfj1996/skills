---
name: preparing-work
description: Use when one TAPD Bug, Story, or Task must be read, scoped, routed to a verified project, and bound to an exact new or existing branch before implementation.
---

# Prepare TAPD Work

Resolve one TAPD item into one validated `TapdWorkDefinition`. This skill is
read-only: it does not edit source, create branches/worktrees, change TAPD, or
write workflow records.

Read [contracts.md](references/contracts.md),
[collection-and-branch.md](references/collection-and-branch.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before acting.

## Inputs

Accept exactly one TAPD URL plus optional hard constraints:

- `fixed_project`;
- `fixed_repo_path`;
- `fixed_branch`;
- `create_base_ref`, when branch creation may be selected and no governing
  workspace policy supplies it;
- `branch_mode=AUTO|CREATE|USE_EXISTING`; and
- additive `scope_increment` supplied in the current conversation.

Constraints are requirements, not hints. Never replace a supplied project,
repository, or branch with a more plausible candidate.

## Procedure

1. Parse type and ID from the URL and fetch the TAPD item read-only. Retain the
   title, description, acceptance facts, attachments/comments that affect
   scope, and missing or conflicting claims in memory.
2. Derive the requested work scope, explicit non-scope, acceptance criteria,
   and `context_confidence`. Never infer missing requirements as facts.
3. Resolve the project using supplied constraints and workspace project
   knowledge. Verify the canonical repository path, Git root, and origin
   remote. If multiple projects remain plausible, return `PENDING` with the
   exact choice required.
4. Apply the branch rules in
   [collection-and-branch.md](references/collection-and-branch.md):
   `CREATE` prepares an exact branch name plus verified base ref/SHA for later
   creation;
   `USE_EXISTING` verifies and selects the exact existing branch;
   `AUTO` selects one of those outcomes only from the exact supplied branch.
5. Display the derived scope, selected project/repository, selected or planned
   branch, and confidence/missing facts. Obtain any required user confirmation.
6. Run the private read-only validator in [agents/validator.md](agents/validator.md).
   Map its result to `VALIDATION_PASSED` or `VALIDATION_FAILED` and discard the
   private protocol line.
7. Return one in-memory `TapdWorkDefinition`. Do not write it to disk.

## Hard rules

- `USE_EXISTING` means start this work on an existing branch. It never requires
  the branch to already contain this TAPD item's commits, Wiki/raw documents,
  generated evidence, or tests.
- If local and remote refs both exist, their SHAs must match. A mismatch is
  `BLOCKED`; never choose one silently.
- Repository fingerprint, scope confirmation, and exact branch decision must
  pass before `READY_FOR_HANDOFF`.
- A `CREATE` handoff must include the exact verified base ref and SHA. Never
  guess a base in `implementing-work`.
- Do not create `raw.md`, `raw.json`, `__test___`, `.zan-workflows`, or any
  other preparation artifact.
