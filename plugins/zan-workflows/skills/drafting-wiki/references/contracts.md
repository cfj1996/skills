# ValidatedWikiDraft contract

`ValidatedWikiDraft` is a pure in-memory result.

## Required content

| Section | Required facts |
| --- | --- |
| Terminal | `VALIDATED|BLOCKED` |
| Target plan | `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD`, workspace, root/month/child identity, title, creator, and evidence; exact URL/ID/body/hash when reusing |
| Claims | resolved value and read-only source for each material field |
| Conflicts | competing values, sources, criticality |
| Current entry | sequence, service, repository, developer, description, branch, scope, tester, online state, environment |
| Placement | `NEW_FRONTEND_SECTION|APPEND_ENTRY|APPEND_RETEST`, `# 前端` evidence, matching-entry evidence, and sequence calculation |
| Preservation | `NEW_PAGE` or original body/hash, insertion point, expected minimal patch or initial body, resulting body, and preservation result |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Output | rendered Markdown on success, otherwise a blocker |

## Rules

- A user-supplied Wiki URL is never required. Resolve one target plan in this
  order: a Wiki link in TAPD details/comments; one related child in the current
  month; otherwise a new child under the fixed hierarchy.
- The `提测文档` root Wiki ID is `1150372234001008260`. Use the submission date
  in `Asia/Shanghai`: the month title is `YYYY-MM`, and the child title is
  `MM-DD: {任务标题中文简述}`. A missing
  month yields `CREATE_MONTH_AND_CHILD`; an existing month without a related
  child yields `CREATE_CHILD`.
- Any linked or related existing child must be read and reused. An inaccessible
  linked page, multiple plausible targets, duplicate related children, or
  conflicting hierarchy evidence blocks creation rather than producing a
  duplicate Wiki.
- `REUSE_EXISTING` requires the exact current target body and content hash.
  Create modes use `before_content_hash=NEW_PAGE` and a fully specified parent
  plan; the monthly parent never receives the entry body.
- Every canonical field must be resolved from read-only evidence. A successful
  body contains no `待补充`; never use `reporter` as a tester fallback.
- The effective branch must be exactly one evidenced `feature/*` or `fixbug/*`
  source branch.
- A newly created child starts with `# 前端` and sequence `1`. A new entry under
  an existing empty `# 前端` also uses sequence `1`; otherwise it uses the
  greatest existing canonical top-level entry sequence plus one. A missing
  section is appended as `# 前端` with sequence `1`. A unique entry with the
  same source branch gets a re-test patch and no new sequence. Duplicate
  sequences or ambiguous matches block.
- Every new entry initializes `是否上线：否`. This means its current-round
  commits have not yet been verified as contained in `origin/master`; it does
  not describe production publication.
- The environment is exactly `联团 老生产` unless current read-only evidence
  establishes a material conflict, which blocks.
- Reused valid content is immutable outside the declared minimal patch. A
  matching legacy entry may add a missing `是否上线：否` line; an existing
  online value is never silently rewritten by this drafting capability.
- `VALIDATED` requires passing validation and a non-empty copyable Markdown
  body. `BLOCKED` requires a concise blocker and no rendered final body.
- The result contains no external-write authority, local path, runtime ID,
  recovery/history state, or private validator response.
- Capability consumers receive the complete in-memory result. Only a direct
  standalone user response projects `VALIDATED` to raw Markdown alone.
