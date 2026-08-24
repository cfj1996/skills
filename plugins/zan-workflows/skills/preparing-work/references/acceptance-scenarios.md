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
| Initial work is not active | Plan one authorized `WRITE_ACTIVE` transition to `修复中`. |
| Continue work is already `待测试` | Plan `SKIPPED_ALREADY_WAITING_TEST`; no status write. |
| Local and remote branch SHAs differ | `BLOCKED` with both observed SHAs. |
| Fixed project or repository mismatches actual fingerprint | `BLOCKED`; never route to a similarly named project. |
| Several projects remain plausible | `PENDING` with the exact user choice required. |
| Scope lacks a material requirement | `PENDING`; do not invent scope. |

Every scenario is read-only and creates no local document or workflow state.
