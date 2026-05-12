# gitlab-map 使用约定

## 适用时机

- 代码提交前：确认当前开发分支创建基线。
- MR 输出或创建前：确认目标分支、源分支和源分支保留策略。
- 提测 Wiki 生成前：确认当前分支提交已同步到 `origin/develop`。

## 使用要求

- 仅接受 `gitlab-map` 返回的判定结果，禁止本地 `git` 命令替代。
- 校验结果需保存到 `iteration-{N}/task-plan.md` 的
  `分支与合规检查` 小节，记录：
  - 当前分支名
  - 校验时间
  - 基线分支
  - 是否通过
  - 未通过原因与修复建议
- MR 方向和源分支保留策略需记录到 `iteration-{N}/task-plan.md` 或 `impl-summary.md`：
  - `source_branch`
  - `target_branch`
  - `remove_source_branch=false` / `should_remove_source_branch=false`
  - 如果已有 MR 开启删除源分支，必须记录已关闭或停止原因

## 不通过处理

- 基线校验未通过：停止提交流程，要求按 `origin/master` 重建分支。
- MR 源分支删除策略未通过：停止输出、创建、更新或合并 MR，直到确认 `remove_source_branch=false` / `should_remove_source_branch=false`。
- 未合并校验未通过：停止提测 Wiki 创建，要求先合并到 `origin/develop`。
