# ReviewedChange contract

`repairing-tapd-work` consumes an approved `TapdWorkDefinition`. It preserves
the definition's project fingerprint as a constraint and emits this result; it
does not grant any later submission, merge, Wiki, or deployment authority.

```yaml
ReviewedChange:
  terminal_state: REVIEWED | BLOCKED
  source_definition:
    tapd_url: string
    work_type: BUG | STORY | TASK
    short_id: string
    approved_scope: [string]
    excluded_scope: [string]
  project_fingerprint:
    expected:
      selected_project: string
      repo_path: string
      git_root: string
      origin_remote: string
    actual:
      selected_project: string | null
      repo_path: string | null
      git_root: string | null
      common_git_dir: string | null
      origin_remote: string | null
      head_before: string | null
      head_after: string | null
    comparison:
      selected_project: PASS | FAIL | BLOCKED
      repo_path: EXACT | WORKTREE_CANONICAL | FAIL | BLOCKED
      git_root: PASS | WORKTREE_CANONICAL | FAIL | BLOCKED
      origin_remote: PASS | FAIL | BLOCKED
    result: PASS | FAIL | BLOCKED
  execution:
    location_confirmation:
      choice: CURRENT_PATH | NEW_BRANCH_AND_WORKTREE | REUSE_BRANCH_AND_WORKTREE | null
      expected_branch: string | null
      expected_worktree_path: string | null
      user_confirmation: string | null
    branch:
      mode: CREATE | REUSE
      expected: string | null
      actual: string | null
      base_ref: string | null
      result: PASS | FAIL | REUSE | BLOCKED
    worktree:
      expected_path: string | null
      actual_path: string | null
      result: PASS | FAIL | REUSE | BLOCKED
  tapd_status:
    expected: 修复中 | 进行中 | UNCHANGED
    actual: string | null
    readback: PASS | FAIL | NOT_ATTEMPTED
  scope_baseline:
    before_status: string
    after_status: string
    allowed_paths: [string]
    changed_paths: [string]
    unrelated_paths: [string]
    result: PASS | FAIL | BLOCKED
  changes:
    summary: [string]
    diff_reference: string | null
  plan:
    route: [string]
    reference: string | null
    prototype_evidence: string | null
  tdd:
    red: {test_command: string | null, exit_code: number | null, output: string | null, target_failure: string | null, result: EXPECTED_FAILURE | FAIL | NOT_RUN}
    green: {test_command: string | null, relation_to_red: SAME_COMMAND | EXPLICITLY_MAPPED | null, mapping_reason: string | null, exit_code: number | null, output: string | null, result: PASS | FAIL | NOT_RUN}
  verification:
    commands: [{command: string, exit_code: number | null, output: string, result: PASS | FAIL | SKIPPED, blocker_reason: string | null}]
  review:
    reviewer: string | null
    input_bundle: [string]
    verdict: REVIEW_PASSED | REVIEW_FAILED | NOT_RUN
    report: string | null
  risks: [string]
  blocker_reason: string | null
```

## Result invariants

- `terminal_state=REVIEWED` requires `project_fingerprint.result=PASS`, every
  fingerprint comparison to pass (or use the allowed worktree-canonical form),
  a confirmed location, branch and worktree results of `PASS` or `REUSE`, a
  scope baseline `PASS`, completed RED then GREEN evidence, no unaccounted
  verification failure, and `review.verdict=REVIEW_PASSED`.
- `actual.selected_project` and `actual.repo_path` are required actual values,
  not labels inferred from the CWD. `selected_project` must equal the approved
  project. `repo_path` is `EXACT` only when its canonical absolute path equals
  `expected.repo_path`.
- `repo_path=WORKTREE_CANONICAL` is allowed only for a confirmed execution
  worktree: its `actual.git_root` equals `execution.worktree.actual_path`, its
  canonical `common_git_dir` equals the canonical common Git directory of the
  expected repository, and its origin remote equals the expected remote. Record
  both absolute paths and the common Git directory. A same-name directory or
  matching branch is not canonical equivalence.
- `actual.git_root` and `actual.origin_remote` must equal their expected values
  unless the preceding `WORKTREE_CANONICAL` rule applies to the Git root. A
  matching directory name, current shell, or branch alone is not evidence.
- `head_after` may change only through in-scope work. This capability does not
  commit or push; a changed HEAD must be explained as pre-existing and causes a
  scope-baseline block unless independently confirmed.
- `CREATE` records an allowed, verified baseline ref. A new branch based on
  `develop` or `dev` is `FAIL`. `REUSE` records the exact confirmed branch and
  its evidence; it never silently substitutes a different ref.
- `changed_paths` are compared with the pre-edit baseline and approved scope.
  Existing dirty paths remain unrelated unless the user explicitly included
  them and the baseline makes that attribution auditable.
- RED is a focused test command for an approved target behavior, run before the
  implementation change. It must exit non-zero, have
  `result=EXPECTED_FAILURE`, and include output plus `target_failure` proving
  that behavior failed. A passing command, lint/build command, or command that
  fails for setup rather than the target behavior is not RED evidence.
- GREEN must exit zero with `result=PASS` after the change and run the same test
  command. A different command is allowed only with
  `relation_to_red=EXPLICITLY_MAPPED` and a concrete `mapping_reason` that
  proves it tests the same target behavior. Missing, failed, or unavailable
  commands remain `NOT_RUN`/`FAIL`; they cannot become passing evidence.
- `REVIEWED` is evidence for a downstream skill, not a write authorization.
  Any blocked or incomplete check keeps `terminal_state=BLOCKED`.
