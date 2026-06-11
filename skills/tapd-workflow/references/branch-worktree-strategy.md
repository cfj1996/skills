# 分支与 Worktree 策略

## 目标

在代码修改前完成分支策略确认、工作区准备和基线合规校验。

## 二次确认动作

执行者只能建议，必须等待用户二次确认后再操作。

**强制前置动作**：在给出分支建议前，必须先调用 `gitlab-map` 的 `get_branch_status` 校验目标复用分支或 `origin/master` 的基线状态，确保建议基于最新的仓库事实。

**命名预计算门禁**：新建分支或新建 worktree 前，必须先根据“命名与路径”规则计算并展示：

- `expected_branch_name`
- `expected_worktree_path`
- 命名来源：TAPD 类型、`git-user`、`YYMMDD`、`slug`、`short-id`

用户确认必须针对具体分支名和具体 worktree 路径生效，不能只确认抽象策略。

用户确认结果必须是以下三类之一：

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
- `expected_branch_name` 和实际分支名
- `expected_worktree_path` 和实际工作区路径（新建 worktree 时记录 worktree 路径）
- 命名校验结果：`PASS`、`FAIL` 或 `REUSE`
- 来源分支：`origin/master` 或用户明确指定的功能分支
- 新建或复用原因
- `gitlab-map` 校验结果

## 命名与路径

- Bug 分支：`fixbug/{git-user}.{YYMMDD}.{slug}-{short-id}`（其中 `{slug}` 必须使用中文简述）
- Story 分支：`feature/{git-user}.{YYMMDD}.{slug}-{short-id}`（其中 `{slug}` 必须使用中文简述）
- 新建 worktree 路径：`./.worktrees/{slug}-{short-id}`（必须在当前项目根目录下创建，禁止在用户目录等外部路径创建；`{slug}` 必须使用中文简述）。
- **多任务并行隔离**：在创建 worktree 前，必须检查路径是否已存在。若路径已被其他正在进行的 TAPD 任务占用，必须通过增加后缀（如 `-v2`）来确保路径唯一，严禁在同一个 worktree 中混合处理多个不相关的 TAPD 任务。
- **脏工作区建议**：处于阶段 4 确认分支策略时，若发现当前工作区有脏改动，应建议用户优先使用 `新建分支 + worktree` 策略以实现物理隔离，避免污染基线或受无关改动干扰。

## 执行偏移校验

- 新建分支后，必须立即校验实际分支名等于 `expected_branch_name`；不一致时必须停止，记录 `FAIL`，不得继续改代码、提交或合并。
- 新建 worktree 后，必须立即校验实际路径等于 `expected_worktree_path`；因路径冲突增加后缀时，必须在用户确认前重新展示新的 `expected_worktree_path`。
- 复用已有分支时，命名校验结果记录为 `REUSE`，不按新建分支模板反向要求重命名；但必须记录复用分支、复用来源和复用原因。
- `docs/{short-id}/raw.md` 中的分支与合规检查必须同时记录 expected、actual 和校验结果，禁止只记录最终实际值。

## 合规校验

- 提交前必须使用 `gitlab-map` 校验基线、复用关系和可继续提交状态
- 新建分支来源不合法时必须停止；如果来源是 `origin/develop`，必须废弃该分支并从合法来源重建
- 复用分支关联关系不清时必须停止，先确认该分支仍承载当前 TAPD/需求
