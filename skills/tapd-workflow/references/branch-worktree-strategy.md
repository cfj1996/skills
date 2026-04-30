# 分支与 Worktree 策略

## 目标

在代码修改前完成分支策略确认、工作区准备和基线合规校验。

## 二次确认动作

执行者只能建议，必须等待用户二次确认后再操作。用户确认结果必须是以下三类之一：

- `新建分支 + worktree`
- `切换/复用已有分支`
- `切换/复用已有分支 + 新 worktree`（仅在用户明确要求隔离时）

## 策略建议口径

- 首次处理独立线上 Bug：通常新建 Bug 分支
- 线上 Bug 再次修复：复用已有 Bug 分支
- 需求开发后的缺陷修复：复用需求分支

## 记录字段（必填）

- 场景类型：`新建分支`、`复用线上 Bug 分支`、`复用需求分支`
- 用户二次确认结果
- 当前 TAPD `short-id`
- 复用分支时的原关联 TAPD / Story / Bug 线索
- 分支名和工作区路径（新建 worktree 时记录 worktree 路径）
- 来源分支：`origin/master` 或用户明确指定的功能分支
- 新建或复用原因
- `gitlab-map` 校验结果

## 命名与路径

- Bug 分支：`fixbug/{git-user}.{YYMMDD}.{slug}-{short-id}`
- Story 分支：`feature/{git-user}.{YYMMDD}.{slug}-{short-id}`
- 新建 worktree 路径：`./.worktree/{短描述}-{short-id}`（目标项目根目录下）

## 合规校验

- 提交前必须使用 `gitlab-map` 校验基线、复用关系和可继续提交状态
- 新建分支来源不合法时必须停止；如果来源是 `origin/develop`，必须废弃该分支并从合法来源重建
- 复用分支关联关系不清时必须停止，先确认该分支仍承载当前 TAPD/需求
