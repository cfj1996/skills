# 需求开发进度与下一步引导

## 判断原则

每次准备交回用户、暂停或阻塞时，先判断当前阶段的完成门禁：

- 当前阶段是 `PENDING|BLOCKED|FAILED`，或必需验证尚未通过：推荐“完善当前阶段”，禁止推荐提测、上线等下游动作。
- 当前阶段门禁已通过：推荐进入紧邻的下一阶段，同时提供“修改当前结果”和“暂停”选项。
- 用户要求修改已确认内容：重开最早受影响阶段，并明确哪些后续确认、Plan、实现或评审结论失效。
- 引导文字只是导航，不替代分支、写入、提交、MR、部署或上线所需的精确授权。

## 阶段与默认下一步

| 当前阶段 | 完成门禁 | 推荐下一步 | 可直接回复 |
| --- | --- | --- | --- |
| `DISCOVERY` | 项目、仓库、origin、`origin/master` 已唯一确认 | 收敛需求范围 | `继续分析需求范围` |
| `SCOPE_BLOCKED` | 仍有 `REQUIREMENT_BLOCKER` | 解决范围、行为或验收问题 | `解决需求确认项` |
| `SCOPE_READY` | 范围、排除项、验收和评审模式已形成 | 生成分支并展示统一清单 | `继续生成执行清单` |
| `IMPLEMENTATION_EVIDENCE_BLOCKED` | 需求可确认，但 API/字段/代码落点等仍阻塞实施 | 补齐技术证据或改为仅编写 Plan | `继续补齐实施证据` / `改为仅编写 Plan` |
| `AWAITING_CHECKLIST_CONFIRMATION` | 等待用户确认完整清单 | 确认或修改清单 | `确认执行` / `修改清单：...` |
| `BRANCH_READY` | 分支已创建/选定且读回匹配 | 编写 branch-bound Plan | `继续编写 Plan` |
| `PLAN_READY` | Plan 已确认、写入并读回 | 开始实施或仅保留 Plan | `开始实施` / `仅保留 Plan` |
| `IMPLEMENTING` | 尚有任务未完成 | 继续当前任务 | `继续实施` |
| `REVIEW_BLOCKED` | 实现或必需验证未通过 | 解决当前阻塞并重新验证 | `解决当前阻塞后继续验证` |
| `REVIEWED` | 所有项目均 `REVIEW_PASSED` | 进入提测流程或检查当前实现 | `提交测试` / `查看当前实现` |
| `SUBMITTED` | `TestSubmissionResult=SUBMITTED` | 按明确意图上线或暂停 | `上线` / `暂停` |
| `PAUSED` | 用户要求暂停 | 从记录的当前阶段恢复 | `继续需求开发` |
| `STOPPED` | 用户取消或工作已由他人接手 | 保留或按确认清理本地资源 | `检查并清理本地资源` |

`BRANCH_ONLY` 在 `BRANCH_READY` 结束，但仍提示可以继续编写 Plan。
`PLAN_ONLY` 在 `PLAN_READY` 结束，但仍提示可以开始实施。
`developing-requirement` 自身在 `REVIEWED` 结束；“提交测试”会进入
`zan-workflows:submitting-for-test`，不是本技能自动执行的隐式步骤。

## 阻塞决策

阻塞时必须区分：

- `CURRENT_STAGE_FIXABLE`：代码、Plan、验证环境或缺失证据仍属于当前范围。推荐先完善当前阶段。
- `SCOPE_CHANGE_REQUIRED`：修复会改变已确认范围。推荐“修改清单/Plan”，重新确认后再实施。
- `EXTERNAL_OWNER`：已由他人开发、外部依赖未就绪或用户取消。推荐暂停/停止，不继续下游流程。
- `DOWNSTREAM_READY`：当前阶段全部通过。只有此状态才推荐下一流程。

“部分定向测试通过但必需构建失败”仍是 `REVIEW_BLOCKED`，不能推荐提交测试；应给出修复验证环境、调整必需验证规则（需重新确认）或暂停三个相关选项。
存在 `REQUIREMENT_BLOCKER` 时使用 `SCOPE_BLOCKED`；仅存在
`IMPLEMENTATION_BLOCKER` 且请求实施时使用 `IMPLEMENTATION_EVIDENCE_BLOCKED`，不能把它们混成同一种“待确认”。

## 多项目进度

多项目时在总进度下增加项目表：

| 项目 | 分支 | Plan | 实施 | 验证/评审 | 阻塞 |
| --- | --- | --- | --- | --- | --- |

总阶段取最早未通过的必需阶段。一个项目已完成、另一个项目阻塞时，推荐处理阻塞项目，不能把整体标为 `REVIEWED`。

## 最终回复模板

每次最终回复必须包含以下四部分，字段可以精简但不能省略：

```markdown
## 流程进度
- [x] 项目定位
- [x] 需求范围
- [ ] 分支准备
- [ ] Plan
- [ ] 实施
- [ ] 验证与评审

当前阶段：`<stage>`
当前状态：`<READY|PENDING|BLOCKED|PAUSED|COMPLETE>`

## 推荐下一步
<一个明确推荐动作，以及为什么现在应做它>

## 你可以选择
1. `<相关动作>` — 回复：`<可直接复制的短句>`
2. `<修改当前结果>` — 回复：`修改范围/清单/Plan：...`
3. `<暂停或结束>` — 回复：`暂停`
```

不要列出当前不具备输入门禁的动作；不要只报告“成功”“完成”或“阻塞”而不给下一步。
