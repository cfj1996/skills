# TAPD 工作流契约

## 触发方式

- 首次处理：`/tapd-workflow <TAPD链接>`
- 继续处理：`/tapd-workflow bug item-id <ITEM_ID>` 或 `/tapd-workflow story item-id <ITEM_ID>`
- 使用 `bug|story item-id` 时，默认表示继续修复或补需求，不重新采集 `raw-cli.json`

## 目录约定

- 工作文件按类型写入：
  - Bug: `docs/bugs/item-{ID}/`
  - Story: `docs/stories/item-{ID}/`
- `raw-cli.json` 和 `item-context.md` 保留在 `item-{ID}` 根目录
- 每次实际执行使用新的 `iteration-{N}/` 子目录，保存当前轮次的 `change-request.md`、`task-plan.md`、`impl-summary.md`、`commit-message.txt` 和 `review-report.md`
- 分支命名：
  - Bug: `fix/{ID}-{slug}`
  - Story: `feat/{ID}-{slug}`
- Worktree 路径：`../worktree-{ID}`

## 输出文件

- `item-context.md`
- `iteration-{N}/change-request.md`
- `iteration-{N}/task-plan.md`
- `iteration-{N}/impl-summary.md`
- `iteration-{N}/commit-message.txt`
- `iteration-{N}/review-report.md`
- `iteration-{N}/test-wiki.md`

## 原型规则

- 只处理详情页正文、评论正文，以及这两处中的图片/截图信息
- 默认优先级：蓝湖 > MasterGo > Figma > 其他链接
- 只要出现原型链接，必须使用 `chrome-devtools-mcp` 打开原型文档
- 原型中的需求提取默认只读取当前展示的需求文档，不主动切换其他需求文档
- 原型分析结果必须提炼后写入 `item-context.md`
- 只有链接存在但无法访问时，才允许标记为缺失

## CLI-first 规则

- 详情和评论默认走 `npx --package=@zan/tapd-cli@canary zan-tapd-cli <type> <id> --json`，并按类型保存原始输出：
  - Bug: `docs/bugs/item-<ID>/raw-cli.json`
  - Story: `docs/stories/item-<ID>/raw-cli.json`
- CLI 输出的 `warnings`/`collection_confidence`（如果有）用于后续阶段判断信息完整度。
- 页面浏览仅在 CLI 无法提供核心信息时才访问。
- CLI 输出的原型/截图链接应该先通过 `chrome-devtools-mcp` 读取原型文档默认展示的需求文档，再通过 `agents/collector.md` 中的提示词逐条向用户确认，用确认后的上下文填充 `item-context.md`，并为当前轮次准备 `change-request.md`、`task-plan.md` 草稿。
- 采集入口由 `node scripts/context-confirm.mjs` 触发，脚本会展示 CLI 摘要、确认原型/截图上下文，并自动产出 `item-context.md`、`raw-cli.json` 及当前轮次所需的草稿内容。
- 后续继续修复或补需求时，不重新生成 `raw-cli.json`，而是新增 `iteration-{N}/change-request.md` 作为当前轮次输入。
- 当用户输入 `/tapd-workflow bug item-id <ITEM_ID>` 或 `/tapd-workflow story item-id <ITEM_ID>` 时，先查找对应类型下的 `item-{ID}` 目录和已有 `item-context.md`，再进入当前轮次流程。

## 处理顺序

1. 收集信息
2. 确认需求
3. 记录本轮变更 `iteration-{N}/change-request.md`
4. 规划任务
5. 实现修改
6. Review
7. 提交与 MR

## 全局约束

- 先证据，后判断
- 范围最小化，不做无关重构
- 每个阶段都要保留可追踪的 Markdown 产物
- 涉及代码修改时，优先运行相关测试
- 同一 TAPD 项继续修复时，必须新开轮次，不覆盖历史轮次产物
