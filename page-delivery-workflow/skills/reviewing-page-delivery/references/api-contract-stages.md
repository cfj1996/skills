# API 契约阶段

## 正式来源搜索顺序

先按项目规范声明的入口搜索正式来源；未指定时依序检查 YApi、OpenAPI、Query Contract、`defineQuery`，再检查项目规范声明的其他正式契约入口。记录已搜索来源和当前可验证契约事实。

评审只记录 API 业务目的、触发、读写、请求响应语义和关键状态；区分“不涉及接口”与“需要接口但缺少正式契约”。不得猜 method、URL、字段、参数位置、类型、必填、可空、枚举、默认值、包装结构、媒体类型、状态码或 Schema。

## reviewing 阶段

`reviewing-page-delivery` 不得生成 Draft OpenAPI，也不得将交付单元设为可实施。它仅评审、呈现冲突并在用户确认更新 Plan 后回写评审范围内的事实。

## 后续 planning 阶段

后续 planning 只有同时满足下列门禁才可生成 Draft：

1. 已确认确实没有正式契约，且业务语义已经确认。
2. method、URL、参数位置、请求与响应媒体类型、状态码、安全要求及 Schema 等机器事实已全部确认。
3. Draft OpenAPI 位置、命名和编号已由适用项目 `AGENTS.md` 或其委托规范唯一确认；不得使用插件默认目录。
4. Draft operation、功能点、任务和 Plan API 编号已建立双向关联。

任一门禁缺失或冲突时，仅报告缺口和候选证据并等待用户确认，不生成 Draft。
