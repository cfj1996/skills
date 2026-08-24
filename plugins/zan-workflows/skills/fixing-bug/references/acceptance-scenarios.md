# Acceptance scenarios

| Scenario | Expected behavior |
| --- | --- |
| One Bug URL before confirmation | Prepare read-only, show one checklist row, and stop with no writes. |
| Three Bug URLs before confirmation | Prepare all three read-only, show three ordered checklist rows, and stop with no writes. |
| Initial “修复这些 Bug” request | Treat it as item selection, not checklist confirmation. |
| Preflight item is `PENDING` or `BLOCKED` | Show its reason in `待确认`; perform no writes for the request. |
| Confirmed checklist with a new fixed branch | Re-prepare the first Bug with `CREATE`; after branch readback re-prepare later Bugs with `USE_EXISTING`. |
| Effective action changes from `CREATE` to `USE_EXISTING` | Keep the confirmation valid because the exact visible branch identity is unchanged. |
| Confirmed checklist with an existing fixed branch | Re-prepare every Bug with `USE_EXISTING` before implementation. Do not require prior Bug-specific evidence. |
| Same Bug still fails after deployment | Use `CONTINUE`, reuse the original branch/Wiki, and run the same implementation/submission pipeline. |
| Continue Bug is already `待测试` | Keep the status unchanged; do not write `修复中`, `待测试`, or the same test-version field again. |
| Continue request explicitly supplies incremental scope and bound facts are unchanged | Skip a repeated full checklist confirmation and proceed to implementation. |
| Confirmed checklist field changes during re-prepare | Show the changed checklist and wait for confirmation again. |
| Execution-time preparation becomes `PENDING` or `BLOCKED` | Pause the entire queue, show the updated checklist, and perform no later writes until reconfirmed. |
| Second Bug fails repair | Report the second Bug failure, skip its submit/go-live, then begin the third Bug. |
| Exact duplicate URL | Keep the first occurrence and do not execute the duplicate again. |
| User says `需要提测 Wiki` | Select `STANDARD` without asking for a profile or Wiki URL. |
| `STANDARD` without a user-supplied Wiki URL | Continue normally; submission locates/reuses or creates the Wiki from TAPD and hierarchy rules. |
| `NO_WIKI` | Submission never loads or invokes Wiki capability. |
| User says “直接提测” | Select `SKIP`; do not ask a separate Jenkins question. |
| User says “发布测试环境后提测” | Select `DEPLOY` and include Jenkins in the consolidated submission plan. |
| No explicit go-live request | Stop each successful Bug after submission. |
| Interrupted conversation | Create no recovery record; the user supplies remaining Bugs again. |
| Shared repository or branch mismatch | Perform no writes for affected items and report the shared blocker concisely. |
| Normal initial one-Bug flow | Require at most one start confirmation and one consolidated submission confirmation before optional go-live. |

The preflight response is exactly the concise checklist and one confirmation
question. The final response contains only the ordered result list. Neither
response exposes handoff objects, runtime metadata, generated files, or
validator protocol.
