# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| `NO_WIKI` with valid reviewed change | Merge to develop, update/read TAPD status, publish/read test version; never load Wiki capability. |
| `STANDARD` with an exact existing Wiki target | Automatically resolve fields and placement, display/authorize the minimal patch, update/read back Wiki, write/read Bug link when applicable, then status and version. |
| Target has no `# 前端` | Add `# 前端` with sequence `1` and `是否上线：否`, then verify the exact readback. |
| Target has existing front-end entries | Calculate maximum canonical sequence plus one without asking the user for the sequence. |
| Exact target Wiki ID is available | Materialize the exact Bug comment from that ID and verify it after the Wiki readback. |
| Source or develop SHA changes before a Git write | Stop, redisplay, and require fresh authorization/validation. |
| Private validation fails | Execute no current or later operation; return `BLOCKED`. |
| Merge succeeds but develop containment fails | Return `BLOCKED`; perform no Wiki/TAPD/version write. |
| Wiki readback fails | Return `BLOCKED`; do not write comment, status, or version. |
| Status succeeds but version fails | Return `BLOCKED` with truthful status success and version failure. |
| External outcome is unknown | Return `BLOCKED`; do not retry or infer success. |

No scenario creates runtime, recovery, audit-ledger, or generated evidence
files.
