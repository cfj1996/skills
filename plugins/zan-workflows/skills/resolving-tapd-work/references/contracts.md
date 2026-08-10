# TapdWorkDefinition contract

`resolving-tapd-work` is an analysis-only producer. It returns this definition
and `STOPPED_FOR_HANDOFF`; no field authorizes a write.

```yaml
TapdWorkDefinition:
  terminal_state: STOPPED_FOR_HANDOFF | BLOCKED
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
    source: string | null
    constraints: [{name: fixed_branch, expected: string | null, actual: string | null, result: PASS | FAIL | PENDING, evidence: string}]
    checks: [{check: local_ref | remote_ref | tapd_association | raw_md | test_evidence, result: PASS | FAIL | PENDING, evidence: string}]
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
```

## Constraint and confidence rules

- A hard fixed constraint records its expected value and a `PASS`, `FAIL`, or
  `PENDING` comparison; it is never converted into a routing fact.
- `VERIFIED` fingerprint requires a resolved repository and actual Git root and
  origin remote from that repository. Absence of a safe target means
  `NOT_ATTEMPTED` or `PENDING`, not a claim of verification.
- `HIGH` needs direct, mutually consistent evidence. `MEDIUM` has a bounded
  unresolved gap. `LOW` names material missing or conflicting evidence.
- `RESUME` requires a selected target-repository ref with historical raw and a
  TAPD association. `REUSE_FIXED` is a requested mode, not proof of `RESUME`.
- When `fixed_branch` is supplied, `branch.constraints` contains exactly one
  `fixed_branch` comparison. With `REUSE_FIXED`,
  `resume.selected_ref` is only `refs/heads/<fixed_branch>` or
  `refs/remotes/origin/<fixed_branch>` after its constraint and every required
  `branch.checks` entry (`local_ref`, `remote_ref`, `tapd_association`,
  `raw_md`, and `test_evidence`) are `PASS`. A mismatch or incomplete check has
  `selected_ref=null` and a `FAIL`/`PENDING` constraint with `BLOCKED` or a
  confirmation-required decision; a different ref cannot substitute for it.
- Scope confirmation is independent from evidence quality. Until the user
  confirms the displayed in-scope, out-of-scope, and history policy,
  `scope.status=PENDING_CONFIRMATION` and `scope_confidence=LOW`.
