---
name: tapd-workflow
description: Use when working on TAPD Bug/Story items with an MCP-first workflow for collecting context, planning fixes, implementing changes, or preparing提测材料. Use when Codex needs to read TAPD pages, continue an existing TAPD item, or write back to TAPD with manual confirmation.
tools:
  - tapd-mcp: 查询tapd相关信息
  - yapi-mcp: 查询api, 接口文档, 接口服务相关信息
  - gitlab-map: 分支创建、合并请求与直接合并到 develop，分支基线校验与 merge 状态查询
  - superpowers: 规划、实现、验证与分支收尾工作流
---

# TAPD 工作流

## 入口

- 首次处理：`/tapd-workflow <TAPD链接>`
- 继续处理：`/tapd-workflow bug item-id <ITEM_ID>` 或 `/tapd-workflow story item-id <ITEM_ID>`
- 细节流程、上下文注入约定和协作写回规范放在 [`references/workflow.md`](references/workflow.md)

## ID 约定

- `id`：TAPD Bug / Story 的原始 ID，只用于入口查找
- `short-id`：通过 TAPD MCP 查询得到的 7 位短 ID
- worktree、提测材料编号统一使用 `short-id`
- 提测 Wiki 里的 `代码分支名` 必须使用真实 Git 分支名，不得用 `short-id` 代替

## 依赖

- 必须依赖 `tapd-mcp`
- 必须依赖 `gitlab-map`
- 需要直接合并到 `develop` 时，必须依赖 `gitlab-mcp`
- 如果 `tapd-mcp` 不可用，停止 workflow 并提示用户
- 如果 `gitlab-map` 不可用，停止 workflow 并提示用户，暂停执行涉及代码提交/提测的后续步骤
- 如果 `gitlab-mcp` 不可用，停止执行自动合并步骤，并提示用户

## 回归检查

- 每个关键阶段完成后，都必须先由 `regression-checker` 做一次门禁检查，再进入下一阶段
- `regression-checker` 只负责判定是否满足当前阶段的流程与证据要求，不承担实现或写入职责
- 阶段回归检查失败时，必须补证据或修正流程状态，禁止跳阶段

## 硬规则

- TAPD 操作必须使用 TAPD MCP
- 只要会直接写入 TAPD 或影响协作结果，就必须先展示内容并等待用户明确确认；包括创建/更新 Bug、Story、Comment、Wiki，以及修改状态、补充内容、移动内容
- 本地文档产物、代码修改、测试、合并整理不需要逐步确认，但对外写入前必须先展示内容
- 提测 Wiki 必须严格按 [`references/test-wiki.md`](references/test-wiki.md) 的模板生成，禁止用摘要模板、简版模板、自由格式替代
- 提测 Wiki 模板中的 `服务名称` 必须使用 `company-project-routing` 技能按项目线索映射获取，不得直接用项目名称代替
- 提测 Wiki 写回前必须先读取父级月目录正文，确认当前模块顺序与插入位置，默认采用增量追加，不得整页覆盖
- 提测 Wiki 写回时，必须先检查当月目录是否已有当前 TAPD 项相关子 Wiki：无则先创建 `MM-DD: {简单描述}` 子 Wiki；有则直接走后续补充流程，禁止重复创建
- 每次进入实现前，都必须先向用户明确本轮处理范围、本轮不处理范围，以及是否纳入历史内容；未声明的内容禁止进入后续阶段
- 采集结果默认只注入当前上下文
- 代码修改必须在 worktree 中进行
- 当产品补充附件、PRD、需求说明或其他相关文档时，必须纳入信息采集阶段并解析其内容，再补充到当前上下文
- 涉及接口对接时，使用 `yapi-workflow`
- 原型链接出现时，必须用 `chrome-devtools-mcp` 读取默认展示的需求文档
- 入口可使用原始 `id` 定位项目，但流程中的 worktree、提测材料统一看 `short-id`；分支名必须使用真实 git 分支，不得用 `short-id` 代替
- 合并完成后，必须通过 GitLab 直接合并到 `develop`，并在合并成功后明确提示用户
- `测试人员` 必须来自 TAPD 字段映射中的真实字段值，优先读取 `custom_field_two`；只有在该字段为空时才允许按模板兜底到 `reporter`
- 修复或功能开发阶段优先复用已有 Superpowers 工作流，不再维护 TAPD workflow 自己的一套实现产物模板

## 参考

- [`references/collector.md`](references/collector.md)
- [`references/gitlab-map.md`](references/gitlab-map.md)
- [`references/test-wiki.md`](references/test-wiki.md)
- [`references/planner.md`](references/planner.md)
- [`references/implementer.md`](references/implementer.md)
- [`references/reviewer.md`](references/reviewer.md)
- [`references/prototype.md`](references/prototype.md)
- [`references/regression-scenarios.md`](references/regression-scenarios.md)
