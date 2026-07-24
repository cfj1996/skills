# 页面交付评审规范

## 项目规范发现、启动与规则门禁

先从启动锚点识别项目、App 或模块，并读取目标路径适用的最近 `AGENTS.md` 及其明确委托的规范。显式业务上下文优先；项目规范、用户结论和已有事实冲突时，必须展示冲突，不得静默选择。PRD 与原型存在冲突时，必须单独识别、报告并等待确认，不得任选其一作为实现基线。

项目级范围必须拒绝：候选范围若包含没有共同独立实施、对接和验收边界的多个页面或模块，要求按该边界拆分为一个或多个页面/内聚模块 Plan。

Plan 和 Draft OpenAPI 位置只能来自适用项目 `AGENTS.md` 或其委托规范。规则明确且无冲突时直接复用；不得提供默认目录。规则缺失、冲突或作用域不唯一时，只读收集候选，并提出下列完整字段：

```markdown
## 页面交付产物规则

- Plan 路径模式：<项目确认的模式>
- Draft OpenAPI 路径模式：<项目确认的模式>
- 交付单元命名：<页面和模块命名规则>
- 编号规则：<序号来源和格式>
- 路径变量：<项目、App、业务域等变量来源>
- 既有文件：<复用或迁移门禁>
```

确认位置规则不等于确认更新 Plan。未经用户确认不得固化。通过一次确认：用户确认完整候选后，必须固化至最近适用公共作用域的 `AGENTS.md`，随后重新读取该规则，并验证 Plan 和 Draft 位置能够唯一解析，才能继续启动确认；不得自动迁移已有文件。启动确认前保持只读：不生成评审卡、不创建 Plan、不生成 Draft、不修改项目文件。

## 证据与评审卡

按证据优先级核对：适用项目规范与明确委托规范、用户已确认业务事实、正式契约来源、PRD、原型、已有 Plan/Draft 与仓库惯例。仓库惯例只能作为位置规则候选，不是正式规则。无法可靠定位的证据只说明原因，不猜测选择器或事实。

每张临时评审卡均包含：临时卡片编号、评审域、关联的 Plan 功能点/API/UI 状态/页面依赖/任务/证据编号、来源证据、评审目标、设计方案、页面区域、布局和组件、交互状态、关联 API、Mock 场景、验收标准、用户结论和用户备注。卡片是会话临时数据，不是独立长期记录。

运行时只接受批准的 canonical `ReviewSession`。会话字段为
`schemaVersion`、`sessionId`、`deliveryUnitKey`、`deliveryUnitKind`、
`artifactRuleFingerprint`、`artifactRuleResolution`、`reviewRound`、
`planFingerprint`、`submissionVersion`、`mode`、`currentCardIndex`、
`viewScope` 和 `cards`。卡片字段为 `id`、`dimension`、`links`、
`sourceEvidence`、`reviewGoal`、`design`、`regionAndComponents`、
`interactionStates`、`relatedApis`、`mockScenarios`、
`acceptanceCriteria`、`conclusion`、`userNote`、`reviewResult`、
`reopened`、`evidenceChanged`；普通业务扩展 `telepath` 可选。
`links` 只包含 features/apis/uiStates/dependencies/tasks/evidence 六组编号，
`sourceEvidence` 只包含有类型的 id/kind/label/selector/frameSelector/path。
未知会话、卡片、结果字段不得进入 state、草稿或 submission。

固定评审维度：

1. 页面定义
2. URL、路由与参数
3. UI 布局
4. 组件与功能实现方案
5. 功能点与业务规则
6. 交互状态
7. API 设计
8. Mock 设计
9. 权限与安全
10. 路由、会话及跨页面状态
11. 验收步骤和证据

组件与功能实现方案必须以适用项目规范、依赖和现有边界为准；无法确定组件体系或规范冲突时标记为阻塞，评审阶段只形成设计，不写业务代码。

## 轮次与确认

首次全量生成全部评审维度；后续复评默认仅处理未评审、待修改、阻塞、重开项和证据变化项，已确认或不适用项保留结论。统一提交评审后，冻结本轮输入、核对证据并展示冲突、拟处理方式和 Plan 变更摘要；用户逐卡核对后，仍须单独点击确认更新 Plan 才能一次性回写同一 Plan。

这是两阶段确认：产物位置规则确认与确认更新 Plan 相互独立。确认更新 Plan
必须先由用户在最终结果卡上进行浏览器可信点击，生成绑定 session、submission
版本和双指纹的一次性内部请求；脚本触发的 click/dispatchEvent、缺失请求、
过期请求、跨 session/version/fingerprint 请求和重复消费都必须拒绝。
pending 请求不得通过 state 或 submission 暴露，并在新结果、重新挂载、销毁
或身份变化后失效。写入前重新读取 Plan 并比对 Plan 内容指纹和产物位置规则
指纹；任一变化或冲突均停止覆盖、展示冲突并等待用户决定。
