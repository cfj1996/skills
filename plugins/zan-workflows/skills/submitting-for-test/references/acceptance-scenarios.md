# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| `NO_WIKI` with valid reviewed change | Merge to develop, update/read TAPD status, publish/read test version; never load Wiki capability. |
| `STANDARD` with valid existing Wiki | Draft, display, authorize, update/read back Wiki, write/read Bug link when applicable, then status and version. |
| New Wiki returns an ID after creation | Read it back, materialize exact Bug comment, then separately display/authorize/validate the comment. |
| Source or develop SHA changes before a Git write | Stop, redisplay, and require fresh authorization/validation. |
| Private validation fails | Execute no current or later operation; return `BLOCKED`. |
| Merge succeeds but develop containment fails | Return `BLOCKED`; perform no Wiki/TAPD/version write. |
| Wiki readback fails | Return `BLOCKED`; do not write comment, status, or version. |
| Status succeeds but version fails | Return `BLOCKED` with truthful status success and version failure. |
| External outcome is unknown | Return `BLOCKED`; do not retry or infer success. |

No scenario creates runtime, recovery, audit-ledger, or generated evidence
files.
