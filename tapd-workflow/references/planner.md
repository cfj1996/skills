# 阶段二：任务规划

## 目标

读取 `item-context.md` 和当前轮次的 `change-request.md`，拆解成可执行任务并生成 `task-plan.md`。

## 任务要点

- 判断 Bug / Story 和当前轮次
- 做根因或方案分析
- 规划可执行任务，单个任务尽量 30 分钟内完成
- 搜索代码库，定位相关文件和入口
- 创建 worktree 前必须先确认并记录基准分支，基准分支必须是 `origin/master`，并在计划中写明 `base_branch`（`origin/master`）
- 分支命名使用 `{fixbug|feature}/{当前git用户名}.{日期},{中文描述}-{short-id}`
- worktree 目录名使用 `./.worktree/{短的描述}-{short-id}`（目录位于目标项目根目录下 `.worktree`）
- 新分支提交前必须先调用 `gitlab-map` 的分支查询结果确认：
  - 当前工作分支名
  - 基线分支是 `origin/master`
  - 是否可继续提交
- 结果必须写入 `task-plan.md` 中的“分支与合规检查”小节（见 [`references/gitlab-map.md`](./gitlab-map.md)）
- 若涉及接口对接，按 `yapi-workflow` 处理
- 如果后续需要创建 Wiki、更新 Bug 评论或改状态，先把这些写入动作汇总成一个待确认批次

## 输出要求

- 包含分析、相关文件、任务清单、测试策略和风险评估
- 任务必须具体可执行
- 首个任务优先验证根因假设
- 规划里要明确：MR 只输出链接，不代建、不代合并；目标分支默认 `develop`
- 不覆盖上一轮的 `task-plan.md`
