# 需求确认前检查清单

## 目的

在用户确认需求范围前，统一展示业务、交互、数据、接口、权限、状态和验收缺口，明确哪些问题必须先决定，哪些问题可以保留到 Plan 但会阻塞实施。清单属于 `SCOPE_REVIEW` 的只读产物，不写文件、不创建 Draft、不修改业务代码。

## 清单结构

每个缺失、冲突或已确认事实使用一行：

| 项目/模块 | 类别 | 检查项 | 状态 | 当前证据 | 责任方 | 影响 | 门禁 | 建议动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

- 状态：`CONFIRMED|MISSING|CONFLICT|NOT_APPLICABLE`。
- 责任方：`agent|user|product|backend|project-owner`；Agent 能查证的必须先查证，不能直接转交用户。
- 门禁：
  - `REQUIREMENT_BLOCKER`：范围、业务行为或验收无法确定，必须先解决才能确认需求；
  - `IMPLEMENTATION_BLOCKER`：需求语义已明确，但接口字段、代码落点等实施证据不足；允许确认需求，禁止进入实施；
  - `NON_BLOCKING`：已有证据或明确不适用。

## 必查类别

1. 项目与范围：受影响项目、页面/模块、包含项、排除项、跨项目边界。
2. 业务行为：触发条件、规则、边界、异常、默认值、角色差异。
3. 输入输出与数据字段：字段含义、来源、必填/可空、默认值、枚举、展示与提交关系。
4. UI 与交互状态：初始、加载、空态、错误、禁用、成功、重复提交和刷新回显。
5. API 与契约：消费点是否需要 API、正式来源、method/URL、请求/响应字段、状态码和错误语义。
6. 权限与安全：角色权限、敏感字段、数据范围、越权与审计要求。
7. 路由与状态：路由参数、页面/应用/会话状态归属、跨页面联动。
8. 验收与验证：可观察结果、关键场景、项目验证命令和缺失测试能力。

## 门禁判定

- 需求范围、业务规则、输入输出语义、用户可观察结果、关键验收标准存在 `MISSING|CONFLICT` 时，标记 `REQUIREMENT_BLOCKER`。
- API method、URL、请求/响应字段、类型、枚举、状态码、权限实现或代码落点缺失，但业务语义已经确定时，标记 `IMPLEMENTATION_BLOCKER`；需求可以确认，`implementationPlan.status` 必须保持 `blocked`。
- API 是否需要仍为 `unknown`、`required` 消费点未完成正式来源搜索或接口事实没有来源证据时，至少是 `IMPLEMENTATION_BLOCKER`；若缺失同时导致业务输入输出无法确定，则升级为 `REQUIREMENT_BLOCKER`。
- `none` 或 `NOT_APPLICABLE` 必须有证据，不能为了清空清单而填写。
- 不得猜测 method、URL、字段、类型、必填、可空、枚举、默认值、包装结构、状态码或 Schema。

只有 `requirement_blocker_count=0` 才能生成 `READY_FOR_CHECKLIST` 或 `CONFIRMED` 的范围结果。
只有 `implementation_blocker_count=0` 且其余实现门禁通过，Plan 才能标记为可实施。

## 展示方式

- `DIALOGUE`：在对话中展示完整缺口表，再展示范围/分支执行清单；两者合并为一次最终确认，不额外提问。
- `PANEL`：业务问题进入对应模块 `questions`；技术缺口进入折叠实现依据和 `implementationPlan.blockers`。统一提交后仍在执行清单中汇总阻塞数量和未解决行。
- 没有缺口时也展示摘要：`需求阻塞 0，实施阻塞 0`，不能静默省略检查。

确认后新增或变化的检查项按最早受影响阶段重开；`REQUIREMENT_BLOCKER` 使范围确认失效，`IMPLEMENTATION_BLOCKER` 保留需求结论但使 Plan/实施准备度回到 blocked。
