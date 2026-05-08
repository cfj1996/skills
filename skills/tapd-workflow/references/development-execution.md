# 开发执行子流程

## 子流程顺序

必须按以下顺序执行，不得跳过：

1. 分支确认子流程
2. 规划子流程（Superpowers 路由）
3. 实现子流程
4. 验证子流程（评审）

## 反伪造执行（Anti-Fake Execution）

**禁止伪造执行**：
- 严禁通过简单地在根目录（或任何非法路径）直接创建 `plan.md`、`tasks.md`、`verification.md` 并自行编造内容来“冒充”已经执行了 Superpowers 工作流。这些文件必须是真实执行过程的留痕。
- 严禁仅输出“使用 Superpowers”、“进入 Superpowers 阶段”然后直接退化为普通快速 Bug 修复模式。
- 严禁自行判定代码逻辑并给出 `REVIEW_PASSED`（必须走独立评审机制）。

**严禁借口跳过流程**：
- 技能中提及的 `invoke_agent` 或特定 `superpowers:*` 工具若在当前平台环境下调用报错或未找到，**必须明确报告真实错误并停止流程等待修复，严禁以此为借口跳过该子流程**。

## 失败恢复与越界回滚协议

如果在执行过程中，发现已经跳过了某一个子流程（例如代码改动已经发生，却发现尚未执行测试或未通过 `PRE_EDIT_GATE`），必须：
1. 立即停止提交/合并/写回动作。
2. 在当前对话中列出“已越界的动作”。
3. 强制退回到最近一个未满足的门禁节点。
4. 补齐证据（如先回退代码或先补齐失败测试证明）后再继续推进。

## 开发证据产物（Superpowers 审计要求）

阶段 4 必须生成 Superpowers 证据包，这是完整流程的硬性要求：

- **强制路径**：必须存放在目标仓库当前工作区的 `docs/tapd-workflow/{short-id}/` 目录下。**绝对禁止存放在仓库根目录。**
- **规划强制检查单（必须体现在 plan.md 中）**：
  1. 当前已加载/调用了哪个 Superpowers 技能（名称）？
  2. 为什么选它（基于前置场景的判定理由）？
  3. 该技能的关键规则是什么？
  4. 该子流程的退出条件是什么？
- **必需文件**：
  - `plan.md`：包含上述检查单、方案、影响范围、测试策略和退出条件。
  - `tasks.md`：任务清单、执行顺序、状态追踪。
  - `verification.md`：真实运行的验证日志、前后对比证据、`REVIEW_PASSED` 独立评审结论。
- 未生成上述规范证据包时，`PRE_EDIT_GATE` 必须判为 `BLOCKED`。

## 分支确认子流程

- 代码修改前必须完成分支策略二次确认、工作区就绪和 `gitlab-map` 校验。
- 二次确认结果只能是：`新建分支 + worktree`、`切换/复用已有分支`、`切换/复用已有分支 + 新 worktree`。
- 新建分支来源只能是 `origin/master` 或用户明确指定的功能分支；禁止 `origin/develop`。
- 详细规则见：[branch-worktree-strategy.md](branch-worktree-strategy.md)

## 规划子流程（Superpowers 路由）

- 完成“分支确认子流程”后再做场景判定，再选择 Superpowers 技能，严禁只写一句“进入规划”。
- 场景 A：需求不清、方案存在分歧或需要先对齐验收口径  
  - 使用 `superpowers:brainstorming`，随后使用 `superpowers:writing-plans`。  
  - 退出条件：方案取舍和验收口径明确，可落地为执行计划。
- 场景 B：Bug / 异常排查，根因不明确  
  - 先使用 `superpowers:systematic-debugging`。必须有清晰的系统排查、假设提出和证伪过程。
  - 根因明确后补 `superpowers:writing-plans`。  
  - 退出条件：复现路径、真实根因证据、修复假设和验证路径齐全。
- 场景 C：根因或方案已清晰，进入实现编排  
  - 任务可拆且互不阻塞：`superpowers:subagent-driven-development`。  
  - 任务强串行依赖：`superpowers:executing-plans`。  
  - 退出条件：任务清单、执行顺序和责任边界明确。
- 场景 D：涉及接口联调或外部契约  
  - 先使用 `yapi-mcp` / `yapi-workflow` 补充接口上下文，再回到 A/B/C 路由。  
  - 退出条件：接口字段、入参出参和错误口径纳入计划。
- 必须将选定的方案、强制检查单和退出条件写入 `docs/tapd-workflow/{short-id}/plan.md`。

## 实现子流程

- 在确认后的工作区中执行；新建分支使用新 worktree，复用已有分支默认使用已有工作区。
- 实现前必须已存在并更新 `docs/tapd-workflow/{short-id}/tasks.md`。
- 实现内部必须遵循 `superpowers:test-driven-development`（测试驱动：先写出证明失败的测试或验证步骤，再进行修复）。
- 改动必须限制在 `本轮处理` 范围内。任何范围外的随手重构将被视为违规。
- 提交信息必须是中文 Conventional Commits，且与证据文档一并提交。

## 验证子流程（评审）

- 声称完成前必须运行 `superpowers:verification-before-completion`。
- 必须将验证命令、**真实运行日志/报错的前后对比**写入 `docs/tapd-workflow/{short-id}/verification.md`。
- **强制独立评审（反自我包庇机制）**：
  - 负责编码的 Agent **绝对禁止**自行判定“代码走查通过”。
  - 必须使用 `invoke_agent` 委托独立的子 Agent（或按照环境内 `mr-code-reviewer` 的设定）进行盲审。
  - 若 `invoke_agent` 无法使用，必须停下来，明确要求用户（或团队中的其他评审者）提供独立的 Review 通过证据。
- 只根据当前范围、当前计划/证据和本次 diff 做独立评审。
- 只有获取到明确的 `REVIEW_PASSED` 结论后，才允许进入下一主阶段（即合并或写 Wiki 阶段）。
