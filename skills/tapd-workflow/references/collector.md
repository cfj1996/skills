# 阶段一：信息收集

## 目标

通过 TAPD MCP 提取需求/Bug 详情、评论、原型和图片，生成 `item-context.md`。

## 采集规则

- 首次处理时读取详情、评论、附件和图片，保存 `raw-mcp.json`
- 提取标题、状态、优先级、描述、评论摘要、原型链接、截图信息
- Bug 必须采集字段：id, title, status, priority, severity, current_owner, reporter, te, de, created
- Bug 记录严重程度、模块、复现步骤；Story 记录所属迭代、验收标准
- 只要出现原型链接，必须用 `chrome-devtools-mcp` 打开原型文档，并只读默认展示的需求文档
- 原型和截图信息要写入 `item-context.md`，并标注来源
- 采集后先向用户展示摘要，等待”继续 / 补充 / 取消”
- 如果后续会进入写入阶段，先把可能写入 TAPD 的内容一并列出来，避免逐条打断用户
- 继续处理时，直接复用已有 `item-context.md` 和 `iteration-{N}`，不要重复采集
- `collection_confidence` 和 `warnings` 用于标记完整度

## TAPD Bug 字段说明

| 字段缩写 | 全称 | 含义 |
|----------|------|------|
| `te` | tester | 测试人员（提测时使用此字段） |
| `de` | developer | 开发人员 |
| `reporter` | reporter | 报告人（提交Bug的人） |
| `current_owner` | current_owner | 当前处理人 |

## 输出要求

- `collection_confidence` 低于 0.6 时，必须列出缺失项
- 原型可访问但未通过 `chrome-devtools-mcp` 读取默认展示的需求文档，视为收集不完整
- 无法访问页面或附件时，写清原因

## 结束条件

- `item-context.md` 已生成
- 关键信息足以支持任务规划
