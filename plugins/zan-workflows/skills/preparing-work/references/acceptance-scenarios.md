# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Existing fixed branch, matching local/remote SHA, no Bug-specific history | `USE_EXISTING`, then `READY_FOR_HANDOFF` when project/scope/validation pass. |
| Existing branch already contains fixes for other Bugs | Still eligible for `USE_EXISTING`; do not require isolation or prior association. |
| `CREATE` but exact branch already exists | `BLOCKED`; do not silently reuse it. |
| `CREATE` branch is absent but base ref/SHA is unresolved | `PENDING`; do not hand off a guessed base. |
| `AUTO` and exact branch exists | Select `USE_EXISTING`. |
| `AUTO` and exact branch is absent locally/remotely | Select `CREATE`. |
| Same Bug still fails after test deployment | Classify `CONTINUE`, recover the original source branch, and select `USE_EXISTING`. |
| Continue work has a prior Wiki/MR branch and a newly derived branch name | Ignore the new name and reuse the evidenced original branch. |
| Continue work original branch is missing or candidates conflict | `PENDING` with evidence/candidates; never create from `develop`. |
| Continue request explicitly names the incremental scope and bound facts are unchanged | Reuse prior project/branch confirmation; do not require a full checklist confirmation again. |
| Initial Bug is not active | Plan one authorized `WRITE_ACTIVE` payload containing both `修复中` status and the verified repair account in `current_owner`. |
| Bug is already `修复中` but still belongs to a tester, another person or nobody | Plan an authorized `WRITE_ACTIVE` owner correction; never select `NO_CHANGE` by status alone. |
| Bug active status and verified repair account both match | Plan `NO_CHANGE` with current status/owner evidence. |
| Repair account is missing, ambiguous or not verified in this workspace | `PENDING`; no status-only payload or inferred account from USER_NAME/Git/tester. |
| Continue Bug is already `待测试` | Plan `SKIPPED_ALREADY_WAITING_TEST`; no status or owner write and no new repair-account requirement. |
| Story or Task in any current status | Plan `NOT_APPLICABLE_NON_BUG`; never construct or write a Bug `修复中` payload. |
| Local branch is ahead of origin on the original branch and increment has confirmed scope or an accepted baseline | `USE_EXISTING` on the exact verified local tip; preserve unpublished commits without demanding push or attributing earlier work to this item. |
| Local-ahead increment is outside or unclear against the confirmed scope | Retain changes; return the concrete scope gap before handoff. |
| Origin is ahead of local, or both have independent commits | `BLOCKED` with tips and relationship; no automatic synchronization or branch substitution. |
| Ref lookup or ancestry evidence is unavailable/incomplete | `PENDING`; do not claim divergence or infer absence. |
| Fixed project or repository mismatches actual fingerprint | `BLOCKED`; never route to a similarly named project. |
| Several projects remain plausible | `PENDING` with the exact user choice required. |
| Scope lacks a material requirement | `PENDING`; do not invent scope. |

Every scenario is read-only and creates no local document or workflow state.
