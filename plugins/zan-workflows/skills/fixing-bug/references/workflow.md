# Workflow

## Single Bug

```text
prepare -> implement -> submit -> optional go-live
```

Stop the current Bug at the first `PENDING` or `BLOCKED` result. Never invent a
later result or compensate for an earlier external write.

## Multiple Bugs

Normalize the input to `[bug1, bug2, ...]` and run the single-Bug workflow for
each item in order. Reuse the same fixed project, repository, and branch
constraints. Do not create a second orchestration skill or a batch artifact.

If the request selected `CREATE`, only the item that actually creates and
reads back the fixed branch uses `CREATE`; every later item uses
`USE_EXISTING`. The switch is held only during the current sequential loop.

```text
bug1: prepare -> implement -> submit -> optional go-live
bug2: prepare -> implement -> submit -> optional go-live
bug3: prepare -> blocked ---------------------------> continue
bug4: prepare -> implement -> submit -> optional go-live
```

`USE_EXISTING` permits each Bug to start on the already selected branch. The
branch may contain earlier Bugs from this list. `preparing-work` verifies the
branch identity and repository only; it does not demand Bug-specific history.

## Failure handling

- Store no recovery state.
- Keep the failure reason only in the current response list.
- Continue with the next Bug unless the shared project/repository/branch
  constraint itself is invalid; in that case mark every remaining Bug with the
  same shared blocker without invoking write capabilities.
- After interruption, accept a new list from the user and start from that list.
