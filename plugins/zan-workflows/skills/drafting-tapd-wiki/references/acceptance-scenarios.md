# Acceptance scenarios

Replay these cases using supplied conversation/result facts only. The validator
is private and read-only in every case; none may invoke an external read or
write.

| Scenario | Required result |
| --- | --- |
| Tester is absent, while one evidenced `feature/order-refactor` branch and all other current facts are consistent | `terminal_state=VALIDATED`; tester renders as `待补充`; do not query fields or use `reporter`. |
| The supplied facts set sequence to `7` with source `用户粘贴的月目录顺序` | `current_entry.sequence=7`, `sequence_source=用户粘贴的月目录顺序`, and one `facts.claims` item has `field=sequence`, value `7`, and the same source. Do not turn it into `待补充` or invent a different order. |
| Current facts contain both `feature/order-refactor` and `fixbug/123` as applicable branches | Retain both source claims; `terminal_state=BLOCKED`, `validation.state=VALIDATION_FAILED`, a normalized blocker, and `rendered_markdown=null`. Never select either branch or persist the private verdict. |
| Current facts contain only `merge/order-to-develop` as a branch | `BLOCKED`; a merge intermediate branch is not an effective Wiki branch and cannot render. |
| A pasted draft contains valid historical material and the current facts identify a new distinct entry | `VALIDATED`; the entire original string is unchanged and the canonical current entry is appended as `expected_patch`. |
| A pasted draft contains the evidenced current entry and supplied additive repair facts | `VALIDATED`; retain the entry verbatim and append only an `追加提测/二次提测` note. |
| A requested merge would revise, delete, normalize, or reattribute text in the pasted draft | `BLOCKED`, `preservation.original_preserved=false`, and no final body. |
| Private validator finds an uncited factual value, duplicate branch line, noncanonical environment, or process/write narration | Map to `VALIDATION_FAILED` with the normalized first business reason and `BLOCKED`; do not persist the raw private line or show a partial body. |
| User asks “直接给我一份能复制的最终 Wiki，不要写入” and all current facts validate | Return only raw Markdown body. Do not include a fence, YAML, verdict, commentary, Wiki target, confirmation request, or next step. |

## GREEN replay of the Task 3 RED baseline

Input: tester is absent; current-entry branch claims are both
`feature/order-refactor` and `fixbug/123`; a pasted draft has valid historical
content; the user requests copy-only output with no write.

Expected private result:

```yaml
terminal_state: BLOCKED
effects: NONE
facts:
  conflicts:
    - field: effective_wiki_branch_name
      values: [feature/order-refactor, fixbug/123]
      critical: true
preservation:
  original_preserved: true
validation:
  checked_privately: true
  state: VALIDATION_FAILED
  failure_reason: 当前条目存在多个有效来源分支
  private_verdict_persisted: false
rendered_markdown: null
```

The original draft remains available in the structured result, but no claimed
final body is emitted. Once the branch is resolved, the same tester gap alone
must produce `- 测试人员：待补充` in a copy-only Markdown body and still perform
no write. For both passing and failing validation, the raw private protocol
line is absent from `ValidatedWikiDraft` and any orchestration history.
Validator unavailability maps to `NOT_RUN` with a truthful normalized blocker.
