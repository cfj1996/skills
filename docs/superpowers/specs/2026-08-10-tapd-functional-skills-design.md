# TAPD Functional Skills Design

## 目标

将 `zan-workflows` 插件内的单体 `tapd-workflow` 替换成可单独触发、可函数式组合的 TAPD 技能。技能按稳定业务产物划分，不按旧阶段编号拆分；根目录独立技能 `skills/tapd-workflow/` 保持不动。

## 核心模型

基础 Bug 流程由五个能力技能和一个编排技能组成：

```text
resolving-tapd-work
  -> repairing-tapd-work
  -> submitting-tapd-for-test
  -> merging-tapd-work-to-master（可选）
```

`drafting-tapd-wiki` 是 `submitting-tapd-for-test` 复用的独立内容能力，也允许用户直接调用。`fixing-tapd-bug` 只负责编排。

技能通过结果契约组合，不使用全局、可变的 `TapdTaskContext`：

```text
TapdWorkDefinition
  -> ReviewedChange
  -> TestSubmissionResult
  -> MasterMergeResult（可选）
```

## 共同规则

- 每个技能声明输入、输出、外部副作用、阻断条件和内部验证。
- 固定项目、仓库和分支是硬约束，不是提示；事实不一致时阻断，不能自动换目标。
- 内部验证属于产生结果的技能，不暴露成独立技能。
- 内部验证使用隔离、只读子智能体，只返回 `验证通过` 或 `验证不通过：<原因>`，验证结果不落库。
- 验证不能替代范围、执行路径、合并和 Wiki 写入等用户授权。
- 外部写入前验证拟执行内容，写入后回读实际结果；验证后内容或目标变化时重新验证。
- 核心保证不能通过参数跳过，例如项目核对、测试、代码审核和读回验证。
- 业务差异使用命名策略，不为每个内部动作增加布尔开关。

## 技能设计

### `resolving-tapd-work`

回答“改什么、在哪个项目改、使用哪个分支”。

输入：

```text
tapd_url（必填）
fixed_project（可选）
fixed_repo_path（可选）
fixed_branch（可选）
branch_mode = AUTO | CREATE | REUSE_FIXED
scope_increment（可选）
```

功能：识别 Bug/Story/Task，读取详情、评论、附件、PRD/原型和动态字段；调用 `workspace-project-knowledge`；在精确仓库中恢复历史分支、MR、commit、raw 和测试证据；合成历史、最新 TAPD 与用户增量；生成上下文、项目和范围可信度；形成并确认范围。

固定参数只限制选择空间，不能跳过验证。输出 `TapdWorkDefinition`，其中包含工作项、证据与冲突、三类可信度、精确项目指纹、分支及其来源、恢复结论、包含/排除范围、历史策略、验收标准和用户确认。

### `repairing-tapd-work`

回答“如何产生已经测试并独立审核通过的代码变更”。

输入 `TapdWorkDefinition`。单独触发而缺少该结果时，必须调用 `resolving-tapd-work` 安全补齐，不能猜测。

功能：核对实际 Git root/remote/branch；更新 TAPD 为修复中或进行中；创建或复用 Worktree；确认实际路径；使用 Superpowers 规划和 TDD 实现；运行验证；生成证据；调用内部只读代码 reviewer。只有全部通过才输出 `ReviewedChange`。

### `drafting-tapd-wiki`

回答“如何从当前会话或显式结果生成经过语义验证、可直接复制的 TAPD Wiki Markdown”。

输入可以是当前会话、TAPD URL、`TapdWorkDefinition`、`ReviewedChange`、现有 Wiki 草稿或这些信息的组合。它生成 Wiki、使用内部只读 validator 检查格式和内容，最终只输出可复制 Markdown 或阻断原因。

该技能没有外部写入，不创建 Wiki、不修改 TAPD、不合并和不发布。

### `submitting-tapd-for-test`

回答“如何完成一次提测业务事务”。

输入 `TapdWorkDefinition`、`ReviewedChange` 和命名提测策略：

```text
STANDARD = 合并 develop + 更新 Bug 状态 + 生成并写入 Wiki + 发布测试版本
NO_WIKI  = 合并 develop + 更新 Bug 状态 + 发布测试版本
```

`STANDARD` 必须复用 `drafting-tapd-wiki`，展示完整草稿并获得用户确认后才写入和回读。`NO_WIKI` 不加载 Wiki 生成能力，并在结果中记录 `wiki = SKIPPED_BY_POLICY`，不能把缺失 Wiki 判为失败。

技能负责实际源/目标分支和 commit 列表确认、提交/推送/MR、合并 `develop`、TAPD 状态、测试版本发布，以及启用 Wiki 时的写入与回读。输出 `TestSubmissionResult`。

### `merging-tapd-work-to-master`

回答“如何把原修复分支合并到 `master` 并更新已有 Wiki 标记”。该能力按需调用，不是所有修复流程的必经步骤。

输入 `TestSubmissionResult` 和原修复分支。功能只包含：确认源分支、`master` 和实际提交；获得用户合并授权；合并后回读；如果存在并要求更新 Wiki，则标记已经合并并回读。

它不发布生产版本、不增加上线检查、不强制要求 Wiki、不额外修改 TAPD 状态。输出 `MasterMergeResult`。

### `fixing-tapd-bug`

接收 TAPD URL、可选项目/分支约束、`STANDARD | NO_WIKI` 提测策略，以及是否需要合并 `master`。

它只按声明的结果契约组合：

```text
resolving-tapd-work
  -> repairing-tapd-work
  -> submitting-tapd-for-test
  -> if requested: merging-tapd-work-to-master
```

任一能力阻断、验证失败或等待用户授权时立即暂停。编排技能不复制项目判断、开发、Wiki、提测或合并规则。

## 调用方式

```text
$zan-workflows:resolving-tapd-work <TAPD URL>
$zan-workflows:repairing-tapd-work <TapdWorkDefinition 或 TAPD URL>
$zan-workflows:drafting-tapd-wiki 根据当前会话输出可复制 Wiki
$zan-workflows:submitting-tapd-for-test 使用 STANDARD 或 NO_WIKI
$zan-workflows:merging-tapd-work-to-master <TestSubmissionResult>
$zan-workflows:fixing-tapd-bug <TAPD URL>
```

## 插件目录

只替换插件内的旧单体：

```text
plugins/zan-workflows/skills/
  resolving-tapd-work/
  repairing-tapd-work/
  drafting-tapd-wiki/
  submitting-tapd-for-test/
  merging-tapd-work-to-master/
  fixing-tapd-bug/
```

旧独立目录 `skills/tapd-workflow/` 不删除、不修改。每个能力技能的 validator/reviewer 和 references 留在该技能目录内，不作为插件技能暴露。
