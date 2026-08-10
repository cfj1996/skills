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
    review_verdict: REVIEW_PASSED # public producer-mapped state; never a private raw verdict
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
    git_delivery_write_plan:
      reviewed_diff_hash: string
      commit: {required: boolean, payload_state: NOT_REQUIRED | PENDING_MATERIALIZATION | MATERIALIZED, payload: {paths: [string], diff_hash: string, message: string, expected_source_sha: string} | null, payload_hash: string | null, authorization: string | null, authorization_result: PASS | NOT_REQUIRED | FAIL, authorization_binding_hash: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
      push: {required: boolean, payload_state: NOT_REQUIRED | PENDING_MATERIALIZATION | MATERIALIZED, payload: {remote: string, refspec: string, commits: [string], expected_remote_sha: string | ABSENT, lease_required: true} | null, payload_hash: string | null, authorization: string | null, authorization_result: PASS | NOT_REQUIRED | FAIL, authorization_binding_hash: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
      mr_create_or_update: {required: boolean, payload_state: NOT_REQUIRED | PENDING_MATERIALIZATION | MATERIALIZED, payload: {source: string, target: develop, title: string, body: string, source_sha: string, expected_target_sha: string, atomic_guard: REQUIRED} | null, payload_hash: string | null, authorization: string | null, authorization_result: PASS | NOT_REQUIRED | FAIL, authorization_binding_hash: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
      mr_merge: {required: boolean, payload_state: NOT_REQUIRED | PENDING_MATERIALIZATION | MATERIALIZED, payload: {mr_id: string, source_sha: string, target: develop, expected_target_sha: string, squash: true | false, auto_merge: true | false, should_remove_source_branch: false, atomic_guard: REQUIRED} | null, payload_hash: string | null, authorization: string | null, authorization_result: PASS | NOT_REQUIRED | FAIL, authorization_binding_hash: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
    execution_preflights:
      - operation: COMMIT | PUSH | MR_CREATE_OR_UPDATE | MR_MERGE
        snapshot_id: string
        captured_at: string
        repository: {repo_path: string, git_root: string, origin_remote: string}
        source_ref_sha: string | null
        target_ref_sha: string
        reviewed_diff_hash: string
        current_round_commits: [string]
        facts_hash: string
        cas_token: string
        expected_state_guard: string
        unchanged_from_displayed_snapshot: true | false
        result: PASS | FAIL
    attempts:
      - sequence: number
        execution_id: string
        idempotency_key: string
        operation: COMMIT | PUSH | MR_CREATE_OR_UPDATE | MR_MERGE
        validation_run_id: string
        snapshot_id: string
        cas_token: string
        executed_facts_hash: string
        executed_payload_hash: string
        authorization_binding_hash: string
        expected_state_guard: string
        reserved_at: string
        validation_consumed_at: string
        events:
          - event_sequence: number
            event: ATTEMPT_RESERVED | WRITE_RETURNED | READBACK_RECONCILED
            occurred_at: string
            result: RESERVED | PASS | FAIL | UNKNOWN
            evidence: string | null
        terminal_result: PASS | FAIL | UNKNOWN
    commit_readback: {resulting_sha: string | null, actual_tree_hash: string | null, actual_diff_hash: string | null, reviewed_diff_hash_matches: true | false | null, readback_at: string | null, evidence: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
    push_readback: {remote_ref: string | null, resulting_sha: string | null, contains_exact_commits: true | false | null, readback_at: string | null, evidence: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
    mr_write_readback: {id: string | null, source: string | null, target: string | null, source_sha: string | null, payload_hash: string | null, readback_at: string | null, evidence: string | null, result: PASS | FAIL | NOT_ATTEMPTED}
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
      payload_hash: string | null
      authorization_binding_hash: string | null
      expected_state_guard: string | null
      executed_snapshot_id: string | null
      executed_payload_hash: string | null
      executed_at: string | null
      write_mode: create | update | append_existing | null
      before_content_hash: string | null
      expected_patch: string | null
      after_content_hash: string | null
      readback_contains_expected_patch: true | false | null
      result: PASS | FAIL | NOT_ATTEMPTED
    readback: {result: PASS | FAIL | NOT_ATTEMPTED, actual_content_hash: string | null, readback_at: string | null, evidence: string | null}
  tapd:
    target: {workspace_id: string, work_type: BUG | STORY | TASK, item_id: string}
    status_operation: string | null
    proposed_status: string | null
    status_payload_hash: string | null
    status_authorization: string | null
    status_authorization_binding_hash: string | null
    status_expected_state_guard: string | null
    status_write: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null}
    status_readback: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null, readback_at: string | null, evidence: string | null}
    comment:
      operation: string | null
      target: {workspace_id: string, work_type: BUG | STORY | TASK, item_id: string} | null
      expected_body: string | null
      payload_hash: string | null
      authorization_binding_hash: string | null
      expected_state_guard: string | null
      actual_body: string | null
      format_result: PASS | FAIL | NOT_APPLICABLE
      write_result: PASS | FAIL | NOT_ATTEMPTED | NOT_APPLICABLE
      executed_snapshot_id: string | null
      executed_payload_hash: string | null
      executed_at: string | null
      readback: {result: PASS | FAIL | NOT_ATTEMPTED | NOT_APPLICABLE, actual_body: string | null, readback_at: string | null, evidence: string | null}
  test_version:
    authorization: string | null
    requested_payload: {service: string, environment: string, version: string, parameters: object} | null
    payload_hash: string | null
    authorization_binding_hash: string | null
    expected_state_guard: string | null
    publish: {result: PASS | FAIL | NOT_ATTEMPTED, id: string | null, executed_snapshot_id: string | null, executed_payload_hash: string | null, executed_at: string | null}
    readback: {result: PASS | FAIL | NOT_ATTEMPTED, actual: string | null, readback_at: string | null, evidence: string | null}
  submission_preflights:
    - operation: WIKI_WRITE | TAPD_COMMENT | TAPD_STATUS | TEST_VERSION
      snapshot_id: string
      captured_at: string
      repository: {repo_path: string, git_root: string, origin_remote: string}
      source_branch: string
      source_ref_sha: string
      target_branch: develop
      target_ref_sha: string
      reviewed_diff_hash: string
      current_round_commits: [string]
      profile: STANDARD | NO_WIKI
      target: string
      facts_hash: string
      payload_hash: string
      authorization_binding_hash: string
      cas_token: string
      expected_state_guard: string
      result: PASS | FAIL
  submission_attempts:
    - sequence: number
      execution_id: string
      idempotency_key: string
      operation: WIKI_WRITE | TAPD_COMMENT | TAPD_STATUS | TEST_VERSION
      validation_run_id: string
      snapshot_id: string
      cas_token: string
      executed_facts_hash: string
      executed_payload_hash: string
      authorization_binding_hash: string
      expected_state_guard: string
      reserved_at: string
      validation_consumed_at: string
      events:
        - event_sequence: number
          event: ATTEMPT_RESERVED | WRITE_RETURNED | READBACK_RECONCILED
          occurred_at: string
          result: RESERVED | PASS | FAIL | UNKNOWN
          evidence: string | null
      terminal_result: PASS | FAIL | UNKNOWN
  validation:
    validator: agents/submission-validator.md
    checked_privately: true | false
    private_verdict_persisted: false
    pre_first_write:
      validation_phase: PRE_FIRST_WRITE
      runs:
        - operation: COMMIT | PUSH | MR_CREATE_OR_UPDATE | MR_MERGE
          sequence: number
          run_id: string
          snapshot_id: string
          facts_hash: string
          payload_hash: string
          authorization_binding_hash: string
          authorization: {actor: string, text: string, confirmed_at: string, scope_hash: string} | {status: NOT_REQUIRED, policy_evidence: string}
          cas_token: string
          input_artifact_hash: string
          validated_at: string
          state: NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED
          failure_reason: string | null
          consumed_by_execution_id: string | null
          consumed_at: string | null
          raw_response_discarded: true
    pre_submission_write:
      validation_phase: PRE_SUBMISSION_WRITE
      runs:
        - operation: WIKI_WRITE | TAPD_COMMENT | TAPD_STATUS | TEST_VERSION
          sequence: number
          run_id: string
          snapshot_id: string
          facts_hash: string
          payload_hash: string
          authorization_binding_hash: string
          authorization: {actor: string, text: string, confirmed_at: string, scope_hash: string}
          cas_token: string
          input_artifact_hash: string
          validated_at: string
          state: NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED
          failure_reason: string | null
          consumed_by_execution_id: string | null
          consumed_at: string | null
          raw_response_discarded: true
    post_write:
      validation_phase: POST_WRITE
      run_id: string | null
      input_artifact_hash: string | null
      final_readback_hash: string | null
      validated_at: string | null
      state: NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED
      failure_reason: string | null
      raw_response_discarded: true
  blocker_reason: string | null
```

## Binding definitions

- `facts_hash`, `payload_hash`, `authorization_binding_hash`,
  `input_artifact_hash`, and `final_readback_hash` are lowercase SHA-256 over
  UTF-8 RFC 8785 canonical JSON of the complete fields named by that hash. No
  omitted/default field, display string, unordered map, or implementation-local
  serialization is valid evidence.
- `cas_token` is the SHA-256 canonical hash of snapshot ID, repository
  fingerprint, source/target ref SHAs, reviewed diff hash, exact current-round
  commits, profile, operation target, payload hash, and expected-state guard.
  Execution re-reads those facts and must produce the same token; a mismatch
  blocks without write.
- An authorization binding contains the actor, exact confirmation text,
  confirmation time, and `scope_hash` over operation, purpose, repository,
  source, target, payload hash, `snapshot_id`, `facts_hash`, and `cas_token`.
  `NOT_REQUIRED` replaces that object only with named governing-policy evidence.
- `expected_state_guard` is the provider-enforced expected source/target SHA,
  ref lease, resource version/hash, or equivalent atomic predicate.
  `idempotency_key` is SHA-256 canonical JSON of execution ID, operation,
  snapshot ID, CAS token, and payload hash; pass it to the provider whenever
  supported. If the provider can enforce neither the guard nor idempotency, the
  operation is `BLOCKED`.
- Attempt and event sequences are durable and append-only, start at 1, have no
  gaps, and follow the declared dependency order. The producer atomically
  appends `ATTEMPT_RESERVED` and consumes the named validation run before the
  external call; an observed `WRITE_RETURNED` and the required
  `READBACK_RECONCILED` are later append-only events. A crash may omit
  `WRITE_RETURNED`; it must not be manufactured. Times satisfy `captured_at <=
  confirmed_at <= validated_at < reserved_at = validation_consumed_at <
  READBACK_RECONCILED.occurred_at`, and an observed `WRITE_RETURNED.occurred_at`
  falls between reservation and readback.

## Invariants

- `SUBMITTED` requires the actual repository to match the upstream expected
  fingerprint, `profile` to be exact, both upstream success states, matching
  source/target/current-round commit lists, a passing merge confirmation, a
  successful merge readback, and `develop_containment.result=PASS`.
- `reviewed_change.review_verdict` consumes only the repairing skill's public
  mapped state. Submission validation must not request, load, parse, or persist
  the private reviewer protocol or its raw output.
- Current-round commits are the reviewed submission scope. Legal extra commits
  from an inherited source baseline are recorded only in
  `inherited_base_difference`; they do not become current-round commits,
  commentary, or a reason to rebuild the branch from `develop`.
- `SUBMITTED` requires `tapd.status_write=PASS`, `tapd.status_readback=PASS`,
  `test_version.publish=PASS`, `test_version.readback=PASS`, every required
  Git/GitLab operation to have a matching `PRE_FIRST_WRITE` run with
  `state=VALIDATION_PASSED`, plus
  every applicable submission operation to have a matching
  `PRE_SUBMISSION_WRITE` run with `state=VALIDATION_PASSED`, plus
  `validation.post_write.state=VALIDATION_PASSED`.
- `PRE_FIRST_WRITE` runs before commit, push, MR create/update, and MR merge as
  applicable. Only the next operation must be `MATERIALIZED`; later required
  payloads remain `PENDING_MATERIALIZATION` until prior writes produce their
  exact IDs/SHAs. Each run binds a fresh repository/ref/diff/commit preflight
  `snapshot_id`/`facts_hash` to one exact `payload_hash`, authorization-binding
  hash, CAS token, expected-state guard, and validation time. The executed
  operation must carry the same payload hash and `executed_snapshot_id`, use the
  provider-enforced guard, and execute after `validated_at`. A changed immutable fact
  or payload invalidates validation and authorization; it must be redisplayed,
  re-authorized when required, and revalidated before execution.
- The chronologically last validation run for an operation before reservation
  must be `VALIDATION_PASSED`, carry the matching CAS/bindings, and name that
  execution in `consumed_by_execution_id`/`consumed_at`. The run is consumed
  atomically by `ATTEMPT_RESERVED`, before the call. Any later `NOT_RUN` or
  `VALIDATION_FAILED` run invalidates earlier passes. An old pass cannot be
  replayed.
- A successful planned commit requires `commit_readback.result=PASS`, a real
  `resulting_sha`, actual tree/diff hashes, and
  `reviewed_diff_hash_matches=true`. Only then may that SHA be appended to the
  expected/actual current-round commit list and materialize push/MR payloads.
  Push and MR writes likewise require their immediate exact readbacks before
  the next operation.
- `PRE_SUBMISSION_WRITE` occurs after develop-merge evidence and immediately
  before each applicable Wiki, TAPD-comment, TAPD-status, or test-version
  write. Each preflight explicitly carries source/target ref SHAs and reviewed
  diff hash. Each run binds the same snapshot/facts/payload/authorization hashes
  and timestamps as the first-write gate; execution must match and follow that
  run. It validates profile, actual source/target/current-round commits,
  authorization, and the one exact operation payload; for Wiki it also validates
  the `ValidatedWikiDraft`, full-draft confirmation, Wiki target, and expected
  patch. Immediately before execution, those immutable facts and payloads are
  re-read; any change invalidates validation/authorization and requires a new
  display, authorization when required, and validation run. This phase must
  not require a write/readback that has not happened.
- For every reserved write, the latest run for that operation has the
  same `snapshot_id`, `facts_hash`, `payload_hash`, and authorization-binding
  hash as the attempt, with `validated_at < reserved_at`. The authorization
  binding contains that snapshot/facts/CAS tuple. A result that
  cannot prove this ordering/binding is `BLOCKED`, even if both records claim
  `PASS` independently.
- Git attempts follow `COMMIT -> PUSH -> MR_CREATE_OR_UPDATE -> MR_MERGE` after
  removing operations marked `NOT_REQUIRED`; submission attempts follow
  `WIKI_WRITE -> TAPD_COMMENT -> TAPD_STATUS -> TEST_VERSION` after profile/type
  skips. Every successful attempt has a reservation and immediate reconciled
  readback before the next attempt; it also has a write-return event when the
  call returned observably. Missing required, out-of-order, duplicate,
  manufactured, retroactively filled, or unbound events block.
- A reserved attempt is never executed twice. After a crash or unknown result,
  reconcile only by its execution ID/idempotency key and exact external state.
  If no effect is proven, retry only as a new attempt with fresh authorization
  when required and fresh validation. If presence or absence is indeterminate,
  return `BLOCKED`; an unconsumed-looking old PASS cannot authorize replay.
- Immediately before the remote call, recompute the CAS token and use the
  provider-enforced expected-state guard from the bound payload. A concurrent
  source/target/resource change must reject before effect. If no equivalent
  atomic guard or idempotency predicate can be enforced, return `BLOCKED`.
- `POST_WRITE` receives actual merge, status, version, and their readbacks;
  under `STANDARD` it also receives actual Wiki/comment effects and readbacks.
  A non-passing post-write verdict returns `BLOCKED`, preserves partial effects,
  and forbids a later write in this transaction.
- Under `STANDARD`, `SUBMITTED` also requires `wiki.status=WRITTEN`, full draft
  confirmation, a passing Wiki write gate/readback, and for Bugs an exact,
  passing, read-back Wiki-link comment. Its status update cannot precede
  Wiki/comment readback success. Required ordering is Wiki write/readback,
  applicable comment write/readback, status write/readback, then test-version
  publish/readback; a failure blocks every later operation.
- For `wiki.write_mode=create`, the pre-Wiki authorization covers the exact
  body/creation target only. After create/readback returns the actual wiki ID,
  materialize the exact comment URL/body, display it, obtain a separate exact
  authorization, and run `PRE_SUBMISSION_WRITE(TAPD_COMMENT)`. A placeholder or
  conditional comment authorization never authorizes the comment write.
- Under `NO_WIKI`, `SUBMITTED` requires `wiki.status=SKIPPED_BY_POLICY`; every
  other Wiki field is null or `NOT_ATTEMPTED`, and all comment fields are
  `NOT_APPLICABLE`. Both validation phases omit Wiki material and do not load
  or require a Wiki. Wiki absence is not a blocker.
- `BLOCKED` preserves observed actual values, has a non-empty blocker, and
  never claims unperformed writes, merge, publication, or readbacks. It may
  represent an irreversible partial external transaction; do not roll back or
  conceal that fact.
- Private validator lines are mapped immediately to the public states
  `NOT_RUN|VALIDATION_PASSED|VALIDATION_FAILED`. Only a normalized business
  reason may enter `failure_reason`/`blocker_reason`; the raw Chinese protocol
  is never persisted in this artifact or orchestration history.
- `checked_privately=false` is valid only when every mapped phase/run is
  `NOT_RUN`; any completed passing or failing validator call sets it to `true`.
- `POST_WRITE` is a fresh private run over `input_artifact_hash` and the
  complete `final_readback_hash`, including both append-only attempt/event
  ledgers, after the last readback. Its `validated_at` follows every
  attempt/readback. Any mutation after that run changes the hash and invalidates
  `SUBMITTED`; an old POST pass cannot be reused.
