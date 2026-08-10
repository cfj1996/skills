---
name: drafting-tapd-wiki
description: Use when current conversation facts or supplied TAPD work, reviewed change, delivery, and existing Wiki-draft results must become a semantically validated, directly copyable TAPD Wiki Markdown draft without creating or updating a Wiki, TAPD item, Git state, MR, or release.
---

# Draft TAPD Wiki

Produce one read-only `ValidatedWikiDraft`. This skill turns facts already
present in the conversation or supplied result objects into a TAPD Wiki body;
it is not a submission or Wiki-write workflow.

## Workflow runtime envelope

When submission invokes this skill, it must first create a nested invocation in
the same `run_id` and pass only `run_id`/`invocation_id` as execution metadata.
Record the exact factual input and the complete public `ValidatedWikiDraft`
before submission consumes it; do not persist the private validator line. Read
[workflow-runtime.md](../../references/workflow-runtime.md). Runtime recording
is not a Wiki write and does not change the final direct-call rule: after the
record is complete, a successful standalone response remains only copyable
Markdown.

## Inputs and boundaries

Read [contracts.md](references/contracts.md) and
[wiki-template.md](references/wiki-template.md) before drafting. Accept any
combination of current-conversation facts, a TAPD URL, `TapdWorkDefinition`,
`ReviewedChange`, delivery facts, and a pasted existing Wiki draft. Treat a
supplied fact as evidence only when its source is retained in the result. Do
not look up, infer, or fabricate a person, branch, repository, service, or
delivery outcome.

This skill has no external side effects. Do not create, update, read, choose,
or locate a Wiki; do not call TAPD; do not run Git; and do not edit, commit,
merge, publish, or write local state. It does not ask for writeback approval
or provide writeback instructions.

## Draft procedure

1. Normalize supplied facts into `facts`, retaining each source and all
   competing claims. Take an existing draft verbatim as `preservation.original`;
   never treat its text as permission to overwrite history.
2. Classify each absent value using [contracts.md](references/contracts.md).
   Render noncritical missing values as the literal `待补充`; do not replace
   them with a likely value. A missing tester is noncritical. A missing,
   malformed, or competing effective source branch is critical.
3. Determine the one `effective_wiki_branch_name` for the current entry. It
   must be exactly one supplied, evidenced `feature/*` or `fixbug/*` source
   branch. A `merge/*` branch is never valid. If two different candidates
   apply to the current entry, retain both facts, set `terminal_state=BLOCKED`,
   and do not choose one.
4. Use [wiki-template.md](references/wiki-template.md) to create the smallest
   patch. With a pasted draft, preserve every valid historical character and
   structure: append an explicitly dated/identified re-test note under the
   matching entry only when it has no conflicting fact; otherwise append a new
   canonical entry without modifying historical entries. Record the exact
   insertion point and `expected_patch`. Without a pasted draft, the canonical
   entry is the complete body.
5. Assemble a `ValidatedWikiDraft` as defined in
   [contracts.md](references/contracts.md). Run the isolated, read-only
   validator in [agents/wiki-validator.md](agents/wiki-validator.md) with the
   proposed result, original draft, and patch. The validator response is
   private. Map it immediately to public `NOT_RUN`, `VALIDATION_PASSED`, or
   `VALIDATION_FAILED`; copy only a normalized business reason to
   `validation.failure_reason`/`blocker_reason`, then discard the raw line. Do
   not expose or persist it in the result, commentary, or orchestration history.
6. If the mapped state is `VALIDATION_FAILED` or `NOT_RUN`, return the blocked
   result with `rendered_markdown=null`. Do not emit a claimed final Wiki body,
   operational narration, target selection, or write instructions.
7. If the mapped state is `VALIDATION_PASSED`, return **only**
   `rendered_markdown` as raw
   Markdown. Do not wrap it in a code fence and do not add a title, status,
   explanation, validation message, or next step. Stop immediately.

## Required facts and stops

- Preserve every supplied conflict and its source. A critical contradiction is
  a stable `BLOCKED` result, not a request to choose the more plausible value.
- `服务名称`, `git 地址`, `开发人员`, `功能描述`, `影响范围`, and `测试人员` may
  be `待补充` when absent. The environment is the canonical `联团 老生产` unless
  supplied facts explicitly and materially contradict the template policy.
- Never use `reporter` as a tester fallback. Do not resolve people or fields
  through an external query in this skill.
- A final current-entry branch must appear on exactly one `代码分支名` line and
  must not combine original and merge/intermediate branches.
- Existing valid draft content is immutable input. If its preservation cannot
  be proven or the requested patch would rewrite it, block rather than
  regenerating the page.
- Re-read [acceptance-scenarios.md](references/acceptance-scenarios.md) before
  returning the result. A successful response is copy-only Markdown; a blocked
  result is a structured `ValidatedWikiDraft`, never an external action.
