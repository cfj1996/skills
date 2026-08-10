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
  user_increment:
    source: string | null
    changes: [string]
```

- `tapd_url` and `submission_profile` are required. A missing or different
  profile pauses before a capability is invoked; it is never silently
  defaulted.
- `resolver_constraints` are passed only to `resolving-tapd-work`. They are
  immutable request facts, not an alternate project/branch-selection mechanism
  for the orchestrator or later capabilities.
- `master_merge.requested=true` must be an explicit user request in the current
  conversation. `false` means the master capability is not invoked.

## Result handoffs

The only capability-to-capability handoffs are the producer-defined artifacts:

```text
TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult?
```

The authoritative schemas and terminal conditions remain in the producer
contracts:

| Artifact | Producer | Consumer | Required handoff state |
| --- | --- | --- | --- |
| `TapdWorkDefinition` | `zan-workflows:resolving-tapd-work` | `zan-workflows:repairing-tapd-work` | producer permits handoff and has no unresolved required user action |
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
- A `BLOCKED` capability result, non-passing validation, or an authorization
  wait is `PAUSED`; it is not converted into a success and no later capability
  is invoked.
- Resume uses only the retained immutable artifacts and explicit new user
  information. “继续” without that information/authorization cannot advance a
  paused gate.
- The final report may describe cleanup but must not add cleanup rules to any
  capability. No cleanup action is inferred or authorized by an upstream
  result.
