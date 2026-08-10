# TAPD Wiki body template

Use this canonical body for one new entry. Replace only fields supported by
supplied facts. Render every absent noncritical field as `待补充`. Do not add
target-location, Wiki-ID, TAPD-comment, writeback, merge, or release content.

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
- 环境：联团 老生产
```

## Field rules

- `序号` is supplied sequence or `待补充`; do not calculate an order from an
  unseen month directory.
- `服务名称` and `git地址` are supplied service/repository facts or `待补充`; do
  not equate a project folder with a service name.
- `开发人员` uses a supplied developer fact or `待补充` in both required places.
- `内容` summarizes only supplied work/change facts; if none exist, use
  `待补充`.
- `代码分支名` is never `待补充`: it must be the one verified source
  `feature/*` or `fixbug/*` branch. A missing or conflicting value blocks.
- `影响范围` lists supplied scopes in order. Use `1. 待补充` when none are
  supplied.
- `测试人员` uses a supplied tester or `待补充`. Never use `reporter` as an
  implicit substitute.
- `环境` is exactly `联团 老生产`.

## Existing-draft patch rule

Keep every valid pasted character unchanged. For a matching current entry,
append only this evidence-backed note below that entry:

```md
**[追加提测/二次提测 {日期或待补充}]**：{补充功能或修复问题}
```

If no matching entry is evidenced, append the complete canonical entry after
the existing content, separated by one blank line. Never replace a pasted
draft with a fresh template, renumber historical entries, or change a prior
entry's branch/person/content.
