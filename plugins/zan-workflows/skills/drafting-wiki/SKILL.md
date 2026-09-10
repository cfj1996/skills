---
name: drafting-wiki
description: Use when current TAPD and reviewed-change context must locate or plan the required TAPD Wiki and calculate a validated Markdown body without writing external state.
---

# Draft TAPD Wiki

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) when selecting a
subagent model or considering escalation.

Produce one read-only `ValidatedWikiDraft` with an automatically resolved
`WikiTargetPlan`. The skill may read TAPD details/comments, Wiki hierarchy,
Git, reviewed-change handoffs, and project knowledge, but it never creates or
updates Wiki, TAPD, Git, release, or local state.

Read [contracts.md](references/contracts.md),
[wiki-template.md](references/wiki-template.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before drafting.

## Inputs

For a standalone call, use the current TAPD work identifier from the request or
conversation. For an orchestrated call, accept the work definition, reviewed
change, `INITIAL|CONTINUE`, delivery facts, and original source branch. Do not
require the user to provide a Wiki URL, month page, sequence, module, or entry fields. Resolve them
from read-only sources and retain the source of every material value. An
ambiguous existing target or unresolved required fact blocks the draft; never
invent a value or render a placeholder.

## Procedure

1. Read the TAPD item and all historical comments. If they contain a matching
   提测 Wiki link for this work, resolve and read that exact Wiki; it must be
   reused. Under `CONTINUE`, also reuse the current-conversation/final prior
   Wiki target when it matches the TAPD item and branch. For `CONTINUE`, before
   planning any new target or resolving Wiki-only fields, classify the
   current-round change from the reviewed diff and implementation/verification
   evidence as `FUNCTIONAL_IMPACT|NON_FUNCTIONAL`; an ambiguous classification
   blocks. If it is `NON_FUNCTIONAL`, return `SKIPPED_BY_POLICY` with
   `skip_reason=NON_FUNCTIONAL_CONTINUE` and do not plan or create a Wiki
   target; retain an already-read existing target only when it is available for
   a later explicit `going-live` handoff.
2. When no linked Wiki exists and the change is not policy-skipped, inspect the fixed `提测文档` hierarchy and the
   current `YYYY-MM` month. Reuse one related `MM-DD: 中文简述` child matched by
   TAPD identity, short ID, or original source branch; otherwise plan creation
   of the missing month and/or child Wiki. Never ask the user for the target.
3. Resolve and reconcile the current TAPD/change, repository, exact Jenkins
   Job name and URL, selected build/release parameter names and values verified against
   Jenkins definitions, project name, project category/service type, package
   classification, developer, tester, description, scope, and original source
   branch from current read-only evidence. Retain conflicts and block
   unresolved fields.
4. Use exactly one evidenced original `feature/*` or `fixbug/*` branch. Never
   use a `merge/*` branch. Use that branch to identify an existing current
   entry.
5. For a `FUNCTIONAL_IMPACT` continuation, locate `# 前端`, reuse the matching
   branch entry, and append the affected scope to that entry's existing
   `影响范围` list. For a business project, also change `已合并` back to
   `未合并` when the new current-round commits are not contained in
   `origin/master`; preserve an existing `未合并`. For a tooling project,
   require and preserve `无需上线`. A missing status or any value outside the
   current three-state contract blocks. Never create a second entry for the same branch. For
   `INITIAL`, render
   a complete body beginning with `# 前端` and sequence `1`, initializing each
   new entry with the resolved status: `未合并` for a business project or
   `无需上线` for a tooling/library project.
6. For a policy skip, map validation to `NOT_RUN` with its normalized reason.
   Otherwise, give the target plan, hierarchy/readback evidence, normalized
   facts, calculation, patch, and proposed body to the private read-only
   [wiki-validator.md](agents/wiki-validator.md). Map its response to
   `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN`, retain only a concise reason,
   and discard the private line.
7. Form one internal `ValidatedWikiDraft` with
   `terminal_state=VALIDATED|SKIPPED_BY_POLICY|BLOCKED`, resolved claims, preservation facts,
   mapped validation state, rendered Markdown, and blocker when applicable.
   `submitting-for-test` consumes this complete in-memory result.

For a standalone user call, project a `VALIDATED` result to only the complete
raw copyable resulting Markdown. Project `SKIPPED_BY_POLICY` as a concise
non-functional-change skip with no body. The internal result still retains
whether the page must be reused or created. On failure, return a concise
blocker and no claimed final body.

No input/output JSON, report file, runtime state, or recovery information is
created. When called by `submitting-for-test`, the draft exists only in memory
until that skill displays the complete rendered Markdown for authorization.
