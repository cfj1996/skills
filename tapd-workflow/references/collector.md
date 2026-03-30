# 阶段一：信息收集

## 目标

- 通过 `zan-tapd-cli --json` 提取需求/Bug 详情、评论、原型和图片，生成 `item-context.md`。
- 执行 `npx` 命令时需要携带 `--package=@zan/tapd-cli@canary` 配置项目

## 要收集的内容

- 标题、状态、优先级
- Bug 的严重程度和模块，或 Story 的所属迭代
- 描述、复现步骤、验收标准
- 评论摘要
- 详情页和评论中的图片信息、原型链接线索

## 获取顺序

1. 如果是首次处理，粘贴 Tapd 链接并解析出 `story`/`bug` 类型与 ID；如果是继续处理，直接使用 `bug item-id` 或 `story item-id` 查找对应类型目录与 `item-context.md`。
2. 首次处理时，运行 `npx --package=@zan/tapd-cli@canary zan-tapd-cli <type> <id> --json`，将输出保存到对应类型目录，便于审计：
   - Bug: `docs/bugs/item-{ID}/raw-cli.json`
   - Story: `docs/stories/item-{ID}/raw-cli.json`
3. 首次处理时，从 CLI 结构化内容中提取标题、状态、优先级、描述、所有原型/截图链接和评论摘要，构建概览和候选上下文条目；继续处理时，直接读取已有 `item-context.md` 作为基础上下文。
4. 首次处理且存在原型链接时，使用 `chrome-devtools-mcp` 打开原型文档，读取默认需求文档中的需求说明、关键交互和限制条件；若有多个需求文档，只读取默认展示的文档，不主动切换。
5. 逐条把候选上下文向用户确认（参考 `agents/collector.md` 中的提示词），接受、编辑或跳过，每条确认后的文本写入 `item-context.md`，并附上 `collection_confidence` 与 `warnings` 说明。若发现 CLI 未返回的关键字段，可补充来自页面或原型文档的描述，并在 Markdown 中标注来源。
6. 为当前轮次准备 `change-request.md` 和 `task-plan.md` 的草稿内容（背景、原型要点、初步待办、验证建议），方便 planner 和 implementer 阶段直接接手。

## 上下文确认流程

- 读取 `docs/bugs/item-{ID}/raw-cli.json` 或 `docs/stories/item-{ID}/raw-cli.json`，把 CLI 输出中的原型/截图链接和对应语句列成候选上下文；优先从 `description` 与评论中提取句子，若无上下文则写明“CLI 仅返回链接”。
- 当链接是 `lanhuapp.com/mastergo.com/figma.com` 等原型时，先通过 `chrome-devtools-mcp` 打开原型文档，读取默认展示的需求文档，再提示用户确认要聚焦的页面、模块和交互；如果是截图链接，提示用户描述截图内容或将重点复述在 `item-context.md`。
- 确认后把最终文本写入 `item-context.md` 的“快速概览”和“原型/截图上下文”部分，并在“采集信息”区记录 `collection_confidence` 与 `warnings`（若 CLI 列出缺字段，用此区分）；如果内容来自原型中的默认需求文档，要显式标注来源。
- 如果 CLI 输出中包含多个链接或图片，逐个确认是否需要提取；不需要的链接可跳过，但要在 Markdown 中说明跳过原因。
- 当前轮次的 `change-request.md` 和 `task-plan.md` 应根据确认后的上下文填充背景、原型要点、初步待办与验证建议，必要时注明 CLI 未覆盖的验证方法或复现步骤，以便后续 implementation 阶段直接拿内容执行。

## 原型处理

1. 只扫描详情页正文、评论正文，以及这两处中的图片/截图内容。
2. 优先从 API 返回的 `description` 和评论 HTML 中提取原型链接，再识别详情页和评论中的图片/截图。
3. 优先识别蓝湖 `lanhuapp.com`，其次识别 `mastergo.com`、`figma.com`。
4. 使用 `chrome-devtools-mcp` 打开原型链接，读取原型文档中的默认需求文档，判断其对应的页面、模块、核心交互和显式约束。
5. 如果存在多个原型链接，保留主链路，同时记录其他补充链接；如果单个原型内存在多个需求文档，只读取默认文档。

## 输出要求

- 需要明确区分 Bug 和 Story 模板
- `collection_confidence` 低于 0.6 时，必须列出缺失项
- 原型可访问但未完成分析，视为收集不完整
- 原型可访问但未通过 `chrome-devtools-mcp` 读取默认展示的需求文档，视为收集不完整
- 无法访问页面或附件时，写清原因
- API 未返回的字段才允许通过页面补采
- CLI 会在 `warnings` 里列出缺失字段，且 `collection_confidence` 会被设为 0.5，以便在 `item-context.md` 明确标记。
- 所有 CLI 原始 JSON 都写入对应类型目录，供 Review 阶段参考：
  - Bug: `docs/bugs/item-{ID}/raw-cli.json`
  - Story: `docs/stories/item-{ID}/raw-cli.json`

## 结束条件

- `item-context.md` 已生成
- 关键信息足以支持任务规划
