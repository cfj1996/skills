# TestSubmissionResult contract

`submitting-tapd-for-test` consumes approved upstream facts, runs one bounded
submission transaction, and returns exactly one terminal result. It does not
authorize or perform a later `master` merge.

```yaml
TestSubmissionResult:
  terminal_state: SUBMITTED | BLOCKED
  profile: STANDARD | NO_WIKI
  source_definition:
    tapd_url: string
    work_type: BUG | STORY | TASK
    short_id: string
  reviewed_change:
    terminal_state: REVIEWED
    review_verdict: REVIEW_PASSED
    project_fingerprint_result: PASS
  repository:
    expected: {repo_path: string, git_root: string, origin_remote: string}
    actual: {repo_path: string | null, git_root: string | null, origin_remote: string | null}
    result: PASS | FAIL | NOT_ATTEMPTED
  merge:
    expected_source_branch: string | null
    expected_target_branch: develop
    expected_commit_list: [string]
    actual_source_branch: string | null
    actual_target_branch: string | null
    actual_commit_list: [string]
    inherited_base_difference: [string]
    confirmation_gate:
      user_confirmation_text: string | null
      result: PASS | FAIL | NOT_ATTEMPTED
    mr: {id: string | null, url: string | null, state: string | null}
    merge_readback: {result: PASS | FAIL | NOT_ATTEMPTED, evidence: string | null}
    develop_containment:
      commits: [{commit: string, contained: true | false, evidence: string | null}]
      result: PASS | FAIL | NOT_ATTEMPTED
  wiki:
    status: WRITTEN | SKIPPED_BY_POLICY | BLOCKED | NOT_ATTEMPTED
    drafter: zan-workflows:drafting-tapd-wiki | null
    full_draft: string | null
    confirmation_text: string | null
    target_wiki_id: string | null
    write_gate:
      write_mode: create | update | append_existing | null
      before_content_hash: string | null
      expected_patch: string | null
      after_content_hash: string | null
      readback_contains_expected_patch: true | false | null
      result: PASS | FAIL | NOT_ATTEMPTED
    readback: {result: PASS | FAIL | NOT_ATTEMPTED, evidence: string | null}
  tapd:
    proposed_status: string | null
    status_authorization: string | null
    status_write: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null}
    status_readback: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null, evidence: string | null}
    comment:
      expected_body: string | null
      actual_body: string | null
      format_result: PASS | FAIL | NOT_APPLICABLE
      write_result: PASS | FAIL | NOT_ATTEMPTED | NOT_APPLICABLE
      readback: PASS | FAIL | NOT_ATTEMPTED | NOT_APPLICABLE
  test_version:
    authorization: string | null
    requested_payload: string | null
    publish: {result: PASS | FAIL | NOT_ATTEMPTED, id: string | null}
    readback: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null, evidence: string | null}
  validation:
    validator: agents/submission-validator.md
    checked_privately: true
    pre_write:
      validation_phase: PRE_WRITE
      verdict: 验证通过 | 验证不通过：string
    post_write:
      validation_phase: POST_WRITE
      verdict: 验证通过 | 验证不通过：string
  blocker_reason: string | null
```

## Invariants

- `SUBMITTED` requires the actual repository to match the upstream expected
  fingerprint, `profile` to be exact, both upstream success states, matching
  source/target/current-round commit lists, a passing merge confirmation, a
  successful merge readback, and `develop_containment.result=PASS`.
- Current-round commits are the reviewed submission scope. Legal extra commits
  from an inherited source baseline are recorded only in
  `inherited_base_difference`; they do not become current-round commits,
  commentary, or a reason to rebuild the branch from `develop`.
- `SUBMITTED` requires `tapd.status_write=PASS`, `tapd.status_readback=PASS`,
  `test_version.publish=PASS`, `test_version.readback=PASS`, and private
  `validation.pre_write.verdict=验证通过` plus
  `validation.post_write.verdict=验证通过`.
- `PRE_WRITE` occurs after develop-merge evidence and before this submission's
  Wiki, TAPD-status, comment, or test-version write. It validates profile,
  actual source/target/current-round commits, authorization, and planned
  status/version payloads; under `STANDARD`, it also validates the
  `ValidatedWikiDraft`, full-draft confirmation, Wiki target, and expected
  patch. It must not require a write/readback that has not happened.
- `POST_WRITE` receives actual merge, status, version, and their readbacks;
  under `STANDARD` it also receives actual Wiki/comment effects and readbacks.
  A non-passing post-write verdict returns `BLOCKED`, preserves partial effects,
  and forbids a later write in this transaction.
- Under `STANDARD`, `SUBMITTED` also requires `wiki.status=WRITTEN`, full draft
  confirmation, a passing Wiki write gate/readback, and for Bugs an exact,
  passing, read-back Wiki-link comment. Its status update cannot precede
  Wiki-readback success.
- Under `NO_WIKI`, `SUBMITTED` requires `wiki.status=SKIPPED_BY_POLICY`; every
  other Wiki field is null or `NOT_ATTEMPTED`, and all comment fields are
  `NOT_APPLICABLE`. Both validation phases omit Wiki material and do not load
  or require a Wiki. Wiki absence is not a blocker.
- `BLOCKED` preserves observed actual values, has a non-empty blocker, and
  never claims unperformed writes, merge, publication, or readbacks. It may
  represent an irreversible partial external transaction; do not roll back or
  conceal that fact.
