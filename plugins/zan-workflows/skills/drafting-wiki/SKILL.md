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
[change consistency](../../references/change-consistency.md),
[wiki-template.md](references/wiki-template.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before drafting. Read
[acceptance-scenarios.md](references/acceptance-scenarios.md) only for a disputed
edge case or regression check. TAPD
and Wiki reads use `tapd-mcp`; browser automation is not a discovery fallback.

Use [shared-test-wiki.md](../../references/shared-test-wiki.md) for owner
discovery and multi-project grouping. One Story/Bug has one target; its page
may contain multiple repository/branch entries. Produce the complete shared
body, retaining all included projects and their distinct status fields.

An entrypoint's pre-execution template preview uses the existing
[template-preview rules](references/wiki-template.md#确定清单中的模板预览) and
does not invoke this formal drafting procedure before implementation is reviewed.
It has no `VALIDATED` state, target/body fingerprint or write authority by itself.
When submission is planned, replace placeholders with evidenced facts. A main
entry's confirmed complete execution checklist may authorize that scoped
completion and write; the consumer compares the exact validated draft to it
without a routine second confirmation. Standalone submission still obtains
its own exact-plan approval; this drafting skill remains read-only in either context.

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

1. For `CONTINUE`, classify the
   current-round change from the reviewed diff and implementation/verification
   evidence as `FUNCTIONAL_IMPACT|NON_FUNCTIONAL`; an ambiguous classification
   blocks. Classify actual behavior, consumers, verification and delivery
   conditions, not file type or diff size. Stale or missing material claims
   require correction even during a nominal refactor. Classification alone does not skip target discovery. A non-functional
   continuation may skip body writes only after step 2 verifies an existing
   owner page and the current repository/original-branch entry. Entry completeness
   includes applicable [supplemental Wiki Jobs](references/wiki-template.md#instant-apps-live-app-关联-job);
   a missing required link takes the minimal correction path, even for `NON_FUNCTIONAL`.
2. Reuse a current complete discovery handoff, or call
   [ensure-test-wiki.mjs](../submitting-for-test/scripts/ensure-test-wiki.mjs)
   once without `--execute` to obtain the target, existing body/hash and
   comment-check evidence; creator/body-file are not needed for discovery.
   It reads the exact TAPD item and comments once, resolves a Task’s parent
   Story and, when its anchor is absent, checks exact sibling Tasks for legacy
   links. Retain `wikiOwner`, ownership evidence and `commentOperations`. A
   linked owner page may return `APPEND_ENTRY` before the current project’s
   branch exists; this is a valid read-only draft target. When count is absent,
   continue full pages until a short page; otherwise exhaust the reported
   count. Repeated or inconsistent pages block. Never repeat an identical comment query.
   If a matching 提测 Wiki link exists, reuse its exact ID and readback; read
   that ID only if the handoff did not include it. Never re-read a page already
   supplied by the helper or list Wiki pages. Under `CONTINUE`, reuse a matching current-conversation
   target after checking details and current comments for conflicts. Retain
   the exact existing ID/parent/title/hash; do not rediscover it at execution.
   For `NON_FUNCTIONAL`, only a still-complete and accurate entry plus
   `REUSE_EXISTING` and `REUSE_ENTRY` permits
   `SKIPPED_BY_POLICY` with `skip_reason=NON_FUNCTIONAL_CONTINUE`: retain the
   owner evidence, exact target and body readback for `going-live`, and return
   no proposed body. A missing page or `APPEND_ENTRY` continues normal drafting
   below. An existing but stale entry follows the validated correction path.
   Unavailable or conflicting evidence blocks; it never proves absence.
3. When the helper supplied a complete target, reuse it with no further Wiki
   queries. Only when no matching link or complete helper target exists,
   query `get_wiki(name=YYYY-MM)` once and select
   the month whose returned `parent_wiki_id` equals the fixed `提测文档` root.
   Then query the deterministic child title once; filter returned rows by the
   verified month ID and plan creation when none exists. A same-title child
   without an exact owner link is an ownership conflict, even if its repository
   and branch match; block instead of reusing or creating another page.
   `get_wiki` does not support `parent_wiki_id` as a query option: never pass it,
   enumerate every Wiki page, or retry an unchanged query with a new limit or
   sort order. An ambiguous or unavailable result blocks instead of widening
   the search. Never ask the user for a Wiki target.
4. Resolve and reconcile the current TAPD/change, repository, exact Jenkins
   Job name and URL, selected build/release parameter names and values verified against
   Jenkins definitions, project name, project category/service type, package
   classification, developer, tester, description, scope, and original source
   branch from current read-only evidence. Resolve applicable supplemental Wiki
   Jobs separately under `wiki-template.md`; they do not expand the test-build
   list or require deployment parameters or build receipts. Retain conflicts and block
   unresolved required fields. Under `SKIP` (including a standalone Wiki-only
   request), use only existing parameter evidence and omit unknown selections;
   do not query Jenkins parameters/builds or ask for deployment-only inputs.
   If the canonical Job URL is missing from knowledge, use the exact read-only
   [Job lookup](../../scripts/resolve-jenkins-job.mjs), or the session's `job`
   PLAN action. This metadata lookup is not a deployment. Missing selections
   are allowed under `SKIP`, but the Job name/URL and other Wiki facts remain
   required. An exact developer name already present in TAPD or the reviewed
   handoff needs no team-roster or GitLab identity lookup; use the identity
   skill only to resolve an actual missing or conflicting mapping.
5. Each project entry uses exactly one evidenced original `feature/*` or
   `fixbug/*` branch, paired with its verified repository (`entryRepoUrl`).
   Never use `merge/*`. The page may contain multiple branches and the same
   branch name in different repositories; select the entry by repository plus
   branch, not by a page-wide branch count.
6. For an existing target, locate `# 前端`. If this repository/branch has no
   entry, append its complete new canonical entry, including a non-functional
   continuation that could not skip. For a `FUNCTIONAL_IMPACT` continuation
   with a matching entry, reconcile `内容`, `影响范围`, `验证结果` and actual
   `交付条件` against the reviewed full delivery and incremental change. Revise
   superseded current claims and add missing impacts even on the same page;
   retain unaffected history and other projects. This is an `UPDATE_ENTRY`
   minimal patch, not just a module-name append. Apply the same correction to
   a stale entry found in a non-functional continuation. For a business project, also change `已合并` back to
   `未合并` when the new current-round commits are not contained in
   the verified remote default ref (`origin/master` or `origin/main`); preserve an existing `未合并`. A new functional submission
   round also resets an existing `待合并` to `未合并`; a non-functional skip
   retains the existing body. Only going-live writes 待合并 after exact open-MR
   proof. For a tooling project,
   resolve `当前版本` using the channel evidence and minimal legacy-field
   replacement rules in `wiki-template.md`. Missing or conflicting status facts
   block. Never create a second entry for the same repository/branch identity. For
   a new target, render
   a complete body beginning with `# 前端` and sequence `1`, initializing each
   new entry with `是否上线：未合并` for a business project, or
   `当前版本：canary|latest` for a tooling/library project, or `当前版本：待发布`
   under `TRIGGER_ACCEPTED` when no existing publication is evidenced. Preserve
   an evidenced prior channel; queue acceptance never proves a new publication.
7. For a policy skip, map validation to `NOT_RUN` with its normalized reason.
   Otherwise, give the target plan, hierarchy/readback evidence, normalized
   facts, reviewed behavior/basis/impact/verification with exact diff evidence,
   coverage mapping, calculation, patch, and proposed body to the private read-only
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
and is consumed under the main execution-checklist authority or the standalone
submission's exact confirmation; drafting itself never authorizes a write.
