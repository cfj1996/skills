---
name: tapd-workflow
description: Use when working on TAPD Bug/Story items with an MCP-first workflow for collecting context, planning fixes, implementing changes, or preparing提测材料. Use when Codex needs to read TAPD pages, continue an existing TAPD item, or write back to TAPD with manual confirmation.
tools:
  - mcp-server-tapd
---

# TAPD 工作流

## 入口

- 首次处理：`/tapd-workflow <TAPD链接>`
- 继续处理：`/tapd-workflow bug item-id <ITEM_ID>` 或 `/tapd-workflow story item-id <ITEM_ID>`
- 细节流程、目录约定和产物规范放在 [`references/workflow.md`](./references/workflow.md)

## ID 约定

- `id`：TAPD Bug / Story 的原始 ID，只用于入口查找
- `short-id`：通过 TAPD MCP 查询得到的 7 位短 ID
- 流程里的命名、分支、worktree、提测材料统一使用 `short-id`

## 依赖

- 必须依赖 `mcp-server-tapd`
- 所有 TAPD 读写都从 `mcp-server-tapd` 进入，不使用 CLI 兜底
- 如果 `mcp-server-tapd` 不可用，停止 workflow 并提示用户

## 硬规则

- TAPD 操作必须使用 TAPD MCP
- 只要会直接写入 TAPD 或影响协作结果，就必须先展示内容并等待用户明确确认；包括创建/更新 Bug、Story、Comment、Wiki，以及修改状态、补充内容、移动内容
- 本地文档产物、代码修改、测试、MR 链接整理不需要逐步确认，但对外写入前必须先展示内容
- 首次采集结果保存为 `raw-mcp.json`，后续迭代复用已有 `item-context.md`
- 代码修改必须在 worktree 中进行
- 涉及接口对接时，使用 `yapi-workflow`
- 原型链接出现时，必须用 `chrome-devtools-mcp` 读取默认展示的需求文档
- 入口可使用原始 `id` 定位项目，但流程中的编号、分支、worktree、提测材料统一看 `short-id`
- 合并请求只提供链接，不代建、不代合并；默认目标分支是 `develop`

## 参考

- [`references/collector.md`](./references/collector.md)
- [`references/planner.md`](./references/planner.md)
- [`references/implementer.md`](./references/implementer.md)
- [`references/reviewer.md`](./references/reviewer.md)
- [`references/prototype.md`](./references/prototype.md)
