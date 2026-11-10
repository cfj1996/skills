# 单仓需求与 Bug 连续提测

在一个已核实的原分支向 dev/develop 交付一项 Story、所选 Task 或完整单仓 Bug 时，复用
已有 workflow-session 的 `action=submit`。它调用原 Git、Jenkins、Wiki 和登记 helper，
一次只准备或执行一份已审清单。输入通过 stdin，计划和回执留在会话内存。

## 只读预览

发送 `{"id":"preview","action":"submit","phase":"PLAN","input":{…}}`。input 使用现有
[交付 helper 契约](../../../references/scripted-delivery.md)，只提供本轮事实，按需加载其参数说明：

| 字段 | 传入内容 |
| --- | --- |
| merge | 单个原分支的准确仓库、项目、目的、当前源码/目标 SHA、评审结果、CI 策略、MR 标题及 `mockSafety`。已交付或禁用写合并使用 `CONTAINMENT_ONLY`，不传 localGit。 |
| localGit | 仅在本轮明确包含原分支本地提交/推送时提供。`commit`、`push:true`、准确 message、`reviewedFiles`（仓库相对路径 → `{sha256,mode}`，删除用 null）。mode 为 100644 或 100755。单独推已有提交时 commit=false、文件表为空。 |
| release | 已选测试部署的实际 targetProject、releaseTarget、jobName、jobUrl、sourceRepository、测试渠道、冻结参数和实际测试分支 releaseRef，或明确 SKIP 时传 null。计划绑定 Job 和参数，执行从本次 Git 回执派生 expectedSha；无版本参数的项目使用同一 SHA 作版本身份。 |
| wiki / linkTaskIds | STANDARD 使用已有 Wiki helper 的 workspaceId、entryType、entryId、sourceBranch、entryRepoUrl、作者及完整正文请求 bodyFile。linkTaskIds 只列本轮需补回链的真实 Task ID。NO_WIKI 时传 null 和空数组。预览固定父需求、目标页、既有正文及拟写正文指纹。 |
| registration | 本条目的 workspaceId、entryType、entryId、workMode、目的和实际状态/版本动作。Story/Task 的 statusAction 为 NONE；versionAction 只有明确写版本才选 WRITE。 |
| decisions | 最新已解决的实质决定，例如查询和保存的字段、实际配置 key、使用真实接口、交付终点。给整体评审者同一版本的决定、清单和完整 Wiki 正文。 |
| repairRecord | 仅 Bug，传已审最终草稿 `{workspaceId,entryId,author,body,requiredRepositories,reviewedSourceSha,contentFingerprint,previousRecord}`。首次尚未发表明确填 null；先实施、后提测要传原 ReviewedChange 的确切评论回执。也会沿用 registration.prerequisites.repairRecord，两个来源必须一致。完整必要范围限本仓库，登记 statusAction=WAITING_TEST，不传 Task 回链。 |

返回 `planId` 及紧凑的 review 视图。独立评审这一版完整计划。人类授权可以来自匹配的
完整执行清单。已批准的 Mock 范围和具体授权仍须与真实来源、操作和测试环境绑定。
会话在等待期间已关闭时，用同样事实重新 PLAN，仅当 ID 仍匹配时复用评审/确认。
重建临时 Wiki 文件时可以换路径。清单 ID 绑定正文指纹、页面归属、目标和动作，
执行仍会读取当前文件并核对已审指纹。正文或目标变化须复核受影响的授权。

## 执行和定向续接

授权和独立评审均匹配时，在 `--allow-execute` 会话里发送一次：

~~~json
{"id":"deliver","action":"submit","phase":"EXECUTE","input":{"confirmed":true,"planId":"<预览 ID>","reviewedPlanHash":"<独立评审通过的同一 ID>"}}
~~~

脚本核实/提交准确文件、推送原分支、执行或只读核验合并，用交付 SHA 触发所选测试构建，
拿到队列回执就继续 Wiki/回链。无登记动作时直接保留 `NOT_APPLICABLE`。成功返回
`SUBMITTED` 和各步真实回执。同一会话再次引用已完成的同一计划只返回现有结果。
主流程将这些真实回执填回原 TestSubmissionResult 的相应仓库/工作项。只有完整范围
满足既有终点，且用户明确要求上线时，才把该结果交给 going-live 复核上线专属事实。

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
- `NEEDS_TARGET_REVIEW`：核对合并后准确版本的新增依赖/Mock 配置，把 `deliveredSha`、
  `scopeFingerprint`、`contentFingerprint` 和评审来源作为 `targetEvidence`，发
  `PLAN {resumePlanId,targetEvidence,decisions}` 后使用新 ID。多仓或人工合并继续用已有专用流程。
- `NEEDS_REPAIR_REVIEW`：尚未发送记录写入。先核实原评论、源码与人员/状态漂移；
  `PLAN {resumePlanId,repairRecord,decisions}` 只复核该记录及登记。已有评论 ID 不得丢弃或换 ID，
  保留所有已完成的 Git、构建和 Wiki。写入结果不明时不能用此续接重发。
- 有写入结果不明、超时或部分成功时，报告失败步骤与已知回执，先只读核实实际效果。
  会话已结束时，有准确原 MR 和队列回执的明确换页可走下述入口，其他情况用原单项 helper
  续做缺失动作。不能从头重放提测。收尾仍发送 finish。

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
