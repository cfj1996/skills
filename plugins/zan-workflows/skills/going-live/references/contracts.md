# MasterMergeResult contract

`going-live` consumes a completed `TestSubmissionResult` and
performs at most one direct original-repair-branch-to-`master` transaction. It
does not authorize or perform release, smoke-test, TAPD, test-version, or Wiki
creation work.

```yaml
MasterMergeResult:
  terminal_state: MERGED | BLOCKED
  submission:
    terminal_state: SUBMITTED
    source_definition: {tapd_url: string, work_type: BUG | STORY | TASK, short_id: string}
    reviewed_change: {terminal_state: REVIEWED, review_verdict: REVIEW_PASSED}
  repository:
    expected: {repo_path: string, git_root: string, origin_remote: string}
    actual: {repo_path: string | null, git_root: string | null, origin_remote: string | null}
    result: PASS | FAIL | NOT_ATTEMPTED
  merge:
    original_repair_branch: string | null
    expected_source_branch: string | null
    expected_target_branch: master
    expected_commit_list: [string]
    actual_source_branch: string | null
    actual_target_branch: string | null
    actual_commit_list: [string]
    inherited_base_difference: [string]
    ref_snapshot:
      expected_source_ref_sha: string | null
      expected_target_master_ref_sha: string | null
      merge_base_sha: string | null
      confirmed_source_ref_sha: string | null
      confirmed_target_master_ref_sha: string | null
      execution_preflight_source_ref_sha: string | null
      execution_preflight_target_master_ref_sha: string | null
      execution_post_master_ref_sha: string | null
    confirmation_gate:
      intended_operation: create_or_update_and_merge_mr
      purpose: string | null
      user_confirmation_text: string | null
      result: PASS | FAIL | NOT_ATTEMPTED
    mr: {id: string | null, url: string | null, state: string | null}
    merge_readback: {result: PASS | FAIL | NOT_ATTEMPTED, evidence: string | null}
    master_containment:
      commits: [{commit: string, contained: true | false, evidence: string | null}]
      result: PASS | FAIL | NOT_ATTEMPTED
  wiki:
    status: MARKED | SKIPPED_NO_WIKI | BLOCKED | NOT_ATTEMPTED
    existing_wiki_id: string | null
    confirmation_text: string | null
    write_gate:
      write_mode: update_existing
      before_content_hash: string | null
      expected_patch: string | null
      full_resulting_body: string | null
      after_content_hash: string | null
      readback_contains_expected_patch: true | false | null
      result: PASS | FAIL | NOT_ATTEMPTED
    readback: {result: PASS | FAIL | NOT_ATTEMPTED, evidence: string | null}
  scope:
    develop_to_master: FORBIDDEN
    production_publish: NOT_PERFORMED
    smoke_test: NOT_PERFORMED
    tapd_status_or_comment: NOT_PERFORMED
    test_version_publish: NOT_PERFORMED
    wiki_creation: NOT_PERFORMED
  validation:
    validator: agents/master-merge-validator.md
    checked_privately: true | false
    private_verdict_persisted: false
    pre_write:
      validation_phase: PRE_WRITE
      state: NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED
      failure_reason: string | null
  blocker_reason: string | null
```

## Invariants

- `MERGED` requires a `SUBMITTED` upstream result, `repository.result=PASS`,
  the original repair branch to be the same submitted `feature/*` or
  `fixbug/*` source, exact actual source/target/current-round commits, a
  passing explicit `MergeConfirmationGate`,
  `validation.pre_write.state=VALIDATION_PASSED`,
  successful MR/merge readback, and `master_containment.result=PASS` for every
  approved commit.
- `MERGED` also requires a consistent immutable-ref chain:
  `expected_source_ref_sha=confirmed_source_ref_sha=execution_preflight_source_ref_sha`
  and
  `expected_target_master_ref_sha=confirmed_target_master_ref_sha=execution_preflight_target_master_ref_sha`.
  `execution_post_master_ref_sha` must be an actual post-merge `master` readback
  and support the recorded containment evidence. A required `merge_base_sha`
  must be retained when inherited history is evaluated. Missing/mismatching
  source or target SHA evidence blocks before merge; a changed preflight SHA
  invalidates authorization and requires re-verification plus fresh
  confirmation.
- The target is exactly `master`. `develop -> master`, `dev -> master`, a
  `merge/*` intermediary, a release branch, or any substituted/rebuilt source
  is always `BLOCKED`. Legal inherited history is recorded only in
  `inherited_base_difference` and never becomes current-round scope.
- `MERGED` permits `wiki.status=SKIPPED_NO_WIKI` when no existing Wiki is
  identified or no marker is requested. It does not search for or create a
  replacement Wiki, and skips every Wiki write/readback field.
- `wiki.status=MARKED` requires a pre-existing Wiki, separate exact-body
  authorization, `write_mode=update_existing`, a passing write gate, and a
  successful readback containing the confirmed minimal `已合并` patch.
- Any observed failed/incomplete verification, merge, containment, or selected
  Wiki marker readback returns `BLOCKED`, preserves actual effects, and forbids
  further writes in this transaction.
- Every result records the six scope exclusions as `NOT_PERFORMED` (and
  `develop_to_master=FORBIDDEN`). No field implies production release, smoke
  test, TAPD state/comment mutation, test version, or Wiki creation.
- The producer maps the private validator response immediately to
  `NOT_RUN|VALIDATION_PASSED|VALIDATION_FAILED`. It stores only the normalized
  business reason in `failure_reason`/`blocker_reason`; the raw protocol line
  never appears in this artifact or orchestration history.
- `checked_privately=false` pairs only with `state=NOT_RUN`; a completed
  passing or failing private validation sets it to `true`.
