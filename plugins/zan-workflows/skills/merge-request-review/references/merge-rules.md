# 合并执行规则

用户要求批准/合并时读取执行规则；审核裁决只需读取“当前变更和 Mock 复核”一节。
主代理持有写入职责；reviewer 不写 GitLab。
发现和只读审核不自动触发 approve、merge、评论、文档写入、部署或分支清理。

## 操作授权

人类使用者具有合并权限、执行账号当前可合并、当前会话授权本次操作，是三个独立条件。
先将已确认的请求对应到准确仓库、MR、源分支、目标分支、操作和目的，遵守已加载工作区
Git 规则。用户说“审核通过就合并”可以覆盖匹配范围的审核和合并，不要求审核完再问一次。
只有对象/操作/目的缺失或发生实质变化时才补充确认；已有授权不能移到另一个 MR。

| 请求 | 本轮可执行的动作 |
| --- | --- |
| 列出 / 审核 / 给出能否合并 | 只读发现或审核，返回判断 |
| 合并指定 MR / 审核通过就合并 | 完成必要审核和门禁后合并；不附带独立 approve 写入 |
| 批准 / approve | 核实准确操作授权、当前 approve 能力及统一门禁后批准；不隐含合并 |
| 批准并合并 | 对授权覆盖的准确 MR 分别执行两项写入，各自写前复核 |

项目需要额外批准但本轮未授权 approve 时，列明缺少的动作或审批人；不能以“合并”
为由自行替用户审批。受自批限制或角色限制时沿真实要求处理，不绕过审批。
若请求缺少既有审核，先完成同一 MR 的审核。明确跳过代码审核不豁免安全、权限、
Mock、范围/影响/文档、适用治理和实时 GitLab 门禁，也不伪造“审核通过”的记录。
本技能以 `codeReview=pass` 作为写入门槛；没有仍有效的等价审核时，不 approve/merge，
说明缺少当前版本审核依据。

批准前使用 `scripts/review-policy.mjs evaluate-approve`，额外传当前
`approvePermission=allowed`。该检查保留安全、代码、merge 权限、CI、讨论、治理、
变更一致性和 Mock 门禁，但允许已核实的 `approval=required-missing`，因为本次批准
正是为了满足该条件；未知审批状态仍阻断。它只返回 `approvalAllowed`，不返回可合并结论，
不得把 approval 手改为 approved 绕过检查。批准请求必须传入已审核的 source SHA；
批准后核对同一 MR 的当前 source SHA 和真实审批状态，再运行
`evaluate-merge`；审批条件仍未满足就不能合并。

## 分支和实时门禁

每次 approve 和 merge 前读取：

- 当前执行账号、准确项目/MR、仍为 open 且非 draft/WIP 的状态；
- 源分支、目标分支和最新 source/target SHA；目标仅 `master` 或 `main`；
- 当前账号对受保护目标的有效 merge 能力；approve 写入还须核实独立 approve 能力；
- mergeability/conflict、项目要求的 pipeline、approval、未解决讨论与适用规则；
- 审核版本、实际范围依据、适用文档条目指纹及当前完整 Mock 清查。

`develop` 同时包含工作区约定的 `dev` 别名，核实真实 ref 和历史。
禁止 develop/dev 作为源分支合并到任何目标；禁止提交历史包含来自 develop/dev 的
合并记录。发现时阻断 `safety` 并给出具体历史证据，不仅凭分支名称搜索或 MR 标题判断。
安全违规可使审核停在未完成；已有充分代码结论仍保留，不仅凭历史判代码不通过。

source SHA 与审核记录不一致时暂缓该 MR，审核当前增量并刷新受影响证据；
不把旧“通过”迁移到新版本。target SHA、规则、文档或清查范围变化时，核对变化影响并
刷新对应检查；整页无关条目变化不自动推翻代码结论，写入防覆盖仍按适用整页指纹处理。
账号或保护规则变化时刷新操作能力；每个 MR 完成后核查下一个 MR 的当前状态，
不能因为一批来自同项目就使用批次开始时的目标 SHA 直接连合。

缺权或权限 unknown 使用 `merge-permission` 阻断；批准能力不足另报 `approve-permission`。
冲突、draft、缺审批、CI 等各自报告原因，不用“有合并权限”覆盖项目门禁。
项目未要求 pipeline 时，none 仅表示未观察到；failed、读取失败及项目要求而未满足的
pipeline 按统一规则阻断。若需要等待 pipeline，写前再次读取 refs 和门禁，不安排
脱离当前审核版本的延迟自动合并。

## 当前变更和 Mock 复核

所有模式遵循 [变更与文档一致性](../../../references/change-consistency.md) 和
[Mock 规范](../../../references/mock-development.md)。未采用 Zan、无 TAPD/Wiki、普通 CI
成功、用户说跳过审核，都不能豁免。没有当前完整源码/差异证据时，只读审核可继续，
不能给可合并结论或执行 approve/merge。

只读准备准确源码并运行共享 [Mock 检查](../../../scripts/mock-safety.mjs)。
清查完整待交付差异、运行入口和绑定，复用同 Plan/brief 已有 `mockModules`；
生产范围仍有 Mock、退役仅改标签/开关、或隔离依据不足均阻断。
已证明仅用于开发且排除生产运行/构建的 fixture 可保留 MOCK-* / MOCK_ONLY 标识。
源码检查不冒充未来制品检查；实际发布仍走 Jenkins 先检后发和当次制品门禁。

构造 `currentChange`：准确 `sourceSha/targetSha`、`sourceRepository`、`targetBranch`、
操作 `purpose`、当前完整清查的 `scopeFingerprint`，以及范围文档/条目的指纹。
`mockSafety` 或单项 `mockSafeties` 的 `baseSha` 必须等于当前 target SHA，
范围指纹必须匹配。连同 reviewer 的 `changeReview`、当前 `mergePermission` 和其他门禁
传给 `scripts/review-policy.mjs evaluate-merge`；批准操作改用 `evaluate-approve`，
并携带独立 `approvePermission`。

两项命令及导出的 `evaluateMergeReadiness` / `evaluateApprovalReadiness` 均异步执行
统一 `checkMockSafetySet`，重新核实
来源版本/内容、完整范围和实际配置；必须等待真实返回。缺项、fail、unknown、版本变化
或 `mock-safety` 阻断都不放行。手填 pass、空列表、旧回执、confirmed=true 或 Promise
不能代替实际结果。测试 Mock 授权不能放行本技能的 master/main 生产目标。

只有对应操作的统一门禁通过，且当前操作另有准确授权/能力，才执行相应写入。
approve 后仍需重新读取审批和门禁；成功批准不是已经合并。

## 执行与失败处理

优先 GitLab MCP；遵守共享 [工具路由](../../../references/tool-routing.md)。
`approve_merge_request` 必须传 `sha=当前已审核 source SHA`，不能仅凭写前读回
推断写入仍针对相同版本。工具不能绑定 SHA 时阻断批准，不退化为无 SHA 请求。
SHA 不匹配时停止，刷新当前增量审核与门禁；不自动重试批准。批准写后读回同一
MR 的 source SHA 和真实审批，版本变化或无法核实则不报告已核验批准，不继续合并。
merge 调用在工具支持时传当前审核 SHA，并设置 `auto_merge: false`、
`should_remove_source_branch: false`。不自动删除源分支，也不切换用户工作区分支。

用准确 MR 读回 `state: merged`、`merged_at`、`merge_commit_sha` 确认成功。
工具超时、断连或写入结果不明确时，先读回该 MR 的真实状态；未核实前不重试写入、
不声称成功。不把“请求已接受”、approve 成功或排队自动合并当作已合并。
MCP 不可用或接口失败时返回准确阻塞；只有用户明确允许等效 GitLab API fallback，
才用 REST 执行合并。浏览器不作为绕过权限或工具禁用的路径。

冲突时停止该 MR 的合并，不在原分支直接修冲突。只有经核实为当前操作者创建的 MR，
且另有准确授权时，才可进入工作区规定的 `A -> C -> B` 冲突流程；审核别人 MR 不顺带
改代码、替换 MR 或关闭原 MR。普通合并失败可继续其他独立 MR；账号、授权范围或
公共规则失效时，停止所有受影响写入。

合并结果按 [报告格式](report-format.md) 返回；草拟的 GitLab 回复仅供使用者决定是否发送。
