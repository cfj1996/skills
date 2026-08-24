# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| TAPD details/comments contain one matching 提测 Wiki link | Read and reuse that child; never create a duplicate or ask the user for its URL. |
| No link, but one related current-month child matches the TAPD/branch | Reuse that child and calculate the minimal patch. |
| No link, month exists, no related child | Plan `CREATE_CHILD` named `MM-DD: 中文简述` under that month with `# 前端`, sequence `1`, and `是否上线：否`. |
| No link and current month is absent | Plan `CREATE_MONTH_AND_CHILD` below root `1150372234001008260`; never put the entry body in the month page. |
| Multiple linked or related Wiki candidates | Block rather than ask for an arbitrary URL or create another page. |
| Reused target without `# 前端` | Append `# 前端` and a sequence `1` entry containing `是否上线：否`. |
| Existing `# 前端` sequences `1` and `3` | Append the new entry as sequence `4`; do not count sub-list numbers. |
| Existing unique entry with the same source branch | Keep its sequence, append the re-test note, and add `是否上线：否` before environment only when the field is missing. |
| Tester or another canonical field cannot be resolved | Block and emit no final body; never render `待补充`. |
| Two applicable source branches conflict | Block and emit no final Wiki body. |
| Only a `merge/*` branch is supplied | Block; never substitute it as the code branch. |
| Linked target cannot be read or has multiple branch matches | Block rather than guess the target, sequence, or insertion point. |
| Proposed output rewrites historical text | Block rather than regenerate the page. |
| Direct drafting request with resolvable TAPD work | Resolve the target plan internally and return the complete resulting raw Markdown without requiring a Wiki URL. |
| Called by `submitting-for-test` | Return the complete in-memory `ValidatedWikiDraft` to the consumer; do not collapse the handoff to a string. |

All scenarios are read-only and create no state or record files.
