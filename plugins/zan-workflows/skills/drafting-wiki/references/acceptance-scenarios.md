# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| TAPD details/comments contain one matching 提测 Wiki link | Read and reuse that child; never create a duplicate or ask the user for its URL. |
| No link, but one related current-month child matches the TAPD/branch | Reuse that child and calculate the minimal patch. |
| No link, month exists, no related child | Plan `CREATE_CHILD` named `MM-DD: 中文简述` under that month with `# 前端`, sequence `1`, and the resolved merge status. |
| No link and current month is absent | Plan `CREATE_MONTH_AND_CHILD` below root `1150372234001008260`; never put the entry body in the month page. |
| Multiple linked or related Wiki candidates | Block rather than ask for an arbitrary URL or create another page. |
| Reused target without `# 前端` | Append `# 前端` and a sequence `1` entry containing the resolved merge status. |
| Existing `# 前端` sequences `1` and `3` | Append the new entry as sequence `4`; do not count sub-list numbers. |
| Existing unique entry with the same source branch and a functional change | Keep its sequence, append only the affected scope, and add the resolved merge status only when the field is missing. |
| Continue work after a prior MR/deployment with a functional change | Reuse the same Wiki/branch entry and append only the new affected scope to `影响范围`. |
| Continue work is proven non-functional by the reviewed diff | Return `SKIPPED_BY_POLICY` with `NON_FUNCTIONAL_CONTINUE`; do not update the Wiki. |
| Continue work changes functional behavior | Reuse the matching entry and append only the affected module/page to its `影响范围` list without creating a duplicate entry. |
| A new functional round reuses a business entry currently marked `已合并` | Append the new affected scope and reset only that entry to `是否上线：未合并`. |
| A reused entry has a missing or non-current status | Block; current templates are the only accepted format. |
| Continue impact classification is ambiguous | Block and emit no final body; never guess whether the Wiki needs an update. |
| Tester or another canonical field cannot be resolved | Block and emit no final body; never render `待补充`. |
| Jenkins Job name or URL cannot be resolved from evidence | Block and emit no final body; never substitute a repository name, alias, or guessed URL. |
| The project is a business project at test submission | Render `是否上线：未合并`. |
| The project is a tooling/library project or package | Render `是否上线：无需上线`. |
| The project is a business project | Render the red service marker `更新服务`. |
| The project is a tooling/library project or package | Render the red service marker `工具服务-无需上线`. |
| Two applicable source branches conflict | Block and emit no final Wiki body. |
| Only a `merge/*` branch is supplied | Block; never substitute it as the code branch. |
| Linked target cannot be read or has multiple branch matches | Block rather than guess the target, sequence, or insertion point. |
| Proposed output rewrites historical text | Block rather than regenerate the page. |
| Direct drafting request with resolvable TAPD work | Resolve the target plan internally and return the complete resulting raw Markdown without requiring a Wiki URL. |
| Called by `submitting-for-test` | Return the complete in-memory `ValidatedWikiDraft` to the consumer; do not collapse the handoff to a string. |

All scenarios are read-only and create no state or record files.
