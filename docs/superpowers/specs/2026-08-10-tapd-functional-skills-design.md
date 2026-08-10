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
- 内部验证使用隔离、只读子智能体，只返回 `验证通过` 或 `验证不通过：<原因>`；producer 边界立即映射为 `NOT_RUN | VALIDATION_PASSED | VALIDATION_FAILED` 和规范化业务原因，raw verdict 不进入结果契约或编排 history。
- 验证不能替代范围、执行路径、合并和 Wiki 写入等用户授权。
- 外部写入前验证拟执行内容，写入后回读实际结果；commit、push、MR 创建/更新和 merge 的首写前及每次执行前都重读不可变事实并验证精确 payload/授权，验证后内容、目标或 ref 变化时重新展示、授权和验证。
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

`fixed_branch` 在三种模式中都是不可替换硬约束：`AUTO+fixed_branch` 只能恢复或创建该精确分支；`CREATE` 必须携带 `fixed_branch`、保留为精确 `branch_to_create` 且绝不返回 `RESUME`；`REUSE_FIXED` 必须携带并只检查精确 ref。resolver 使用唯一终止模型 `READY_FOR_HANDOFF | PENDING | BLOCKED`，响应 marker 与其一致，并为非 handoff 状态提供 `blocker_reason`。

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

在任何 commit/push/MR create-or-update/merge 前，私有 `PRE_FIRST_WRITE` 验证仓库、source/target/ref、精确 diff/commits、操作 payload 与授权，并在每次执行前重读；变化即重新展示、授权和验证。技能不维护跨调用事务状态：每次调用都先读取外部目标的真实状态；精确效果已存在时展示回读并经用户确认后标记 `ADOPTED_EXISTING_EFFECT`、不重复写，确定不存在时才以 fresh 授权和验证执行一次新写入，无法判断时阻断。合并回读后，保留独立的 `PRE_SUBMISSION_WRITE` 验证 Wiki/TAPD/version 计划，最终使用 `POST_WRITE` 验证实际效果与 readback。三个阶段都只持久化公共映射状态。

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

恢复时按 `pause.capability` 唯一路由，复用所有更早且未变化的产物并只调用暂停 producer；resolver 只在 resolver 暂停或显式 resolver-owned scope/identity 改变时重跑。非 resolver 的本轮授权以绑定 capability、operation、原文、时间和 scope hash 的 `authorization_increment` 仅传给暂停 producer，由 producer 自行复核；“继续”不构成授权。上游产物替换只失效并重跑依赖它的下游后缀，未受影响的前缀保持不变。

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
