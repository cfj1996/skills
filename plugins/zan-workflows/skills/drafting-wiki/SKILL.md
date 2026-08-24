---
name: drafting-wiki
description: Use when one exact TAPD Wiki target must be read and combined with the current TAPD, Git, and reviewed-change context to calculate a validated, directly copyable Markdown update without writing external state.
---

# Draft TAPD Wiki

Produce one read-only `ValidatedWikiDraft` for an exact target Wiki. The skill
may read the target Wiki, TAPD, Git, reviewed-change handoffs, and project
knowledge to calculate the content, but it never writes Wiki, TAPD, Git,
release, or local state.

Read [contracts.md](references/contracts.md),
[wiki-template.md](references/wiki-template.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before drafting.

## Inputs

For a standalone call, require only one exact `target_wiki_url` from the user.
Resolve the current work from the conversation and read-only TAPD, Git, project
knowledge, and Wiki reads. For an orchestrated call, also accept a work
definition, reviewed change, and delivery facts as authoritative handoffs, but
reconcile them with current readbacks instead of requiring the user to restate
their fields. Every material value must retain its source. An unreadable target
or unresolved required fact blocks the draft; never invent a value or render a
placeholder.

## Procedure

1. Read the exact target Wiki and retain its body, identity, source, and content
   hash. Do not calculate from an unseen page.
2. Resolve and reconcile the current TAPD/change, repository, service,
   developer, tester, description, scope, and original source branch from
   current read-only evidence. Retain conflicts and block unresolved fields.
3. Use exactly one evidenced original `feature/*` or `fixbug/*` branch. Never
   use a `merge/*` branch. Use that branch to identify an existing current
   entry.
4. Locate `# 前端`, calculate the sequence or matching re-test position, and
   apply the smallest patch defined by
   [wiki-template.md](references/wiki-template.md). Initialize every new entry
   with `是否上线：否` and preserve the target byte-for-byte outside the patch.
5. Give the target readback, normalized facts, calculation, patch, and proposed
   body to the private read-only
   [wiki-validator.md](agents/wiki-validator.md). Map its response to
   `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN`, retain only a concise reason,
   and discard the private line.
6. Form one internal `ValidatedWikiDraft` with
   `terminal_state=VALIDATED|BLOCKED`, supplied claims, preservation facts,
   mapped validation state, rendered Markdown, and blocker when applicable.
   `submitting-for-test` consumes this complete in-memory result.

For a standalone user call, project a successful internal result to only the
complete raw copyable resulting Markdown. On failure, return a concise blocker
and no claimed final body. The user-facing projection does not change the
internal contract.

No input/output JSON, report file, runtime state, or recovery information is
created. When called by `submitting-for-test`, the draft exists only in memory
until that skill displays the complete rendered Markdown for authorization.
