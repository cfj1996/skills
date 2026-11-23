# 执行 Wiki 的保存与读回

脚本位于本技能的 `scripts/story-execution-wiki.mjs`。用 Node 调用并通过标准输入传入一个 JSON 对象；结果为标准输出的一行 JSON。沿用插件自带的 TAPD MCP 客户端和当前已配置的 TAPD 身份。工作项、Wiki、空间 ID 一律传字符串，保持长 ID 的精度。输入正文通过 JSON 序列化传送，保留换行和 Markdown 原始字节。

## 会话输出

选择会话模式时直接返回完整评审稿。程序化调用可使用同一脚本的 `SESSION` 和 `{"markdown":"<评审稿>"}`。该模式原样返回正文，在缺少工作项、Wiki 目录和 TAPD 连接时也能工作。

## 确认并保存

1. 在对话中审完范围和完整正文。取得工作项所在空间 `workspaceId`、完整 `storyId` 或 `bugId`（二选一）、用户选择的执行文档目录 `parentWikiId`、已核实的 TAPD 操作者 `actor`。一律从本次需求取值。
2. 调用 `node <技能目录>/scripts/story-execution-wiki.mjs PLAN`，Story 输入 `{workspaceId, storyId, parentWikiId, actor, markdown}`，Bug 用 `bugId` 替代 `storyId`。此模式验证正文结构、按类型精确读取工作项、父目录、固定标题子页及该工作项评论，返回实际写入动作列表 `operations`、`action`、`approval`、`fingerprint`、当前 Wiki ID 和回链状态。Story 固定页名为 `需求执行计划 · <完整Story ID>`，Bug 为 `Bug 修复计划 · <完整Bug ID>`。原条目已有唯一执行文档回链时，按 ID 读取原页并核实空间、父目录、正文条目链接和完整 ID，需求改名沿用原页。没有回链时，已有旧格式的「〈条目标题〉｜需求执行文档」（Bug 为「〈条目标题〉｜Bug 修复执行文档」）时，按父目录、正文链接与完整工作项 ID 核对归属。`ADOPT` 预览须展示原页、差异、归档及改名动作。确认后将草稿原文归档，再在原 Wiki ID 保存首个正式版本，原链接继续有效。
3. 向用户展示实际父目录、页名、新建或修订、版本和指纹（可展示可区分的前缀），以及本次确认的完整稿或相对原版的变更和完整稿入口。用户确认这一版和写入目标后，调用 `SAVE`，正文使用 PLAN 返回的 `markdown`。在原 PLAN 输入中附上原样的 `approval` 对象以及 `confirmedFingerprint`（PLAN 返回的完整 `fingerprint`）。原审阅后发生内容、父目录、身份或基版变化须重新预览。若 PLAN 已返回 `CONFIRMED/REUSE`，直接使用已读回的版本。
4. 成功后使用返回的 `wikiUrl` 和 `revision`。固定页包含完整 Markdown，首行隐藏元数据记录版本、目标和确认指纹。只在选定的工作项添加一条固定页回链。Story 评论标记使用 `需求开发执行文档：`，Bug 使用 `Bug 修复执行文档：`，后面紧跟准确 Wiki URL。首次在同一条评论附上 ` ｜ 执行计划版本确认：<wikiId>:r<版本>:<完整fingerprint>`；更版另行追加只有版本确认的纯文本评论。读回核对唯一的本版确认评论 ID、实际作者、Wiki ID 和指纹。Bug 的修复记录按交付流程另行维护。提测 Wiki 的评论属于另一个流程。
5. 内容更版时，从 READ 的完整 Markdown 起草，保持原执行记录，展示变更并对新版执行 PLAN/SAVE。覆盖前会在当前页下归档上版**包含全部当时进度**的原文，按版本和完整页 SHA-256 命名，读回成功后才更新固定入口。原页始终可直接执行。原页或归档存在手工改动时核对差异，保留现场，不能强制覆盖。

初次保存的「执行状态」为「待执行」，执行记录为空。已有开发进度的工作项在开工时核验历史代码、测试和交付证据，通过 PROGRESS 回填。开发中的修订沿用现有状态与完整记录。已上线的 rN 若修订了执行范围，PLAN 展示 rN+1「待执行」和空的本版记录。确认后原正文、上线状态及证据进历史页，正式链接按新周期记录开工、验证和上线。

## 从正式页面开工

`READ` 输入 `{workspaceId, storyId, parentWikiId}` 或 `{workspaceId, bugId, parentWikiId}`。新会话可以直接传 `{"wikiUrl":"<正式 Wiki 链接>"}`。脚本从链接读取页面，解析工作项类型和 ID、核实父目录，再校验实际工作项、确认评论和正式页 ID。归档或尚未确认的人工草稿可回到收集阶段只读检查。完整返回包含 `state: "CONFIRMED"`、`wikiId`、`wikiUrl`、`revision`、`approvalCommentId`、`approvalFingerprint`、`bodySha256`、`planSha256`、`pageSha256`、`markdown`。正式页、对应工作项唯一回链、该项上的独立版本确认评论、正文哈希及结构均需读回成功。

- `bodySha256` 是用户确认时完整 Markdown 的 SHA-256。
- `planSha256` 绑定执行正文，归一化受管的顶部执行状态；最后的执行记录属于可追加区域。
- `pageSha256` 绑定读回的全页实际字节，包含版本元数据和现有进度。PROGRESS 使用这个值防止覆盖其他改动。

## 立即和手动开工

`START` 只读返回选定交付上下文。传正式 `wikiUrl` 和 `startMode`（IMMEDIATE 或 MANUAL）。立即执行传本次联合确认并保存的 `expectedRevision` 和完整 `expectedApprovalFingerprint`；手动执行若指明 rN 或指纹，同样钉住该版本。仅打开页面用 READ。START 不创建 MR、不触发构建。按当前开工指令把其 `tapdPlan` 交给下游只读 PLAN，与实际参数一致就按原授权继续，不必换一次人工确认。详见[执行上下文](../../executing-tapd-plan/references/execution-context.md)。

## 进度回填

当本次开工授权已涵盖进度回填，取得真实回执后调用 `PROGRESS`，例如：

```json
{
  "workspaceId": "123",
  "storyId": "111230010000101",
  "parentWikiId": "111230010000201",
  "expectedApprovalFingerprint": "<READ 返回的完整 approvalFingerprint>",
  "expectedPageSha256": "<READ 返回的完整 pageSha256>",
  "progressAuthorized": true,
  "receiptId": "P1.F1.start.01",
  "entry": "P1-M1-F1 已按确认范围开始开发",
  "evidence": "本轮确认的开工指令及实际分支核验回执编号",
  "executionStatus": "开发中"
}
```

`entry` 和 `evidence` 各占一行，写清范围和可查证来源，可带证据链接。脚本在文末 `## 执行记录` 内追加一行。相同回执及内容可以重放，内容不同则阻止写入。可选 `executionStatus` 只允许保持原状态，或由「待执行」进入「开发中」、由「开发中」进入「已上线」。由执行者核实开工授权；更新至「已上线」时核实全部适用项目的上线结果。是否提测、是否构建沿用确认选项，实际提交、构建、发布结果逐项进入执行记录。证据中只写脱敏引用。

## 未知写入和并发

- SAVE 中断后，将原 SAVE 输入用于只读 `CHECK`。它返回 `CONFIRMED`、`WIKI_VERIFIED_LINK_PENDING` 或 `UNVERIFIED`。已确认则完成；正文已核实但缺回链或独立确认评论，使用原 SAVE 恢复。未核实先检查同名页、准确父级、已有回链和原页内容。PROGRESS 中断则 READ 并核验同一 receiptId 的完整记录。
- 为防止超时或进程退出后重复发起写入，脚本在首次发送前将无正文、无凭据的操作键写入 `${XDG_STATE_HOME:-~/.local/state}/zan-workflows/story-execution-writes/`。明确的 TAPD 权限或参数拒绝返回 `WRITE_REJECTED` 并释放本次占用，修正后可重试。超时或含义不明的失败保留原占用。在同一状态目录复跑时，脚本优先采用远端读回；已发送、结果仍不明确的步骤返回 `UNKNOWN_WRITE`。保留状态目录，待服务端确认结果。跨机器恢复先做只读核验；其他机器没有原本的发起记录。
- TAPD 的整页更新不提供原子条件写入。脚本在写前复读完整原页、写后再复读结果。在多用户或多机器同时编辑时，应串行保存。若发现指纹不一致或重复页/评论，保留所有现有记录，重新核对后继续。
