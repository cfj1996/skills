# Orchestration contract

`fixing-bug` is a stateless sequential composition. It owns ordering and the
final summary; producer skills own all business validation and external writes.

## Request

| Field | Required | Rule |
| --- | --- | --- |
| `tapd_urls` | yes | One Bug URL or an ordered list; exact duplicates are removed. |
| `fixed_project` | yes | Hard constraint shared by every Bug. |
| `fixed_repo_path` | yes | Canonical repository path shared by every Bug. |
| `fixed_branch` | yes | Exact repair branch shared by every Bug. |
| `branch_mode` | yes | `AUTO`, `CREATE`, or `USE_EXISTING`. |
| `create_base_ref` | conditional | Exact base when creation may occur, unless verified workspace policy supplies it. |
| `submission_profile` | yes | Exactly `STANDARD` or `NO_WIKI`. |
| `go_live` | yes | `true` only after an explicit current-conversation request. |

`USE_EXISTING` means begin this Bug on the supplied existing branch. It is not
a resume request and carries no requirement for prior Bug-specific evidence.

For a multi-Bug request that starts with `CREATE`, the effective mode changes
to `USE_EXISTING` immediately after the exact branch is created and its ref is
read back. Later items must not repeat `CREATE`. If an item fails before branch
creation, the next item may still use `CREATE`; if creation occurred before a
later failure, the next item uses `USE_EXISTING`.

## In-memory handoffs

| Producer | Successful output | Next consumer |
| --- | --- | --- |
| `preparing-work` | `TapdWorkDefinition` with `READY_FOR_HANDOFF` | `implementing-work` |
| `implementing-work` | `ReviewedChange` with `REVIEWED` | `submitting-for-test` |
| `submitting-for-test` | `TestSubmissionResult` with `SUBMITTED` | optional `going-live`, as the complete input |
| `going-live` | `MasterMergeResult` with `MERGED` | final summary |

Handoffs live only for the current execution. They are not serialized or
written to the repository.

## Per-Bug result

The orchestrator retains only enough in the current conversation to report:

| Field | Values |
| --- | --- |
| Bug | supplied URL or derived short ID |
| Status | `成功`, `失败`, `待确认` |
| Last capability | capability name or `未开始` |
| Reason | first blocker or required confirmation; empty on success |

A failed Bug does not cancel later Bugs. The final list preserves input order.
