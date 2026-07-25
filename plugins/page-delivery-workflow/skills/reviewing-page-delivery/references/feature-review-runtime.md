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

使用 `browser:control-in-app-browser` 打开选定原型。远程 HTTPS 原型直接导航；
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

右侧详情第一屏只展示 `implementationPlan` 的一句话方案和四块实施摘要：
“怎么实现”“怎么联动”“数据怎么走”“怎么验收”。每块使用短列表，突出具体
组件与代码落点、触发条件与状态变化、API/状态数据流和关键验收场景。项目规范、
依赖、源码位置、完整字段和来源证据收纳在默认折叠的“实现依据”中；不得用 Tabs
把四块相互关联的信息拆开。`status=blocked` 时在摘要上方展示“实现阻塞”，
非阻塞结论不可选择。

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

## 统一提交

在用户通过面板完成当前轮全部输入并统一提交前，`currentSubmissionReceived` 必须为假。等待用户操作后，在同一页面轮询 `window.__PAGE_DELIVERY_REVIEW__.exportSubmission()`；返回 `null` 时继续等待，不得猜测用户已经提交。

只有导出的快照同时满足以下身份检查，`currentSubmissionReceived` 才为真：

```js
submission.sessionId === reviewSession.sessionId
&& Number.isInteger(submission.submissionVersion)
&& submission.submissionVersion > 0
&& submission.planFingerprint === reviewSession.planFingerprint
&& submission.artifactRuleFingerprint === reviewSession.artifactRuleFingerprint
```

`PAGE_DELIVERY_REVIEW_SUBMITTED` 仅是诊断日志，不是提交证据；观察到该日志不得单独将 `currentSubmissionReceived` 设为真。完整提交只能通过 `exportSubmission()` 读取，并按 `sessionId`、`submissionVersion`、`planFingerprint` 和 `artifactRuleFingerprint` 核对当前 ReviewSession。

不得用旧提交、截图、文字转述或自动填写替代当前统一提交。未收到当前提交不得给出最终评审结论。

## 展示结果

仅当全部可观察谓词为真时，基于 `exportSubmission()` 的当前结果展示本轮评审卡、拟更新和后续确认门禁。仍然不得在确认前写 Plan，也不得在 reviewing 阶段生成 Draft OpenAPI。

若 Browser、host、Shadow Root、临时 API 或当前提交任一证据缺失，明确报告“评审阻塞”、说明缺失谓词和可执行的恢复动作；不得把阻塞说明写成最终评审结论。

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
