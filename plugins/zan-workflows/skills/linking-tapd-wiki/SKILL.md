---
name: linking-tapd-wiki
description: Use when a TAPD Bug, Story, or Task already has a verified 提测 Wiki and its exact link must be added to or verified in the item comments without rerunning the submission workflow.
---

# Link TAPD Wiki

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens comment-write
gates.

Link one verified 提测 Wiki to one TAPD work item comment. This capability is
idempotent and supports `Bug|Story|Task`. It does not create or edit Wiki pages,
change TAPD status or test versions, deliver Git changes, deploy, or go live.
When `submitting-for-test/scripts/ensure-test-wiki.mjs` has already returned a
read-back `LINKED|ALREADY_LINKED` result for the exact item/Wiki, do not invoke
this skill again.

Read [contracts.md](references/contracts.md),
[acceptance-scenarios.md](references/acceptance-scenarios.md), and the shared
[tool-routing policy](../../references/tool-routing.md) before any write. All
TAPD item, comment, and Wiki reads/writes use `tapd-mcp`; browser automation is
not a fallback.

## Inputs and modes

Require one exact TAPD item identity, its type `Bug|Story|Task`, and one exact
Wiki target containing workspace ID, Wiki ID, canonical URL, and association
evidence. Accept `link_phase=PLAN|EXECUTE` and
`confirmation_mode=STANDALONE|DEFER_TO_ORCHESTRATOR`.

- `STANDALONE`: `PLAN` is mandatory, displays the exact comment operation and
  stops. A later exact confirmation permits `EXECUTE`.
- `DEFER_TO_ORCHESTRATOR`: used by `submitting-for-test`. The current confirmed
  `SubmissionPlan` must already contain the exact item target, Wiki target,
  deterministic comment payload, operation, and purpose. Never ask again while
  those facts remain unchanged.

A raw URL alone is not association proof. Accept association from a validated
`WikiTargetPlan|TestSubmissionResult`, or prove it from the Wiki readback using
the TAPD ID/short ID, original branch, and matching workspace. Missing or
conflicting association evidence is `BLOCKED`.

## Procedure

1. Resolve the exact item, Wiki ID, original source branch and author from
   the request/current verified handoff. Reuse available association evidence;
   never ask again for known facts. Without a complete current handoff, call
   [ensure-test-wiki.mjs](../submitting-for-test/scripts/ensure-test-wiki.mjs)
   once in `--mode link --expected-wiki-id <id>` without `--execute`.
   Its preview returns the exact body SHA-256, parent/title, canonical payload
   and complete comment-check evidence. It reads item/comments/Wiki in parallel,
   pages comments until a short page when count is absent, and blocks repeated
   or inconsistent results. Never accept a predicted ID or unreadable Wiki.
2. Verify the same TAPD workspace and supplied association evidence. Retain
   the exact Wiki ID, parent, title and `beforeBodySha256` from the preview or
   current handoff; no hierarchy discovery is needed.
3. Use the script's historical-comment evidence by canonical Wiki ID,
   regardless of plain text or Markdown:
   - the same Wiki ID already present returns `ALREADY_LINKED` with no write;
   - a different 提测 Wiki link returns `BLOCKED_CONFLICT` with both targets;
   - no Wiki link proceeds to the exact comment plan.
4. Render exactly:

   ```text
   提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})
   ```

   Do not append implementation, MR, build, deployment, verification, or status
   text.
5. For standalone `PLAN`, display item type/ID, canonical Wiki ID/URL, exact
   payload, `intended_operation=TAPD_COMMENT`, and purpose, return
   `AWAITING_CONFIRMATION`, ask exactly `是否补写以上 Wiki 链接评论？`, and stop.
6. For `EXECUTE`, require the matching standalone or unchanged orchestrator
   confirmation and run [comment-validator.md](agents/comment-validator.md)
   once for the full authorized script invocation. Only `验证通过` permits
   execution; discard the private line.
7. Call the helper once with `--mode link --execute`, exact item/branch,
   `--expected-wiki-id`, `--expected-month-id`, title,
   `--expected-body-sha256`, `--expect-target REUSE_EXISTING` and comment
   author. Do not pass `--body-file`: this mode cannot create or update Wiki.
   The script refreshes exact bound facts, writes through `tapd-mcp` only when
   missing and reads back one conflict-free canonical target. Require
   `wikiState=UNCHANGED` and `commentState=LINKED|ALREADY_LINKED`; map its
   failure to `BLOCKED` and stop. Do not manually repeat its reads or invoke
   another validator between write and readback. Unknown effects are never
   retried or inferred as success.

## Output

Return one in-memory `TapdWikiLinkResult` with item type/ID/workspace, Wiki
ID/URL and association evidence, prior matching/conflicting comments, exact
payload and authorization source, write/readback evidence, validation result,
and terminal state
`AWAITING_CONFIRMATION|ALREADY_LINKED|LINKED|BLOCKED_CONFLICT|BLOCKED`.

Create no report, state file, recovery record, or generated evidence directory.
