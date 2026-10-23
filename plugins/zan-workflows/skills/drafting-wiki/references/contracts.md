# ValidatedWikiDraft contract

`ValidatedWikiDraft` is a pure in-memory result.

## Required content

| Section | Required facts |
| --- | --- |
| Terminal | `VALIDATED|SKIPPED_BY_POLICY|BLOCKED` |
| Target plan | For `VALIDATED`, `REUSE_EXISTING|CREATE_CHILD|CREATE_MONTH_AND_CHILD`, workspace, root/month/child identity, title, creator, and evidence; exact URL/ID/body/hash when reusing. A policy skip requires the verified owner page, matching repository/branch entry and exact target/body readback for `going-live`. |
| Claims | resolved value and read-only source for each material field |
| Conflicts | competing values, sources, criticality |
| Deployment context | Resolved `DEPLOY|SKIP`; a standalone Wiki-only request uses `SKIP` for parameter requirements. |
| Shared ownership | owner Story/Bug type/ID/workspace, Task parent readback, ownership discovery evidence, included repository/branch entries, one target/body and all owner/Task comment targets; see [shared-test-wiki.md](../../../references/shared-test-wiki.md) |
| Current entry | sequence, Jenkins Job name/URL, selected build/release parameter names and values (only already-evidenced selections required under `SKIP`), project name, project category/service type, repository, developer, description, branch, scope, tester, business merge status or tooling current-version channel and release evidence |
| Work mode | `INITIAL|CONTINUE`, impact classification, and incremental-scope evidence when continuing |
| Wiki decision | `UPDATE|SKIP_NON_FUNCTIONAL` and normalized reason |
| Placement | For `VALIDATED`, `NEW_FRONTEND_SECTION|APPEND_ENTRY|APPEND_IMPACT_SCOPE`, `# 前端` evidence, matching-entry evidence, and sequence calculation; for a policy skip, the skip decision evidence |
| Preservation | For `VALIDATED`, `NEW_PAGE` or original body/hash, insertion point, expected minimal patch or initial body, resulting body, and preservation result; for a policy skip, no patch |
| Validation | `VALIDATION_PASSED|VALIDATION_FAILED|NOT_RUN` and normalized reason |
| Output | rendered Markdown for `VALIDATED`, no body plus skip reason for `SKIPPED_BY_POLICY`, otherwise a blocker |

## Rules

- A user-supplied Wiki URL is never required. For `VALIDATED`, resolve one
  target plan in this order: a Wiki link in the owner's TAPD details/comments
  or its verified related Tasks; exact-title lookup in the current month;
  otherwise a new child under the fixed hierarchy. A title/repository/branch
  match without an owner link is insufficient to reuse an existing page.
  A policy skip never plans a new child.
- Discovery uses an exact linked Wiki ID, then at most a month-name query and
  an exact child-title query when needed. Compare returned `parent_wiki_id`
  locally; it is not a supported `get_wiki` filter. Do not enumerate the
  unfiltered Wiki list or repeat unchanged queries to prove absence.
- The `提测文档` root Wiki ID is `1150372234001008260`. Use the submission date
  in `Asia/Shanghai`: the month title is `YYYY-MM`, and the child title is
  `MM-DD: {归属需求或Bug标题}`. A missing
  month yields `CREATE_MONTH_AND_CHILD`; an existing month without a related
  child yields `CREATE_CHILD`.
- Any owner-linked child must be read and reused. An unlinked exact-title child,
  an inaccessible
  linked page, multiple plausible targets returned by those precise queries, or
  conflicting hierarchy evidence blocks creation rather than producing a
  duplicate Wiki.
- `CONTINUE` reuses the prior matching child/branch entry. A functional
  continuation appends only the affected scope; a proven non-functional
  continuation with a verified owner page/current entry returns `SKIPPED_BY_POLICY`. It never
  creates a duplicate entry solely because the prior MR was merged.
- `REUSE_EXISTING` requires the exact current target body and content hash.
  The helper preview's `beforeBodySha256` is SHA-256 over the exact UTF-8
  Markdown, including trailing newlines. Carry it with the exact Wiki
  ID/parent/title into the one creation/supplementation/comment execution;
  a changed original body blocks supplementation. A preview is read-only and
  does not authorize writes. New-page execution uses the preview's fixed
  month/title, not the date when the later confirmation arrives.
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
  Do not query Jenkins parameters/builds or require deployment-only inputs;
  exact read-only Job metadata lookup is permitted solely to evidence the
  required canonical URL when knowledge lacks it. No build/deploy is triggered;
  Job name/URL and other canonical facts remain required. Under `DEPLOY`,
  required selections must still be resolved and checked against definitions.
- For `CONTINUE`, classify the current-round change from reviewed diff and
  implementation/verification evidence as `FUNCTIONAL_IMPACT` or
  `NON_FUNCTIONAL`. Ambiguous classification blocks.
- `NON_FUNCTIONAL` continuation returns `SKIPPED_BY_POLICY` only after discovery
  proves `REUSE_EXISTING` and `REUSE_ENTRY` for the exact owner/repository/branch,
  retaining ID/URL/parent/title/body/hash and ownership/entry evidence. It has
  `skip_reason=NON_FUNCTIONAL_CONTINUE`, no rendered body, and no Wiki update.
  A missing page or current entry takes the normal validated creation/append
  path; uncertain or conflicting evidence blocks. Never skip discovery because
  the diff is non-functional or defer the missing target to going-live.
  This policy covers changes that do not alter functional behavior, such as
  refactoring, logging, test-only, or build-only changes.
- `FUNCTIONAL_IMPACT` continuation reuses the matching existing entry and
  appends the new affected module/page to that entry's `影响范围` list. A
  business entry changes `已合并` back to `未合并` when the new current-round
  commits are not in the verified remote default ref (`origin/master` or `origin/main`); a tooling entry preserves `当前版本`
  unless a newer release changes the channel under the verified-readback or
  conditional `DEPLOY` rule in `wiki-template.md`. Do
  not create a duplicate entry or duplicate an identical scope already listed.
- Each entry has exactly one evidenced `feature/*` or `fixbug/*` source branch.
  The whole page may contain multiple branches; select entries by repository
  plus branch. Same branch names across repositories are not duplicate entries.
- A newly created child starts with `# 前端` and sequence `1`. A new entry under
  an existing empty `# 前端` also uses sequence `1`; otherwise it uses the
  greatest existing canonical top-level entry sequence plus one. A missing
  section is appended as `# 前端` with sequence `1`. A unique entry with the
  same source branch gets an impact-scope patch and no new sequence. Duplicate
  sequences or ambiguous matches block.
- Every new business entry initializes `是否上线：未合并`. Tooling/library
  entries instead use `当前版本：canary` for `canary` or
  `当前版本：latest` for `official`, following the release-evidence rules
  in `wiki-template.md`; no tooling `是否上线` field is rendered. A business
  entry changes to `已合并` only after the original branch is verified in
  the verified remote default ref (`origin/master` or `origin/main`); it is not a production-publication claim.
- Reused valid content is immutable outside the declared minimal patch. A
  matching entry must already use the current status contract: business
  `未合并|待合并|已合并`, or tooling `当前版本：canary|latest`.
  Exactly one legacy tooling `是否上线：无需上线` line may be replaced with
  the evidenced `当前版本` line in the declared minimal patch. Missing,
  conflicting or other non-current values block. Only the declared scope
  append, required business reset, and evidenced tooling status patch may change.
- `VALIDATED` requires passing validation and a non-empty copyable Markdown
  body. `BLOCKED` requires a concise blocker and no rendered final body.

- `待合并` is written only by `going-live` after an exact open default-target MR
  is created/reused under the approved conditional patch. Drafting never
  invents that evidence. A new functional submission round resets an existing
  待合并 to 未合并 with its declared scope patch; a non-functional skip retains
  the existing body. Final 已合并 still requires verified source containment.
- The result contains no external-write authority, local path, runtime ID,
  recovery/history state, or private validator response.
- Capability consumers receive the complete in-memory result. Only a direct
  standalone user response projects `VALIDATED` to raw Markdown alone.
