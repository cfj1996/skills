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
   reused.
   Under `CONTINUE`, also reuse the current-conversation/final prior Wiki target
   when it matches the TAPD item and branch.
2. When no linked Wiki exists, inspect the fixed `提测文档` hierarchy and the
   current `YYYY-MM` month. Reuse one related `MM-DD: 中文简述` child matched by
   TAPD identity, short ID, or original source branch; otherwise plan creation
   of the missing month and/or child Wiki. Never ask the user for the target.
3. Resolve and reconcile the current TAPD/change, repository, service,
   developer, tester, description, scope, and original source branch from
   current read-only evidence. Retain conflicts and block unresolved fields.
4. Use exactly one evidenced original `feature/*` or `fixbug/*` branch. Never
   use a `merge/*` branch. Use that branch to identify an existing current
   entry.
5. For a reused child, locate `# 前端`, calculate the sequence or matching
   re-test position, and apply the smallest patch from
   [wiki-template.md](references/wiki-template.md). For a new child, render a
   complete body beginning with `# 前端` and sequence `1`. Initialize each new
   entry with `是否上线：否`.
   `CONTINUE` with a matching branch entry appends only the incremental
   re-test note (and a missing legacy online field when required); it does not
   create another entry or reset an existing online value.
6. Give the target plan, hierarchy/readback evidence, normalized facts,
   calculation, patch, and proposed body to the private read-only
   [wiki-validator.md](agents/wiki-validator.md). Map its response to
   `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN`, retain only a concise reason,
   and discard the private line.
7. Form one internal `ValidatedWikiDraft` with
   `terminal_state=VALIDATED|BLOCKED`, resolved claims, preservation facts,
   mapped validation state, rendered Markdown, and blocker when applicable.
   `submitting-for-test` consumes this complete in-memory result.

For a standalone user call, project a successful internal result to only the
complete raw copyable resulting Markdown. The internal result still retains
whether the page must be reused or created. On failure, return a concise
blocker and no claimed final body.

No input/output JSON, report file, runtime state, or recovery information is
created. When called by `submitting-for-test`, the draft exists only in memory
until that skill displays the complete rendered Markdown for authorization.
