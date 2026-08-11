---
name: fixing-bug
description: Use when one or more TAPD Bugs must be handled sequentially through preparation, repair, test submission, and optional go-live on one fixed project branch.
---

# Fix TAPD Bug

Compose the TAPD capability skills for one Bug or a list of Bugs. A list is
not a separate batch workflow: normalize it to an ordered list and execute the
same single-Bug composition once per item.

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

## Execution

For each normalized Bug URL in order:

1. Call `preparing-work` with that URL and the same fixed project, repository,
   branch, effective branch mode, and creation base constraint. When the
   request starts with `CREATE`, keep `CREATE` only until the exact branch is
   created and read back; use `USE_EXISTING` for every later Bug in the same
   request. This switch is current-execution control flow, not persisted state.
2. If it returns `READY_FOR_HANDOFF`, call `implementing-work` with the returned
   definition.
3. If it returns `REVIEWED`, call `submitting-for-test` with the definition,
   reviewed change, and selected submission profile.
4. If submission returns `SUBMITTED` and go-live was explicitly requested,
   call `going-live` with that exact `TestSubmissionResult`; it owns reading
   the original repair branch from the result.
5. Record only a concise in-conversation result for this Bug. If any capability
   returns `PENDING` or `BLOCKED`, record the first reason, skip the remaining
   capabilities for that Bug, and continue with the next Bug.

The same existing branch may contain fixes for many Bugs. Under
`USE_EXISTING`, starting the next Bug must not require that branch to already
contain commits, documentation, or tests associated with that Bug.

## Response

Return a concise ordered list with one row per Bug:

- Bug URL or short ID;
- `成功`, `失败`, or `待确认`;
- last completed capability;
- failure/confirmation reason when applicable.

Do not expose internal handoff objects, validator protocol lines, JSON/YAML, or
local record paths. No interruption recovery is provided: after interruption,
the user supplies the remaining Bug URLs again.
