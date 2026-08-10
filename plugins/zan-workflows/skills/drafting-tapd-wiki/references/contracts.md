# ValidatedWikiDraft contract

`drafting-tapd-wiki` is a pure renderer. It consumes only supplied facts and
returns a draft boundary; it never creates, selects, reads, or updates a Wiki
and never writes TAPD, Git, MR, release, or local state.

```yaml
ValidatedWikiDraft:
  terminal_state: VALIDATED | BLOCKED
  effects: NONE
  facts:
    claims:
      - field: sequence | service_name | repository_url | developer | feature_description | effective_wiki_branch_name | impact_scope | tester | environment | existing_draft
        value: string | null
        source: string
    conflicts:
      - field: string
        values: [string]
        sources: [string]
        critical: boolean
        required_decision: string | null
    missing_noncritical: [sequence | service_name | repository_url | developer | feature_description | impact_scope | tester]
  current_entry:
    sequence: string | 待补充
    sequence_source: string | null
    service_name: string | 待补充
    repository_url: string | 待补充
    developer: string | 待补充
    feature_description: string | 待补充
    effective_wiki_branch_name: string | null
    impact_scope: [string] | [待补充]
    tester: string | 待补充
    environment: 联团 老生产
  preservation:
    original: string | null
    mode: NEW_BODY | APPEND_NEW_ENTRY | APPEND_RETEST_NOTE | BLOCKED
    insertion_point: string | null
    expected_patch: string | null
    original_preserved: true | false
  validation:
    validator: agents/wiki-validator.md
    checked_privately: true | false
    state: NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED
    failure_reason: string | null
    private_verdict_persisted: false
  rendered_markdown: string | null
  blocker_reason: string | null
```

## Fact classification

Noncritical fields may be absent and must render as the literal `待补充`:

- sequence, service name, repository URL, developer, feature description,
  impact scope, and tester. A non-placeholder `current_entry.sequence` must
  match one `facts.claims` item whose `field=sequence`, and
  `sequence_source` must reproduce that item's `source`;
- an unavailable dynamic tester field. Never substitute `reporter`.

Critical facts cannot be replaced by a placeholder:

- the current entry's effective source branch is absent, malformed, a
  `merge/*` branch, or has two different applicable values;
- supplied facts materially contradict a fixed canonical environment;
- the requested change would alter or discard valid text in a pasted existing
  draft;
- the private validator cannot establish a valid result.

For a critical issue, retain all facts and sources, set
`terminal_state=BLOCKED`, set `preservation.mode=BLOCKED` when preservation is
at risk, set `rendered_markdown=null`, and name the first blocker. A blocked
result does not choose a branch and does not contain a claimed final Wiki body.

## Result invariants

- `VALIDATED` requires `effects=NONE`, one valid effective source branch, no
  unresolved critical conflict, `validation.state=VALIDATION_PASSED`, and a non-empty
  `rendered_markdown`.
- `BLOCKED` requires a non-empty normalized blocker and
  `rendered_markdown=null`; validation is `VALIDATION_FAILED` when the private
  validator rejects it or `NOT_RUN` when validation could not run. It does not
  imply any external lookup or write.
- Each current canonical entry has exactly one `- 代码分支名：` line. Its value
  must be the exact `effective_wiki_branch_name`, which is one original
  `feature/*` or `fixbug/*` source branch.
- Existing drafts are immutable input. `original_preserved=true` means the
  complete original string is retained unchanged in the rendered body and the
  only difference is `expected_patch` at `insertion_point`.
- The private validator line is ephemeral. The producer stores only
  `NOT_RUN|VALIDATION_PASSED|VALIDATION_FAILED` plus a normalized business
  reason; the raw line never enters this result or orchestration history. On
  `VALIDATED`, the user-facing
  response is only raw `rendered_markdown`; do not show this contract, YAML,
  a validator verdict, a writeback prompt, or explanatory prose.
- `checked_privately=false` pairs only with `state=NOT_RUN`; both passing and
  failing validator runs set it to `true`.
