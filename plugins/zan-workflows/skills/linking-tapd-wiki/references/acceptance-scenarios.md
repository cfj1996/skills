# Acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Bug, Story, or Task has a verified Wiki and no Wiki comment | Render the exact payload and wait for confirmation, or reuse the exact confirmed submission authorization. |
| Same Wiki ID already appears as plain text or Markdown | `ALREADY_LINKED`; perform no write. |
| A different 提测 Wiki ID appears in historical comments | `BLOCKED_CONFLICT`; show both targets and perform no write. |
| User supplies a Wiki URL with no association evidence | `BLOCKED`; do not trust the URL alone. |
| Wiki and item belong to different TAPD workspaces | `BLOCKED`; perform no write. |
| Standalone user confirms an unchanged exact plan | Re-read all facts, validate, write through `tapd-mcp`, read back, and return `LINKED`. |
| Confirmed target, comments, Wiki, or association changed | Perform no write and return the refreshed plan or conflict. |
| Write succeeds but readback is unavailable or mismatched | `BLOCKED`; report the uncertain effect and do not retry. |
| Caller requests status, version, Wiki, Git, deployment, or cleanup writes | Reject those operations as outside this skill. |
