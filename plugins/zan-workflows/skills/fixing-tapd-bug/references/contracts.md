# FixingTapdBug orchestration contract

`fixing-tapd-bug` is a composition boundary. It transports the stable results
owned by its capability producers; it does not define a mutable task context or
duplicate a producer's business validation.

## Request

```yaml
FixingTapdBugRequest:
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
    capability: repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master | null
    operation: string | null
    confirmation_text: string | null
    confirmed_at: string | null
    scope_hash: string | null
```

- `tapd_url` and `submission_profile` are required. A missing or different
  profile pauses before a capability is invoked; it is never silently
  defaulted.
- `resolver_constraints` are passed only to `resolving-tapd-work`. They are
  immutable request facts, not an alternate project/branch-selection mechanism
  for the orchestrator or later capabilities.
- `master_merge.requested=true` must be an explicit user request in the current
  conversation. `false` means the master capability is not invoked.
- `prior_report=null` identifies a new run. A resume is a fresh invocation
  whose request carries the complete, immutable report returned by the prior
  invocation; it must not consume hidden conversation state. TAPD URL, profile,
  and master request must agree. Resolver constraints may differ only when the
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
- `authorization_increment` is the only cross-invocation authorization input.
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
| `TapdWorkDefinition` | `zan-workflows:resolving-tapd-work` | `zan-workflows:repairing-tapd-work` | `terminal_state=READY_FOR_HANDOFF`, matching response marker, and no unresolved required user action |
| `ReviewedChange` | `zan-workflows:repairing-tapd-work` | `zan-workflows:submitting-tapd-for-test` | `terminal_state=REVIEWED` and producer review passes |
| `TestSubmissionResult` | `zan-workflows:submitting-tapd-for-test` | `zan-workflows:merging-tapd-work-to-master` | `terminal_state=SUBMITTED` |
| `MasterMergeResult` | `zan-workflows:merging-tapd-work-to-master` | final report only | `terminal_state=MERGED` |

`drafting-tapd-wiki` is a named required dependency but is not a fourth
handoff. `submitting-tapd-for-test` owns that composition under `STANDARD`; it
must not be invoked, inspected, or represented for `NO_WIKI`.

## Final report

```yaml
FixingTapdBugReport:
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
      - capability: resolving-tapd-work | repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master
        artifact_type: TapdWorkDefinition | ReviewedChange | TestSubmissionResult | MasterMergeResult
        artifact: TapdWorkDefinition | ReviewedChange | TestSubmissionResult | MasterMergeResult
        reason: string
        disposition: REPLACED | INVALIDATED_BY_UPSTREAM_REPLACEMENT
        replaced_by:
          capability: resolving-tapd-work | repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master | null
          result_chain_slot: definition | reviewed_change | submission | master_merge.result | null
          terminal_state: READY_FOR_HANDOFF | PENDING | REVIEWED | SUBMITTED | MERGED | BLOCKED | null
  resume_route:
    source_pause_capability: resolving-tapd-work | repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master | request-validation | null
    reused_slots: [definition | reviewed_change | submission | master_merge.result]
    entry_capability: resolving-tapd-work | repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master | null
    replaced_slots: [definition | reviewed_change | submission | master_merge.result]
    invalidated_slots: [definition | reviewed_change | submission | master_merge.result]
  pause:
    capability: resolving-tapd-work | repairing-tapd-work | submitting-tapd-for-test | merging-tapd-work-to-master | request-validation | null
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
- A resumed report begins with every `prior_report.history.superseded_results`
  unchanged. After a producer returns its new artifact, the orchestrator
  compares it with the matching `prior_report.result_chain` artifact. Only if
  it is a replacement does the orchestrator append the old exact artifact once
  with the truthful `reason` and the new producer/slot/terminal state in
  `replaced_by`; the replacement itself occupies the current result chain slot.
  Every downstream artifact whose input changed is appended once with
  `disposition=INVALIDATED_BY_UPSTREAM_REPLACEMENT`, cleared from the current
  chain, and recomputed only as part of the affected suffix. An unchanged
  prefix artifact is reused and is not superseded.
- `resume_route.entry_capability` records only the first producer selected by
  `pause.capability`; a successful replacement may continue through its
  affected suffix in the same invocation. `replaced_slots` contains producer
  slots directly replaced in this run. `invalidated_slots` contains only their
  dependent downstream slots, never the replaced root itself. An invalidated
  history entry has all `replaced_by` fields null until that same slot is
  recomputed, then points to the new same-slot producer result.
- A `BLOCKED`/`PENDING` capability result, non-passing validation, or an authorization
  wait is `PAUSED`; it is not converted into a success and no later capability
  is invoked.
- Resume uses only `prior_report`, retained immutable artifacts within it, and
  explicit `scope_increment`/`authorization_increment`. It routes by
  `pause.capability`: resolver
  pause invokes resolver; repair pause invokes repair with the retained
  definition; submission pause invokes submission with retained definition and
  reviewed change; master pause invokes master with the retained submission;
  request validation invokes none. Resolver reruns only for its own pause or an
  explicit resolver-owned scope/identity change. “继续” without required
  information/authorization cannot advance a paused gate.
- Result-chain and history artifacts contain only producer-owned public mapped
  validation states and normalized business reasons. A raw private validator
  line is invalid orchestration input and is never persisted or copied.
- The final report may describe cleanup but must not add cleanup rules to any
  capability. No cleanup action is inferred or authorized by an upstream
  result.
