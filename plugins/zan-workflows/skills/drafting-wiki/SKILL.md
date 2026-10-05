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
[wiki-template.md](references/wiki-template.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before drafting. Read
[acceptance-scenarios.md](references/acceptance-scenarios.md) only for a disputed
edge case or regression check. TAPD
and Wiki reads use `tapd-mcp`; browser automation is not a discovery fallback.

## Inputs

For a standalone call, use the current TAPD work identifier from the request or
conversation. For an orchestrated call, accept the work definition, reviewed
change, `INITIAL|CONTINUE`, resolved `DEPLOY|SKIP`, delivery facts, and original
source branch. For a standalone call, use explicit deployment intent or existing
delivery facts; a Wiki-only request has no deployment selection requirement. Do not
require the user to provide a Wiki URL, month page, sequence, module, or entry fields. Resolve them
from read-only sources and retain the source of every material value. An
ambiguous existing target or unresolved required fact blocks the draft; never
invent a value or render a placeholder.

## Procedure

1. For `CONTINUE`, before any Wiki query, classify the
   current-round change from the reviewed diff and implementation/verification
   evidence as `FUNCTIONAL_IMPACT|NON_FUNCTIONAL`; an ambiguous classification
   blocks. If it is `NON_FUNCTIONAL`, return `SKIPPED_BY_POLICY` with
   `skip_reason=NON_FUNCTIONAL_CONTINUE` and do not plan or create a Wiki
   target; retain an already-read existing target only when it is available for
   a later explicit `going-live` handoff.
2. Reuse a current complete discovery handoff, or call
   [ensure-test-wiki.mjs](../submitting-for-test/scripts/ensure-test-wiki.mjs)
   once without `--execute` to obtain the target, existing body/hash and
   comment-check evidence; creator/body-file are not needed for discovery.
   It reads the exact TAPD item and comments once. When count is absent,
   continue full pages until a short page; otherwise exhaust the reported
   count. Repeated or inconsistent pages block. Never repeat an identical comment query.
   If a matching 提测 Wiki link exists, reuse its exact ID and readback; read
   that ID only if the handoff did not include it. Never re-read a page already
   supplied by the helper or list Wiki pages. Under `CONTINUE`, reuse a matching current-conversation
   target after checking details and current comments for conflicts. Retain
   the exact existing ID/parent/title/hash; do not rediscover it at execution.
3. When the helper supplied a complete target, reuse it with no further Wiki
   queries. Only when no matching link or complete helper target exists,
   query `get_wiki(name=YYYY-MM)` once and select
   the month whose returned `parent_wiki_id` equals the fixed `提测文档` root.
   Then query the deterministic child title once; filter returned rows by the
   verified month ID and reuse a unique matching child or plan creation.
   `get_wiki` does not support `parent_wiki_id` as a query option: never pass it,
   enumerate every Wiki page, or retry an unchanged query with a new limit or
   sort order. An ambiguous or unavailable result blocks instead of widening
   the search. Never ask the user for a Wiki target.
4. Resolve and reconcile the current TAPD/change, repository, exact Jenkins
   Job name and URL, selected build/release parameter names and values verified against
   Jenkins definitions, project name, project category/service type, package
   classification, developer, tester, description, scope, and original source
   branch from current read-only evidence. Retain conflicts and block
   unresolved required fields. Under `SKIP` (including a standalone Wiki-only
   request), use only existing parameter evidence and omit unknown selections;
   do not call Jenkins or ask for deployment-only inputs. Missing selections
   are allowed under `SKIP`, but the Job name/URL and other Wiki facts remain
   required. An exact developer name already present in TAPD or the reviewed
   handoff needs no team-roster or GitLab identity lookup; use the identity
   skill only to resolve an actual missing or conflicting mapping.
5. Use exactly one evidenced original `feature/*` or `fixbug/*` branch. Never
   use a `merge/*` branch. Use that branch to identify an existing current
   entry.
6. For a `FUNCTIONAL_IMPACT` continuation, locate `# 前端`, reuse the matching
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
7. For a policy skip, map validation to `NOT_RUN` with its normalized reason.
   Otherwise, give the target plan, hierarchy/readback evidence, normalized
   facts, calculation, patch, and proposed body to the private read-only
   [wiki-validator.md](agents/wiki-validator.md). Map its response to
   `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN`, retain only a concise reason,
   and discard the private line.
8. Form one internal `ValidatedWikiDraft` with
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
