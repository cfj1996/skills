# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Existing fixed branch, matching local/remote SHA, no Bug-specific history | `USE_EXISTING`, then `READY_FOR_HANDOFF` when project/scope/validation pass. |
| Existing branch already contains fixes for other Bugs | Still eligible for `USE_EXISTING`; do not require isolation or prior association. |
| `CREATE` but exact branch already exists | `BLOCKED`; do not silently reuse it. |
| `CREATE` branch is absent but base ref/SHA is unresolved | `PENDING`; do not hand off a guessed base. |
| `AUTO` and exact branch exists | Select `USE_EXISTING`. |
| `AUTO` and exact branch is absent locally/remotely | Select `CREATE`. |
| Local and remote branch SHAs differ | `BLOCKED` with both observed SHAs. |
| Fixed project or repository mismatches actual fingerprint | `BLOCKED`; never route to a similarly named project. |
| Several projects remain plausible | `PENDING` with the exact user choice required. |
| Scope lacks a material requirement | `PENDING`; do not invent scope. |

Every scenario is read-only and creates no local document or workflow state.
