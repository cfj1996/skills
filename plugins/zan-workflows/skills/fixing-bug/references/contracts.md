# FixingTapdBug orchestration contract

`fixing-bug` is a composition boundary. It transports the stable results
owned by its capability producers; it does not define a mutable task context or
duplicate a producer's business validation.

## Request

```yaml
FixingTapdBugRequest:
  run_id: string | null
  tapd_url: string
  resolver_constraints:
    fixed_project: string | null
    fixed_repo_path: string | null
    fixed_branch: string | null
    branch_mode: AUTO | CREATE | REUSE_FIXED | null
  submission_profile: STANDARD | NO_WIKI
  master_merge:
    requested: true | false
    existing_wiki_mark_request: true | false | null
  prior_report: FixingTapdBugReport | null
  upstream_change:
    requested: true | false
    fields: [WORK_IDENTITY | SCOPE | PROJECT | REPOSITORY | BRANCH_CONSTRAINT]
    reason: string | null
  scope_increment:
    source: string | null
    changes: [string]
  authorization_increment:
    capability: implementing-work | submitting-for-test | going-live | null
    operation: string | null
    confirmation_text: string | null
    confirmed_at: string | null
    scope_hash: string | null
```

- `tapd_url` and `submission_profile` are required. A missing or different
  profile pauses before a capability is invoked; it is never silently
  defaulted.
- `resolver_constraints` are passed only to `preparing-work`. They are
  immutable request facts, not an alternate project/branch-selection mechanism
  for the orchestrator or later capabilities.
- `master_merge.requested=true` must be an explicit user request in the current
  conversation. `false` means the master capability is not invoked.
- `run_id=null` identifies a new run and requires creating the runtime record
  before resolver. A non-null `run_id` identifies a resume and loads recorded
  invocation inputs/outputs, current skill, next action, and effects; it must
  not consume hidden conversation state. `prior_report` is optional compatibility
  evidence and must equal the run's last recorded public report when supplied.
  TAPD URL, profile, and master request must agree with the stored request.
  Request-identity comparison uses TAPD URL, resolver hard constraints, profile,
  and master request; it excludes `run_id`, `prior_report`, scope/authorization
  increments, and routing metadata.
  Resolver constraints may differ only when the
  user explicitly declares the corresponding `upstream_change` field and
  reason; that route invalidates the affected suffix and starts at resolver.
  `scope_increment` or an explicitly declared resolver-owned upstream change
  may also route resolver. The actual delta and source must also be normalized
  into `scope_increment`, because that is the only change payload passed to the
  resolver; `upstream_change` is routing metadata, not a hidden input. Any undeclared mismatch pauses at
  `request-validation` without a capability call.
- On every resolver call, the orchestrator passes only the resolver's declared
  `tapd_url`, `fixed_project`, `fixed_repo_path`, `fixed_branch`,
  `branch_mode`, and `scope_increment`. `prior_report`, a prior definition,
  and history are orchestration-only inputs and are never resolver inputs.
- `authorization_increment` is the only new cross-invocation authorization input.
  It must identify the paused non-resolver capability and exact operation, carry
  the current explicit confirmation text/time/scope hash, and is forwarded only
  to that producer for its own verification. A capability mismatch, incomplete
  binding, stale authorization, or generic “继续” pauses at request validation;
  the orchestrator never upgrades it to authorization. Resolver never receives
  this field, and an authorization increment never invalidates unchanged
  upstream artifacts.

## Result handoffs

The only capability-to-capability handoffs are the producer-defined artifacts:

```text
TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult?
```

The authoritative schemas and terminal conditions remain in the producer
contracts:

| Artifact | Producer | Consumer | Required handoff state |
| --- | --- | --- | --- |
| `TapdWorkDefinition` | `zan-workflows:preparing-work` | `zan-workflows:implementing-work` | `terminal_state=READY_FOR_HANDOFF`, matching response marker, and no unresolved required user action |
| `ReviewedChange` | `zan-workflows:implementing-work` | `zan-workflows:submitting-for-test` | `terminal_state=REVIEWED` and producer review passes |
| `TestSubmissionResult` | `zan-workflows:submitting-for-test` | `zan-workflows:going-live` | `terminal_state=SUBMITTED` |
| `MasterMergeResult` | `zan-workflows:going-live` | final report only | `terminal_state=MERGED` |

`drafting-wiki` is a named required dependency but is not a fourth
handoff. `submitting-for-test` owns that composition under `STANDARD`; it
must not be invoked, inspected, or represented for `NO_WIKI`.

## Final report

```yaml
FixingTapdBugReport:
  run_id: string
  terminal_state: COMPLETED | PAUSED
  request: FixingTapdBugRequest
  result_chain:
    definition: TapdWorkDefinition | null
    reviewed_change: ReviewedChange | null
    submission: TestSubmissionResult | null
    master_merge:
      request: REQUESTED | NOT_REQUESTED
      result: MasterMergeResult | null
  history:
    superseded_results:
      - capability: preparing-work | implementing-work | submitting-for-test | going-live
        artifact_type: TapdWorkDefinition | ReviewedChange | TestSubmissionResult | MasterMergeResult
        artifact: TapdWorkDefinition | ReviewedChange | TestSubmissionResult | MasterMergeResult
        reason: string
        disposition: REPLACED | INVALIDATED_BY_UPSTREAM_REPLACEMENT
        replaced_by:
          capability: preparing-work | implementing-work | submitting-for-test | going-live | null
          result_chain_slot: definition | reviewed_change | submission | master_merge.result | null
          terminal_state: READY_FOR_HANDOFF | PENDING | REVIEWED | SUBMITTED | MERGED | BLOCKED | null
  resume_route:
    source_pause_capability: preparing-work | implementing-work | submitting-for-test | going-live | request-validation | null
    reused_slots: [definition | reviewed_change | submission | master_merge.result]
    entry_capability: preparing-work | implementing-work | submitting-for-test | going-live | null
    replaced_slots: [definition | reviewed_change | submission | master_merge.result]
    invalidated_slots: [definition | reviewed_change | submission | master_merge.result]
  pause:
    capability: preparing-work | implementing-work | submitting-for-test | going-live | request-validation | null
    reason: string | null
    next_required_action: string | null
    resume_with: [TapdWorkDefinition | ReviewedChange | TestSubmissionResult | MasterMergeResult]
  cleanup:
    status: NOT_REQUESTED | SKIPPED | COMPLETED | BLOCKED
    target: string | null
    authorization: string | null
    readback: string | null
  final_summary: [string]
```

## Invariants

- `COMPLETED` requires a submitted result and either `master_merge.request`
  `NOT_REQUESTED` with a null master result, or `REQUESTED` with a `MERGED`
  master result. Cleanup does not change this definition.
- `PAUSED` preserves every returned result exactly as supplied, identifies the
  first incomplete capability or request gate, and names a truthful next
  action. It never contains invented downstream artifacts.
- A resumed report begins with the run's last recorded public report and every
  `history.superseded_results` entry unchanged. A supplied `prior_report` must
  match that record. After a producer returns its new artifact, the orchestrator
  compares it with the matching recorded result-chain artifact. Only if
  it is a replacement does the orchestrator append the old exact artifact once
  with the truthful `reason` and the new producer/slot/terminal state in
  `replaced_by`; the replacement itself occupies the current result chain slot.
  Every downstream artifact whose input changed is appended once with
  `disposition=INVALIDATED_BY_UPSTREAM_REPLACEMENT`, cleared from the current
  chain, and recomputed only as part of the affected suffix. An unchanged
  prefix artifact is reused and is not superseded.
- Every public `FixingTapdBugReport` is persisted with runtime `record-report`
  before it is returned. The runtime stores its revision and canonical hash;
  `resume` returns it and rejects a supplied `prior_report` whose hash differs.
- `resume_route.entry_capability` records only the first producer selected by
  the runtime `current_skill` and matching last pause; a successful replacement may continue through its
  affected suffix in the same invocation. `replaced_slots` contains producer
  slots directly replaced in this run. `invalidated_slots` contains only their
  dependent downstream slots, never the replaced root itself. An invalidated
  history entry has all `replaced_by` fields null until that same slot is
  recomputed, then points to the new same-slot producer result.
- A `BLOCKED`/`PENDING` capability result, non-passing validation, or an authorization
  wait is `PAUSED`; it is not converted into a success and no later capability
  is invoked.
- Resume uses only `run_id`, retained immutable invocation outputs within that
  run, and explicit `scope_increment`/`authorization_increment`. A supplied
  `prior_report` is checked but is not required. It routes by runtime
  `current_skill` and the matching recorded pause: resolver
  pause invokes resolver; repair pause invokes repair with the retained
  definition; submission pause invokes submission with retained definition and
  reviewed change; master pause invokes master with the retained submission;
  request validation invokes none. Resolver reruns only for its own pause or an
  explicit resolver-owned scope/identity change. “继续” without required
  information/authorization cannot advance a paused gate.
- Submission never consumes a prior invocation's private PASS or raw validator
  output. It may consume the public runtime effect ID, target, payload hash,
  status, and recorded readback. Whether resumed from a returned report or
  re-entered after an interrupted invocation, it reconciles every pending
  effect from the retained immutable handoffs, recorded effect plan, and current
  external readback. Exact existing
  effects require bound adoption confirmation, proved absence requires fresh
  validation before one new write, and ambiguity pauses the workflow.
- An interrupted invocation retains each public return in its runtime
  `returns`. When an `UNKNOWN` effect is proven `VERIFIED`, the runtime reopens
  that same owning invocation with its original recorded input; it does not
  start a replacement invocation or reuse the old private validation.
- Result-chain and history artifacts contain only producer-owned public mapped
  validation states and normalized business reasons. A raw private validator
  line is invalid orchestration input and is never persisted or copied.
- The final report may describe cleanup but must not add cleanup rules to any
  capability. No cleanup action is inferred or authorized by an upstream
  result.
