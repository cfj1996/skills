# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Tester is absent but one valid source branch exists | Render `测试人员：待补充` and validate. |
| Two applicable source branches conflict | Block and emit no final Wiki body. |
| Only a `merge/*` branch is supplied | Block; never substitute it as the code branch. |
| Existing draft plus a distinct new entry | Preserve the full draft and append one canonical entry. |
| Existing matching entry plus additive repair facts | Append only the re-test note. |
| Proposed output rewrites historical text | Block rather than regenerate the page. |
| Direct copy-only request with valid facts | Internally form `VALIDATED`; return raw Markdown only, without code fence or explanation. |
| Called by `submitting-for-test` | Return the complete in-memory `ValidatedWikiDraft` to the consumer; do not collapse the handoff to a string. |

All scenarios are read-only and create no state or record files.
