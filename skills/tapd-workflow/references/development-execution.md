# 开发执行子流程（内部阶段 4）

## 目标

在用户确认的分支和工作区中，拆解并执行 TAPD 任务。本阶段由“分支确认 -> 规划 -> 实现 -> 验证”四个子环节组成。

## 1. 分支确认（前置环节）

在修改代码前，必须按 [branch-worktree-strategy.md](branch-worktree-strategy.md) 完成分支策略确认和 `gitlab-map` 校验。

## 2. 规划（Superpowers 路由）

根据阶段 1-3 采集的上下文和本轮范围，做场景判定并路由到对应 Superpowers 技能。

- **A. 修复 Bug**（TAPD 类型为 Bug 或缺陷修复）：`superpowers:systematic-debugging` -> `superpowers:writing-plans` -> `superpowers:test-driven-development`。
- **B. 开发需求**（Story/Task 或新增能力）：`superpowers:brainstorming` -> `superpowers:writing-plans` -> `superpowers:test-driven-development`。

**规划要点**：
- 规划必须包含：分析、相关文件定位、任务清单（单个任务建议 < 30 分钟）、测试策略。
- 规划中必须明确：合并到 `develop` 时需获得用户二次确认。
- 若涉及接口对接，先用 `yapi-mcp` 补齐契约。

## 3. 实现与验证

- **环境准备**：使用 `superpowers:using-git-worktrees` 进入对应工作区。
- **任务执行**：有 subagent 能力时用 `superpowers:subagent-driven-development`，否则用 `superpowers:executing-plans`。
- **TDD 约束**：所有实现必须遵循 `superpowers:test-driven-development`（RED -> GREEN -> REFACTOR），提交时需附带 Superpowers 计划文档。
- **独立评审**：必须通过 `superpowers:requesting-code-review` 调用独立 Agent 评审（见 [reviewer.md](reviewer.md)），主 Agent 禁止自行判定通过。
- **完成验证**：声称完成前运行 `superpowers:verification-before-completion`，展示真实命令输出。

## 4. 退出条件（Gate 4）

- [ ] 已按场景使用对应 Superpowers 技能并留有 TDD 运行报告和验证证据包。
- [ ] 分支与 Worktree 合规，已通过 `gitlab-map` 校验。
- [ ] 测试证据中包含失败用例和修复后的通过结果。
- [ ] 已获独立评审 `REVIEW_PASSED`，评审意见已记录。
- [ ] 任务收尾：执行 `superpowers:finishing-a-development-branch`。

不满足任一条件时，停在阶段 4 并补齐，禁止进入阶段 5。
