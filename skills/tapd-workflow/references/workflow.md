# TAPD 工作流参考

`SKILL.md` 是唯一权威执行契约。本文件只展开流程图和阶段细节，不另起一套规则。

## 流程图

```mermaid
flowchart LR
  A["TAPD Bug / Story"] --> B["通过 MCP 采集上下文"]
  B --> C["判断是否需要补充上下文"]
  C -->|需要补充| D["用户补充上下文"]
  D --> B
  C -->|上下文足够| E["确认本轮范围"]
  E -->|用户确认需求/Bug描述与范围| F["更新 TAPD 状态并确认分支策略"]
  E -->|需要补充| D
  F --> G["使用 Superpowers 规划"]
  G --> H["在确认后的工作区中实现"]
  H --> I["验证与评审"]
  I -->|通过| J["展示合并影响并请求确认"]
  J -->|用户确认| K["通过 GitLab 合并到 develop"]
  K --> L["准备提测 Wiki 草稿"]
  L --> M["展示草稿并等待用户确认"]
  M -->|确认| N["通过 TAPD MCP 写 Wiki / 评论 /状态"]
  M -->|修改| L
  M -->|取消| X["停止"]
  N --> O["清理并汇报结果"]
```

## 阶段补充

### 采集上下文

- 使用 `tapd-mcp` 读取 TAPD 详情、评论、附件、PRD 和补充文档。
- 出现原型链接时，读取默认展示的需求文档。
- 采集成功并拿到 `short-id` 后，创建或更新 `docs/{short-id}/raw.md`，记录 TAPD id 与描述、需求/Bug 描述、流程进度和创建时间。
- 如果发现已有 `__test___/{short-id}/` 或 `docs/{short-id}/`，必须先读取历史测试、计划、验证、评审和 `raw.md`，据此判断是否为二次开发。
- 除 `docs/{short-id}/raw.md` 外，不创建 TAPD 专属原始数据转储文件。
- Bug 必采字段包括 `id`、`title`、`status`、`priority`、`severity`、`current_owner`、`reporter`、`te`、`de` 和 `created`。
- 测试人员解析规则统一参见 [collector.md](collector.md)；严禁在此处硬编码任何字段映射。
- **状态流转同步**：每次进入新阶段或遇到门禁阻塞时，必须同步调用 `update_topic` 更新会话状态，确保摘要实时反映当前处理进度。

### 补充上下文

- TAPD 描述不清楚时，先列出缺失信息，再向用户提出具体补充问题。
- 常见缺口包括复现路径、期望行为、影响范围、验收口径、关联分支、测试人员、原型说明和历史修复关系。
- 用户补充内容必须纳入当前上下文，并标明来源为“用户补充”。
- 补充信息改变判断时，先更新摘要，再确认本轮范围。
- 上下文仍不足时，不得进入规划。

### 确认范围

- 必须明确展示需求描述、Bug 描述、`本轮处理`、`本轮不处理` 和 `历史内容处理策略`。
- 必须获得用户确认后才能进入开发执行阶段；未确认时只能继续补充上下文或调整范围。
- 历史内容默认排除，除非用户明确纳入。
- 未出现在 `本轮处理` 中的内容，不得进入实现、验证、合并说明或 Wiki 正文。

### 开发执行阶段（阶段 4）

详细规则见：[development-execution.md](development-execution.md)。内部包含分支确认、规划、实现与验证环节。
进入时必须先写回 TAPD 状态：Bug 改为“修复中”，Story/Task 改为“进行中”。计划、验证、评审和 Superpowers 过程文档必须写入 `docs/{short-id}/`；测试代码必须写入 `__test___/{short-id}/xxx.test.(js|ts)`。

### 合并到 develop
 
 - 提交后确认合并条件。
 - 合并条件只按本轮提交范围判断；合法来源分支相对 `develop` 多出的历史提交属于继承基线差异，应记录但不阻断。
 - 不得因为继承基线差异而 cherry-pick 到 `origin/develop` 基线上另建开发分支。
 - **必须先展示拟合并的分支详情和提交列表，获得用户明确确认后，再通过 GitLab 合并到 `develop`。**
 - 合并成功是准备提测 Wiki 的前置条件。

### 准备提测 Wiki

- 严格按 [test-wiki.md](test-wiki.md) 执行。
- **准备前，必须先查询 TAPD 详情与历史评论，检查是否已存在提测 Wiki 链接。若已存在，则在原页面补充，绝对禁止新建 Wiki。**
- `服务名称` 必须通过 `company-project-routing` 解析。
- 写入前必须读取对应的目标页面（月目录或已有子 Wiki）。
- TAPD 写入前必须向用户展示完整 Wiki 草稿。

### 写回 TAPD

- TAPD 写入必须获得用户明确确认。
- Bug 评论格式固定为 `提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`。
- 调用 `create_comments` 前必须通过 `TAPD_COMMENT_GATE`：评论正文只能由最终 Wiki 链接生成，且必须完全等于单行 `提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`。
- Bug 评论正文禁止追加 MR、Jenkins、构建结果、实现说明、验证摘要或任何多行说明；这些信息只允许出现在最终回复中。
- Wiki、评论、状态写入尽量合并为一次确认。

### 清理

- 严格执行 `SKILL.md` 中的“工作区清理门禁”。
- 确认 GitLab 合并结果：若合并失败或有冲突，必须停在阶段 5 解决，禁止进入清理。
- 确认 TAPD 写回结果。
- 最终汇报必须包含：TAPD 链接、需求/Bug 描述、处理范围、Wiki 链接、合并后的 SHA、单元测试结果、集成测试结果、`docs/{short-id}/raw.md` 路径、清理完成声明和剩余风险。

## 自动化检查与回归

工作流规则调整后，执行 [regression-scenarios.md](regression-scenarios.md) 中的场景，并同步修正偏离 `SKILL.md` 的阶段提示词。
