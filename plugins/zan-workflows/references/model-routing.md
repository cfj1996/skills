# Model and reasoning routing

These profiles balance correctness, latency, and token cost. They are execution
preferences, not user input gates. A skill cannot replace the active parent
model: never block, ask the user to switch models, or spawn an otherwise
unneeded agent solely to emulate a profile. Apply a profile when the current
client can choose the lead model or when a skill invokes a private/subagent
role.

## Profiles

| Profile | Model | Reasoning | Use |
| --- | --- | --- | --- |
| `CRITICAL` | `gpt-5.6-sol` | `high` | Ambiguous multi-step decisions, code changes/review, external writes, branch safety, and master/develop merge workflows |
| `BALANCED` | `gpt-5.6-terra` | `medium` | Read-heavy discovery, structured synthesis, deterministic drafting, and bounded context retrieval |
| `FAST` | `gpt-5.6-luna` | `low` | Narrow, repeatable identity/token lookups with explicit inputs and deterministic output |

If a configured model is unavailable, inherit the parent model and preserve the
same safety/validation gates. Never lower a required authorization or evidence
standard to compensate for model availability.

## Skill defaults

| Skill | Default profile | Reason |
| --- | --- | --- |
| `fixing-bug` | `CRITICAL` | Coordinates multiple capability handoffs, confirmation state, and optional writes across one or more Bugs |
| `preparing-work` | `CRITICAL` | Resolves ambiguous project ownership, scope, repository fingerprints, and branch identity |
| `implementing-work` | `CRITICAL` | Changes code, verifies behavior, and performs independent change review |
| `submitting-for-test` | `CRITICAL` | Executes Git, Wiki, TAPD, and test-version writes with ordered readbacks |
| `going-live` | `CRITICAL` | Merges an original repair branch to `master` and maintains Wiki online state |
| `managed-mr-review` | Conditional | Discovery is `BALANCED`; code review/merge decisions are `CRITICAL` for high-risk MRs and `BALANCED` for routine MRs |
| `drafting-wiki` | `BALANCED` | Read-only target resolution and deterministic Markdown/sequence calculation |
| `workspace-project-knowledge` | `BALANCED` | Read-heavy routing and graph/knowledge lookup |
| `project-memory-context` | `BALANCED` | Bounded retrieval and evidence-aware memory synthesis |
| `login-token-workflow` | `FAST` | Explicit, repeatable token retrieval and URL assembly |
| `team-identity-map` | `FAST` | Bounded roster lookup and identifier translation |

## Escalation

Escalate a `BALANCED` task to `CRITICAL` only when one of these changes the
decision materially:

- project routing has tied candidates or conflicting runtime/code evidence;
- TAPD, Git, Wiki, or handoff facts conflict;
- review crosses authorization, payment, order, ledger, stock, settlement,
  security, deployment, or data-integrity boundaries;
- the task becomes write-owning or must approve/merge to `master`/`develop`;
- a large or cross-module diff requires call-chain reasoning and edge-case
  review.

Do not escalate merely because a task has many files, long tool output, or a
strict template. Prefer `BALANCED` for read-only pagination, filtering,
formatting, and deterministic validation.

## Managed MR reviewer roles

- Use `agents/mr-code-reviewer.md` (`BALANCED`) for routine, bounded MRs.
- Use `agents/mr-critical-reviewer.md` (`CRITICAL`) for any escalation signal.
- The lead agent classifies risk from MR metadata/diff before delegation,
  resolves reviewer disagreements conservatively, and owns every approval or
  merge authorization.
