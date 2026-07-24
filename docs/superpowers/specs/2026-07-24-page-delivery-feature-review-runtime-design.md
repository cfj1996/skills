# Page Delivery 功能评审运行门禁设计

## 1. 状态与范围

- 设计状态：已批准
- 目标插件：`page-delivery-workflow`
- 目标 Skill：`reviewing-page-delivery`
- 目标版本：`0.1.1`
- 范围：修复真实调用 Skill 时未打开 in-app Browser、用独立 HTML 或静态代码评审替代功能评审的问题
- 非目标：不创建其他 Skill，不修改消费项目源码，不处理消费项目 dev server、build 或运行态错误

## 2. 已确认问题

现有面板运行时和浏览器夹具验收只证明：页面已经打开且脚本已经注入后，Shadow DOM 面板能够工作。真实消费任务暴露了缺失的编排门禁：

1. Agent 将消费项目 Vite 运行态错误视为功能评审前置条件。
2. Vite 因 `EMFILE` 失败后，Agent 退化成静态代码评审。
3. 后续显式调用 Skill 时，Agent 创建了独立评审 HTML，但没有打开 in-app Browser。
4. 整个过程没有挂载 `data-page-delivery-review-host`、创建 Shadow Root、暴露 `window.__PAGE_DELIVERY_REVIEW__` 或等待 `PAGE_DELIVERY_REVIEW_SUBMITTED`。

根因是 Skill 只要求“动态注入面板”，没有规定可验证的浏览器执行顺序，也没有在最终结论前设置失败关闭门禁。

## 3. 消费方临时处理

插件新版本生效前，消费方任务使用一次性任务约束纠偏，不修改消费项目：

1. 使用现有静态原型或用户提供的原型 URL。
2. 本地 HTML 仅通过临时 loopback 静态服务加载。
3. 不启动消费项目 dev server，不执行 build，不排查运行态错误。
4. 使用 Codex in-app Browser 打开原型。
5. 从已安装 Skill 读取并动态执行 `inject-review-panel.js`，不修改原型源码。
6. 在返回结论前报告并验证：
   - 当前 Browser URL；
   - `data-page-delivery-review-host` 存在；
   - `host.shadowRoot` 存在；
   - `window.__PAGE_DELIVERY_REVIEW__` 存在；
   - 当前会话已经收到 `PAGE_DELIVERY_REVIEW_SUBMITTED`。
7. 任一验证失败时只报告“评审阻塞”；独立 HTML、截图、静态代码评审和文字结论都不能替代面板。

临时处理不得写入消费项目源码、Plan、Draft 或 `AGENTS.md`。产物位置规则仍执行既有门禁。

## 4. 插件调用策略

`page-delivery-workflow` 继续只包含一个 `reviewing-page-delivery` Skill。插件是安装和分发容器，Skill 是工作流入口。

在 `agents/openai.yaml` 设置：

```yaml
policy:
  allow_implicit_invocation: false
```

用户在 Codex UI 中主动选择插件的 Skill，或显式使用 `$reviewing-page-delivery` 时进入功能评审。用户不需要在已经选择 Skill 后再启动第二套流程；普通页面讨论不得隐式进入。

## 5. 功能评审运行协议

Skill 在启动确认和产物位置规则门禁通过后，必须依次执行：

1. **选择评审页面**
   - 原型 URL 可访问时直接使用。
   - 原型是本地 HTML 时，从其父目录启动临时 loopback 静态服务。
   - 原型缺失时可使用中性静态宿主页展示“原型缺失”阻塞卡，但不得生成伪造原型或评审报告页面。
2. **打开 in-app Browser**
   - 必须调用 `browser:control-in-app-browser`。
   - 功能评审不依赖消费应用运行态，不得启动 dev server 或 build。
3. **动态注入**
   - 读取插件自带的 `inject-review-panel.js`。
   - 在页面上下文执行面板脚本和当前 ReviewSession。
   - 调用 `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)`。
   - 不向原型写入 `<script>`，不修改原型文件。
4. **挂载验证**
   - 验证 Browser URL 与预期页面一致。
   - 验证唯一 host、开放 Shadow Root 和临时 API。
   - 验证失败时进入“评审阻塞”，不得降级。
5. **统一提交**
   - 保持任务运行，等待用户在面板统一提交。
   - 只接受当前 `sessionId` 和 `submissionVersion` 的轻量事件。
   - 通过 `exportSubmission()` 读取完整冻结快照。
6. **展示结果**
   - 收到当前提交后才能执行评审和 `applyResult()`。
   - 最终文字答复只能总结已经在面板展示的结果。

## 6. 失败关闭门禁

以下任一条件未满足时，不得给出功能评审最终结论：

```text
browserOpened
&& hostExists
&& shadowRootExists
&& reviewApiExists
&& currentSubmissionReceived
```

禁止下列替代路径：

- 用消费项目 dev server、build 或运行态验收替代原型功能评审；
- 因 `EMFILE`、依赖安装、后端接口或登录态失败而转成静态代码评审；
- 创建独立 HTML、Markdown、JSON、截图或文字报告替代动态面板；
- 未等待面板统一提交就直接输出“通过”“暂缓通过”或“不通过”。

## 7. 测试策略

### RED

保留真实失败记录作为基线，并新增无答案提示的压力场景：

- 用户主动调用 Skill；
- 消费应用 Vite 报 `EMFILE`；
- 静态原型可用；
- 时间紧且已有静态代码证据；
- Agent 必须选择是否继续功能评审。

在修改 Skill 前用新鲜代理运行场景，记录其是否启动/构建应用、生成替代 HTML、跳过 Browser、或未提交即给结论。

同时先添加会失败的自动契约测试，锁定：

- `allow_implicit_invocation: false`；
- 浏览器运行协议的固定顺序；
- host、Shadow Root、API 和当前提交门禁；
- 禁止 dev/build、静态代码评审和独立 HTML 替代；
- 插件版本为 `0.1.1`。

### GREEN

最小修改：

- `SKILL.md` 增加核心运行顺序和失败关闭规则；
- 新增 `references/feature-review-runtime.md` 承载详细步骤、临时消费方约束和验证清单；
- `agents/openai.yaml` 增加显式调用策略；
- manifest 升级为 `0.1.1`。

使用相同压力场景重新运行新鲜代理；它必须选择静态原型 + in-app Browser 路径，并在无法实际完成挂载时明确阻塞，而不是生成替代报告。

### REFACTOR

依据 GREEN 代理出现的新绕行理由补强规则，只处理本次暴露的漏洞。重新运行契约测试、压力场景、完整 Node 测试、Skill 校验器和 Plugin 校验器。

## 8. 验收标准

- 仍然只有 `reviewing-page-delivery` 一个 Skill。
- 普通提示不会隐式触发；主动选择 Skill 后直接进入功能评审。
- 消费项目运行态失败不影响静态原型评审。
- 没有 Browser/Shadow DOM/API/当前提交证据时，Skill 只返回阻塞。
- 不生成独立评审 HTML。
- 原型和消费项目源码保持不变。
- 所有自动测试与官方校验器通过。
