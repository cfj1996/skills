# ValidatedWikiDraft contract

`ValidatedWikiDraft` is a pure in-memory result.

## Required content

| Section | Required facts |
| --- | --- |
| Terminal | `VALIDATED|BLOCKED` |
| Target | exact Wiki URL/ID, read source, original body, and content hash |
| Claims | resolved value and read-only source for each material field |
| Conflicts | competing values, sources, criticality |
| Current entry | sequence, service, repository, developer, description, branch, scope, tester, online state, environment |
| Placement | `NEW_FRONTEND_SECTION|APPEND_ENTRY|APPEND_RETEST`, `# 前端` evidence, matching-entry evidence, and sequence calculation |
| Preservation | original body, insertion point, expected minimal patch, resulting body, and preservation result |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Output | rendered Markdown on success, otherwise a blocker |

## Rules

- `target_wiki_url` is required. A successful result is based on a current,
  readable target body; never calculate from an unseen page.
- Every canonical field must be resolved from read-only evidence. A successful
  body contains no `待补充`; never use `reporter` as a tester fallback.
- The effective branch must be exactly one evidenced `feature/*` or `fixbug/*`
  source branch.
- A new entry under an empty `# 前端` uses sequence `1`; otherwise it uses the
  greatest existing canonical top-level entry sequence plus one. A missing
  section is appended as `# 前端` with sequence `1`. A unique entry with the
  same source branch gets a re-test patch and no new sequence. Duplicate
  sequences or ambiguous matches block.
- Every new entry initializes `是否上线：否`. This means its current-round
  commits have not yet been verified as contained in `origin/master`; it does
  not describe production publication.
- The environment is exactly `联团 老生产` unless current read-only evidence
  establishes a material conflict, which blocks.
- Existing valid content is immutable outside the declared minimal patch. A
  matching legacy entry may add a missing `是否上线：否` line; an existing
  online value is never silently rewritten by this drafting capability.
- `VALIDATED` requires passing validation and a non-empty copyable Markdown
  body. `BLOCKED` requires a concise blocker and no rendered final body.
- The result contains no external-write authority, local path, runtime ID,
  recovery/history state, or private validator response.
- Capability consumers receive the complete in-memory result. Only a direct
  standalone user response projects `VALIDATED` to raw Markdown alone.
