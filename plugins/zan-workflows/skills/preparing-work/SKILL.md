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
[collection-and-branch.md](references/collection-and-branch.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before acting. Fetch
TAPD through `tapd-mcp`; do not open a browser merely because a TAPD page is available.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
ambiguous case or regression check.

When the orchestrator already supplied an exact project, repository, TAPD
identity, scope and fixed branch with current evidence, validate those facts
instead of repeating project routing, prototype inspection or unrelated Wiki
history. Fetch remote refs once for the preflight and refresh them only before
branch creation or after an observed change. The read-only preflight and later
authorized handoff reuse the same evidence set; the second pass checks only
mutable facts and confirmation binding.

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

Reuse an in-memory `implementationBrief`, Bug investigation summary, or an
applicable formal Plan/Task result from the orchestrator. Validate its scope,
evidence and acceptance against the same selected item and fixed branch.
Small changes need no formal Plan or Task breakdown. Existing formal Plan/Task
requirements and blockers remain binding; a shorter summary cannot bypass them.

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
7. Derive the status plan with scope and branch facts. Display the concrete
   changes in Chinese under the shared 确定清单 before approval; its confirmed
   current content becomes 执行清单. Keep raw status
   codes/payload, identity-source details and full SHA in the verified internal
   definition. The readable preview must still map exactly to those facts. For a
   Bug, apply [修复中状态与处理人](../implementing-work/references/bug-repair-owner.md)
   and its read-only helper. Resolve one verified TAPD repair account and bind
   its source/member evidence plus the old `status,current_owner` to the plan.
   Use `WRITE_ACTIVE` when entering `修复中` or correcting an already-active
   Bug's owner; its payload must contain both status and `current_owner`.
   Use `NO_CHANGE` only when both active status and repair owner match, or
   `SKIPPED_ALREADY_WAITING_TEST` for `CONTINUE` already in `待测试`, preserving
   status and owner without requiring a new repair account. For a Story or Task, use exactly
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
- If both refs exist, verify ancestry. Equal refs or a verified local-ahead tip
  with confirmed scope/baseline can use the existing local branch. Bind its exact
  tip; remote-ahead/diverged refs block automatic selection or synchronization.
- Repository fingerprint, scope confirmation, exact branch decision, and a
  matching current-conversation branch/implementation confirmation must
  pass before `READY_FOR_HANDOFF`.
- A `CREATE` handoff must include the exact verified base ref and SHA. Never
  guess a base in `implementing-work`.
- Only Bug definitions may carry a `WRITE_ACTIVE` status plan or target
  `修复中`; Story/Task definitions must use `NOT_APPLICABLE_NON_BUG`.
- A missing/ambiguous repair account is `PENDING`, not a status-only write.
  Do not infer a TAPD account from `USER_NAME`, Git, the branch author, tester,
  or reporter. Status alone never proves an active Bug has the right owner.
- Do not create `raw.md`, `raw.json`, `__test___`, `.zan-workflows`, or any
  other preparation artifact.
