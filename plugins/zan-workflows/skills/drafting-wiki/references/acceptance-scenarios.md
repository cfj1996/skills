# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Exact target URL and resolvable current work | Read the target, resolve all fields, calculate placement, and validate without requiring user-supplied field values. |
| Empty target or target without `# 前端` | Append `# 前端` and a sequence `1` entry containing `是否上线：否`. |
| Existing `# 前端` sequences `1` and `3` | Append the new entry as sequence `4`; do not count sub-list numbers. |
| Existing unique entry with the same source branch | Keep its sequence, append the re-test note, and add `是否上线：否` before environment only when the field is missing. |
| Tester or another canonical field cannot be resolved | Block and emit no final body; never render `待补充`. |
| Two applicable source branches conflict | Block and emit no final Wiki body. |
| Only a `merge/*` branch is supplied | Block; never substitute it as the code branch. |
| Target cannot be read or has multiple branch matches | Block rather than guess the sequence or insertion point. |
| Proposed output rewrites historical text | Block rather than regenerate the page. |
| Direct target-only request with resolvable facts | Internally form `VALIDATED`; return the complete resulting raw Markdown without code fence or explanation. |
| Called by `submitting-for-test` | Return the complete in-memory `ValidatedWikiDraft` to the consumer; do not collapse the handoff to a string. |

All scenarios are read-only and create no state or record files.
