# 执行 Wiki 的保存与读回

脚本位于本技能的 `scripts/story-execution-wiki.mjs`。用 Node 调用并通过标准输入传入一个 JSON 对象；结果为标准输出的一行 JSON。沿用插件自带的 TAPD MCP 客户端和当前已配置的 TAPD 身份。工作项、Wiki、空间 ID 一律传字符串，保持长 ID 的精度。输入正文通过 JSON 序列化传送，保留换行和 Markdown 原始字节。

## 会话输出

选择会话模式时直接返回完整评审稿。程序化调用可使用同一脚本的 `SESSION` 和 `{"markdown":"<评审稿>"}`。该模式原样返回正文，在缺少工作项、Wiki 目录和 TAPD 连接时也能工作。

## 确认并保存

1. 在对话中审完范围和完整正文。取得工作项所在空间 `workspaceId`、完整 `storyId` 或 `bugId`（二选一）、用户选择的执行文档目录 `parentWikiId`、已核实的 TAPD 操作者 `actor`。一律从本次需求取值。
2. 调用 `node <技能目录>/scripts/story-execution-wiki.mjs PLAN`，新版 Story 输入 `{schema:4, workspaceId, storyId, parentWikiId, actor, markdown}`，Bug 用 `bugId` 替代 `storyId`。此模式验证正文、工作项、父目录、正式页和评论，返回 `operations`、`action`、`approval`、`fingerprint`、`wikiTitle`、当前 Wiki ID 及回链状态。新正式页使用 `MM-DD: 中文描述`，日期取首次保存预览时的北京时间，描述使用已读回的 TAPD 工作项标题。页名随预览确认，跨日保存沿用原日期。`ADOPT` 展示原草稿、差异、归档和改名动作，确认后原位转正。已有正式页按原页名和版本续接。
3. 向用户展示实际父目录、页名、新建或修订、版本和指纹（可展示可区分的前缀），以及本次确认的完整稿或相对原版的变更和完整稿入口。用户确认这一版和写入目标后，调用 `SAVE`，正文使用 PLAN 返回的 `markdown`。在原 PLAN 输入中附上原样的 `approval` 对象以及 `confirmedFingerprint`（PLAN 返回的完整 `fingerprint`）。原审阅后发生内容、父目录、身份或基版变化须重新预览。若 PLAN 已返回 `CONFIRMED/REUSE`，直接使用已读回的版本。
4. 成功后使用返回的 `wikiUrl` 和 `revision`。页内标记保存工作项类型、完整 ID、版本和确认指纹。日期格式页的 Wiki 备注提供固定工作项定位，供回链尚未写入时找回页面。已有回链则按 Wiki ID 核实归属。Story 回链使用 `需求开发执行文档：`，Bug 使用 `Bug 修复执行文档：`，后面紧跟准确 Wiki URL。首次在同一条评论附上 ` ｜ 执行计划版本确认：<wikiId>:r<版本>:<完整fingerprint>`，更版另行追加只有版本确认的纯文本评论。读回核对唯一的本版确认评论 ID、实际作者、Wiki ID 和指纹。Bug 修复记录及提测 Wiki 由各自交付流程维护。
5. 内容更版按[同步实施正文](#同步实施正文)执行。覆盖前在当前页下归档上版**包含全部当时进度**的原文，按版本和完整页 SHA-256 命名。归档读回后更新固定入口，原链接继续有效。

初次保存使用空执行记录。已有进展时核验实际源码、测试和交付证据，再由 `PROGRESS` 追加。修订后的执行者按当前版本和证据判断可复用成果。已经上线的旧版若进入新的实施周期，沿用原归档规则保留已交付的证据。

## 同步实施正文

后续需求或实现方案变化时，从同一正式页 `READ` 的完整 Markdown 起草，更新受影响的功能、接口、步骤和验收，保留执行记录。新版修订 `PLAN` 增加 `expectedPageSha256`，值取起草时 `READ` 的 `pageSha256`。遇到基版变化时重新读回并与最新正文合并，再预览差异。

按当前确认使用 `PLAN → SAVE → READ`，沿用原工作项和 Wiki。用读回的新 revision 和 approvalFingerprint 生成续接的 `START` 上下文，复用仍覆盖本轮动作的启动授权及有效回执。`PROGRESS` 用于追加已经发生的执行结果。

## 从正式页面开工

`READ` 输入 `{workspaceId, storyId, parentWikiId}` 或 `{workspaceId, bugId, parentWikiId}`。新会话也可以直接传 `{"wikiUrl":"<正式 Wiki 链接>"}`。脚本核实工作项、父目录、正式页与独立确认评论。`state: "CONFIRMED"` 表示确认版已读回。新版 `delivery` 为 `null`，需要在开工时提供选项。已完成的动作读 Markdown 执行记录，返回还包含页链接、版本、确认及正文指纹和功能范围。

- `bodySha256` 是用户确认时完整 Markdown 的 SHA-256。
- `planSha256` 绑定实施正文，文末执行记录属于可追加区域。旧版沿用顶部状态的原归一化算法。
- `pageSha256` 绑定读回的全页实际字节，包含版本元数据和现有进度。PROGRESS 使用这个值防止覆盖其他改动。

## 立即和手动开工

`START` 只读返回本轮选定的执行上下文。传正式 `wikiUrl` 和 `startMode`（IMMEDIATE 或 MANUAL）。立即执行传刚读回的 `expectedRevision` 和完整 `expectedApprovalFingerprint`，手动执行也按用户所指版本固定。新版由本次确认的 `startup.submit`、`startup.build` 及选中的分支、Job、Wiki 范围决定交付。仅开发验证用 `startup: {"submit":false,"build":false}`。将返回的 `tapdPlan` 原样交给下游。指纹绑定文档版本、选中 F 与当次启动选择。详细字段见[执行上下文](../../executing-tapd-plan/references/execution-context.md)。

## 进度回填

开工授权涵盖回填时，取得真实实施或交付回执后用 `PROGRESS` 追加执行记录。开发收尾通过后在交付前回填该轮结果。交付返回部分结果或用户要求暂停时，汇总已经核实的动作和下次续接所需的证据。回填暂不可用时，在会话中报告对应的证据引用和缺口，已获准的后续动作按各自前提推进。

```json
{
  "workspaceId": "123",
  "storyId": "111230010000101",
  "parentWikiId": "111230010000201",
  "expectedApprovalFingerprint": "<READ 返回的完整 approvalFingerprint>",
  "expectedPageSha256": "<READ 返回的完整 pageSha256>",
  "progressAuthorized": true,
  "receiptId": "P1.F1.review.01",
  "entry": "P1-M1-F1 开发收尾通过，覆盖本功能验收",
  "evidence": "本次源码 SHA、适用的未提交差异指纹、验收编号及结果、独立评审的可读来源"
}
```

`entry` 和 `evidence` 各占一行。按实际取得的结果选取以下内容。使用新会话能定位的脱敏引用，例如原会话的具体结果、GitLab MR 或 Jenkins Job 与队列 ID。

| 回执 | 足以续接的依据 |
| --- | --- |
| 实施、验收或开发评审 | 所覆盖的 F/TC，实际仓库和原分支，基准与源码 SHA，有未提交改动时记录其指纹。保留测试命令或场景、结果、必要联验及可核实的独立评审来源。 |
| Git 与构建 | 原分支推送 SHA、MR 与实际目标分支、合入的交付 SHA。构建记录 Job、队列 ID 或构建号、交付 SHA 和参数指纹，用原 Jenkins 回执核对实际参数。 |
| 文档与登记 | 提测 Wiki ID 及正文指纹、对应回链或修复记录评论 ID、工作项登记的实际读回。 |
| 暂停或部分完成 | 已核实的结果、下一待办和实际阻塞，含可能已发送但还需读回的操作及其目标。 |

同一个实际事件使用同一个回执 ID，内容相同可重放。按[续接位置](../../executing-tapd-plan/references/executing.md#新会话从哪里继续)复核当前证据。启动时的交付选择仍随开工指令传递。只有旧版格式支持原 `executionStatus` 字段。

## 未知写入和并发

- SAVE 中断后，将原 SAVE 输入用于只读 `CHECK`。它返回 `CONFIRMED`、`WIKI_VERIFIED_LINK_PENDING` 或 `UNVERIFIED`。已确认则完成；正文已核实但缺回链或独立确认评论，使用原 SAVE 恢复。未核实先检查同名页、准确父级、已有回链和原页内容。PROGRESS 中断则 READ 并核验同一 receiptId 的完整记录。
- 为防止超时或进程退出后重复发起写入，脚本在首次发送前将无正文、无凭据的操作键写入 `${XDG_STATE_HOME:-~/.local/state}/zan-workflows/story-execution-writes/`。明确的 TAPD 权限或参数拒绝返回 `WRITE_REJECTED` 并释放本次占用，修正后可重试。超时或含义不明的失败保留原占用。在同一状态目录复跑时，脚本优先采用远端读回；已发送、结果仍不明确的步骤返回 `UNKNOWN_WRITE`。保留状态目录，待服务端确认结果。跨机器恢复先做只读核验；其他机器没有原本的发起记录。
- TAPD 的整页更新不提供原子条件写入。脚本在写前复读完整原页、写后再复读结果。在多用户或多机器同时编辑时，应串行保存。若发现指纹不一致或重复页/评论，保留所有现有记录，重新核对后继续。
