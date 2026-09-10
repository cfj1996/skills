# TAPD Wiki body template

Use this canonical body for one fully resolved new entry. Calculate every field
from current read-only evidence. A valid body contains no `待补充`. Do not add
target-location, Wiki-ID, TAPD-comment, writeback, merge, or release narration.

```md
{序号}. Job：[{Jenkins Job 名称}?{Job 参数}]({Jenkins Job 地址}) **!!#ff0000 {服务类型}!!**
- 项目名称：[{项目名称}]({Git 仓库地址})
- 负责人：{开发人员}
- 开发人员：
  - 前端：{开发人员}
- 内容：{功能描述}
- 代码分支名：{effective_wiki_branch_name}
- 影响范围：
  1. {影响范围}
- 测试人员：{测试人员}
- 是否上线：{上线状态}
```

## Field rules

- `序号` is calculated from the resolved child Wiki under `# 前端`; a new child
  starts at `1`. It is never supplied as an unexplained placeholder.
- `Jenkins Job 名称` is the exact Job name from the workspace knowledge
  `jenkins_jobs` index. It must not be replaced with a repository name, service
  alias, or a guessed display name. For the rendered link text only, hide
  environment tokens such as `test` and `master` and their adjoining separator
  (for example, `front-vantix-system-test` displays as `front-vantix-system`).
  Remove only tokens identified as environment markers, not matching substrings
  inside business names. Preserve the exact original Job name for lookup and
  evidence, and leave the full Job URL unchanged.
- `Job 参数` contains the selected build/release parameter names and values
  from current delivery facts, checked against Jenkins definitions. Render
  `name=value` pairs joined by `&`, preserving their names, values, and order.
  Include target and release-type selections; omit branch parameters such as
  `branch` by default, since the original source branch has its own Wiki field.
  Do not infer selections from the Job name or treat defaults as confirmed.
  If no displayable parameters remain, omit `?` and the parameter suffix;
  under `DEPLOY`, unresolved required selections block a final body. Under
  `SKIP`, render only parameters already evidenced in the current work context;
  missing build/release selections do not block the Wiki. Do not call Jenkins
  or request deployment-only selections to complete a skipped deployment.
  Still require an evidenced Job name/URL and the other canonical Wiki fields.
  This query-like text is
  only a display label, never a modification to the actual Job URL.
  Examples:
  - `Job：[front-suppliers?platform=--suppliers](http://ops.jubaozan.cn/jenkins/job/front-suppliers-test/)`
  - `Job：[npm-tools?PROJECT_NAME=zan-lib&RELEASE_TYPE=release:canary](http://ops.jubaozan.cn/jenkins/job/npm-tools-test/)`
- `Jenkins Job 地址` is the exact clickable URL of that Job, resolved from the
  workspace knowledge/Jenkins readback. Never use the Git repository URL or
  construct a URL from the Job name when the address is not evidenced.
- `项目名称` is the current project name. For a monorepo package, use
  `项目名称/子包名称`; the Markdown link points to the verified Git
  repository URL.
- `Git 仓库地址` is the verified repository URL for the current project. For
  a monorepo package, link to the monorepo repository, not a guessed package
  URL.
- `服务类型` is exactly `更新服务` for a business project and exactly
  `工具服务-无需上线` for a tooling/library project or package. Resolve it from the
  project category; do not use `更新服务` for a tool package.
- Project type must come from explicit project knowledge or package metadata;
  an `@scope` name alone does not decide whether the project is a tooling
  project.
- `开发人员` comes from the reconciled work definition, TAPD developer, or
  reviewed change and is used in both required places. Conflicts block.
- `内容` summarizes the resolved TAPD work and current reviewed change.
- `代码分支名` is the one verified original `feature/*` or `fixbug/*` source
  branch. A missing, conflicting, or `merge/*` value blocks.
- `影响范围` lists resolved current-round scopes in order. Missing scope blocks.
- `测试人员` comes from the TAPD tester field or its dynamically resolved custom
  field. Never use `reporter` as an implicit substitute; missing tester blocks.
- `上线状态` is derived from the project type: a business project is exactly
  `未合并` for test submission and becomes `已合并` only after the original
  branch is verified in `origin/master`; a tooling/library project is exactly
  `无需上线`. An unresolved project type blocks; never guess. `已合并` also
  requires the corresponding master-containment evidence.
- For `CONTINUE`, classify the current-round change before patching. If it is
  `NON_FUNCTIONAL`, do not update the Wiki. If it is `FUNCTIONAL_IMPACT`, the
  new affected module/page must be appended to the matching entry's
  `影响范围` list; do not duplicate an identical existing item. A business
  entry already marked `已合并` must also return to `未合并` when this new
  current round is not contained in `origin/master`. A tooling entry remains
  `无需上线`.

## Wiki target resolution

Do not request a Wiki URL from the user. Resolve the target in this order:

1. Read the current TAPD item and exhaust pagination for all historical
   comments. If one matching 提测 Wiki link is associated with this work, use
   `REUSE_EXISTING`; never create another.
2. If no link exists, inspect root Wiki `1150372234001008260` (`提测文档`),
   then the `Asia/Shanghai` submission month's `YYYY-MM` page and all its
   children, exhausting pagination.
3. Reuse one related child matched by TAPD ID/short ID, original source branch,
   or unambiguous existing association.
4. If no related child exists, use title `MM-DD: {任务标题中文简述}`. Plan
   `CREATE_CHILD` when the month exists, otherwise
   `CREATE_MONTH_AND_CHILD`. Derive the required creator from authenticated
   TAPD/current-work evidence.

Multiple linked/related candidates, an inaccessible linked Wiki, or conflicting
month hierarchy evidence block instead of asking the user to choose or creating
a duplicate. Never write the entry template into the `YYYY-MM` month page; it
belongs in the child Wiki.

## Body calculation and patch rules

For `CREATE_CHILD|CREATE_MONTH_AND_CHILD`, render a complete new child body as
`# 前端`, one blank line, then the canonical entry above with `序号=1` and the
resolved `上线状态`.

For `REUSE_EXISTING`, operate only on the current child body read from TAPD:

- If `# 前端` is absent, append one `# 前端` section and the canonical entry with
  sequence `1`.
- If `# 前端` exists and no current entry matches the original source branch,
  use sequence `1` when the section has no canonical entry; otherwise calculate
  `max(existing canonical top-level sequences) + 1` within that section and
  append the canonical entry before the next level-one section.
- If exactly one entry under `# 前端` contains the original source branch,
  preserve its sequence. For a `FUNCTIONAL_IMPACT` continuation, append the
  affected module/page as the next numbered item under that entry's existing
  `影响范围` field. For a business project, the same minimal patch also changes
  `是否上线：已合并` to `是否上线：未合并` when the new current-round commits
  are not contained in `origin/master`; an existing `未合并` is preserved. A
  tooling project must preserve `是否上线：无需上线`. A missing status or any
  value outside the current three-state contract blocks; do not migrate an old
  template. For a `NON_FUNCTIONAL` continuation, produce a policy skip and no
  patch.
- Multiple matching entries, duplicate existing sequences,
  duplicate/conflicting merge-status fields, malformed section boundaries, or an
  unreadable child block instead of guessing.

Keep every reused character unchanged outside the calculated patch. Never
replace an existing child with a freshly generated page, renumber historical
entries, or silently change a prior entry's branch, person, content, or merge
status.
