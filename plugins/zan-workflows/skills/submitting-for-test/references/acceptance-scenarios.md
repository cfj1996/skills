# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| `NO_WIKI` with valid reviewed change | Merge to develop, update/read TAPD status, publish/read test version; never load Wiki capability. |
| `STANDARD` without a supplied Wiki URL | Inspect TAPD links and Wiki hierarchy; never stop to request a Wiki target. |
| TAPD contains an existing Wiki link | Reuse/update/read back that child and never create a duplicate. |
| No link but one related child exists | Reuse it based on TAPD/branch evidence. |
| Month exists but no related child | Create `MM-DD: 中文简述` under that month with `# 前端`, sequence `1`, and `是否上线：否`. |
| Month does not exist | Create/read the `YYYY-MM` month under root `1150372234001008260`, then separately authorize/create/read the child. |
| Planned payload writes entry body to the month page | Block before write; canonical content belongs only in the child Wiki. |
| Existing child has front-end entries | Calculate maximum canonical sequence plus one without asking the user for the sequence. |
| Final child ID is available | Materialize the exact Bug comment from that ID and verify it after child readback. |
| Source or develop SHA changes before a Git write | Stop, redisplay, and require fresh authorization/validation. |
| Private validation fails | Execute no current or later operation; return `BLOCKED`. |
| Merge succeeds but develop containment fails | Return `BLOCKED`; perform no Wiki/TAPD/version write. |
| Wiki readback fails | Return `BLOCKED`; do not write comment, status, or version. |
| Status succeeds but version fails | Return `BLOCKED` with truthful status success and version failure. |
| External outcome is unknown | Return `BLOCKED`; do not retry or infer success. |

No scenario creates runtime, recovery, audit-ledger, or generated evidence
files.
