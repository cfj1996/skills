# 阶段三：代码实现

## 目标

在 worktree 中按当前已确认的计划执行修改，优先复用 Superpowers 的实现与验证工作流。

## 工作内容

- 切换到正确的 worktree
- 创建 worktree 前必须先确认并记录基准分支，基准分支必须是 `origin/master`
- 分支命名使用 `{fixbug|feature}/{当前git用户名}.{日期}.{中文描述}-{short-id}`
- worktree 目录名使用 `./.worktree/{短的描述}-{short-id}`（目录位于目标项目根目录下 `.worktree`）
- 创建新分支并开始提交前，必须先调用 `gitlab-map` 的分支查询结果确认：
  - 当前工作分支名
  - 基线分支是 `origin/master`
  - 是否可继续提交
- 如果使用了 Superpowers 计划文档，结果必须写入对应计划文档中的“分支与合规检查”小节（见 [`references/gitlab-map.md`](gitlab-map.md)）
- 逐项实现修改
- 每次修改后运行相关测试
- 使用 Superpowers 的 TDD / 执行 / 验证能力沉淀实现过程，不额外维护 TAPD 专属实现摘要文件
- **如果本轮生成了 Superpowers 文档，提交代码时必须同步提交 `docs/` 下的相关文档（若被忽略需 `git add -f`）**

## 实施要求

- 最小化改动
- 不删除用户已有注释，除非它们错误
- 发现计划失配时，先修正计划再继续
- 提测 Wiki 和 Bug 评论写回前，先把同批次内容整理成单次确认稿
- 不额外创建 TAPD workflow 的本地过程产物

## 输出要求

- 变更文件、测试结果、未完成项都要记录清楚；记录方式优先复用 Superpowers 现有产物或对话总结
