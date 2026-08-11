# ValidatedWikiDraft contract

`ValidatedWikiDraft` is a pure in-memory result.

## Required content

| Section | Required facts |
| --- | --- |
| Terminal | `VALIDATED|BLOCKED` |
| Claims | value and supplied source for each material field |
| Conflicts | competing values, sources, criticality |
| Current entry | sequence, service, repository, developer, description, branch, scope, tester, environment |
| Preservation | original draft, additive mode, insertion point, expected patch, preservation result |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Output | rendered Markdown on success, otherwise a blocker |

## Rules

- Noncritical missing fields render as `待补充`: sequence, service, repository,
  developer, description, impact scope, and tester. Never use `reporter` as a
  tester fallback.
- The effective branch is critical and must be exactly one supplied
  `feature/*` or `fixbug/*` source branch.
- The environment is exactly `联团 老生产` unless supplied facts establish a
  material conflict, which blocks.
- Existing valid content is immutable. A successful result changes it only by
  the declared additive patch.
- `VALIDATED` requires passing validation and a non-empty copyable Markdown
  body. `BLOCKED` requires a concise blocker and no rendered final body.
- The result contains no external-write authority, local path, runtime ID,
  recovery/history state, or private validator response.
- Capability consumers receive the complete in-memory result. Only a direct
  standalone user response projects `VALIDATED` to raw Markdown alone.
