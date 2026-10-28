# MR review contracts

本技能服务具有合并权限的人员。交接使用当前会话内的数据包，不创建工作流状态文件，
不要求 TAPD、固定开发分支或交付 session。主代理拥有发现范围、事实核实及远程写入；
reviewer 只读审核一个准确 MR。

## 身份、处理关系与操作能力

三个事实分别记录，不互相推导：

| 事实 | 需要核实的内容 |
| --- | --- |
| 执行身份 | GitLab host、当前连接账号 id/username；多账号时使用本次已核实的账号 |
| 本人处理关系 | reviewer、assignee、待本人审批或明确交办的证据；有合并权限本身不是待办关系 |
| 操作能力 | 当前账号对准确项目、MR、受保护目标分支的 merge / approve 能力及读取时间 |

`mergePermission=allowed|denied|unknown` 表示执行账号当前能否向该目标合并。
优先使用当前 MR/目标的有效权限读回，并结合保护分支、项目规则及审批限制核实。
角色级别只作线索；不能仅凭 maintainer/owner、用户自述或另一个账号的权限填 `allowed`。
若 API 的 `can_merge` 混合了冲突、CI 等状态，保留原始依据，分别核实权限和对应门禁；
无法拆清时保持 `unknown`，不能把技术阻断简单归因为没有权限。

approve 能力单独记录，不能从 merge 能力或 MR 已获得审批推断。
`approval` 仅表示 MR 的审批要求是否满足，不表示当前账号能否批准，也不表示用户授权。
缺少权限不妨碍只读审核，不能把代码结论改成“不通过”。

## Project preflight packet

按 host/project 分组复用稳定事实；采用范围按实际受影响子项目分别建立。

| 内容 | 必需事实 |
| --- | --- |
| Identity | host、project id/path、准确仓库来源、执行账号 |
| Rules | 审核版本上适用的项目规则、继承范围、例外及来源版本 |
| Adoption | 各范围的 `adoptionScope/scopeEvidence`、文件事实、Zan 状态和审核模式 |
| Requirements | 项目明确要求的 pipeline、approval、discussion、验证和文档条件 |
| Context | 项目类型、适用专项；已有 `KnowledgeContext` 的来源/版本、证据和缺口 |
| Capability | merge / approve 的有效能力、目标范围、证据和读取时间 |

只有范围、规则、Adoption/Exception 及版本仍适用时才复用。MR 改规则文件、涉及新子项目，
或账号/目标改变时补查受影响事实；根文件没变不证明所有子项目可以共用结论。

## MR review packet

每个 MR 独立绑定准确 source/target，不能用同项目另一个 MR 的结论替代。

| 内容 | 必需事实 |
| --- | --- |
| MR | URL、iid、标题、作者、open/draft 状态、source/target branch 与 SHA |
| Change | 完整 changed files、diff、提交历史、关键上下文及实际影响的消费者 |
| Basis | MR 描述、讨论及准确关联 Issue/需求/设计/已确认反馈；目标、验收和排除范围 |
| Gates | mergeability、pipeline、approval、未解决讨论及项目要求；原始来源和读取时间 |
| Review | `ROUTINE|HIGH`、从 changed hunk 得出的风险依据、选定 reviewer |
| Documents | 适用文档正文、准确条目标识/指纹、适用性依据及缺口 |
| Mock | 当前完整源码清查、同 Plan/brief 的现有 Mock inventory、运行入口/绑定与隔离证据 |
| Gaps | 无法获取的事实及其具体影响；未命中或读取失败不是“不存在” |

无直接链接但项目要求提测 Wiki 时，只沿已核实 TAPD 工作项详情/评论定位已有页；
Task 核实父需求与共享页归属。普通项目无需补建 TAPD；检查其实际要求的 API、使用、
迁移或变更说明。NO_WIKI 只免除该 Wiki，不能免除其他适用文档。
确认无文档要求时使用有依据的 `NOT_APPLICABLE`；缺失、过期或适用性未知不能冒充豁免。
只读准确相关条目，Review 中不新建或修订文档，也不发布打回评论。

## Reviewer result

两个 reviewer 共用以下交接结构。主代理提供已核实的数据包，不让 reviewer 重跑公共发现，
也不提供其他 reviewer 的代码结论。代码线索仍须在当前审核 SHA 的源码核实。

```markdown
MR: <project>!<iid>
Review HEAD: <source SHA>
Review target: <target SHA>
Risk class: ROUTINE | HIGH | ESCALATE_HIGH
Review mode: ordinary | zan-enhanced | ordinary-with-zan-warning
Zan status: not-adopted | adopted | misconfigured | unknown
Code conclusion: 通过 | 不通过 | 未完成
Merge eligibility: 可合并 | 不可合并
Merge blockers: <none or precise blocker ids>
Change review: <changeReview with sourceSha, targetSha, documentHashes and evidenced scope/impact/documentation>
Main issue: <one-line summary>

Evidence:
- <reviewed file:line / diff / call path / gate evidence>

Zan Conformance (only for zan-enhanced; otherwise write "不适用"):
| Rule ID | Level | Changed evidence | Exception | Result | Verification |
| --- | --- | --- | --- | --- | --- |
| <ZAN-...> | MUST / SHOULD | <path:line or hunk> | <id/none> | pass / fail / warning / unknown | <command/output/source> |

Edge cases checked (HIGH only):
- <important boundary, failure or recovery case>

Reason:
- <why the evidence permits or blocks merge>

Suggested fix:
- <concrete fix direction, or "无阻断修复项">

Review comments (only when present):
- <必须修复 | 优化建议 | 需要重新设计 | 证据不足; evidence, impact, blocking decision and scoped action>

GitLab reply:
<简洁中文的 MR 自身可操作阻断说明；没有时写“无需打回说明”。这里只起草，不发送。>
```

reviewer 的合并资格是对当前 packet 的建议；主代理运行统一检查并刷新实时门禁后裁决。
同一 MR 有多份结果时，代码结论按“不通过 > 未完成 > 通过”保守合并；明确证据不足时
不能制造缺陷。超时/失败且主代理未完成等价审核时，保留 `code-review-incomplete`。
普通 reviewer 遇真实高风险信号返回 `ESCALATE_HIGH` 和未完成，交高风险角色继续。

## 合并判断与授权

`scripts/review-policy.mjs evaluate-merge` 输入当前 `mergePermission`、代码/安全/项目门禁、
Adoption、`changeReview/currentChange` 及完整 Mock 证据。详细字段见
[Zan reference 的合并判断输入](zan-conformance.md#合并判断输入)。
`mergePermission` 省略、未知、无权限或非法值均返回 `merge-permission` 阻断；
脚本不会查询权限，调用方必须依据当前账号/目标的真实读回归一化。

批准前使用 `evaluate-approve` / `evaluateApprovalReadiness`，同样携带上述当前证据，
另需 `approvePermission=allowed`；否则阻断 `approve-permission`。该检查允许已核实的
`approval=required-missing`，不伪造审批已满足；其余门禁仍保留，只返回 `approvalAllowed`。
批准写入必须绑定已审核的 `sourceSha`；不支持 SHA 绑定则阻断，不发送无 SHA 批准。
SHA 不匹配需刷新受影响审核，不自动重试。写后核对同一 MR 的 source SHA 与真实
审批状态再判断 `mergeAllowed`；版本漂移或读回不明不算已核验批准，不能将批准资格
当作合并资格。

代码结论、合并资格、操作授权保持独立。`mergeAllowed=true` 或 `approvalAllowed=true`
均不授权任何写入。
批准/合并还必须有当前会话对准确仓库、source/target、操作和目的的授权，按
[合并执行规则](merge-rules.md) 逐次刷新；不要为已有且匹配的授权重复提问。
