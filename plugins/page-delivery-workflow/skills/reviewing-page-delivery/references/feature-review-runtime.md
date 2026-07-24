# 功能评审运行协议

本协议是主动选择 `reviewing-page-delivery` 后的唯一功能评审运行路径。消费项目的运行态不能替代本协议，也不能改变既有 ReviewSession、产物位置门禁或面板 JavaScript API。

## 选择评审页面

启动确认通过后，只读发现 PRD、既有 Plan、项目 `AGENTS.md` 指定的唯一产物位置规则，以及可访问的静态 HTML 原型。选择与当前页面或内聚模块对应的原型页面；原型源码不得修改。

若原型需要本地静态服务，只能根据已发现证据填入占位符后临时启动，例如：

```bash
python3 -m http.server <discovered-loopback-port> --bind 127.0.0.1 --directory "<discovered-prototype-directory>"
```

`<discovered-loopback-port>` 和 `<discovered-prototype-directory>` 必须来自当前消费方的已发现证据。不得为插件创建或指定 Plan、Draft OpenAPI 或其他长期产物目录。

## 打开 in-app Browser

使用 `browser:control-in-app-browser` 打开选定原型的 loopback URL。`browserOpened` 仅在当前 Codex in-app Browser 已打开该评审页面时为真。

消费项目 dev server、build 和运行态验收不是功能评审前置条件：遇到 Vite `EMFILE` 时，保留它作为消费应用运行态证据，继续使用可访问的静态原型页面。不得启动消费项目 dev server；不得执行消费项目 build。

## 动态注入

在已打开的同一 in-app Browser 页面中，动态注入本 Skill 自带的现有面板脚本。仅使用现有 `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)` 挂载由当前只读证据构造的 ReviewSession；不得改写原型或重写面板运行时。

面板应创建或复用带有 `data-page-delivery-review-host` 的 host，并将 UI 放入该 host 的开放 Shadow DOM。挂载后，页面临时 API 必须是 `window.__PAGE_DELIVERY_REVIEW__`。

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

在用户通过面板完成当前轮全部输入并统一提交前，`currentSubmissionReceived` 必须为假。等待当前面板提交，观察 `PAGE_DELIVERY_REVIEW_SUBMITTED`，然后调用 `window.__PAGE_DELIVERY_REVIEW__.exportSubmission()`；只有返回当前 ReviewSession 对应的提交，`currentSubmissionReceived` 才为真。

不得用旧提交、截图、文字转述或自动填写替代当前统一提交。未收到当前提交不得给出最终评审结论。

## 展示结果

仅当全部可观察谓词为真时，基于 `exportSubmission()` 的当前结果展示本轮评审卡、拟更新和后续确认门禁。仍然不得在确认前写 Plan，也不得在 reviewing 阶段生成 Draft OpenAPI。

若 Browser、host、Shadow Root、临时 API 或当前提交任一证据缺失，明确报告“评审阻塞”、说明缺失谓词和可执行的恢复动作；不得把阻塞说明写成最终评审结论。

## 消费方临时纠偏

当消费应用 dev server 或 build 因环境错误不可用时，不修复、不重启，也不把消费应用运行态作为评审启动条件。只要已发现的静态原型能够通过临时 loopback 服务在 in-app Browser 中打开，继续按本协议挂载和提交；否则保持“评审阻塞”，等待可访问的原型证据。

## 禁止的替代路径

- 不得启动消费项目 dev server。
- 不得执行消费项目 build。
- 不得退化为静态代码评审。
- 不得生成独立评审 HTML。
- 未收到当前提交不得给出最终评审结论。
- 不得以截图、文字结论、独立报告或另一套页面替代当前 Browser 中已验证的面板。
