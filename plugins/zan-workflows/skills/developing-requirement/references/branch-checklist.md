# 需求分支规则

分支动作由 preparing-work 核实，创建由 implementing-work 或明确 BRANCH_ONLY
操作执行。清单排版和确认边界统一使用
[执行确认清单](../../../references/execution-checklist.md)，本文件只定义分支事实。

## 名称与作者

新 Story/Task 分支使用工作区 git-safety 规则：

```text
feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>
```

- 在每个仓库运行 `scripts/resolve-branch-owner.mjs --cwd <仓库根目录>`。
  当前工具用户级提示词的 USER_NAME 非空时，传 `--user-name <USER_NAME>`；
  也可用 `--user-prompt-file <当前工具实际提示词路径>`，不扫描其他工具配置。
- 作者依次来自 USER_NAME、`git config user.name`、本机用户名，不使用邮箱
  前缀或硬编码姓名。保留中文、规范化不安全分隔符，记录返回 source；无法
  生成安全值时才请求作者标识。
- MMDD 是首次确认清单的 Asia/Shanghai 月日，确认后不重算；短 ID 必须是真实
  TAPD 展示编号，中文描述来自需求，不翻译成英文 slug。
- 用 `git check-ref-format --branch <完整分支名>` 核验，并检查作者/日期/中文
  描述规则。用户指定名称冲突时展示差异，不静默替换。
- CONTINUE 复用已证实原分支，不因日期或新命名规范重命名。创建 child Task
  不改变原 Story/所选 Task 的分支，不按 Task 重复建分支。

示例：`feature/alice.0918.1080800.供应商分账限制`。
无 TAPD 的仓库维护遵守工作区命名规则，但不进入本 Story/Task 工作流。

## 只读预检

1. 核实项目/子项目、仓库根、origin、当前分支与工作区状态。
2. 获取并验证本轮远端基准，记录准确 `origin/master` ref/SHA。
3. 核实精确名称的本地/远程 refs 及祖先关系。两端一致，或本地包含远端且
   领先内容属于已确认范围或已接受的既有基线时，可 USE_EXISTING 并绑定准确本地 tip。
   远端领先、分叉或范围不明时先返回差异，不自动推送、重置或变基。
   仅有一端时按 preparing-work 核实该端；都不存在才计划 CREATE。
4. 只形成预检快照；不切分支、写 Task/Plan 或修改业务源码。复用先前足够的
   项目/TAPD/原型证据，写前只刷新可变 refs 与其他被改变的事实。

内部保留准确仓库、origin、原分支/HEAD、base ref/SHA、完整目标分支、动作、
用途及对应确认。用户表内显示新建/复用、完整目标名和基准 ref；不重复打印
内部证据。Story/Task 的状态动作始终为 NOT_APPLICABLE_NON_BUG。

## 确认与执行

范围、分支、必要 Task/Plan 内容共同确认。需求确认与实施准备分别判断；
需求问题未解决不询问执行，IMPLEMENT 还需所有实施阻塞解除，或用户明确
改成 PLAN_ONLY。BRANCH_ONLY 只要求分支条件，不索取未来实施方案。

写前复核授权绑定；范围、人员/工时、目标路径、方案、base 或分支实质变化
展示受影响差异后再执行。排版变化和同一分支 CREATE 后转 USE_EXISTING
不重复确认。清单已批准的系统 ID/链接回填沿用任务/Plan 保存规则。

CREATE 使用：

```text
git switch --no-track -c <完整目标分支> <已验证的基准ref/SHA>
```

随后读回仓库、当前分支、HEAD 和工作区；不先设置 upstream 再取消。
USE_EXISTING 直接选择准确原分支并读回，不要求存在当前 Task 的历史提交。
