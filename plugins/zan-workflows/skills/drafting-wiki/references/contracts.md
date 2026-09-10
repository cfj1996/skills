# ValidatedWikiDraft contract

`ValidatedWikiDraft` is a pure in-memory result.

## Required content

| Section | Required facts |
| --- | --- |
| Terminal | `VALIDATED|SKIPPED_BY_POLICY|BLOCKED` |
| Target plan | For `VALIDATED`, `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD`, workspace, root/month/child identity, title, creator, and evidence; exact URL/ID/body/hash when reusing. A policy skip retains an existing target only when available for `going-live`. |
| Claims | resolved value and read-only source for each material field |
| Conflicts | competing values, sources, criticality |
| Deployment context | Resolved `DEPLOY|SKIP`; a standalone Wiki-only request uses `SKIP` for parameter requirements. |
| Current entry | sequence, Jenkins Job name/URL, selected build/release parameter names and values (only already-evidenced selections required under `SKIP`), project name, project category/service type, repository, developer, description, branch, scope, tester, merge status |
| Work mode | `INITIAL|CONTINUE`, impact classification, and incremental-scope evidence when continuing |
| Wiki decision | `UPDATE|SKIP_NON_FUNCTIONAL` and normalized reason |
| Placement | For `VALIDATED`, `NEW_FRONTEND_SECTION|APPEND_ENTRY|APPEND_IMPACT_SCOPE`, `# 前端` evidence, matching-entry evidence, and sequence calculation; for a policy skip, the skip decision evidence |
| Preservation | For `VALIDATED`, `NEW_PAGE` or original body/hash, insertion point, expected minimal patch or initial body, resulting body, and preservation result; for a policy skip, no patch |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Output | rendered Markdown for `VALIDATED`, no body plus skip reason for `SKIPPED_BY_POLICY`, otherwise a blocker |

## Rules

- A user-supplied Wiki URL is never required. For `VALIDATED`, resolve one
  target plan in this order: a Wiki link in TAPD details/comments; one related
  child in the current month; otherwise a new child under the fixed hierarchy.
  A policy skip never plans a new child.
- The `提测文档` root Wiki ID is `1150372234001008260`. Use the submission date
  in `Asia/Shanghai`: the month title is `YYYY-MM`, and the child title is
  `MM-DD: {任务标题中文简述}`. A missing
  month yields `CREATE_MONTH_AND_CHILD`; an existing month without a related
  child yields `CREATE_CHILD`.
- Any linked or related existing child must be read and reused. An inaccessible
  linked page, multiple plausible targets, duplicate related children, or
  conflicting hierarchy evidence blocks creation rather than producing a
  duplicate Wiki.
- `CONTINUE` reuses the prior matching child/branch entry. A functional
  continuation appends only the affected scope; a proven non-functional
  continuation returns `SKIPPED_BY_POLICY`. It never
  creates a duplicate entry solely because the prior MR was merged.
- `REUSE_EXISTING` requires the exact current target body and content hash.
  Create modes use `before_content_hash=NEW_PAGE` and a fully specified parent
  plan; the monthly parent never receives the entry body.
- Every canonical field must be resolved from read-only evidence. A successful
  body contains no `待补充`; never use `reporter` as a tester fallback. The
  rendered link must derive its display name from the evidenced Jenkins Job
  name by hiding environment tokens, append the selected build/release parameter
  names and values according to `wiki-template.md`, and preserve the exact Job URL.
  Never substitute a repository name or alias. The red service marker is `更新服务` for business projects
  and `工具服务-无需上线` for tooling/library projects.
- Under `SKIP`, absent build/release selections do not block validation. Render
  only already-evidenced parameters, omitting the `?` suffix when none remain.
  Do not call Jenkins or require deployment-only inputs to fill this field;
  Job name/URL and other canonical facts remain required. Under `DEPLOY`,
  required selections must still be resolved and checked against definitions.
- For `CONTINUE`, classify the current-round change from reviewed diff and
  implementation/verification evidence as `FUNCTIONAL_IMPACT` or
  `NON_FUNCTIONAL`. Ambiguous classification blocks.
- `NON_FUNCTIONAL` continuation returns `SKIPPED_BY_POLICY` with
  `skip_reason=NON_FUNCTIONAL_CONTINUE`, no rendered body, and no Wiki update.
  This policy covers changes that do not alter functional behavior, such as
  refactoring, logging, test-only, or build-only changes.
- `FUNCTIONAL_IMPACT` continuation reuses the matching existing entry and
  appends the new affected module/page to that entry's `影响范围` list. A
  business entry changes `已合并` back to `未合并` when the new current-round
  commits are not in `origin/master`; a tooling entry preserves `无需上线`. Do
  not create a duplicate entry or duplicate an identical scope already listed.
- The effective branch must be exactly one evidenced `feature/*` or `fixbug/*`
  source branch.
- A newly created child starts with `# 前端` and sequence `1`. A new entry under
  an existing empty `# 前端` also uses sequence `1`; otherwise it uses the
  greatest existing canonical top-level entry sequence plus one. A missing
  section is appended as `# 前端` with sequence `1`. A unique entry with the
  same source branch gets an impact-scope patch and no new sequence. Duplicate
  sequences or ambiguous matches block.
- Every new entry initializes `是否上线` from the project type: `未合并` for a
  business project or `无需上线` for a tooling/library project. A business
  entry changes to `已合并` only after the original branch is verified in
  `origin/master`; it is not a production-publication claim.
- Reused valid content is immutable outside the declared minimal patch. A
  matching entry must already use the current status contract: business
  `未合并|已合并`, or tooling `无需上线`. Missing or non-current values block.
  Only the declared current-round scope append and any
  required business `已合并` to `未合并` reset may change.
- `VALIDATED` requires passing validation and a non-empty copyable Markdown
  body. `BLOCKED` requires a concise blocker and no rendered final body.
- The result contains no external-write authority, local path, runtime ID,
  recovery/history state, or private validator response.
- Capability consumers receive the complete in-memory result. Only a direct
  standalone user response projects `VALIDATED` to raw Markdown alone.
