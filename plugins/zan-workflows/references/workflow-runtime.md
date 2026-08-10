# Workflow runtime V1

Use this protocol for the six functional TAPD skills. It records progress for
later resumption without passing a mutable task context into capability skills.

## Scope

V1 intentionally has no lock manager, concurrent owner detection, database, or
event-sourced history. It assumes one active executor for a `run_id`. The source
of truth is one atomically replaced `run.json` written only by
`scripts/workflow_runtime.py`; never edit that file manually.

The default state root is `~/.codex/state/zan-workflows`. Override it with the
task-specific `ZAN_WORKFLOWS_STATE_ROOT` environment variable or the CLI
`--state-root` option. State must never be written inside an installed plugin or
plugin cache.

Resolve the runtime script from the loaded skill package, not from the current
working directory:

```text
<plugin-root>/scripts/workflow_runtime.py
```

## Run lifecycle

For a fresh orchestration, create the run before invoking the first skill:

```text
python3 <runtime> init \
  --workflow fixing-tapd-bug \
  --workflow-version 1 \
  --request-file <exact-request.json>
```

Return the resulting `run_id` to the user immediately. A standalone capability
uses `--workflow standalone:<skill-name>` and otherwise follows the same
protocol.

Before each capability call, persist its exact function input:

```text
python3 <runtime> begin-skill \
  --run-id <run-id> \
  --skill zan-workflows:<skill-name> \
  --skill-version 1 \
  --input-file <exact-input.json>
```

For a capability owned by another capability, also pass
`--parent-invocation-id <owner-invocation-id>`. V1 permits nested calls only
from the current running parent. In `STANDARD`, the Wiki drafter is a child of
the submission invocation; after the drafter finishes, control returns to that
parent invocation.

After it returns, persist its complete public output and mapped validation
state. Use `--next-skill` only when the workflow may advance:

```text
python3 <runtime> finish-skill \
  --run-id <run-id> \
  --invocation-id <invocation-id> \
  --status SUCCEEDED \
  --validation-state PASSED \
  --output-file <exact-output.json> \
  --next-skill zan-workflows:<next-skill>
```

Valid terminal invocation states are `SUCCEEDED`, `BLOCKED`, `WAITING_USER`,
and `INTERRUPTED`. A blocked or waiting result keeps the current skill and
stores `next_action`; it never advances downstream.
`SUCCEEDED` requires mapped validation `PASSED`. The runtime rejects a final
success while any non-invalidated invocation or effect remains unresolved.

## External-effect progress

Before a significant external write, create an effect while the owning
invocation is `RUNNING`:

```text
python3 <runtime> plan-effect \
  --run-id <run-id> \
  --invocation-id <invocation-id> \
  --operation <operation> \
  --target-file <exact-target.json> \
  --payload-file <exact-payload.json>
```

Use these transitions:

```text
PLANNED -> EXECUTING -> APPLIED -> VERIFIED
PLANNED -> ADOPTED_EXISTING_EFFECT
EXECUTING -> UNKNOWN -> VERIFIED | BLOCKED
any nonterminal effect -> BLOCKED
```

For a new write, record the gate immediately before calling the provider:

```text
python3 <runtime> mark-effect \
  --run-id <run-id> \
  --effect-id <effect-id> \
  --status EXECUTING \
  --validation-state PASSED \
  --authorization-file <authorization-or-policy-evidence.json>
```

Then use `mark-effect --status APPLIED --actual-file ...` for the observed
return and `mark-effect --status VERIFIED --readback-file ...` after readback.

- Mark `EXECUTING` immediately before the external call with the mapped
  `PASSED` validation state and exact authorization evidence (or explicit
  policy evidence that authorization is not required).
- Mark `APPLIED` only after the call returns, with its actual result.
- Mark `VERIFIED` only after readback.
- When an exact effect already exists, move directly from `PLANNED` to
  `ADOPTED_EXISTING_EFFECT` with the matching readback and bound confirmation;
  this transition also requires mapped validation `PASSED`. Do not call the
  external write. The runtime records `adoption_scope_hash`
  over effect ID, target hash, intended/readback hashes, and confirmation hash.
- If an executing call has an unknown outcome, mark `UNKNOWN`. The run becomes
  `INTERRUPTED`. Read the external system first, then mark `VERIFIED` with the
  proven readback or `BLOCKED`; never start a replacement write blindly. If the
  owning invocation already returned `INTERRUPTED`, either reconciliation
  result (`VERIFIED` or `BLOCKED`) reopens that same invocation with its
  original input. Its earlier interrupt return remains in `returns`; finish it
  again only after the capability reaches a new public result.

An invocation can finish `SUCCEEDED` only when every owned effect is
`VERIFIED` or `ADOPTED_EXISTING_EFFECT`. A `BLOCKED` effect requires a blocked
skill result; `PLANNED`, `EXECUTING`, `APPLIED`, or `UNKNOWN` requires more work.

## Resume

Resume from the persisted run record, not from conversation memory:

```text
python3 <runtime> resume --run-id <run-id>
```

The response contains `current_skill`, the current invocation with its recorded
input, `next_action`, completed immutable outputs with `skill_version` and
`input_hash`, the last public report, and pending effects with their exact
target, intended payload/hash, actual return, and readback. Reuse a completed
output only when the current skill version and reconstructed input hash match
its recorded values. If an
upstream input changes, let `fixing-tapd-bug` select the affected linear suffix,
then mark it before re-execution:

```text
python3 <runtime> invalidate-suffix \
  --run-id <run-id> \
  --from-invocation-id <first-invalid-invocation> \
  --reason <normalized-reason>
```

The old invocation values remain for audit but are excluded from reusable
completed outputs. The runtime derives `current_skill` from the invalidated
root invocation. When the selected invocation is nested, its owning parent and
the parent's downstream suffix are invalidated too, so a submission can never
reuse output built from an invalid Wiki draft. Then create a new invocation
with the changed exact input. A blocked, waiting, interrupted, or completed run
cannot start a new invocation until its affected suffix is explicitly
invalidated or its interrupted effect is reconciled.

Suffix invalidation is rejected while any selected invocation owns an
`EXECUTING`, `APPLIED`, or `UNKNOWN` effect. Read back and reconcile that effect
to `VERIFIED` or `BLOCKED` first. Invalidation can never be used to hide an
uncertain provider outcome or authorize a replacement write.

## Public orchestration report

Before any progress, pause, or completion response that returns a
`FixingTapdBugReport`, persist the complete public report:

```text
python3 <runtime> record-report \
  --run-id <run-id> \
  --report-file <exact-public-report.json>
```

Only the latest report is needed for V1 recovery; its revision and hash are
stored in `run.json`. `resume` returns that report. When the caller supplies
optional compatibility evidence, validate it at the recovery boundary:

```text
python3 <runtime> resume \
  --run-id <run-id> \
  --prior-report-file <supplied-report.json>
```

The command rejects a mismatch. Without `prior_report`, the persisted public
report remains authoritative.

## Stored data boundary

The runtime stores sanitized complete input/output values plus their canonical
SHA-256 hashes. Token, cookie, password, secret, and private-key fields are
replaced with `[REDACTED]`. Raw private validator protocol lines are replaced
with `[PRIVATE_VALIDATION_RESULT_DISCARDED]`; capability outputs must still
persist only their public mapped validation state and normalized reason.

Do not place access tokens or raw private validator output in filenames,
operation names, free-form reasons, or confirmation text.
