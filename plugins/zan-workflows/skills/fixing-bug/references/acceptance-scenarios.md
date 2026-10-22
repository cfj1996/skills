# Acceptance scenarios

| Scenario | Expected behavior |
| --- | --- |
| One Bug URL before confirmation | Prepare read-only, show one checklist row, and stop with no writes. |
| Three Bug URLs before confirmation | Prepare all three read-only, show three ordered checklist rows, and stop with no writes. |
| Initial “修复这些 Bug” request | Treat it as item selection, not checklist confirmation. |
| Repair request without a submission request | Select `delivery_mode=IMPLEMENT`; show the five common checklist columns and stop each successful Bug at `REVIEWED`. |
| `IMPLEMENT` without a Wiki policy | Do not ask for submission profile/deployment or call submission PLAN; absence of the policy does not block repair. |
| Later explicit submission request after `IMPLEMENT` | Reuse a still-current `ReviewedChange` through submission PLAN and its state checks; require the exact submission confirmation, without repeating Bug activation. |
| Preflight item is `PENDING` or `BLOCKED` | Show its reason in `待确认`; perform no writes for the request. |
| Confirmed checklist with a new fixed branch | Re-prepare the first Bug with `CREATE`; after branch readback re-prepare later Bugs with `USE_EXISTING`. |
| Effective action changes from `CREATE` to `USE_EXISTING` | Keep the confirmation valid because the exact visible branch identity is unchanged. |
| Confirmed checklist with an existing fixed branch | Re-prepare every Bug with `USE_EXISTING` before implementation. Do not require prior Bug-specific evidence. |
| Same Bug still fails after deployment | Use `CONTINUE` on the original branch; preserve the previously explicit delivery endpoint when applicable, otherwise infer current intent. Reuse the Wiki only when submission is selected. |
| Continue Bug is already `待测试` | Keep status and handler unchanged; do not write `修复中`, `待测试`, repair owner or the same test-version field again. |
| Initial Bug enters `修复中` | Original start authorization includes old handler → verified repair TAPD account; write status and handler together and read back both. |
| Already repairing Bug still belongs to a tester | Plan an authorized owner correction, not `NO_CHANGE`. |
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
| Explicit submission without go-live | Select `SUBMIT` and stop each successful Bug after submission. |
| Existing Wiki or `待测试` status without delivery intent | Do not infer submission from these facts. |
| Known narrow fix with high-risk behavior | `QUICK` preparation may apply, but high-risk verification, independent review and exact Bug status/owner authorization remain required. |
| Broad investigation with `FULL` and `IMPLEMENT` | Complete preparation and implementation without acquiring submission or go-live authority. |
| Interrupted conversation | Create no recovery record; the user supplies remaining Bugs again. |
| Shared repository or branch mismatch | Perform no writes for affected items and report the shared blocker concisely. |
| Initial one-Bug flow with submission selected | Require at most one start confirmation and one consolidated submission confirmation before optional go-live. |

When initial confirmation is needed, the preflight response contains the
concise checklist and one confirmation question. A valid `CONTINUE` request with
explicit incremental scope and unchanged bound facts proceeds without repeating
that question. The final response contains the ordered result list and, when go-live
was attempted, its cleanup outcome. Verified candidates require the exact
combined plan and `是否删除以上本地开发环境？` with choices
`确认清理` / `保留开发环境` for local-only scope. A plan including verified
remote temporary merge refs instead asks `是否清理以上资源（含远程临时分支）？`
and offers `确认清理（含远程临时分支）` / `保留开发环境` once for both scopes;
remote development branches remain retained. Use the concise three-row format;
no candidates or blocked cleanup require a reason.
Neither
response exposes handoff objects, runtime metadata, generated files, or
validator protocol.
