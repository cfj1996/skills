---
name: fixing-bug
description: Use when the user asks to fix one or more TAPD Bugs on one fixed project branch.
---

# Fix TAPD Bug

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability is never a preflight blocker.

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
- `work_mode=AUTO|INITIAL|CONTINUE`;
- `branch_mode=AUTO|CREATE|USE_EXISTING`;
- an exact creation base ref when `CREATE` may be selected, unless a verified
  workspace policy already supplies it;
- `submission_profile=STANDARD|NO_WIKI`;
- `deployment_mode=AUTO|DEPLOY|SKIP`; and
- an optional explicit request to run `going-live` after submission.

The Bug URLs may come from the user, conversation context, or an MCP query.
After normalization their source is irrelevant. Preserve the supplied order
and de-duplicate exact duplicate URLs.

Infer `CONTINUE` when the same Bug is resumed after incomplete work, test
feedback, post-deployment reproduction, or omitted scope. `CONTINUE` reuses the
original project/repository/branch and existing Wiki; it is not a separate
repair workflow. Never create a “follow-up” branch for it.

Infer `STANDARD` from an explicit request such as `需要提测 Wiki`, and infer
`NO_WIKI` from an explicit request to omit Wiki. Ask for the profile only when
the user's intent is genuinely absent or conflicting. Never ask the user for a
Wiki URL: under `STANDARD`, `submitting-for-test` owns locating an existing
Wiki or creating the required month/child Wiki from TAPD evidence.

Infer `DEPLOY` from explicit test-environment publication wording and `SKIP`
from “直接提测/跳过发布”. With no deployment wording, keep `AUTO`; the
submission capability applies project policy or defaults to direct提测.

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

3. For `INITIAL`, show one authorization summary below the checklist:
   include exact branch action and verified base ref/SHA when creating, the
   active-state transition to `修复中` when required, and implementation of the
   listed scope on the listed branch. For
   `CONTINUE`, preserve the current TAPD status; if it is already `待测试`,
   record `SKIPPED_ALREADY_WAITING_TEST` and perform no status write. Reuse
   prior project/branch confirmation when still current, and ask only when the
   incremental scope is not explicit or a bound fact changed.
4. Return the checklist/summary followed by the single question
   `是否按此清单执行？` only when confirmation is required, then stop. The
   initial request to repair the Bugs selects the work items; it never confirms
   a checklist that has not yet been shown.
5. If any snapshot is `PENDING` or `BLOCKED`, put its normalized reason in
   `待确认` and keep the whole request read-only. The user must supply the
   missing decision or explicitly exclude that Bug before preflight is rebuilt.
6. Treat confirmation as binding only while every visible checklist field is
   unchanged. After interruption, rebuild the checklist rather than relying on
   hidden conversation state.

The visible `分支` field binds the exact branch identity only. It excludes the
producer-owned `CREATE` or `USE_EXISTING` action. The expected `CREATE` to
`USE_EXISTING` transition does not invalidate confirmation.

Preflight permits TAPD/project/repository/ref reads only. Before confirmation,
do not create a branch, change TAPD, write tests, edit source, commit, push, or
invoke any write-owning capability. Hiding raw handoff objects, validator
protocol, JSON, or YAML never permits hiding this user-facing checklist.

Wiki target discovery is intentionally not a preflight field. A missing
user-supplied Wiki link is never a blocker and must never appear in `待确认`.

## Execution

Only after current initial-checklist confirmation or valid explicit
`CONTINUE` incremental-scope authorization, process each normalized Bug URL in
order:

1. Re-call `preparing-work` immediately before implementation with that URL and
   the same work mode, fixed project, repository, branch, effective branch
   mode, creation base constraint, and current confirmation. When an `INITIAL`
   request starts with `CREATE`, keep
   `CREATE` only until the exact branch is created and read back; use
   `USE_EXISTING` for every later Bug. This switch is current-execution control
   flow, not persisted state or a visible checklist change.
2. Compare the refreshed definition's project/repository, exact branch
   identity, and scope with the confirmed row. If a visible field changed,
   show the updated checklist and stop before `implementing-work`;
   confirmation is no longer current. If execution-time `preparing-work`
   returns `PENDING` or `BLOCKED`, pause the entire queue, show the updated
   checklist, and perform no later write until the user confirms it.
3. Only from a matching `READY_FOR_HANDOFF`, call `implementing-work` with the
   returned definition and reusable implementation/status authorization from
   the confirmed checklist. `implementing-work` must not ask again while those
   exact facts still match.
4. If it returns `REVIEWED`, call `submitting-for-test` with the definition,
   reviewed change, work mode, selected submission profile, and deployment
   mode. Under `STANDARD`, pass the
   TAPD identity and full in-memory handoffs; do not request or manufacture a
   Wiki target in this orchestrator.
5. If submission returns `SUBMITTED` and go-live was explicitly requested,
   call `going-live` with that exact `TestSubmissionResult`; it owns reading
   the original repair branch from the result.
6. Record only a concise in-conversation result for this Bug. Only
   `implementing-work`, `submitting-for-test`, or `going-live` may return a
   per-Bug `PENDING` or `BLOCKED` that skips the remaining capabilities for
   that Bug and continues with the next confirmed Bug. A shared
   project/repository/branch failure still stops later writes.

The same existing branch may contain fixes for many Bugs. Under
`USE_EXISTING`, starting the next Bug must not require that branch to already
contain commits, documentation, or tests associated with that Bug.

If the same Bug still fails after test deployment, restart at the `CONTINUE`
preparation gate. Do not make an ad-hoc branch decision, rebuild the Wiki, or
change an already-`待测试` Bug back to `修复中`.

## Responses

Before initial execution, return the ordered checklist, its exact active-state
and implementation authorization summary, and `是否按此清单执行？`. One Bug
produces one row; multiple Bugs produce one row per item in execution order.

For a current `CONTINUE` request with unchanged project/branch and explicit
incremental scope, proceed using the user's request as scope authorization and
save the next confirmation for the consolidated submission plan.

After execution, return a concise ordered list with one row per Bug:

- Bug URL or short ID;
- `成功`, `失败`, or `待确认`;
- last completed capability;
- test deployment result `DEPLOYED|SKIPPED_BY_INTENT|FAILED|UNKNOWN` when
  submission was attempted;
- failure/confirmation reason when applicable.

Do not expose internal handoff objects, validator protocol lines, JSON/YAML, or
local record paths. No interruption recovery is provided: after interruption,
the user supplies the remaining Bug URLs again.
