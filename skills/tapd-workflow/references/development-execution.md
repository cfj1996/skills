# 开发执行子流程

## 适用范围

阶段 4「开发执行」用于以下工程任务：Bug 修复、新需求开发、行为变更、重构、测试/构建失败修复、性能排查、接口联调。

## 核心规则

开发阶段统一使用 `superpowers` 工作流中的相关技能完成。基于阶段 1-3 采集到的 TAPD 条目类型和「本轮处理范围」，只分两条路径：

### A. 修复 Bug

适用：TAPD 条目为 Bug，或 Story/Task 在本轮范围内被定性为缺陷修复（含测试打回、构建失败、性能问题、线上异常）。

入口技能：`superpowers:systematic-debugging` → `superpowers:writing-plans` → `superpowers:test-driven-development`。

### B. 开发需求

适用：TAPD 条目为 Story/Task，或 Bug 在本轮范围内被定性为行为变更/新增能力。

入口技能：`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:test-driven-development`。

### 两条路径共用的后续技能

- 进入实现工作区：`superpowers:using-git-worktrees`，遵循 [branch-worktree-strategy.md](branch-worktree-strategy.md) 的企业分支约束（来源只能是 `origin/master` 或用户指定分支，禁止从 `origin/develop` 切）。
- 执行实现计划：有 subagent 能力时用 `superpowers:subagent-driven-development`，否则用 `superpowers:executing-plans`。
- 评审：`superpowers:requesting-code-review`，必须独立评审，主 Agent 不得自行 `REVIEW_PASSED`。
- 完成前验证：`superpowers:verification-before-completion`，须有真实命令输出作证据。
- 收尾：`superpowers:finishing-a-development-branch`，由用户选择 merge / PR / keep / discard。

### 路径选择前提

- 阶段 1-3 的采集结论（TAPD 类型、`本轮处理`、`本轮不处理`）必须已经写入上下文，再据此选 A 或 B。
- 接口联调先用 `yapi-mcp` 补齐契约，再进入对应路径。

## 与 TAPD 工作流的对接

- 评审子 Agent 必须只读，禁止 commit / push / 创建 MR / 合并；细则见 [reviewer.md](reviewer.md)。
- 所有“完成 / 测试通过 / 评审通过”的声明必须能追溯到真实命令输出、真实 review 输出或真实 diff。
- 不为了“审计留痕”创建额外文件；Superpowers 设计文档与实现计划遵循其默认路径，证据默认保留在对话、终端日志、PR 描述中。

## 退出条件

阶段 4 通过的标志：

- 已按场景使用对应 Superpowers 技能并留有真实证据。
- 工作区合规，baseline 已运行。
- 实现已通过 TDD（RED → GREEN → REFACTOR）。
- 已获独立评审 `REVIEW_PASSED`。
- 已通过 `superpowers:verification-before-completion` 的真实验证。

不满足任一条件时，停在阶段 4 并补齐证据，禁止进入阶段 5。
