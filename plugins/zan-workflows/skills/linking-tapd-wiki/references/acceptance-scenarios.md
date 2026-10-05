# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Bug, Story, or Task has a verified Wiki and no Wiki comment | Render the exact payload and wait for confirmation, or reuse the exact confirmed submission authorization. |
| Same Wiki ID already appears as plain text or Markdown | `ALREADY_LINKED`; perform no write. |
| A different 提测 Wiki ID appears in historical comments | `BLOCKED_CONFLICT`; show both targets and perform no write. |
| User supplies a Wiki URL with no association evidence | `BLOCKED`; do not trust the URL alone. |
| Wiki and item belong to different TAPD workspaces | `BLOCKED`; perform no write. |
| Standalone user confirms an unchanged exact plan | Validate one `--mode link` invocation; let it refresh bound facts, write/read back through `tapd-mcp`, and return `LINKED`. |
| Confirmed target, comments, Wiki, or association changed | Perform no write and return the refreshed plan or conflict. |
| Write succeeds but readback is unavailable or mismatched | `BLOCKED`; report the uncertain effect and do not retry. |
| Caller requests status, version, Wiki, Git, deployment, or cleanup writes | Reject those operations as outside this skill. |
| A Wiki bundle already returned exact-item `LINKED|ALREADY_LINKED` | Reuse the result; do not run another comment capability or script invocation. |
| Comment-only execution receives a body file | Reject before any write; this mode cannot create or update Wiki. |
| Comments lack count and the same-ID link is on a later full page | Read full pages until a short page; return `ALREADY_LINKED` with no duplicate write. |
| Bound Wiki ID/body hash changes | Block before the comment write; do not rediscover or choose a same-title replacement. |
