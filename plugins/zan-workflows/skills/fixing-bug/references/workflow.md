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

## Phase 2: confirmed execution

After explicit confirmation, re-prepare each Bug immediately before its
single-Bug chain:

```text
re-prepare -> implement -> submit(profile, target Wiki when STANDARD) -> optional go-live
```

Only a matching `READY_FOR_HANDOFF` may reach implementation. If refreshed
project/repository, branch, or scope differs from the confirmed row, return the
updated checklist and wait for confirmation again.

If the request selected `CREATE`, only the item that actually creates and
reads back the fixed branch uses `CREATE`; every later item uses
`USE_EXISTING`. The switch is held only during the current sequential loop.
Branch action is execution control flow, not a visible checklist field, so the
expected `CREATE` to `USE_EXISTING` switch does not invalidate confirmation.

```text
bug1: re-prepare(CREATE)       -> implement -> submit -> optional go-live
bug2: re-prepare(USE_EXISTING) -> implement -> submit -> optional go-live
bug3: re-prepare(USE_EXISTING) -> implement -> blocked ---------> continue
bug4: re-prepare(USE_EXISTING) -> implement -> submit -> optional go-live
```

`USE_EXISTING` permits each Bug to start on the already selected branch. The
branch may contain earlier Bugs from this list. `preparing-work` verifies the
branch identity and repository only; it does not demand Bug-specific history.

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
