---
name: drafting-wiki
description: Use when supplied TAPD and change facts must become a validated, directly copyable TAPD Wiki Markdown draft without writing any external or local state.
---

# Draft TAPD Wiki

Produce one read-only `ValidatedWikiDraft`. This skill renders facts already
present in the conversation or supplied handoffs. It never creates, locates,
reads, or updates a Wiki and never writes TAPD, Git, release, or local files.

Read [contracts.md](references/contracts.md),
[wiki-template.md](references/wiki-template.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before drafting.

## Inputs

Accept any combination of current-conversation facts, a TAPD URL or work
definition, a reviewed change, delivery facts, and a pasted existing Wiki
draft. Every material value must retain its supplied source. Do not query or
invent missing people, project, branch, service, or delivery facts.

## Procedure

1. Normalize supplied claims and retain conflicts.
2. Render absent noncritical fields as `待补充`. A missing or conflicting
   effective branch is critical and blocks the draft.
3. Use exactly one evidenced original `feature/*` or `fixbug/*` branch for the
   current entry. Never use a `merge/*` branch.
4. Apply the smallest additive patch from
   [wiki-template.md](references/wiki-template.md). Preserve a pasted existing
   draft byte-for-byte outside that patch.
5. Give the proposed draft and supplied facts to the private read-only
   [wiki-validator.md](agents/wiki-validator.md). Map its response to
   `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN`, retain only a concise reason,
   and discard the private line.
6. Form one internal `ValidatedWikiDraft` with
   `terminal_state=VALIDATED|BLOCKED`, supplied claims, preservation facts,
   mapped validation state, rendered Markdown, and blocker when applicable.
   `submitting-for-test` consumes this complete in-memory result.

For a standalone user call, project a successful internal result to only the
raw copyable Markdown. On failure, return a concise blocker and no claimed
final body. The user-facing projection does not change the internal contract.

No input/output JSON, report file, runtime state, or recovery information is
created. When called by `submitting-for-test`, the draft exists only in memory
until that skill displays the complete rendered Markdown for authorization.
