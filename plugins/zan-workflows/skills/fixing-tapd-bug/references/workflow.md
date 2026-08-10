# Composition workflow

This is the orchestration routing table, not a restatement of capability
business rules. Read the linked producer contract whenever the table refers to
a producer state or gate.

| Order | Invoke | Exact input | Continue only when | Pause/result ownership |
| --- | --- | --- | --- | --- |
| 0 | none | `FixingTapdBugRequest`, including `prior_report` or explicit null | TAPD URL and exact profile are present; named skills are available; a prior report, when supplied, matches the immutable request identity | Return `PAUSED` at `request-validation`; no capability result exists. |
| 1 | `zan-workflows:resolving-tapd-work` | Only `tapd_url`, `fixed_project`, `fixed_repo_path`, `fixed_branch`, `branch_mode`, and `scope_increment` | Its producer permits an actionable handoff | Preserve `TapdWorkDefinition`; resolver owns blocked/pending evidence and requested confirmation. `prior_report` remains in the orchestrator. |
| 2 | `zan-workflows:repairing-tapd-work` | unchanged `TapdWorkDefinition` | `ReviewedChange.terminal_state=REVIEWED` and its review passes | Preserve definition and change; repair owns location, planning, TDD, verification, and review decisions. |
| 3 | `zan-workflows:submitting-tapd-for-test` | unchanged definition, unchanged reviewed change, exact profile | `TestSubmissionResult.terminal_state=SUBMITTED` | Preserve all three results; submission owns develop, Wiki policy, authorization, writes, and readbacks. |
| 4 | `zan-workflows:merging-tapd-work-to-master` | unchanged submitted result, exact original repair branch, optional existing-Wiki mark request | `MasterMergeResult.terminal_state=MERGED` | Invoke only for an explicit master request. Preserve all results; master capability owns its authorization and readbacks. |
| 5 | none | complete result chain | reporting is formed | The orchestrator owns optional cleanup handling and the final report only. |

## Profile routing

Forward the request profile exactly once to submission:

| Request profile | Orchestrator action | Submission-owned behavior |
| --- | --- | --- |
| `STANDARD` | Invoke submission with `STANDARD`; do not draft a Wiki itself. | Submission invokes `zan-workflows:drafting-tapd-wiki` under its own contract. |
| `NO_WIKI` | Invoke submission with `NO_WIKI`; do not load any Wiki material or capability. | Submission records its producer-defined skip result. |

## Pause and resume

1. Stop at the first capability that is blocked, has a failing validation, or
   is waiting for authorization/required user input.
2. Return the already-produced artifacts unchanged in `FixingTapdBugReport`.
3. A later invocation must provide that report in `prior_report`, plus an
   explicit `scope_increment` or authorization. Do not read hidden conversation
   state. Resume at the earliest paused producer; it decides whether
   revalidation is needed. Do not replay later stages first.
4. Call resolver with only its declared input fields. After it returns, the
   orchestrator compares the new definition with
   `prior_report.result_chain.definition`. If it is a replacement, preserve the
   earlier exact artifact by appending it with its replacement reason and
   replacement slot to `history.superseded_results`; leave the new result in
   the current chain. Downstream execution waits for its new eligible handoff.
   Carry unchanged historical entries forward.

## Cleanup boundary

The workflow has no implicit deletion or branch/worktree cleanup. After a
terminal chain or a pause, cleanup may be requested as a separate orchestration
action. First identify the exact target from the existing results, display the
planned operation, obtain user authorization, perform it, read it back, and
record the observed result. A refusal, absent authorization, or failed
readback remains visible in `FixingTapdBugReport` and never changes capability
results.
