# 开发执行子流程（内部阶段 4）

## 目标

在用户确认的分支和工作区中，拆解并执行 TAPD 任务。本阶段由“分支确认 -> 规划 -> 实现 -> 验证”四个子环节组成。

## 1. 分支确认（前置环节）

在修改代码前，必须按 [branch-worktree-strategy.md](branch-worktree-strategy.md) 完成分支策略确认和 `gitlab-map` 校验。

进入本阶段时必须已完成范围确认，并通过 TAPD MCP 写回状态：Bug 为“修复中”，Story/Task 为“进行中”。写回失败时不得继续创建/切换分支或修改代码。

## 2. 规划（Superpowers 路由）

根据阶段 1-3 采集的上下文和本轮范围，做场景判定并路由到对应 Superpowers 技能。

- **A. 修复 Bug**（TAPD 类型为 Bug 或缺陷修复）：`superpowers:systematic-debugging` -> `superpowers:writing-plans` -> `superpowers:test-driven-development`。
- **B. 开发需求**（Story/Task 或新增能力）：`superpowers:brainstorming` -> `superpowers:writing-plans` -> `superpowers:test-driven-development`。

**规划要点**：
- 规划必须包含：分析、相关文件定位、任务清单（单个任务建议 < 30 分钟）、测试策略。
- 规划中必须明确：合并到 `develop` 时需获得用户二次确认。
- 规划文件必须写入 `docs/{short-id}/`，例如 `docs/{short-id}/plan.md`、`docs/{short-id}/tasks.md`。
- Superpowers 生成的计划、执行、验证和收尾文档都必须写入 `docs/{short-id}/`，不得落在 `docs/superpowers/`、仓库根目录或临时目录。
- 若涉及接口对接，先用 `yapi-mcp` 补齐契约。

## 3. 实现与验证

- **环境准备**：使用 `superpowers:using-git-worktrees` 进入对应工作区。
- **目录规范**：在开始编写测试前，确保项目根目录下存在 `__test___/{short-id}/` 和 `docs/{short-id}/`。测试代码文件只能放在 `__test___/{short-id}/xxx.test.js` 或 `__test___/{short-id}/xxx.test.ts`；计划、验证、评审、截图和 Superpowers 过程文档只能放在 `docs/{short-id}/`。
- **流程总账**：`docs/{short-id}/raw.md` 必须在阶段 1 初始化，并在阶段 4 持续更新 TAPD id 与描述、需求/Bug 描述、单元测试、集成测试、流程进度和创建时间；修复时间在未完成前可记为“未完成/待填写”，阶段 8 清理前必须补成真实结果或明确阻塞原因。
- **任务执行**：有 subagent 能力时用 `superpowers:subagent-driven-development`，否则用 `superpowers:executing-plans`。
- **TDD 约束**：所有实现必须遵循 `superpowers:test-driven-development`（RED -> GREEN -> REFACTOR），提交时需附带 Superpowers 计划文档。
- **自动独立评审**：在完成代码实现与验证（Green 阶段）后，主 Agent 必须**自动发起**独立 Agent 评审（见 [reviewer.md](../references/reviewer.md)），无需等待用户针对评审动作的授权。主 Agent 禁止自行判定通过。
- **完成验证**：评审通过后，声称完成前运行 `superpowers:verification-before-completion`，展示真实命令输出。

## 4. 退出条件（Gate 4）

- [ ] 已按场景使用对应 Superpowers 技能并留有 TDD 运行报告和验证证据包。
- [ ] 测试代码文件已按规范存放于项目根目录的 `__test___/{short-id}/xxx.test.(js|ts)`。
- [ ] 计划、验证、评审和 Superpowers 过程文档已按规范存放于 `docs/{short-id}/`。
- [ ] `docs/{short-id}/raw.md` 已记录流程进度、单元测试、集成测试和创建时间；修复时间已记录真实结果，或在未进入清理前明确标记为“未完成/待填写”。
- [ ] 分支与 Worktree 合规，已通过 `gitlab-map` 校验。
- [ ] 测试证据中包含失败用例和修复后的通过结果。
- [ ] 已获独立评审 `REVIEW_PASSED`，评审意见已记录。
- [ ] 任务收尾：执行 `superpowers:finishing-a-development-branch`。

不满足任一条件时，停在阶段 4 并补齐，禁止进入阶段 5。
