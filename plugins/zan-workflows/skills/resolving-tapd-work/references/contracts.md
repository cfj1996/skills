# TapdWorkDefinition contract

`resolving-tapd-work` is an analysis-only producer. It returns this definition
with one authoritative terminal state; no field authorizes a write.

```yaml
TapdWorkDefinition:
  terminal_state: READY_FOR_HANDOFF | PENDING | BLOCKED
  work_identity:
    tapd_url: string
    type: BUG | STORY | TASK
    id: string
    short_id: string
    title: string
    source: string
  evidence:
    claims: [{claim: string, source: string, confidence: HIGH | MEDIUM | LOW}]
    conflicts: [{topic: string, claims: [string], required_decision: string}]
    warnings: [string]
  confidence:
    context_confidence: {level: HIGH | MEDIUM | LOW, reasons: [string], missing: [string]}
    project_confidence: {level: HIGH | MEDIUM | LOW, reasons: [string], missing: [string]}
    scope_confidence: {level: HIGH | MEDIUM | LOW, reasons: [string], missing: [string]}
  project:
    routing_status: RESOLVED | AMBIGUOUS | UNRESOLVED | BLOCKED
    selected_project: string | null
    candidates: [{project: string, evidence: [string]}]
    fingerprint:
      verification: VERIFIED | PENDING | FAILED | NOT_ATTEMPTED
      expected: {project: string | null, repo_path: string | null}
      actual: {repo_path: string | null, git_root: string | null, origin_remote: string | null}
      constraints: [{name: fixed_project | fixed_repo_path, expected: string, actual: string | null, result: PASS | FAIL | PENDING}]
  branch:
    mode: AUTO | CREATE | REUSE_FIXED
    fixed_branch: string | null
    branch_to_create: string | null
    source: string | null
    constraints: [{name: fixed_branch, expected: string | null, actual: string | null, result: PASS | FAIL | PENDING, evidence: string}]
    checks: [{check: local_ref | remote_ref | tapd_association | raw_md | test_evidence, result: PASS | FAIL | PENDING | ABSENT, evidence: string}]
  resume:
    decision: RESUME | FRESH | NEED_CONFIRMATION | PENDING_PROJECT | PENDING_REPO_VERIFICATION | BLOCKED
    selected_ref: string | null
    context_source: string | null
  context:
    previous_context: {status: FOUND | NOT_FOUND | NOT_APPLICABLE, source: string | null, summary: string}
    latest_tapd_refresh: {source: string, changes: [string]}
    user_increment: {source: string, changes: [string]}
  scope:
    status: CONFIRMED | PENDING_CONFIRMATION | BLOCKED
    in_scope: [string]
    out_of_scope: [string]
    history_policy: string
    acceptance_criteria: [{criterion: string, source: string}]
  confirmations:
    required: [string]
    present: [string]
    missing: [string]
  blocker_reason: string | null
```

## Constraint and confidence rules

- A hard fixed constraint records its expected value and a `PASS`, `FAIL`, or
  `PENDING` comparison; it is never converted into a routing fact.
- Valid combinations are `AUTO` with or without `fixed_branch`, `CREATE` with
  `fixed_branch`, and `REUSE_FIXED` with `fixed_branch`. `CREATE` or
  `REUSE_FIXED` without it is `BLOCKED`.
- `PENDING` means evidence is unavailable/incomplete or a named user decision
  could still satisfy the constraint. `BLOCKED` means a hard fact is
  disproven, conflicting, or invalid. `ABSENT` is used only for a proven
  missing exact ref during creation evaluation and is not a constraint failure.
- `VERIFIED` fingerprint requires a resolved repository and actual Git root and
  origin remote from that repository. Absence of a safe target means
  `NOT_ATTEMPTED` or `PENDING`, not a claim of verification.
- `HIGH` needs direct, mutually consistent evidence. `MEDIUM` has a bounded
  unresolved gap. `LOW` names material missing or conflicting evidence.
- `RESUME` requires a selected target-repository ref with historical raw and a
  TAPD association. `CREATE` never returns `RESUME`; it keeps
  `resume.selected_ref=null` and the exact fixed name in `branch_to_create`.
  `REUSE_FIXED` is a requested mode, not proof of `RESUME`.
- When `fixed_branch` is supplied, `branch.constraints` contains exactly one
  `fixed_branch` comparison in every mode. `AUTO` and `REUSE_FIXED` may set
  `resume.selected_ref` only to `refs/heads/<fixed_branch>` or
  `refs/remotes/origin/<fixed_branch>`; `CREATE` may set only the same value in
  `branch_to_create`. A mismatch or incomplete check has `selected_ref=null`
  and a `FAIL`/`PENDING` constraint with `BLOCKED` or a confirmation-required
  decision; a different ref cannot substitute for it.
- If both exact local and remote refs pass resume checks, their SHAs must match
  and `selected_ref=refs/remotes/origin/<fixed_branch>`. A SHA mismatch is a
  hard conflict and blocks selection.
- Scope confirmation is independent from evidence quality. Until the user
  confirms the displayed in-scope, out-of-scope, and history policy,
  `scope.status=PENDING_CONFIRMATION` and `scope_confidence=LOW`.
- `READY_FOR_HANDOFF` requires a verified repository, a valid mode/branch
  combination, an eligible branch decision, confirmed scope, no missing
  confirmation, and `blocker_reason=null`. `PENDING` and `BLOCKED` require a
  non-empty normalized `blocker_reason` and must not be consumed by repair.
