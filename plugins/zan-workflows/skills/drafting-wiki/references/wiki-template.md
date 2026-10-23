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
{项目状态行}
```

## Preview boundary

The rules below govern the final validated body. For an earlier execution
checklist, use the distinct template-preview boundary below; never submit that
preview as a validated body.

## 确定清单中的模板预览

用户明确需要 Wiki 时，入口在初次或调整后的完整确定清单中、执行确认问题前
展示 `### 提测 Wiki 模板预览`。复用上面的 canonical 结构及最终页面的 `# 前端`
标题；多项目按本次选定范围展示各项目/原分支条目，不增加另一套 Wiki 模板。

- 明确标注“执行前模板预览，尚未写入 Wiki”。已核实的项目、仓库、负责人、
  计划分支、影响范围和 Job 信息填实际值；分支未创建时在正文外说明计划动作。
  不把已有 Wiki/已完成登记当成尚未执行的新写入，也不改变其历史条目。
- 最终序号、页面地址或字段尚未核实，写 `〈定位后确定〉` 或 `〈待核实：字段〉`；
  不猜 URL、人员、参数、状态或版本。模板预览不要求先有 `ReviewedChange`，
  不为填完模板提前调用正式提测流程或定位/创建月份页。
- 功能内容先展示已确认的拟修复/开发行为。尚未发生的实际修复、验证、构建
  和发布结果写 `〈执行后按实际结果补充〉`，明确它们不是已通过事实。
  这些计划待填项不是“待决事项”；必要的身份、接口或目标缺口仍按影响阶段
  列入原清单，不能靠模板占位符清除真实阻塞。
- 此预览不返回 `VALIDATED`，不产生目标/body hash 或 Wiki 写入授权；含未核实
  字段的结构不能传给写入脚本、评论或当成可提测结果。
- 正式提测前，`drafting-wiki` 仍依据当前已审查改动、真实字段/目标和交付事实
  生成无占位符的完整正文或最小补丁。在 `SubmissionPlan` 展示后取得该计划
  的准确确认，满足原 Git/部署门禁后才允许 Wiki/评论写入与读回。

普通修复/开发的“是否需要提测 Wiki”默认“需要”，因此确定清单先展示模板。
明确关闭 Wiki 或本轮仅开发/计划/分支时不展示空模板、不查询 Wiki；已有明确
选择继续保留。默认意图或单个选项回答不授权合并、部署或提前写入。

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
  missing build/release selections do not block the Wiki. Do not query build
  parameters/status or request deployment-only selections for skipped deployment.
  A missing canonical Job URL may be resolved by the exact read-only Job
  metadata lookup; that lookup must not trigger any build/deploy operation.
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
- `项目状态行` contains exactly one type-specific field:
  - Business: `- 是否上线：未合并` for test submission; use `已合并` only
    after the original branch is verified in the verified remote default ref (`origin/master` or `origin/main`).
    `待合并` is a valid intermediate value maintained by going-live only after
    exact original-source/default-target MR creation/reuse and open-state
    readback; it does not mean production delivery or completed merge.
  - Tooling/library: `- 当前版本：canary` for `canary`, or
    `- 当前版本：latest` for `official`. Do not render `是否上线` for tooling.
    The Wiki uses package channel labels `canary|latest`; the release executor's
    internal enum remains `canary|official`, with `official` displayed as `latest`.
    Resolve the latest verified publication for this entry's project/package
    from current delivery readbacks; retain its channel, actual package versions when applicable,
    source SHA and build evidence in claims. A newer verified publication may
    change the value in either direction. Do not infer a publication from the
    project category, Job name, selected parameter, or a master merge.
    A `DEPLOY` draft may bind the exact planned channel, but its Wiki write is
    conditional on the matching successful release readback. Under `SKIP`, use
    existing release evidence or preserve a valid existing `当前版本` field;
    do not query builds, require deployment selections, or default to canary.
    If the channel cannot be resolved, block the final body.
  An unresolved project type blocks; never guess.
- For `CONTINUE`, classify the current-round change before patching. If it is
  `NON_FUNCTIONAL` and the verified owner page already contains this repository/
  branch entry, skip the body write and retain its exact readback. With no page
  or current entry, prepare the normal creation/append body. If it is `FUNCTIONAL_IMPACT`, the
  new affected module/page must be appended to the matching entry's
  `影响范围` list; do not duplicate an identical existing item. A business
  entry already marked `已合并` must also return to `未合并` when this new
  current round is not contained in the verified remote default ref (`origin/master` or `origin/main`). A tooling entry preserves
  its valid `当前版本` unless a newer release changes the channel under the
  verified-readback or conditional `DEPLOY` rule above.
  An existing `待合并` likewise returns to `未合并` when a new functional
  round is submitted; do not carry an old pending-MR claim into new work.
  Replace a legacy tooling `是否上线：无需上线` field with the evidenced
  `当前版本` line as an explicit minimal patch; no other legacy-field migration
  is allowed.

Apply [shared-test-wiki.md](../../../references/shared-test-wiki.md) before
these target/body rules. The target belongs to the Story (including Tasks) or
Bug; each canonical entry belongs to one repository/original-branch pair.
All branch matching below means that pair. Different repositories may use the
same branch name; different branches in one repository have separate entries.
A new multi-project body starts at sequence 1 and numbers each further entry
sequentially under the same `# 前端`, with all required fields per entry.

## Wiki target resolution

Do not request a Wiki URL from the user. Resolve the target in this order:

1. Resolve the owner Story/Bug and its/current item links, checking exact sibling
   Tasks when the Story has no anchor. Read the exact TAPD item and comments,
   including links in the description.
   `get_comments` may omit count: then page through full pages until a short
   page. With count, require the full reported set; inconsistent or repeated
   pages block. If one matching 提测 Wiki link is associated with this
   work, read that Wiki by ID and use `REUSE_EXISTING`, including prior-month
   children; do not query Wiki lists. Reuse a complete script preview instead
   of repeating these reads. Execution binds the ID, parent, title and original
   body SHA-256; new pages bind the preview's month/title.
2. If no link exists, call `get_wiki` with `name=YYYY-MM` for the
   `Asia/Shanghai` submission month. Select the exact month whose returned
   `parent_wiki_id` is root `1150372234001008260` (`提测文档`). Multiple same-name
   results under other parents are not a reason to scan the whole workspace.
3. When the month exists, query the deterministic child title once with
   `get_wiki(name=MM-DD: 中文简述)` and locally match its returned
   `parent_wiki_id` to the month ID. A same-title child without an owner link
   blocks: matching repository and branch do not establish TAPD ownership.
   `get_wiki` accepts `name` and `id`, but
   not `parent_wiki_id` as a query option; never send that unsupported filter,
   paginate the unfiltered Wiki list, or repeat identical requests.
4. If no related child exists, use title `MM-DD: {归属需求或Bug标题}`;
   a child Task uses its parent Story title, not its project-prefixed Task title. Plan
   `CREATE_CHILD` when the month exists, otherwise
   `CREATE_MONTH_AND_CHILD`. Derive the required creator from authenticated
   TAPD/current-work evidence.

Multiple linked/related candidates, an inaccessible linked Wiki, or conflicting
month hierarchy evidence block instead of asking the user to choose or creating
a duplicate. Never write the entry template into the `YYYY-MM` month page; it
belongs in the child Wiki.

## Body calculation and patch rules

For `CREATE_CHILD|CREATE_MONTH_AND_CHILD`, render a complete new child body as
`# 前端`, one blank line, then all included project/branch entries starting at
`序号=1`, each with its own resolved `项目状态行`.

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
  are not contained in the verified remote default ref (`origin/master` or `origin/main`); an existing `未合并` is preserved. A
  tooling project follows the `当前版本` rule above: preserve a valid value,
  update it only under the release-evidence rule above, or replace exactly one legacy
  `是否上线：无需上线` line when the release channel is evidenced. A missing
  status or any other non-current value blocks. For a `NON_FUNCTIONAL`
  continuation with this verified existing entry, produce a policy skip and no
  patch while retaining the exact target/body readback for go-live.
- Multiple matching entries, duplicate existing sequences,
  duplicate/conflicting status fields (including both tooling field names),
  malformed section boundaries, or an unreadable child block instead of guessing.

Keep every reused character unchanged outside the calculated patch. Never
replace an existing child with a freshly generated page, renumber historical
entries, or silently change a prior entry's branch, person, content, or merge
status.
