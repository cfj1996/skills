# Orchestration contract

`fixing-bug` is a stateless sequential composition. It owns preflight ordering,
checklist formatting, execution ordering, and the final summary; producer
skills own all business validation and external writes.

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

## Preflight checklist

Before any write, the orchestrator derives one user-visible row from each
producer-owned preflight snapshot:

| Column | Source |
| --- | --- |
| Bug | TAPD identity or short ID |
| 项目/仓库 | verified selected project and canonical repository |
| 分支 | exact fixed branch and planned/current action |
| 修复范围 | concise producer-derived in-scope work |
| 待确认 | normalized missing decision/blocker, or `无` |

The initial repair request is item selection, not checklist confirmation. An
unconfirmed checklist permits no write capability. A `PENDING` or `BLOCKED`
snapshot remains producer-owned, appears in `待确认`, and keeps the whole
request read-only.

After explicit confirmation, each Bug is prepared again immediately before
implementation. Only a `READY_FOR_HANDOFF` whose visible project/repository,
branch, and scope match the confirmed row may become a handoff. Any changed
visible field invalidates confirmation and returns the updated checklist.

The checklist and confirmation live only in the current conversation. They do
not add request fields, persistence, runtime IDs, or recovery state.

## In-memory handoffs

| Producer | Successful output | Next consumer |
| --- | --- | --- |
| `preparing-work` | `TapdWorkDefinition` with `READY_FOR_HANDOFF` | `implementing-work` |
| `implementing-work` | `ReviewedChange` with `REVIEWED` | `submitting-for-test` |
| `submitting-for-test` | `TestSubmissionResult` with `SUBMITTED` | optional `going-live`, as the complete input |
| `going-live` | `MasterMergeResult` with `MERGED` | final summary |

Preflight snapshots are not handoffs. Handoffs live only for the current
execution, begin only after checklist confirmation and execution-time
re-preparation, and are not serialized or written to the repository.

## Per-Bug result

The orchestrator retains only enough in the current conversation to report:

| Field | Values |
| --- | --- |
| Bug | supplied URL or derived short ID |
| Status | `成功`, `失败`, `待确认` |
| Last capability | capability name or `未开始` |
| Reason | first blocker or required confirmation; empty on success |

A failed Bug does not cancel later Bugs. The final list preserves input order.
