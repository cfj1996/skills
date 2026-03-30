---
name: tapd-workflow
description: 处理 TAPD Bug/Story 的端到端工作流：CLI 收集信息 → 规划任务 → Worktree 隔离开发 → Review 验证
---

# TAPD 工作流

## 输入

- TAPD Bug URL: `https://www.tapd.cn/<workspace_id>/bugtrace/bugs/view/<bug_id>`
- 或 TAPD Story URL: `https://www.tapd.cn/tapd_fe/<workspace_id>/story/detail/<story_id>`
- 或继续处理已有项：`/tapd-workflow bug item-id <ITEM_ID>` 或 `/tapd-workflow story item-id <ITEM_ID>`

## CLI 使用方式

- 首次处理：
  - `/tapd-workflow <TAPD链接>`
- 继续修复或补需求：
  - `/tapd-workflow bug item-id <ITEM_ID>`
  - `/tapd-workflow story item-id <ITEM_ID>`
  - 随后补一句本轮说明，例如“这是二次修复”或“这是补需求”

示例：

```text
/tapd-workflow https://www.tapd.cn/tapd_fe/50372234/story/detail/1150372234001068680
```

```text
/tapd-workflow story item-id 1150372234001068680
本轮是继续修复，不重新采集 raw-cli.json，请直接新开 iteration 并记录 change-request。
```

## 执行步骤

### 1. 解析类型与 ID

从输入中识别：
- **Bug**: URL 包含 `/bugtrace/` → 类型为 `bug`
- **Story**: URL 包含 `/story/` → 类型为 `story`
- **ITEM_ID**: 从 URL 中提取的 Bug 或 Story ID，或直接使用 `bug|story item-id`
- 如果输入是 `bug item-id` 或 `story item-id`，优先从对应类型目录中查找已有上下文，并按继续处理流程执行

### 2. 收集信息

```bash
npx --package=@zan/tapd-cli@canary zan-tapd-cli <type> <id> --json
```

将输出保存到按类型区分的目录：

- Bug: `docs/bugs/item-{ID}/raw-cli.json`
- Story: `docs/stories/item-{ID}/raw-cli.json`

从 CLI 输出中提取并写入 `item-context.md`：
- 标题、状态、优先级
- Bug: 严重程度、所属模块、复现步骤
- Story: 所属迭代、验收标准
- 描述、评论摘要
- 原型链接（蓝湖 > MasterGo > Figma）
- 截图/图片附件

只要出现原型链接，必须使用 `chrome-devtools-mcp` 打开原型文档，读取其中默认展示的需求文档，并将提炼结果写入 `item-context.md`。若存在多个需求文档，只读取默认展示的文档，除非用户另行要求。

### 3. 需求确认（阻塞环节）

在完成信息收集后，**必须**主动向用户展示解析后的功能概要或问题描述，并等待用户确认。

**展示内容包括**：
- **标题**：{TAPD 标题}
- **类型**：Bug 或 Story
- **功能点/问题复现步骤**：{提炼后的核心内容}
- **原型分析结果**：{原型中的核心逻辑说明}

**询问话术示例**：
> 已收集并解析 TAPD 信息：
> **[Bug/Story 标题]**
> {核心描述/步骤}
>
> **请确认是否继续处理该项？**
> - 输入 `继续`：开始本轮变更记录与规划。
> - 输入 `补充需求: xxx`：将补充信息并入 `item-context.md` 后再进行规划。
> - 输入 `取消`：终止工作流。

**未收到明确的“继续”或“补充”指令前，禁止执行后续步骤。**

#### Bug 模板

```markdown
# Bug: {标题}

- **ID**: {ID}
- **类型**: Bug
- **URL**: {TAPD_URL}
- **状态**: {状态}
- **优先级**: {优先级}
- **严重程度**: {严重程度}
- **所属模块**: {所属模块}

## 问题描述
{完整描述}

## 复现步骤
{复现步骤}

## 期望行为
{期望行为}

## 实际行为
{实际行为}

## 评论摘要
{关键评论}

## 原型/截图
- {链接}: {分析摘要}

## 采集信息
- **collection_confidence**: {0.0-1.0}
- **warnings**: []
```

#### Story 模板

```markdown
# Story: {标题}

- **ID**: {ID}
- **类型**: Story
- **URL**: {TAPD_URL}
- **状态**: {状态}
- **优先级**: {优先级}
- **所属迭代**: {所属迭代}

## 业务背景
{详细说明}

## 验收标准
{验收标准列表}

## 评论补充
{关键评论摘要}

## 原型与 UI
- **原型链接**: {URL}
- **关键交互**: {分析摘要}

## 采集信息
- **collection_confidence**: {0.0-1.0}
- **warnings**: []
```

**confidence 评分**：
- 1.0: 所有字段完整，有原型/截图分析
- 0.8: 核心字段完整，原型或截图缺失
- 0.6: 描述完整，其他字段部分缺失
- < 0.6: 关键信息缺失，需人工补充

### 4. 记录本轮变更

如果是首次处理后的继续修复、补充需求或再次开发，先在当前 `item-{ID}` 目录下创建新的 `iteration-{N}/change-request.md`，记录本轮为什么重启、要补充什么、与上一轮相比变化了什么。

```markdown
# 本轮变更说明

- **iteration**: iteration-{N}
- **trigger**: {新增需求 | 二次修复 | 回归问题 | 其他}
- **summary**: {本轮处理目标}

## 背景
{为什么要继续处理}

## 新增需求/问题
- {新增点 1}
- {新增点 2}

## 本轮范围
- {本轮要做}

## 非目标
- {本轮不做}
```

首次处理时可直接创建 `iteration-1/change-request.md` 作为本轮说明。

### 5. 规划任务

基于 `item-context.md` 和当前轮次的 `change-request.md` 生成 `task-plan.md`：

```markdown
# 任务计划

## 背景
{需求背景或 Bug 原因}

## 相关文件
- `path/to/file1.tsx`: {说明}
- `path/to/file2.ts`: {说明}

## 任务清单
- [ ] {任务1}: {具体描述}
- [ ] {任务2}: {具体描述}

## 测试策略
{如何验证修改}

## 风险评估
{潜在风险}

## 分支信息
- **分支名**: fix/{ID}-{slug} 或 feat/{ID}-{slug}
- **Worktree**: ../worktree-{ID}
```

**任务拆分要求**：
- 每个任务 30 分钟内可完成
- 任务描述具体、可执行
- 若根因不明确，首个任务应是验证假设

#### 接口对接任务

若需求涉及接口对接，**必须**调用 `yapi-workflow` skill 获取接口文档：

**触发条件**：
- 描述中提到"调用接口"、"对接接口"、"新增接口"
- 验收标准中包含接口相关内容
- 前端需要对接后端 API

**调用方式**：

使用 `Skill` tool 调用 `yapi-workflow`：

```
Skill: yapi-workflow
Args: search 用户列表
```

或在对话中直接使用 slash 命令：

```
/yapi-workflow search 用户列表
/yapi-workflow query 12345
/yapi-workflow gen-ts --id 12345 --output ./src/types/api.ts
```

**接口信息记录**：

在 `task-plan.md` 中增加接口信息章节：

```markdown
## 接口信息

### {接口名称}
- **服务名**: {serverName}
- **完整路径**: {serverName}{path}
- **方法**: {method}
- **接口 ID**: {id}

#### 请求参数
{从 query 返回的 request 字段提取}

#### 响应结构
{从 query 返回的 response 字段提取}

#### 类型文件
已生成至: `./src/types/api.ts`
```

**服务名确认**：

若 `serverNameSource` 为 `yapi` 或 `none`，需与后端确认后更新：

```
/yapi-workflow server set "项目名" "正确的服务名"
```

### 5. 创建 Worktree

**必须**在独立 worktree 中进行代码修改，分支基于 `origin/master`：

```bash
# 先拉取最新代码
git fetch origin master

# Bug 修复 - 基于 origin/master 创建
git worktree add ../worktree-{ID} -b fix/{ID}-{slug} origin/master

# Story 开发 - 基于 origin/master 创建
git worktree add ../worktree-{ID} -b feat/{ID}-{slug} origin/master
```

### 6. 实现修改

在 worktree 中按 `task-plan.md` 执行：
- 逐项实现修改
- 每次修改后运行相关测试
- 最小化改动，不做无关重构
- 生成当前轮次的 `impl-summary.md`

**接口对接实现**：

若已通过 `yapi-workflow` 生成类型声明，实现时：

1. 引入生成的类型：
```typescript
import type { XxxPathParams, XxxQuery, XxxRequestBody, XxxResponseBody } from './types/api';
```

2. 使用 `serverName + path` 拼接完整请求路径：
```typescript
const fullPath = `${serverName}${path}`; // 如 /micro/order/api/order/list
```

3. 确保请求参数类型与生成的类型匹配

```markdown
# 实现摘要

## 变更文件
- `path/to/file1.tsx`: {变更说明}

## 接口对接
- 接口: {serverName}{path}
- 类型文件: `./src/types/api.ts`

## 测试结果
{测试命令及输出}

## 未完成项
{如有}
```

### 7. Review

对比 `item-context.md`、当前轮次的 `change-request.md`、`task-plan.md` 与实际 diff：

**Review 维度**：
1. 需求一致性
2. 修改范围（是否最小化）
3. 代码质量
4. 安全性

**判定规则**：
- `confidence >= 0.8`: 输出 `REVIEW_PASSED`
- `< 0.8`: 输出 `review-report.md`，说明问题

### 8. 提交与清理

**提交代码时必须同时提交 `docs/` 下对应的文档**。注意：有些项目可能会将 `docs/` 文件夹忽略，需使用 `-f` 强制添加。

```bash
# 提交代码和文档
git add .
# 针对可能被 .gitignore 忽略的 docs 目录，执行强制添加
git add -f docs/

git commit -m "fix({ID}): {描述}"

# 推送并创建 PR（如需要）
git push -u origin fix/{ID}-{slug}

# 合并后清理 worktree
git worktree remove ../worktree-{ID}
```

### 9. 生成提测 Wiki

在当前迭代目录下生成 `test-wiki.md`，模板如下：

```markdown
1、[{项目名称}]({git地址}) **!!#ff0000 更新服务!!**
- 负责人：{负责人}
- 开发人员：
  - 前端：{开发者}
- 内容：{commit message 或变更描述}
- 代码分支名：{fix|feat}/{ID}-{slug}
- 影响范围：{影响的功能模块或页面}
- 测试人员：{从 TAPD 获取}
- 环境：联团 老生产
```

字段来源：
- **项目名称**: 当前文件夹名称，如果是monorepo，则去子包名称
- **git地址**: 当前项目的git地址
- **负责人/开发人员/前端**: 从 `item-context.md` 获取，或默认使用当前开发者
- **内容**: 从当前迭代的 `commit-message.txt` 或 `impl-summary.md` 提取
- **代码分支名**: 从 `task-plan.md` 获取
- **影响范围**: 从 `task-plan.md` 风险评估或 `impl-summary.md` 变更文件汇总
- **测试人员**: 从 `item-context.md` 获取

### 10. Worktree 收尾

清理 worktree 后，**自动切换回主工作目录**：

```bash
# 记录当前 worktree 路径
WORKTREE_PATH="../worktree-{ID}"

# 清理前先切换回主项目目录
cd /path/to/main/project

# 删除 worktree
git worktree remove $WORKTREE_PATH

# 确认当前在主项目目录
pwd
```

**重要**：
- 清理 worktree 前必须先切换目录
- 切换后告知用户已回到主项目目录

## 目录约定

```text
docs/
├── bugs/item-{ID}/
│   ├── raw-cli.json
│   ├── item-context.md
│   ├── iteration-1/
│   │   ├── change-request.md
│   │   ├── task-plan.md
│   │   ├── impl-summary.md
│   │   ├── commit-message.txt
│   │   ├── review-report.md
│   │   └── test-wiki.md
│   └── iteration-{N}/
│       ├── change-request.md
│       ├── task-plan.md
│       ├── impl-summary.md
│       ├── commit-message.txt
│       ├── review-report.md
│       └── test-wiki.md
└── stories/item-{ID}/
    ├── raw-cli.json
    ├── item-context.md
    ├── iteration-1/
    │   ├── change-request.md
    │   ├── task-plan.md
    │   ├── impl-summary.md
    │   ├── commit-message.txt
    │   ├── review-report.md
    │   └── test-wiki.md
    └── iteration-{N}/
        ├── change-request.md
        ├── task-plan.md
        ├── impl-summary.md
        ├── commit-message.txt
        ├── review-report.md
        └── test-wiki.md
```

## 全局约束

- 先证据，后判断
- 范围最小化，不做无关重构
- 每个阶段保留可追踪的 Markdown 产物，**提交代码时必须同步提交 `docs/` 下的文档（可能需要 `git add -f`）**
- 代码修改必须在 worktree 中进行
- 涉及代码修改时，优先运行相关测试
- 出现原型链接时，原型需求提取必须通过 `chrome-devtools-mcp` 完成，且默认不切换到其他需求文档
- `raw-cli.json` 仅保留首次采集结果，后续重启流程不重复采集
- 同一 TAPD 项后续继续修复或补需求时，不覆盖历史轮次，而是新增 `iteration-{N}` 目录继续执行
- **涉及接口对接时，必须调用 `yapi-workflow` skill 获取接口文档和类型声明**
- 接口服务名需与后端确认，确认后使用 `server set` 更新本地映射
