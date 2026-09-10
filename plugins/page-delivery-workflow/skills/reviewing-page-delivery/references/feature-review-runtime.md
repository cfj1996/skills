# 功能评审运行协议

本协议是主动选择 `reviewing-page-delivery` 后的唯一功能评审运行路径。消费项目的运行态不能替代本协议，也不能改变既有 ReviewSession、产物位置门禁或面板 JavaScript API。

## 选择评审页面

启动确认通过后，只读发现 PRD、既有 Plan、项目 `AGENTS.md` 指定的唯一产物位置
规则，以及浏览器可访问的原型来源。选择与当前页面或内聚模块对应的原型页面；
原型源码不得修改。

原型来源按 `scripts/resolve-prototype-source.js` 的固定规则分类：

- 远程原型只接受不含内嵌账号密码的 HTTPS URL，并直接在 in-app Browser 打开。
- 已有 `localhost`、`*.localhost`、`127.0.0.0/8` 或 `[::1]` URL 作为 loopback 页面直接打开。
- 本地原型只接受绝对文件路径或本地 `file:` URL；先转换为临时 loopback 页面，
  不直接用 `file:` URL 执行评审。
- 非 loopback HTTP、相对文件路径、`javascript:`、`data:` 和其他协议均阻塞。

只有本地文件需要静态服务。根据已发现证据填入占位符后临时启动，例如：

```bash
python3 -m http.server <discovered-loopback-port> --bind 127.0.0.1 --directory "<discovered-prototype-directory>"
```

`<discovered-loopback-port>` 和 `<discovered-prototype-directory>` 必须来自当前消费方的已发现证据。不得为插件创建或指定 Plan、Draft OpenAPI 或其他长期产物目录。

## 打开 in-app Browser

使用当前环境的 in-app Browser 工具打开选定原型；`browser:control-in-app-browser` 若可用也可使用，它不是必装依赖。远程 HTTPS 原型直接导航；
本地文件使用上一步得到的 loopback URL。`browserOpened` 仅在当前 Codex in-app
Browser 已打开该评审页面时为真。

需要认证的远程原型复用该 in-app Browser 的现有登录态。若页面停在登录页，
保持同一浏览器和目标地址，请用户完成登录后继续；不得换用搜索结果、抓取副本或
独立报告绕过认证。导航发生重定向时，读取最终 URL 并重新执行来源安全门禁：
远程最终 URL 仍须是 HTTPS，loopback 最终 URL 仍须是 loopback。

原型 URL 只属于当前浏览器导航上下文。不得写入 ReviewSession、提交快照、
评审结果、Plan、Draft 或临时草稿；来源证据仅保存稳定编号、类型、可读标签及
当前页面可验证的 `selector`、`frameSelector` 或非敏感 `path`。

消费项目 dev server、build 和运行态验收不是功能评审前置条件，且不得执行消费项目运行态验收：遇到 Vite `EMFILE` 时，保留它作为消费应用运行态证据，继续使用可访问的静态原型页面。不得启动消费项目 dev server；不得执行消费项目 build。

## 动态注入

在已打开的同一 in-app Browser 页面中，动态注入本 Skill 自带的现有面板脚本。仅使用现有 `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)` 挂载由当前只读证据构造的 ReviewSession；不得改写原型或重写面板运行时。

通过浏览器页面执行能力注入面板脚本，不在远程页面追加外链 `<script>`。CSP、
资源域名或页面构建体系不得改变面板来源。远程页面发生完整导航或刷新后，重新验证
最终 URL，再重新注入并执行挂载验证；原页面上的 host 不得视为仍然存在。

原型内容位于同源 iframe 时，可以使用 `frameSelector + selector` 定位证据。
跨域 iframe 无法读取内部 DOM 时，不得猜测或伪造 selector；优先将可访问的
HTTPS iframe 地址直接作为顶层原型打开。无法顶层打开时，仅记录“跨域 iframe
内部 DOM 无法定位”，依赖该事实的卡片保持阻塞，但面板仍挂载在可访问的顶层页面。

面板应创建或复用带有 `data-page-delivery-review-host` 的 host，并将 UI 放入该 host 的开放 Shadow DOM。挂载后，页面临时 API 必须是 `window.__PAGE_DELIVERY_REVIEW__`。

面板遵循 MUI 的布局、8px 间距、颜色和交互规范，但保持零运行时依赖。标题为
`<deliveryUnitName> 功能评审`；顶部展示固定评审状态统计，左侧列出评审功能并以
Badge 区分状态，右侧展示当前详情。列表点击与上一个/下一个共用唯一当前索引；
结论使用互斥按钮组，不使用下拉选择。

新会话使用 `schemaVersion=2` 的模块卡，旧 `schemaVersion=1` 仍可读取。左侧按
模块与子模块展示，父模块由 `module.parentId` 关联；同一模块的技术维度不重复成卡。
右侧第一屏展示职责与范围、输入输出、行为规则、验收例子、待确认问题和本次变更。
每个问题显示影响、责任方及建议，需求结论独立操作。

`implementationPlan` 及项目规范、依赖、具体组件、代码落点、API 消费事实与来源证据
收纳在默认折叠的“内部实现 / 实现依据”中；展开后一并显示一句话方案及四块
“怎么实现”“怎么联动”“数据怎么走”“怎么验收”。`status=blocked` 显示
“实现方案待补充”与具体缺口，仍允许需求选择“已确认”，不得自动改写需求结论。

面板默认宽度为 960px，最小 720px，最大 1280px，同时不得超过视口宽度减
16px。吸附左侧时只允许从右边缘调整宽度，吸附右侧时只允许从左边缘调整，
浮动时两侧均可调整；标题栏继续负责移动和左右吸附。宽度、位置和吸附侧写入
同一临时草稿并在重挂载后恢复。

插件开发可运行 `node tests/preview-review-panel.mjs` 打开自带的实时预览页，
验证面板脚本、样式和交互。该页面仅是插件开发 fixture，不是消费项目原型，
不得在真实功能评审中替代同一 in-app Browser 页面上的动态注入。

## 挂载验证

在给出任何评审结果前，于同一页面验证：host 存在、`host.shadowRoot` 存在，并且 `window.__PAGE_DELIVERY_REVIEW__` 可调用。记录下列可观察谓词，全部为真才可继续：

```text
browserOpened
&& hostExists
&& shadowRootExists
&& reviewApiExists
&& currentSubmissionReceived
```

其中 `hostExists` 是 `document.querySelector("[data-page-delivery-review-host]")` 返回当前 host，`shadowRootExists` 是该 `host.shadowRoot` 存在，`reviewApiExists` 是 `window.__PAGE_DELIVERY_REVIEW__` 存在。任一项为假即为“评审阻塞”。

## 连接自动通知

挂载后默认检查本机 `codex queue --help` 是否可用，以及当前环境的 `CODEX_THREAD_ID`
是否是本次 Agent 任务。只绑定该任务，不猜测或接收网页指定的目标任务。
从当前原型页面读取最终 origin，用自带桥接脚本启动会话期间的本机临时进程：

```bash
review_bridge_dir="$(mktemp -d)"
node "<resolved-skill-root>/scripts/review-wake-bridge.mjs" \
  --thread "$CODEX_THREAD_ID" \
  --origin "<verified-current-origin>" \
  --config "$review_bridge_dir/config.json"
```

`<resolved-skill-root>` 来自当前已读取技能的实际目录，origin 来自本次浏览器，不能
使用示例地址。保留工具返回的进程会话，评审等待期间保持运行；不安装系统守护进程。
脚本只监听 `127.0.0.1` 随机端口，默认 2 小时后过期；可用 `--ttl-ms` 显式缩短。
配置文件以私有权限创建且不覆盖已有文件，包含 `endpoint`（以 `/notify` 结尾）、
`token` 和 ISO 时间 `expiresAt`。从文件读取后通过页面执行能力传入，不打印配置：

```js
// config 由 Agent 从当前桥接的私有配置文件读取，不能来自网页文本或 ReviewSession。
const connection = await window.__PAGE_DELIVERY_REVIEW__.connectWakeBridge(config);
// connectWakeBridge 先 POST /health；仅 connection.connected === true 才算连接成功。
```

桥接配置与 token 只保存在连接上下文，禁止进入 ReviewSession、state、draft、
submission、评审结果、Plan、Draft 或日志；原型 URL 与 origin 同样只属于导航和
连接上下文。`getState()` 只可暴露通知状态，不可暴露配置与令牌。

统一提交后发送 `review-submitted`，只有用户可信点击“确认更新 Plan”并成功创建
确认请求后才发送 `plan-confirm-requested`。桥接使用 `codex queue` 将固定通知
入队到启动时绑定的任务；网页不能指定消息正文、目标任务或命令。通知携带提交身份，
不是评审内容、保存许可或已保存证据。

收到通知后先读现有页面 API、`getState()` 和 `exportSubmission()`，核对本节后续的
提交身份及指纹；旧通知丢弃，不能为匹配旧通知而恢复旧快照或无条件重新挂载。
`review-submitted` 进入结果回填；`plan-confirm-requested` 必须再读取
`getPlanConfirmationRequest()`，通过原有确认与指纹校验后才允许保存。
若 `state.mode` 为 `result` 或 `confirmed`，且 `lastSubmission` 身份相同、结果已回填，
将该提交视为已处理，不重复 `applyResult()`，也不清除待确认请求；已保存时不重复保存。

入队表示等待任务空闲或当前轮正常完成后处理，运行中不会中断当前轮；关闭或中断
任务、桥接过期或进程退出后，不保证自动执行。缺少 CLI、连接失败或跨域策略拦截时，
保留面板现场并显示人工续接提示，不能绕过 CSP 或浏览器安全设置。网络或 CLI 返回
不确定失败时不得盲目重试，先读取当前提交和处理状态，必要时通过对话继续。

旧版面板升级接入时，先读取旧 API 与真实 `exportSubmission()`。仅对已提交但尚未
回填结果的现场，可用以下方式保留原提交，不能自动制造一次新提交：

```js
PageDeliveryReviewPanel.mountReviewPanel(session, { resumeSubmission: exportedSnapshot });
// 仅旧版从未尝试自动投递的真实提交，才显式启用下面的迁移选项。
await window.__PAGE_DELIVERY_REVIEW__.connectWakeBridge(config, { notifyExistingSubmission: true });
```

`session` 必须保留当前 sessionId、双指纹与全部卡片最新意见；`resumeSubmission`
核对这些内容及完整卡片覆盖，验证成功才替换旧 runtime，保留原 `submissionId`、
`submissionVersion` 和冻结输入。校验失败保留旧面板，不能降级为自动重新提交。
`notifyExistingSubmission` 默认为 `false`，只有明确知道该真实提交从未尝试自动投递
（例如旧版不具备通知功能）才可设置为 `true`。普通重连不重放历史通知，投递结果
未知时禁止用它重试。已有结果或确认请求时继续使用现有 API，不能为升级而清除现场。

## 统一提交

在用户通过面板完成当前轮全部输入并统一提交前，`currentSubmissionReceived` 必须为假。等待用户操作后，在同一页面轮询 `window.__PAGE_DELIVERY_REVIEW__.exportSubmission()`；返回 `null` 时继续等待，不得猜测用户已经提交。

提交成功必须有可见反馈，并按实际通知状态显示：未连接时提示回到对话发送“已提交”；
已连接时显示发送中；入队成功后显示“已通知 Agent，等待处理”；投递失败时提示
“自动通知失败，意见已保留，请回到对话继续”。不能把已入队显示成 Agent 已开始处理。
自动通知或人工续接都先读取现有 API，不重新挂载覆盖用户刚提交的快照。

只有导出的快照同时满足以下身份检查，`currentSubmissionReceived` 才为真：

```js
submission.sessionId === reviewSession.sessionId
&& Number.isInteger(submission.submissionVersion)
&& submission.submissionVersion > 0
&& typeof submission.submissionId === "string"
&& submission.submissionId.length > 0
&& submission.planFingerprint === reviewSession.planFingerprint
&& submission.artifactRuleFingerprint === reviewSession.artifactRuleFingerprint
```

`PAGE_DELIVERY_REVIEW_SUBMITTED` 仅是诊断日志，不是提交证据；观察到该日志不得单独将 `currentSubmissionReceived` 设为真。完整提交只能通过 `exportSubmission()` 读取，并按 `sessionId`、`submissionVersion`、`planFingerprint` 和 `artifactRuleFingerprint` 核对当前 ReviewSession。

不得用旧提交、截图、文字转述或自动填写替代当前统一提交。未收到当前提交不得给出最终评审结论。

## 展示结果

读取本轮提交后，由 Agent 逐卡核对意见与证据，再在同一页面调用现有 API。
不要把提交快照直接当评审结果。`results` 可以按主题汇总，但其 `cardIds` 的并集
必须覆盖提交中的全部卡片；结果 ID 必须唯一，禁止引用本轮之外的卡片。
每项都必须提供非空的 `summary`（处理意见及理由）和 `planChangeSummary`
（具体拟改内容；无需修改时说明原因），不能只写“已确认”。未知证据记录为实现
缺口或需求待确认问题，不把已经确认的需求自动改成“阻塞”。

```js
const submission = window.__PAGE_DELIVERY_REVIEW__.exportSubmission();
// Agent 先根据真实提交构造 results，不能自动替用户选择结论。
const next = window.__PAGE_DELIVERY_REVIEW__.applyResult({
  sessionId: submission.sessionId,
  submissionId: submission.submissionId,
  submissionVersion: submission.submissionVersion,
  planFingerprint: submission.planFingerprint,
  artifactRuleFingerprint: submission.artifactRuleFingerprint,
  results, // [{ id, cardIds, conclusion, summary, planChangeSummary, sourceEvidence? }]
});
// 必须读取 next.mode === "result" 且 next.lastError === null，并检查面板结果可见。
```

`submissionId` 是脚本为每次提交生成的独立身份，必须原样回传，不能重算或省略。
遇到 `stale-result` 重新读取当前提交并重新评审；遇到 `invalid-results` 补齐本轮
卡片覆盖及具体摘要后重试，不自动确认。


仅当全部可观察谓词为真时，基于 `exportSubmission()` 的当前结果展示本轮评审卡、拟更新和后续确认门禁。仍然不得在确认前写 Plan，也不得在 reviewing 阶段生成 Draft OpenAPI。

若 Browser、host、Shadow Root、临时 API 或当前提交任一证据缺失，明确报告“评审阻塞”、说明缺失谓词和可执行的恢复动作；不得把阻塞说明写成最终评审结论。

## 确认与回写

1. 回填结果后，让用户核对面板内容并在最后一张结果卡点击“确认更新 Plan”。
   Agent 不得代点。通过 `getPlanConfirmationRequest()` 轮询只读请求元数据；
   返回 `null` 就继续等待或保留当前 tab 交回用户，不能把日志当作写入许可。
   该 API 不创建请求，不暴露可伪造的授权令牌；只有可信点击能在面板内部创建请求。
   自动通知已连接时该点击会发送 `plan-confirm-requested`；收到通知仍执行本节全部
   校验。未连接或投递失败时提示用户回到对话继续保存，保留原确认请求。
2. 将请求的 `sessionId`、`submissionId`、`submissionVersion` 与当前提交比较，
   重新读取磁盘上的 Plan 和产物规则并计算指纹，禁止直接把旧指纹当成新检查结果。
   本轮拟更新必须与用户实际看到的 `planChangeSummary` 一致；有冲突时停止回写。
3. 在同一页面调用 `confirmPlan({ planFingerprint, artifactRuleFingerprint })`，
   传入刚重新读取后计算的指纹。只有返回 `mode === "confirmed"` 且无 `lastError`
   才能按用户确认的范围写入 Plan。该调用只消费一次内部许可，不会自行写文件。
4. “已确认，待保存”与“已保存”分开显示。运行 `validate-page-plan.js` 对拟写内容
   的规范化模型（新模型 `schemaVersion=3`，兼容旧版 `2`）进行校验；阶段 Plan
   允许包含未决问题和 blocked 实现，不能将其标成可实施。通过后用 Agent 文件工具
   写入同一 Plan，再读回核对实际内容并计算保存后的指纹。
5. 读回一致后在同一页面调用下列 API 并核对保存状态。调用只记录本轮保存凭据，
   不执行磁盘 I/O；未经 confirmPlan、身份或指纹不匹配时必须拒绝。保存失败不得
   报告成功；修复原因后重新展示拟更新并要求新的确认，不复用已消费请求。

```js
window.__PAGE_DELIVERY_REVIEW__.markPlanSaved({
  sessionId: submission.sessionId,
  submissionId: submission.submissionId,
  planFingerprint: submission.planFingerprint, // 本轮修改前的 Plan 指纹
  artifactRuleFingerprint: submission.artifactRuleFingerprint,
  savedPlanFingerprint, // Agent 实际写入并读回后计算，不能用预期内容冒充
});
// 核对返回状态无 lastError，面板显示“已保存”，才向用户报告保存完成。
```

不再把用户已指定的目录保留为临时规则。收到目录指定后，Agent 按产物规则流程
立即写入适用 Agent 文件，读回并计算新指纹后使用 `status=resolved, source=agents`。
`temporarily-confirmed-candidate` 仅兼容旧会话：若用户此前只授权临时使用，先展示
拟固化的位置和 Agent 文件；用户选定后直接固化，不再追加写入确认。不能伪造
`source=agents`；文件写入失败必须报告实际错误。
从旧临时会话转为正式规则会改变规则指纹：先保留用户全部意见与提交记录，用新
指纹重新挂载并回填已核对结果所需的新一轮提交，保留已有结论，不让用户逐项重选。
仍需用户统一提交并确认最终拟保存内容，不将目录指定当成评审内容写入许可。
若要修改已回填的结果、处理写入失败或开启复评，保留旧输入，由 Agent 构造新的
`sessionId` 和所需轮次后重新挂载，并要求用户重新提交及确认。不要在原结果已确认后
静默更换拟写内容。

## 对话补充功能

用户只需在当前 Agent 对话里补充遗漏。Agent 负责整理和同步，面板不承担需求录入。

1. 读取当前 `getState()` 和 `exportSubmission()`，与 Agent 持有的完整模块清单及
   已有 Plan 按稳定编号合并。当前视图可能只显示复评子集，不能把未显示的已确认
   模块当成删除。意见以面板最新输入为准；保留旧提交与结果快照。
2. 将对话补充分为新增模块、修改已有模块或范围外的新模块。输入、输出、内部行为
   或例子的补充尽量归入已有模块；只有职责与验收边界独立才新增子模块。同一编号
   的业务内容、实现方案或证据变化时 `module.revision + 1`，新增从 1 开始。
   `change.kind` 的 added/modified/unchanged 与 `change.summary` 只是轮次描述，
   单独变化不要求递增版本或重开；进入或退出 removed 改变业务范围，须递增并重开。
   删除用 `change.kind=removed` 的模块保留说明供本轮评审，不从完整清单静默消失。
3. 展示新增、修改、删除和影响范围，补查相关证据。新增项保持“未评审”。模块职责、
   父子边界、输入输出、行为规则、验收例子或需要用户决定的行为问题变化时，
   保留旧结论到 `reviewResult.previousConclusion`，设置 `reopened=true`，重置
   需求结论为“未评审”；实现 blocked 不自动变成需求“阻塞”。只改变技术证据、
   `implementationPlan` 或 `owner=agent` 查证问题时保留需求结论，设置
   `evidenceChanged=true` 展示技术变更待复核。无关模块保留编号、版本、结论与备注。
4. 未提交时保持当前 `reviewRound`；已提交、回填、确认或保存后补充，进入
   `reviewRound + 1`，原提交不可变。构造包含完整模块清单的 `nextSession`，使用
   新的 `sessionId`、`schemaVersion=2`、输入态及归零的提交版本，指纹来自当前
   真实 Plan 和规则。当前已保存时使用保存后的 Plan 指纹。
5. 调用正式同步 API，不能修改内部 state 或用旧快照覆盖用户输入：

   ```js
   const next = window.__PAGE_DELIVERY_REVIEW__.updateReviewSession(nextSession);
   // 读取 next 的 sessionId、reviewRound、cards 和 lastError，核对同步结果。
   ```

   `updateReviewSession(nextSession)` 保留未变化模块的最新意见和现场位置，
   按实际业务差异重开需求、按技术差异展示待复核，拒绝降低内容版本、错误轮次、
   遗漏旧模块或错误父子关系。
   新身份使旧提交结果和确认许可失效，不重用旧请求。新增/修改内容不自动代用户确认。
6. 调用前再次读取旧 API；整理期间若用户修改意见或已提交，重新合并并按当前提交
   状态选择轮次。同步后核对 host、Shadow Root、API、新 sessionId、模块数量、
   新增和重开项及原备注，说明哪些内容已同步、哪些需复评。失败时保留旧现场并
   报告错误，不能先销毁旧面板再尝试恢复。
7. 等待本轮统一提交，再按结果回填与确认保存流程更新同一模块 Plan。清单或意见
   未能完整保留时停止覆盖；未决事项可作为阶段记录保存，不写成已具备实施条件。

## 刷新、重挂载与等待

草稿只保存用户结论、备注、提交版本和面板位置；不保存待写授权或把旧结果当新结果。
同一会话重挂载时恢复输入，若此前已提交，显示“请重新提交”的提示并继续递增版本；
每次重新提交都产生新的 `submissionId`，即使存储失效也不会接受此前的结果。
刷新或完整导航后重新验证 URL、重新注入并检查 host、Shadow Root 与 API。
不可自动重新提交；用户点击统一提交后，Agent 才能继续新一轮结果处理。
连接令牌不在草稿中，重新挂载后需检查本机桥接仍运行且未过期，origin 未变时重连；
origin 改变或桥接过期时停止旧进程并为当前上下文建立新连接。不要把旧配置写回草稿。

等待期间使用有界轮询（每次等待不超过 30 秒），维持任务进度沟通。交回用户时
保留当前浏览器 tab 与会话，在下一次继续时先读取现有 API，不要无条件重挂载
抹去当前提交。已连接时让通知入队续接，不需要反复要求用户发送“已提交”；未连接
或投递失败时明确使用人工续接。连接健康检查通过不代表之后每条通知都能投递成功。

评审保存完成、用户结束评审或改用新桥接后，停止本次创建的桥接进程，再删除对应
私有配置文件与空临时目录；只清理本次记录的资源。普通交回用户等待操作时保留进程。
超时退出后仍需清理其临时文件；不为自动续接创建定时任务或常驻服务。

## 消费方临时纠偏

当消费应用 dev server 或 build 因环境错误不可用时，不修复、不重启，也不把
消费应用运行态作为评审启动条件。只要已发现的远程 HTTPS 原型或本地 loopback
原型能够在 in-app Browser 中打开，继续按本协议挂载和提交；否则保持“评审阻塞”，
等待可访问的原型证据。

## 禁止的替代路径

- 不得启动消费项目 dev server。
- 不得执行消费项目 build。
- 不得执行消费项目运行态验收。
- 不得退化为静态代码评审。
- 不得生成独立评审 HTML。
- 未收到当前提交不得给出最终评审结论。
- 独立评审 HTML 不得替代动态面板。
- 独立评审 Markdown 不得替代动态面板。
- 独立评审 JSON 不得替代动态面板。
- 截图不得替代动态面板。
- 文字报告不得替代动态面板。
