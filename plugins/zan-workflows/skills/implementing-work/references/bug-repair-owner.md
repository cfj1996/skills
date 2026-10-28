# 修复中状态与处理人

本规则由 `preparing-work` 只读规划，`fixing-bug` 在原确认清单中展示，
`implementing-work` 获准后执行。仅适用于 Bug，不修改 Story/Task。

## 修复人员

- 优先使用本次明确指定的修复人员；否则核对 Bug 实际开发人员字段
  （标准字段为 `de`）与本次修复责任。通过当前空间成员/可分配账号证据
  核实准确 TAPD 账号。多人、缺失或责任冲突时保持 `PENDING`，不得猜测。
- `USER_NAME`、Git/分支作者、团队身份表都只提供身份线索，不能直接当作
  TAPD 账号或成员核实证据。不默认沿用测试人员、创建人或旧 `current_owner`。
- 内存 `repairOwner={account, workspaceId, source, evidence}` 记录一个已核实
  修复账号及来源；不修改 Bug 的 `de`、`te`、`reporter` 等原责任字段。

## 动作与授权

1. 优先处理 `CONTINUE` 且已 `待测试`：返回
   `SKIPPED_ALREADY_WAITING_TEST`，状态和处理人都保持原样，不因此要求补
   修复人员，也不把测试中的 Bug 重新分配给开发。
2. 其余 Bug 先读取准确 ID、当前 `status`、`current_owner`、实际开发人员字段，
   核实工作流映射及修复人员。
3. 只有状态为 `修复中` **且处理人为该修复账号**才返回 `NO_CHANGE`。
   已修复中但仍属于测试人员/其他人/无人处理时，仍需 `WRITE_ACTIVE`。
4. `WRITE_ACTIVE` 的完整 payload 必须同时包含
   `{id, status: <修复中实际状态码>, current_owner: <已核实修复账号>}`。
   在原初始清单的“TAPD 更新与修复记录”区块逐 Bug 用中文显示状态与
   准确处理人变更，账号来源及原始 payload 留在内部核验。若只是同一账号
   的分号/空白格式差异，显示“某某，保持不变”；真实变更才显示
   “原处理人 → 修复人员”。原清单确认同时绑定精确 payload，不增加确认。
   旧确认只有状态、没有处理人变更时，不能扩大为人员写入授权。
5. 写前刷新当前状态/处理人及修复人员来源，核对仍与确认事实一致；漂移
   或成员证据失效时停止写入并更新清单。使用 `tapd-mcp` 的一次
   `update_bug` 同时写入状态和处理人，不拆成两次更新。
   常规匹配由主代理依据真实来源、原中文预览/授权及下述 helper 检查，
   不额外派写前 Agent，不把脚本通过当作成员身份或人类授权。确有解释
   歧义才独立复核；缺证据/确证冲突仍阻断，不能由 reviewer 猜测放行。
6. 立即按准确 ID 读回 `status,current_owner`，两者都符合计划才能改业务源码。
   只有状态写入成功、处理人未变化或未读回时均 `BLOCKED`，保留已知实际
   效果，不自动回滚或重试。提测仍由原流程转给 `te`，为空时按原政策转给 `reporter`。

## 只读辅助脚本

在规划时，以及写前刷新后，运行
`scripts/bug-repair-status.mjs`（相对 `implementing-work` 目录）。输入仅通过
stdin 传递，不生成流程文件；脚本不调用 TAPD，不代表授权或成员身份真实。

```bash
node <implementing-work-dir>/scripts/bug-repair-status.mjs
```

计划输入包含 `entryType=bug`、`workspaceId`（正整数）、`entryId`（完整字符串 ID）、
`workMode=INITIAL|CONTINUE`、已核实 `activeStatus`/`waitingStatus` 状态码、
`current={id,status,current_owner}` 和上述 `repairOwner`。输出精确动作、旧状态/
处理人与 payload，供确认和写前校验；没有持久化或写入效果。

读回校验的 stdin 为 `{input: <原计划输入>, readback: <准确 Bug 读回>}`。
校验失败必须阻止源码编辑；`NO_CHANGE` 与政策跳过也需有当前状态/处理人
证据，但不需要写授权或私有写前 Agent 校验。部分账号读回不能算作成功。
