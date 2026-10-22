# Workflow

## Phase 1: read-only preflight

```text
single: prepare(read-only) -> checklist -> confirmation

multiple:
  prepare bug1 --\
  prepare bug2 ----> ordered checklist -> confirmation
  prepare bug3 --/
```

Every normalized Bug is prepared before any write. One Bug produces one
checklist row; multiple Bugs produce rows in input order. The initial repair
request is not confirmation of derived fields. If any result is `PENDING` or
`BLOCKED`, show its reason in `待确认` and stop the whole request before writes.
Resolve profile/risk per Bug from the returned scope/evidence. Reuse an eligible
QUICK Bug's scope summary as its implementation brief and pass the same brief,
profile and risk through re-preparation into implementation. Shared branches do
not require identical profiles; explain the choice in the existing summary.

## Phase 2: confirmed execution

After explicit confirmation or valid `CONTINUE` incremental-scope authorization,
re-prepare each Bug immediately before its
single-Bug chain:

```text
re-prepare -> implement -> REVIEWED
  IMPLEMENT: result -> next confirmed Bug
  SUBMIT:    submit PLAN -> confirmation -> submit EXECUTE
  GO_LIVE:   submit PLAN -> confirmation -> submit EXECUTE -> go-live DELIVER
```

Only a matching `READY_FOR_HANDOFF` may reach implementation. If refreshed
project/repository, branch, scope, old status/owner or verified repair person
differs from the confirmed row/authorization summary, return the updated
checklist and wait for confirmation again. The original start confirmation
binds both `修复中` and its repair handler; write/read back both together.
An already-active Bug is `NO_CHANGE` only when its handler also matches.

If the request selected `CREATE`, only the item that actually creates and
reads back the fixed branch uses `CREATE`; every later item uses
`USE_EXISTING`. The switch is held only during the current sequential loop.
Branch action is execution control flow, not a visible checklist field, so the
expected `CREATE` to `USE_EXISTING` switch does not invalidate confirmation.

```text
bug1: re-prepare(CREATE)       -> implement -> selected delivery endpoint
bug2: re-prepare(USE_EXISTING) -> implement -> selected delivery endpoint
bug3: re-prepare(USE_EXISTING) -> implement -> blocked ---------> continue
bug4: re-prepare(USE_EXISTING) -> implement -> selected delivery endpoint
```

`USE_EXISTING` permits each Bug to start on the already selected branch. The
branch may contain earlier Bugs from this list. `preparing-work` verifies the
branch identity and repository only; it does not demand Bug-specific history.

## Continue mode

```text
same Bug feedback -> reuse original branch -> implement increment
                  -> IMPLEMENT: REVIEWED
                  -> SUBMIT/GO_LIVE: original Wiki and submission policy
```

Do not create another branch or reset TAPD status. If the Bug is already
`待测试`, keep that status and its current handler throughout. Reuse prior project/branch confirmation
when unchanged; ask only for unclear incremental scope and the final
consolidated submission plan when submission was selected. Continue the
previously explicit endpoint when still applicable and not changed by the current
request; the current explicit endpoint takes precedence. Existing Wiki, `待测试`
status and test feedback do not independently select submission.

## Confirmation budget

```text
IMPLEMENT: necessary scope/start confirmation -> implementation and review
INITIAL + SUBMIT/GO_LIVE: scope/start confirmation -> consolidated submit confirmation
CONTINUE + SUBMIT/GO_LIVE: optional incremental-scope confirmation -> consolidated submit confirmation
GO LIVE:  separate master/Wiki confirmation
CLEANUP:  separate exact local worktree/branch confirmation after the queue finishes
```

Generated commit/MR/Wiki/Jenkins identifiers and successful readbacks do not
create new confirmation points when they follow the authorized derivation.

The checklist displays the delivery endpoint. Only `SUBMIT|GO_LIVE` resolves
and displays `STANDARD|NO_WIKI` and `DEPLOY|SKIP`; `IMPLEMENT` uses the five
common columns and does not ask for these settings. Checklist confirmation
authorizes repair execution only. A `REVIEWED` result with `IMPLEMENT` ends
that Bug successfully without calling submission PLAN. For `SUBMIT|GO_LIVE`,
render the exact consolidated `SubmissionPlan` and stop. Initial confirmation,
implementation completion, “修复完成就提测”,
or a prior generic “可以” cannot substitute for confirmation of that plan.
Go-live confirmation never authorizes cleanup. Cleanup candidates are retained
until the entire confirmed queue finishes, then de-duplicated and displayed;
no per-Bug cleanup may remove the shared branch while later Bugs still use it.

A later explicit submission request reuses a still-valid `ReviewedChange`
through submission PLAN and its current-state checks. Do not repeat Bug
activation or source repair solely to advance the endpoint. A changed diff or
scope requires refreshed evidence and affected review before submission.

## Preparation and verification depth

Apply the shared `workflow_profile` and independent `verification_risk` from
[adaptive-workflow.md](../../../references/adaptive-workflow.md). `QUICK`
uses a concise in-memory implementation brief when eligible. Known high-risk
behavior can still be `QUICK` but requires high-risk verification and independent
review. `FULL` does not change an `IMPLEMENT` endpoint or authorize delivery
writes. Reuse an existing formal Plan/Task contract; do not downgrade to evade
its unresolved blockers.

## Failure handling

- Store no recovery state.
- A preflight or confirmation failure performs no writes and stops execution.
- An execution-time `preparing-work` result of `PENDING` or `BLOCKED` pauses
  the entire queue, returns the updated checklist, and permits no later write
  until the checklist is confirmed again.
- A changed visible checklist field invalidates the prior confirmation.
- Keep the failure reason only in the current response list.
- A per-Bug failure from `implementing-work`, `submitting-for-test`, or
  `going-live` may continue with the next Bug unless the shared
  project/repository/branch constraint itself is invalid; in that case mark
  every remaining Bug with the same shared blocker without invoking write
  capabilities.
- After interruption, accept a new list from the user and start from that list.
