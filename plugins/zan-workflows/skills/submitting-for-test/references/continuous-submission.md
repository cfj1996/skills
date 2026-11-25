# 应用连续提测

一个完整 Bug 或同一 Story 及所选 Tasks 使用 workflow-session 的 `action=submit`。
一次规划全部应用仓库，由现有 Git、Jenkins、Wiki 和登记 helper 按回执推进。
计划和回执留在会话内存。包发布、同仓多 Job、冲突中转分支按提测技能的相应步骤处理。

## 来自执行中的 TAPD Plan

START 返回 CONTINUOUS_SUBMIT 时，首个 submit PLAN 原样带 START 返回的 `tapdPlan`。新版引用同时绑定 Wiki 版本、功能范围、当次 `startup` 及其指纹。PLAN 读回正式页并核对本次逐仓 Git 操作、测试 Job 与参数。主代理核实匹配后，使用同一次授权和本次 planId 执行。无构建传 release=null。仅构建时 release 的 PLAN 与 EXECUTE 使用同一引用。旧格式或已确认的会话稿按完整当前清单核对已有授权。

START 返回 DELIVERY_STEPS 时直接用本技能现有逐项路径。通常是同仓多个 Job、独立工具包/构建、同仓不同分支或多仓不同操作目的。按 gitProjects 去重提交推送和合并，再按 buildProjects 为每个 Job 执行一次 release，沿用各项目自己的目的。业务源在合入目标前后分别绑定已审源码与真实交付回执。逐项 merge、release、wiki、registration 的 PLAN/EXECUTE 都传同一 tapdPlan；先核对实际工作项归属、模板与授权，再处理公共提测 Wiki、Bug 修复记录及适用登记。全部所选仓库、构建回执和跨仓验收均就绪后才登记整项完成。只读刷新失败或写入结果不明时保留既有效果。每项调用的 confirmed 都映射同一次开工指令，不逐项询问用户。

逐项 Wiki 和登记执行时带各仓 gitDeliveryReceipts。从本次会话已接受的测试队列核对全部选定 Job；尚缺回执会返回 `AWAITING_PLAN_BUILDS` 和缺少的 P 编号，自动去执行剩余构建，再续办原动作。同一次会话重复派发完全相同的 Plan 构建请求时复用已接受回执。跨会话可把从原进度恢复的确切队列回执作为 `planBuildReceipts` 传入；在当前冻结契约和 Jenkins 队列或历史构建读回通过后才复用，原提测登记的 Git/Wiki 门禁同时适用。

整项 Wiki、Bug 修复记录和登记执行前均核验 gitProjects 的全部 Git 回执。缺项返回 `AWAITING_PLAN_GIT` 和待补 P 编号，当前步骤零写入。每份回执绑定 origin、源分支、目标分支、源 SHA 和交付 SHA。同仓不同分支分别提供回执和 Mock/评审依据，同 SHA 可能重合时在各份证据写清 sourceBranch、targetBranch。已选测试 Wiki 时，以本次写入的真实回执（或恢复时的 wikiReceipt）再次核对工作项上的回链与正文。逐项 Bug 用 `action=repair-record` 发表已审记录，再 `registration` 登记。局部授权只完成其 Git/Job 和进度回填。

独立 Job 没有对应合并回执时，`reviewedBuildSources` 以 P 编号映射本轮已核实的构建 SHA，例如 `{"P2":"<本轮实际 SHA>"}`。同会话可复用该项目当轮真实构建的源码绑定；跨会话用当前 ReviewedChange 和真实 ref 核实。旧队列仅证明发生过构建，需与本轮实际源码、Job、冻结参数一并匹配。

Plan 测试构建按工作项版本、Job、仓库、ref、SHA 和参数识别同一次派发。本机在 `${XDG_STATE_HOME:-~/.local/state}/zan-workflows/plan-builds/` 只保存摘要键、Jenkins 队列标识及按需核对的流水线指纹，支持同机新会话恢复。换机器时，沿用原执行记录的 `planBuildReceipts`。先核实冻结参数、当前源码、队列或历史构建，再复用。派发结果未知时，先取得实际队列证据；保留既有 MR 与成功回执。运行中在提交、推送、MR、Jenkins、Wiki 和 TAPD 的实际写入前复核当前确认版本，版本变化则停止剩余操作。

`NEEDS_CONFLICT_RESOLUTION` 表示已经读回原 MR 的真实冲突，回执包含原 MR、A 的 SHA 和已选的 C/工作位置。按[冲突处理](../../../references/conflict-merge.md)转入受限的 A→C→B 流程，复核操作者身份和权限。替代 MR 合并后发送 `PLAN {resumePlanId, conflictResolution:{branch, mrIid, reviewedSha, reviewEvidence}}`。它只读核对替代 MR 及 A/C 在同一交付 SHA 的包含关系。用同一计划 ID 继续 EXECUTE，复用既有 commit、MR、构建回执；仍在等待、失败或结果不明均保持其实际状态。

## 只读预览

发送 `{"id":"preview","action":"submit","phase":"PLAN","input":{…}}`。input 使用现有
[交付 helper 契约](../../../references/scripted-delivery.md)，只提供本轮事实，按需加载其参数说明：

| 字段 | 传入内容 |
| --- | --- |
| merge | 单个原分支的准确仓库、项目、目的、当前源码/目标 SHA、评审结果、CI 策略、MR 标题及 `mockSafety`。已交付或禁用写合并使用 `CONTAINMENT_ONLY`，不传 localGit。 |
| localGit | 仅在本轮明确包含原分支本地提交/推送时提供。`commit`、`push:true`、准确 message、`reviewedFiles`（仓库相对路径 → `{sha256,mode}`，删除用 null）。mode 为 100644 或 100755。单独推已有提交时 commit=false、文件表为空。 |
| release | 所选测试构建。可传固定配置中的 `jenkinsProjectKey` 自动绑定 Job，或传准确的 `jobName`、`jobUrl` 和目标项目。默认用当前仓库与测试分支，参数由冻结契约填充，只传实际需要的覆盖值。明确 SKIP 时传 null。执行从 Git 回执派生 expectedSha。 |
| wiki / linkTaskIds | STANDARD 传 workspaceId、entryType、entryId、原分支和仓库、作者及下方任一正文输入。linkTaskIds 只列本轮需补回链的真实 Task ID。NO_WIKI 时传 null 和空数组。预览固定父需求、目标页、既有正文及拟写正文指纹。 |
| registration | 本条目的 workspaceId、entryType、entryId、workMode、目的和实际状态/版本动作。Story/Task 的 statusAction 为 NONE；versionAction 只有明确写版本才选 WRITE。 |
| decisions | 最新已解决的实质决定，例如查询和保存的字段、实际配置 key、使用真实接口、交付终点。主代理对照同一版本的决定、清单和完整 Wiki 正文。 |
| repairRecord | 仅 Bug，传已审最终草稿 `{workspaceId,entryId,author,body,requiredRepositories,reviewedSourceSha,contentFingerprint,previousRecord}`。首次尚未发表的 `previousRecord` 填 null。先实施、后提测传原评论回执，其与 `registration.prerequisites.repairRecord` 一致。登记 statusAction=WAITING_TEST，Task 回链为空。 |

跨仓时以 `repositories: [{merge, localGit?, release}, …]` 提供同一目的下的全部已审原仓库，
替代顶层的 Git 和构建字段。每仓出现一次，Wiki、Task 回链和登记仍各用一份共同输入。
跨仓 Bug 用草稿中的 `reviewedSources: [{originUrl, sourceSha, contentFingerprint}, …]`
覆盖每个必要仓，替代单仓草稿的源码字段。

Wiki 可用完整 `bodyFile`。需要生成补丁时，使用
`entryMarkdown: [{entryRepoUrl, sourceBranch, markdown}, …]` 描述全部选定项目的完整编号条目。
脚本在 `# 前端` 下保持旧条目标题和序号，计算新增序号，通过 `review.approvedWikiBody`
返回完整正文用于展示和评审。预检返回失败的仓库、阶段和原因。TAPD MCP 证书和依赖启动
失败分别返回 `MCP_TLS_FAILED`、`MCP_DEPENDENCY_UNAVAILABLE`。

预检通过返回 `PREPARED`、`planId` 及 review 视图。人类授权可以来自开工时的确认，也可以来自独立运行时覆盖本次操作的用户指令及上下文。计划和完整 Wiki 供主代理内部核对。核对后当轮 EXECUTE，返回最终回执。已批准的 Mock 范围和具体授权仍须与真实来源、操作和测试环境绑定。
会话在等待期间已关闭时，用同样事实重新 PLAN，仅当 ID 仍匹配时复用评审/确认。
重建临时 Wiki 文件时可以换路径。清单 ID 绑定正文指纹、页面归属、目标和动作，
执行仍会读取当前文件并核对已审指纹。正文或目标变化须复核受影响的授权。

同一会话已有 `planId` 时直接用于 EXECUTE。如需取回已准备的快照，用 `PLAN {resumePlanId}`。首次写入前只需补 Wiki 正文时，传 `PLAN {resumePlanId, wiki:{bodyFile}}` 或 `wiki:{entryMarkdown}`。已知问题可同时传 `decisions`，也可只传 `resumePlanId, decisions`。沿用原 Wiki 归属、目标及基础正文，以及已准备的 Git、Job 和登记行。主代理按新 ID 核对修订点。写入仍实时核对绑定。若归属或交付内容变化，重新准备相应计划。

## 执行和定向续接

已有实现评审和本轮提测授权均匹配时，在同一 `--allow-execute` 会话发送一次 EXECUTE。旧调用可继续传 reviewedPlanHash，它须等于本次 planId。

~~~json
{"id":"deliver","action":"submit","phase":"EXECUTE","input":{"confirmed":true,"planId":"<预览 ID>"}}
~~~

脚本核实/提交准确文件、推送原分支、执行或只读核验合并，用交付 SHA 触发所选测试构建，
各仓依次取得回执后处理共用 Wiki、回链和登记。跨仓的 `receipts.repositories` 按原仓
记录 Git 和构建回执。无登记动作时直接保留 `NOT_APPLICABLE`。成功返回
`SUBMITTED` 和各步真实回执。同一会话再次引用已完成的同一计划只返回现有结果。
主流程将这些真实回执填回原 TestSubmissionResult 的相应仓库/工作项。只有完整范围
满足既有终点，且用户明确要求上线时，才把该结果交给 going-live 复核上线专属事实。

提交 Hook 改动内容时，已读回的本地提交保存在 `localGit.sourceSha`，`reviewedTree` 和 `changedPaths` 给出待核对增量。用两者对应的 Git 树比较实际差异。补验受影响内容并绑定已有提交，核实原分支、远端及其余门禁后从推送续办。未改动文件沿用原验证。未可靠读回的写入按未知结果核实。

Bug 的记录在 Git、所选构建、适用 Wiki 及其独立链接评论核实后才发表。相同作者和
内容的现有记录精确读回复用，已待测试的 CONTINUE 保留原状态/处理人。已有不同正文、
归属不清或重复时停止登记；同轮返工回原草稿，不能追加第二条修复评论。
已知当前轮评论 ID 时优先按 ID 核实，即使列表遗漏或标题被改也不能再 CREATE。
比较段落、列表、链接和文本，对等价的 HTML 实体/加粗标签复用，登记仍绑定实际原文的 SHA-256。
若确属另一轮，须在完整计划中独立核实 `priorRounds:[{commentId,author,created,bodySha256,roundEvidence}]`，
逐条核对历史读回。创建回执不明保留效果，先只读核实。最终登记使用实际读回 HTML 的指纹。

- `NEEDS_WIKI_REVIEW`：重新核实当前有效页及同一 TAPD 归属，保留他人内容，准备新补丁。
  发 `PLAN {resumePlanId,wiki,decisions}`，只评审变化后的目标/正文与授权覆盖，再用新 ID
  EXECUTE。已验证 Git、已接受队列直接复用。仍有多个不能判定的链接时保留阻塞。
  若历史评论仍保留前一计划中的旧页，只接受能从同一父 Story 读回的明确替代通知：
  新页的“提测wiki”链接及明确的“（作废旧页 #旧页编号）”。新 wiki 输入可传
  `supersededWiki:{wikiId,noticeCommentId,noticeBodySha256}` 固定旧页及通知原文 SHA-256。
  预览和写入复核实际归属、所选各 Task 的全部回链、通知及正文。历史评论保持原样。
  缺证据或出现未解释的第三页时停止在 Wiki。
- 出现 `NEEDS_TARGET_REVIEW` 时，核对合并后准确版本的新增依赖/Mock 配置，把 `deliveredSha`、
  `scopeFingerprint`、`contentFingerprint` 和评审来源作为 `targetEvidence`。跨仓追加暂停仓
  的 `sourceRepository`。发 `PLAN {resumePlanId,targetEvidence,decisions}` 后使用新 ID。
- 出现 `NEEDS_VISUAL_ACCEPTANCE` 时，按返回的用例编号补齐当前计划和代码的
  [视觉验收回执](../../collecting-requirements/references/wiki-storage.md#视觉验收回执)。
  将通过回执回填后发 `PLAN {resumePlanId}`，通过后从现有 Git 和构建回执续接。
- 出现 `AWAITING_MERGE` 时，人工合并完成后发 `PLAN {resumePlanId}`。读回原 MR
  和目标包含关系后沿用同一计划 ID，在真实授权仍适用时继续 EXECUTE。
- `NEEDS_REPAIR_REVIEW`：尚未发送记录写入。先核实原评论、源码与人员/状态漂移；
  `PLAN {resumePlanId,repairRecord,decisions}` 只复核该记录及登记。已有评论 ID 不得丢弃或换 ID，
  保留所有已完成的 Git、构建和 Wiki。写入结果不明时不能用此续接重发。
- 有写入结果不明、超时或部分成功时，报告失败步骤与已知回执，先只读核实实际效果。
  会话结束时沿用下述续接入口或用原单项 helper 补未完成动作。收尾发送 finish。

## 会话关闭后的交付续接

先按[续接位置](../../executing-tapd-plan/references/executing.md#新会话从哪里继续)从原执行记录及真实回执逐仓、逐 Job 还原进度。部分完成时，沿原 MR 核实等待、冲突或已合并；恢复仍有效的 Git 和构建回执。用当前授权和 `tapdPlan` 交给相应单项 helper，只推进真正缺少的 Git 或 Job。原 Job 曾收到请求但结果不明时，先核实原队列或历史构建。

所有选定仓的 Git 和构建结果均已核实，仅余 Wiki、回链、修复记录或登记时，在新会话
用原清单及受影响的更新发 PLAN，将上一轮结果的 `receipts` 作为 `recoverDelivery`。
按原计划顺序提交各仓回执。原计划明确跳过构建时，沿用对应的跳过回执。
PLAN 与 EXECUTE 均只读核实原 MR 或测试分支包含关系、固定 Job 和原队列参数。
测试分支前进后，核实原交付版本包含已评审源码，且仍包含在当前测试分支中。
保留原合并 SHA、已评审目标增量的交付 SHA 及对应的原构建回执。
通过后从文档与登记继续。回执不足时先核实实际结果，禁止重放状态不明的写入。

## 会话关闭后的共享 Wiki 换页

只用于普通单仓 Story/Task 已合并且测试队列已接受、旧共享 Wiki 有同一 Story 上的明确
作废通知、尚需处理新页和所选 Task 回链的情况。新会话发送 `action=submit, phase=PLAN`，
提供以下原回执和当前正文。不要从猜测补回执，也不要用新构建代替无法读回的队列。

| 字段 | 本轮输入 |
| --- | --- |
| `recoverWiki` | `{previousWikiId, releaseReceipt}`。前者是上一份清单的旧页 ID，后者是原 `BUILD_SUBMITTED` 回执。旧版本回执缺少 `jenkinsProjectKey` 时，可在这里传原已确认计划中的准确值。 |
| `merge` | 保留原仓库、原分支、评审及 Mock 证据。用原 Git 回执的准确 `mrIid`、实际 `sourceSha` 和原测试分支，原始 `targetSha` 仍是计划字段。 |
| `wiki / linkTaskIds` | 现有新页的 `expectedWikiId`、同一父 Story 的归属、完整正文文件及 `supersededWiki` 证明。只列原清单中实际交付的 Task。 |
| `registration / decisions` | 原 Story/Task 身份，状态及版本动作均为 `NONE`，可传本轮核实的换页决定。 |

PLAN 和确认后执行都只读核实原 MR、原交付 SHA 的目标包含关系及原队列参数。队列返回
404 时，在同一 Job 最近 30 个构建中按准确 `queueId` 找唯一记录并读回参数。未核实就
停在 Wiki 前。采用上方同一个 `EXECUTE` 格式，仅更新已审的新页和回链。任何写入结果
不明仍先核实实际效果。回执留在会话内存，沿用原工作上下文交接。
原回执须保留完整已提交参数和冻结定义、环境配置及参数值指纹。普通参数不可用脱敏占位，
固定测试、项目及分支选择与回执不一致时停止续接。
