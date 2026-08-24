# TAPD Wiki body template

Use this canonical body for one fully resolved new entry. Calculate every field
from current read-only evidence. A valid body contains no `待补充`. Do not add
target-location, Wiki-ID, TAPD-comment, writeback, merge, or release narration.

```md
{序号}. [{服务名称}]({git地址}) **!!#ff0000 更新服务!!**
- 负责人：{开发人员}
- 开发人员：
  - 前端：{开发人员}
- 内容：{功能描述}
- 代码分支名：{effective_wiki_branch_name}
- 影响范围：
  1. {影响范围}
- 测试人员：{测试人员}
- 是否上线：否
- 环境：联团 老生产
```

## Field rules

- `序号` is calculated from the visible target Wiki under `# 前端` as defined
  below; it is never supplied as an unexplained placeholder.
- `服务名称` and `git地址` come from verified project routing/repository
  evidence. Do not equate a project folder with a service name without that
  mapping.
- `开发人员` comes from the reconciled work definition, TAPD developer, or
  reviewed change and is used in both required places. Conflicts block.
- `内容` summarizes the resolved TAPD work and current reviewed change.
- `代码分支名` is the one verified original `feature/*` or `fixbug/*` source
  branch. A missing, conflicting, or `merge/*` value blocks.
- `影响范围` lists resolved current-round scopes in order. Missing scope blocks.
- `测试人员` comes from the TAPD tester field or its dynamically resolved custom
  field. Never use `reporter` as an implicit substitute; missing tester blocks.
- `是否上线` is exactly `否` for a new entry. Only `going-live` may change it to
  `是` after verified `origin/master` containment.
- `环境` is exactly `联团 老生产`.

## Target calculation and patch rules

Operate only on the current body read from `target_wiki_url`:

- If `# 前端` is absent, append one `# 前端` section and the canonical entry with
  sequence `1`.
- If `# 前端` exists and no current entry matches the original source branch,
  use sequence `1` when the section has no canonical entry; otherwise calculate
  `max(existing canonical top-level sequences) + 1` within that section and
  append the canonical entry before the next level-one section.
- If exactly one entry under `# 前端` contains the original source branch,
  preserve its sequence and append only the re-test note below that entry. If
  the entry predates `是否上线`, also insert `- 是否上线：否` immediately before
  its `- 环境` line.
- Multiple matching entries, duplicate existing sequences,
  duplicate/conflicting online fields, malformed section boundaries, or an
  unreadable target block instead of guessing.

The re-test note is:

```md
**[追加提测/二次提测 {日期}]**：{补充功能或修复问题}
```

Keep every existing character unchanged outside the calculated patch. Never
replace a target with a freshly generated page, renumber historical entries,
or silently change a prior entry's branch, person, content, or online state.
