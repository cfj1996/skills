---
name: preparing-work
description: Use when one TAPD Bug, Story, or Task must be read, scoped, routed to a verified project, and bound to an exact new or existing branch before implementation.
---

# Prepare TAPD Work

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available, especially for ambiguous project routing.

Resolve one TAPD item into one validated `TapdWorkDefinition`. This skill is
read-only: it does not edit source, create branches/worktrees, change TAPD, or
write workflow records.

Read [contracts.md](references/contracts.md),
[collection-and-branch.md](references/collection-and-branch.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before acting. Fetch
TAPD through `tapd-mcp`; do not open a browser merely because a TAPD page is available.

## Inputs

Accept exactly one TAPD URL plus optional hard constraints:

- `fixed_project`;
- `fixed_repo_path`;
- `fixed_branch`;
- `create_base_ref`, when branch creation may be selected and no governing
  workspace policy supplies it;
- `branch_mode=AUTO|CREATE|USE_EXISTING`;
- `work_mode=AUTO|INITIAL|CONTINUE`; and
- additive `scope_increment` supplied in the current conversation; and
- `confirmation_source`, when a current-conversation checklist or standalone
  confirmation binds the exact project/repository, scope, fixed branch,
  source/base, target branch, operation and purpose.

Constraints are requirements, not hints. Never replace a supplied project,
repository, or branch with a more plausible candidate.

## Procedure

1. Parse type and ID from the URL and fetch the TAPD item read-only. Retain the
   title, description, acceptance facts, attachments/comments that affect
   scope, and missing or conflicting claims in memory.
2. Derive the requested work scope, explicit non-scope, acceptance criteria,
   and `context_confidence`. Never infer missing requirements as facts.
3. Resolve `work_mode`. Use `CONTINUE` when the same TAPD work is being
   continued after incomplete implementation, test feedback, post-deployment
   reproduction, or newly discovered omitted scope. Reuse current-conversation
   project/repository/branch facts when unchanged; otherwise recover the
   original source branch from an existing Wiki `代码分支名`, prior MR source,
   TAPD comments, then verified refs. A single consistent branch selects
   `USE_EXISTING`; missing/competing evidence is `PENDING`. Never derive a new
   “后续修复” branch or fall through to `CREATE`.
4. Resolve the project using supplied constraints and workspace project
   knowledge. Verify the canonical repository path, Git root, and origin
   remote. If multiple projects remain plausible, return `PENDING` with the
   exact choice required.
5. Apply the branch rules in
   [collection-and-branch.md](references/collection-and-branch.md):
   `CREATE` prepares an exact branch name plus verified base ref/SHA for later
   creation;
   `USE_EXISTING` verifies and selects the exact existing branch;
   `AUTO` selects one of those outcomes only from the exact supplied branch.
6. Validate the confirmation source against every visible project, scope and
   branch fact. Missing or changed confirmation keeps the definition `PENDING`;
   never ask again when the current-conversation confirmation still matches.
7. Derive and display the status plan with the scope and branch facts. For a
   Bug, use `WRITE_ACTIVE` for an initial item that must enter `修复中`,
   `NO_CHANGE` when already active, or `SKIPPED_ALREADY_WAITING_TEST` for
   `CONTINUE` already in `待测试`. For a Story or Task, use exactly
   `NOT_APPLICABLE_NON_BUG` with no target status, payload, authorization, or
   planned status write. Display the derived incremental scope, work mode, selected
   project/repository, selected/planned branch, and confidence/missing facts.
   For `CONTINUE`, reuse still-valid project/branch confirmation and ask only
   when incremental scope is not explicit or a bound fact changed.
8. Run the private read-only validator in [agents/validator.md](agents/validator.md).
   Map its result to `VALIDATION_PASSED` or `VALIDATION_FAILED` and discard the
   private protocol line.
9. Return one in-memory `TapdWorkDefinition`. Do not write it to disk.

## Hard rules

- `USE_EXISTING` means start this work on an existing branch. It never requires
  the branch to already contain this TAPD item's commits, Wiki/raw documents,
  generated evidence, or tests.
- `CONTINUE` always reuses the original source branch and existing Wiki when
  available. If the original branch cannot be proved, return `PENDING`; do not
  propose a new branch from `develop`, `master`, or another base.
- If local and remote refs both exist, their SHAs must match. A mismatch is
  `BLOCKED`; never choose one silently.
- Repository fingerprint, scope confirmation, exact branch decision, and a
  matching current-conversation branch/implementation confirmation must
  pass before `READY_FOR_HANDOFF`.
- A `CREATE` handoff must include the exact verified base ref and SHA. Never
  guess a base in `implementing-work`.
- Only Bug definitions may carry a `WRITE_ACTIVE` status plan or target
  `修复中`; Story/Task definitions must use `NOT_APPLICABLE_NON_BUG`.
- Do not create `raw.md`, `raw.json`, `__test___`, `.zan-workflows`, or any
  other preparation artifact.
