# 开发执行子流程

## 子流程顺序

必须按以下顺序执行，不得跳过：

1. 分支确认子流程
2. 规划子流程（Superpowers 路由）
3. 实现子流程
4. 验证子流程（评审）

## 分支确认子流程

- 代码修改前必须完成分支策略二次确认、工作区就绪和 `gitlab-map` 校验。
- 二次确认结果只能是：`新建分支 + worktree`、`切换/复用已有分支`、`切换/复用已有分支 + 新 worktree`。
- 新建分支来源只能是 `origin/master` 或用户明确指定的功能分支；禁止 `origin/develop`。
- 详细规则见：[branch-worktree-strategy.md](branch-worktree-strategy.md)

## 规划子流程（Superpowers 路由）

- 完成“分支确认子流程”后再做场景判定，再选择 Superpowers 技能，不得只写“进入 Superpowers”。
- 场景 A：需求不清、方案存在分歧或需要先对齐验收口径  
  - 使用 `superpowers:brainstorming`，随后使用 `superpowers:writing-plans`。  
  - 退出条件：方案取舍和验收口径明确，可落地为执行计划。
- 场景 B：Bug / 异常排查，根因不明确  
  - 先使用 `superpowers:systematic-debugging`。  
  - 根因明确后补 `superpowers:writing-plans`。  
  - 退出条件：复现路径、根因证据、修复假设和验证路径齐全。
- 场景 C：根因或方案已清晰，进入实现编排  
  - 任务可拆且互不阻塞：`superpowers:subagent-driven-development`。  
  - 任务强串行依赖：`superpowers:executing-plans`。  
  - 退出条件：任务清单、执行顺序和责任边界明确。
- 场景 D：涉及接口联调或外部契约  
  - 先使用 `yapi-mcp` / `yapi-workflow` 补充接口上下文，再回到 A/B/C 路由。  
  - 退出条件：接口字段、入参出参和错误口径纳入计划。
- 最小产出：
  - 场景判定结果和技能选择理由
  - 影响范围（模块/文件/接口）
  - 测试策略（覆盖原失败路径与修复后路径）
  - “验证后合并到 `develop`”预期
- 参考：[planner.md](planner.md)

## 实现子流程

- 在确认后的工作区中执行；新建分支使用新 worktree，复用已有分支默认使用已有工作区。
- 计划可拆成独立任务时，优先 `superpowers:subagent-driven-development`。
- 不适合并行时，使用 `superpowers:executing-plans`。
- 实现内部遵循 `superpowers:test-driven-development`。
- 改动必须限制在 `本轮处理` 范围内。
- 如果本轮实际生成了 Superpowers 文档，提交代码时必须一并提交相关文档。
- 提交信息必须是中文 Conventional Commits。
- 参考：[implementer.md](implementer.md)

## 验证子流程（评审）

- 声称完成前必须运行 `superpowers:verification-before-completion`。
- Bug 修复必须覆盖原始失败路径和修复后路径。
- 只根据当前范围、当前计划/证据和本次 diff 做评审。
- 只有结论达到 `REVIEW_PASSED` 后，才允许进入下一主阶段。
- 参考：[reviewer.md](reviewer.md)
