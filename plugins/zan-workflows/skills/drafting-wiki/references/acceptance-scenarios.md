# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| TAPD details/comments contain one matching 提测 Wiki link | Read and reuse that child; never create a duplicate or ask the user for its URL. |
| No link, but one related current-month child matches the TAPD/branch | Reuse that child and calculate the minimal patch. |
| No link, month exists, no related child | Plan `CREATE_CHILD` named `MM-DD: 中文简述` under that month with `# 前端`, sequence `1`, and the resolved type-specific status. |
| No link and current month is absent | Plan `CREATE_MONTH_AND_CHILD` below root `1150372234001008260`; never put the entry body in the month page. |
| Multiple linked or related Wiki candidates | Block rather than ask for an arbitrary URL or create another page. |
| Reused target without `# 前端` | Append `# 前端` and a sequence `1` entry containing the resolved type-specific status. |
| Existing `# 前端` sequences `1` and `3` | Append the new entry as sequence `4`; do not count sub-list numbers. |
| Existing unique entry with the same source branch and a functional change | Keep its sequence, append the affected scope, and apply only the allowed type-specific status patch; a missing status blocks. |
| Continue work after a prior MR/deployment with a functional change | Reuse the same Wiki/branch entry and append only the new affected scope to `影响范围`. |
| Continue work is proven non-functional by the reviewed diff | Return `SKIPPED_BY_POLICY` with `NON_FUNCTIONAL_CONTINUE`; do not update the Wiki. |
| Continue work changes functional behavior | Reuse the matching entry and append only the affected module/page to its `影响范围` list without creating a duplicate entry. |
| A new functional round reuses a business entry currently marked `已合并` | Append the new affected scope and reset only that entry to `是否上线：未合并`. |
| A reused entry has a missing or non-current status | Block except for the evidenced minimal replacement of a tooling legacy `是否上线：无需上线` line. |
| Continue impact classification is ambiguous | Block and emit no final body; never guess whether the Wiki needs an update. |
| Tester or another canonical field cannot be resolved | Block and emit no final body; never render `待补充`. |
| `SKIP`, known Job name/URL and remaining Wiki fields, but no build/release selections | Validate using the bare display name without `?`; do not call Jenkins or request deployment-only inputs. |
| `SKIP`, known exact Job name but no indexed URL | Resolve only that Job's metadata through Jenkins readback; retain SKIP, never query parameters/builds or trigger deployment. |
| `SKIP` for a tooling library, only `PROJECT_NAME=zan-lib` is evidenced and a valid prior current-version field exists | Render `npm-tools?PROJECT_NAME=zan-lib` and preserve `当前版本`; do not invent or require `RELEASE_TYPE`. |
| `DEPLOY` for a tooling library with unresolved required `RELEASE_TYPE` | Block; the `SKIP` exception must not weaken deployment validation. |
| Only a branch parameter is evidenced under `SKIP` | Omit that parameter and the empty `?` suffix; retain the original source branch in its dedicated field. |
| Jenkins Job name or URL cannot be resolved from evidence | Block and emit no final body; never substitute a repository name, alias, or guessed URL. |
| The project is a business project at test submission | Render `是否上线：未合并`. |
| Tooling/library project has a verified canary publication | Render `当前版本：canary`; omit `是否上线`. |
| Tooling/library project has a verified official publication | Render `当前版本：latest`; omit `是否上线`. |
| A newer verified canary publication follows an official publication for the same target | Update the matching entry to `当前版本：canary`; preserve other text. |
| Reused tooling entry still contains `是否上线：无需上线` and the channel is evidenced | Replace only that line with the resolved `当前版本` field in the explicit minimal patch. |
| Tooling entry has both `是否上线` and `当前版本`, or conflicting channel evidence | Block; do not guess which field or publication wins. |
| Tooling `DEPLOY` draft uses a confirmed planned channel | Gate its Wiki write on matching successful release readback; a plan is not publication evidence. |
| Tooling `SKIP` has neither existing release evidence nor a valid prior current-version field | Block the final body; do not default to canary or query builds. |
| The project is a business project | Render the red service marker `更新服务`. |
| The project is a tooling/library project or package | Render the red service marker `工具服务-无需上线`. |
| Two applicable source branches conflict | Block and emit no final Wiki body. |
| Only a `merge/*` branch is supplied | Block; never substitute it as the code branch. |
| Linked target cannot be read or has multiple branch matches | Block rather than guess the target, sequence, or insertion point. |
| Proposed output rewrites historical text | Block rather than regenerate the page. |
| Direct drafting request with resolvable TAPD work | Resolve the target plan internally and return the complete resulting raw Markdown without requiring a Wiki URL. |
| Called by `submitting-for-test` | Return the complete in-memory `ValidatedWikiDraft` to the consumer; do not collapse the handoff to a string. |

All scenarios are read-only and create no state or record files.
