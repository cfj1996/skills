# Fixing Bug Scope Checklist Design

## 目标

为 `zan-workflows:fixing-bug` 增加不可跳过的执行清单确认门禁。单个或多个 Bug 在任何写操作前，都必须先完成只读准备、展示项目/仓库、分支和修复范围，并获得用户确认。

`fixing-bug` 仍只负责编排；范围解析、项目与分支验证继续由 `preparing-work` 所有，后续实现、提测和上线继续由各自能力技能所有。

## 编排流程

`fixing-bug` 分成两个阶段：

```text
preflight: prepare every Bug -> show checklist -> wait for confirmation
execute:   implement each confirmed Bug -> submit -> optional go-live
```

### 预检阶段

1. 按输入顺序标准化并去重 Bug URL。
2. 对每个 Bug 调用只读 `preparing-work`，取得用于展示的预检快照。范围尚未确认时，快照可以保持 producer-owned `PENDING`，编排器不得把它提升为 `READY_FOR_HANDOFF`。
3. 在所有 Bug 完成准备前，不调用 `implementing-work`，也不执行建分支、修改 TAPD、写测试或改代码等写操作。
4. 将 producer 输出转换为精简、用户可读的执行清单，不暴露原始 handoff、validator 协议或 YAML/JSON。
5. 输出清单后暂停，等待用户明确确认。

单 Bug 输出一行，多 Bug 按执行顺序输出多行：

| Bug | 项目/仓库 | 分支 | 修复范围 | 待确认 |
| --- | --- | --- | --- | --- |

验收标准、置信度等内部信息默认不展示；存在歧义或阻断时，才在“待确认”中补充必要说明。

### 执行阶段

只有整份清单确认后，`fixing-bug` 才能进入执行阶段。每个 Bug 在调用 `implementing-work` 前，都必须重新只读调用 `preparing-work`，让 producer 根据当前会话确认和最新分支事实返回权威 `READY_FOR_HANDOFF`。项目/仓库、分支或修复范围与已确认清单不一致时，暂停并重新确认；编排器不得自行改写结果。

首次创建公共修复分支的 Bug 使用 `CREATE`；分支创建并读回后，后续 Bug 的执行前核验使用 `USE_EXISTING`。这样预检阶段无需提前创建分支，也不会把过期的 `CREATE` 结果传给后续实现。

后续 handoff 保持不变：

```text
TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult?
```

实施阶段继续按 Bug 顺序执行。单项实施失败时沿用现有策略：记录首个失败原因并继续后续已确认 Bug。范围发生实质变化时暂停，重新展示更新后的清单并等待确认。

## 确认语义

- 用户最初的“修复这些 Bug”只选择处理对象，不确认派生出的项目、分支和修复范围。
- 清单展示后的明确确认才允许进入执行阶段；确认只绑定用户可见的项目/仓库、分支和修复范围，不替代 producer 的执行前事实核验。
- 任一 Bug 的准备结果为 `PENDING` 或 `BLOCKED` 时，预检阶段不得产生写操作；用户补充信息或明确排除该项后，重新生成清单。
- `fixing-bug` 必须传播 producer 的暂停和阻断状态，不得将未确认结果提升为 `READY_FOR_HANDOFF`。
- “不暴露内部 handoff”只限制原始结构化对象，不得用于省略用户可读执行清单。
- 清单与确认只存在于当前会话，不增加 run ID、状态文件或恢复记录；会话中断后重新执行预检。

## 职责边界

- `preparing-work`：读取单个 TAPD 项目，派生范围，验证项目/仓库/分支，并返回 producer-owned 状态。
- `fixing-bug`：调用全部准备步骤、汇总执行清单、等待确认、传播终止状态并安排后续调用。
- `implementing-work`、`submitting-for-test`、`going-live`：保持现有业务规则和结果契约，不复制清单确认逻辑。

## 回归场景

1. 单 Bug：输出一行项目、分支、范围清单并暂停；确认前无写操作。
2. 多 Bug：所有 `preparing-work` 都完成后输出完整清单；首次写操作发生在整份清单确认之后。
3. 初始请求包含“修复这些 Bug”：不得将其当作清单确认。
4. 任一准备结果待确认或阻断：展示原因并保持全局只读。
5. 用户确认清单：逐项重新准备；字段一致且 producer 返回 `READY_FOR_HANDOFF` 后，按既有 handoff 进入实施阶段。
6. 已确认范围发生变化：暂停并重新确认更新后的清单。
7. 响应隐藏原始 handoff，但始终保留精简执行清单。

## 验证

- 先用本次会话对应的单 Bug/多 Bug 提示验证当前规则会跳过清单，形成行为基线。
- 修改 `fixing-bug` 的主说明、契约、工作流和验收场景，使上述回归场景通过。
- 运行 Skill 官方快速校验和 Plugin 官方校验。
- 检查 `preparing-work` 的 producer-owned 确认门禁未被复制、削弱或改写。
- 检查首个 Bug 创建分支后，后续 Bug 使用 `USE_EXISTING` 重新准备，不复用过期的 `CREATE` 快照。
