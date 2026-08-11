---
name: fixing-bug
description: Use when the user asks to fix one or more TAPD Bugs on one fixed project branch.
---

# Fix TAPD Bug

Compose the TAPD capability skills for one Bug or a list of Bugs. Normalize a
list to a stable order, complete one read-only preflight for every item, and
only after checklist confirmation execute the single-Bug composition once per
item.

Read [contracts.md](references/contracts.md), [workflow.md](references/workflow.md),
and [acceptance-scenarios.md](references/acceptance-scenarios.md) before acting.

## Inputs

Accept:

- one TAPD Bug URL or an ordered list of TAPD Bug URLs;
- one fixed project, repository path, and repair branch for the whole request;
- `branch_mode=AUTO|CREATE|USE_EXISTING`;
- an exact creation base ref when `CREATE` may be selected, unless a verified
  workspace policy already supplies it;
- `submission_profile=STANDARD|NO_WIKI`; and
- an optional explicit request to run `going-live` after submission.

The Bug URLs may come from the user, conversation context, or an MCP query.
After normalization their source is irrelevant. Preserve the supplied order
and de-duplicate exact duplicate URLs.

## Capability composition

Require these named capabilities:

1. `zan-workflows:preparing-work`
2. `zan-workflows:implementing-work`
3. `zan-workflows:submitting-for-test`
4. `zan-workflows:going-live`, only when explicitly requested

`submitting-for-test` invokes `zan-workflows:drafting-wiki` itself only under
`STANDARD`. This orchestrator never invokes the Wiki drafter directly.

For each Bug, pass only the in-memory handoff returned by the preceding
capability:

```text
TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult?
```

Do not create a shared task context, run ID, batch ID, state file, history,
recovery record, input/output JSON, or generated evidence directory. Do not
write `.zan-workflows`, `docs/<bug-id>/raw.*`, or `__test___/<bug-id>`.

## Required preflight

Before invoking `implementing-work` or performing any other write:

1. Call `preparing-work` read-only for every normalized Bug URL. Keep each
   result as a preflight snapshot; a `PENDING` snapshot awaiting scope
   confirmation is not a downstream handoff and must not be promoted. Collect
   all rows before presenting one combined response; do not ask for confirmation
   one Bug at a time.
2. Build one ordered checklist with exactly these columns:

   | Bug | 项目/仓库 | 分支 | 修复范围 | 待确认 |
   | --- | --- | --- | --- | --- |

3. Return the checklist followed by the single question
   `是否按此清单执行？`, then stop. The initial request to repair the Bugs
   selects the work items; it never confirms a checklist that has not yet been
   shown.
4. If any snapshot is `PENDING` or `BLOCKED`, put its normalized reason in
   `待确认` and keep the whole request read-only. The user must supply the
   missing decision or explicitly exclude that Bug before preflight is rebuilt.
5. Treat confirmation as binding only while every visible checklist field is
   unchanged. After interruption, rebuild the checklist rather than relying on
   hidden conversation state.

Preflight permits TAPD/project/repository/ref reads only. Before confirmation,
do not create a branch, change TAPD, write tests, edit source, commit, push, or
invoke any write-owning capability. Hiding raw handoff objects, validator
protocol, JSON, or YAML never permits hiding this user-facing checklist.

## Execution

Only after explicit confirmation of the current checklist, process each
normalized Bug URL in order:

1. Re-call `preparing-work` immediately before implementation with that URL and
   the same fixed project, repository, branch, effective branch mode, and
   creation base constraint. When the request starts with `CREATE`, keep
   `CREATE` only until the exact branch is created and read back; use
   `USE_EXISTING` for every later Bug. This switch is current-execution control
   flow, not persisted state.
2. Compare the refreshed definition's project/repository, branch, and scope
   with the confirmed row. If a visible field changed, or preparation returns
   `PENDING` or `BLOCKED`, show the updated checklist and stop before
   `implementing-work`; confirmation is no longer current.
3. Only from a matching `READY_FOR_HANDOFF`, call `implementing-work` with the
   returned definition.
4. If it returns `REVIEWED`, call `submitting-for-test` with the definition,
   reviewed change, and selected submission profile.
5. If submission returns `SUBMITTED` and go-live was explicitly requested,
   call `going-live` with that exact `TestSubmissionResult`; it owns reading
   the original repair branch from the result.
6. Record only a concise in-conversation result for this Bug. If an execution
   capability returns `PENDING` or `BLOCKED`, record the first reason, skip the
   remaining capabilities for that Bug, and continue with the next confirmed
   Bug unless a shared project/repository/branch constraint is invalid.

The same existing branch may contain fixes for many Bugs. Under
`USE_EXISTING`, starting the next Bug must not require that branch to already
contain commits, documentation, or tests associated with that Bug.

## Responses

Before execution, return only the ordered checklist and
`是否按此清单执行？`. One Bug produces one row; multiple Bugs produce one row
per item in execution order.

After execution, return a concise ordered list with one row per Bug:

- Bug URL or short ID;
- `成功`, `失败`, or `待确认`;
- last completed capability;
- failure/confirmation reason when applicable.

Do not expose internal handoff objects, validator protocol lines, JSON/YAML, or
local record paths. No interruption recovery is provided: after interruption,
the user supplies the remaining Bug URLs again.
