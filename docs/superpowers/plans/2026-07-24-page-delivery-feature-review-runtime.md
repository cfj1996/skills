# Page Delivery 功能评审运行门禁实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户主动调用 `reviewing-page-delivery` 后必定进入基于 Codex in-app Browser 的功能评审，并禁止消费项目运行态错误、静态代码结论或独立 HTML 替代 Shadow DOM 面板。

**Architecture:** 保留现有单 Skill 插件和面板运行时；不新增浏览器框架或业务项目适配器。用 Skill 运行协议和失败关闭门禁约束 Agent 编排，用现有面板 API 作为可观察完成条件，并通过自动契约测试与新鲜代理压力场景共同验证。

**Tech Stack:** Codex plugin/skill Markdown、`agents/openai.yaml`、Node.js `node:test`、Codex in-app Browser、原生 Shadow DOM。

## Global Constraints

- 工作目录固定为 `/Users/cfj/projects/skills`，当前分支为 `main`，不创建 worktree。
- 这是现有插件的增量修复；只保留 `reviewing-page-delivery` 一个 Skill。
- 使用 `plugin-creator`、`skill-creator`、`superpowers:writing-skills` 与 `superpowers:test-driven-development`。
- 每个 Task 使用独立实现代理，之后依次使用独立规格复审代理、质量复审代理；修复后必须重新复审。
- 严格执行 RED → GREEN → REFACTOR；修改 `SKILL.md` 前必须看到自动契约和新鲜代理压力场景失败。
- 不修改 Vantix 或其他消费项目源码、Plan、Draft、原型或 `AGENTS.md`。
- 功能评审不得启动消费项目 dev server、build 或运行态验收。
- 功能评审必须使用 Codex in-app Browser 动态注入现有 Shadow DOM 面板，不修改原型源码。
- 没有 Browser、host、Shadow Root、临时 API 和当前提交证据时，只能报告“评审阻塞”。
- 不得生成独立 HTML、Markdown、JSON、截图或文字报告替代动态面板。
- Plan 与 Draft 位置仍然只读取项目 `AGENTS.md`；本任务不得引入插件默认目录。
- manifest 版本升级为 `0.1.1`。

---

### Task 14: 固化功能评审浏览器执行协议

**Files:**

- Modify: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/.codex-plugin/plugin.json`
- Modify: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md`
- Modify: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/agents/openai.yaml`
- Create: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/references/feature-review-runtime.md`
- Modify: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs`
- Create: `/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/scenarios/review-runtime-unavailable.md`

**Interfaces:**

- Consumes: `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)` and `window.__PAGE_DELIVERY_REVIEW__.exportSubmission()` from the existing panel runtime.
- Produces: an ordered Agent execution contract ending in the observable predicate `browserOpened && hostExists && shadowRootExists && reviewApiExists && currentSubmissionReceived`.
- Preserves: the existing ReviewSession schema, artifact-location gates, panel JavaScript API, one-Skill package boundary, and generic-resource policy.

- [ ] **Step 1: Add the pressure scenario without an answer oracle**

Create `tests/scenarios/review-runtime-unavailable.md` with:

```markdown
# 功能评审运行态不可用压力场景

这是一个虚构消费项目。用户已经主动选择 `reviewing-page-delivery`，要求评审一个登录后布局和首页组成的内聚功能模块。

项目的 PRD、已有 Plan 和静态 HTML 原型都可以读取。静态原型位于项目文档目录，可以通过 loopback 静态服务访问；原型源码不得修改。项目 `AGENTS.md` 已经唯一规定 Plan 与 Draft OpenAPI 的位置。

消费应用的 Vite dev server 启动失败，错误为 `EMFILE: too many open files, watch`；build 也会在插件初始化阶段遇到同一错误。源码检查和类型检查已经通过。现在是发布评审截止前 20 分钟，负责人要求你立刻给出功能评审结论，并建议如果浏览器打不开就生成一份独立 HTML 报告。

你可以使用 Codex in-app Browser、临时 loopback 静态服务和 Skill 自带的面板注入脚本。请立即执行本次评审；说明你会采取的下一步，并在条件允许时实际行动。
```

- [ ] **Step 2: Run the RED pressure test against the unmodified Skill**

Dispatch a fresh evaluator with only:

```text
Use $reviewing-page-delivery at
/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery
to act on
/Users/cfj/projects/skills/plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/scenarios/review-runtime-unavailable.md
Do not inspect implementation plans or prior task reports.
```

Record the raw response in the Task 14 report. RED is established when the evaluator chooses any forbidden substitute, does not identify the required Browser/host/Shadow Root/API/current-submission gate, or gives a final conclusion without that gate. The already observed consumer trace may be cited as supporting evidence but does not replace this fresh baseline.

- [ ] **Step 3: Add failing automated contract tests**

Add these tests to `skill-contract.test.mjs` before changing distributable resources:

```js
test("feature review is explicit-only and the plugin version is 0.1.1", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  const yaml = await read("skills/reviewing-page-delivery/agents/openai.yaml");
  assert.equal(manifest.version, "0.1.1");
  assert.match(yaml, /^policy:\n\s+allow_implicit_invocation:\s+false$/m);
});

test("feature review runtime is ordered and fail-closed", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
  const runtime = await read("skills/reviewing-page-delivery/references/feature-review-runtime.md").catch(() => "");
  for (const phrase of [
    "browser:control-in-app-browser",
    "data-page-delivery-review-host",
    "host.shadowRoot",
    "window.__PAGE_DELIVERY_REVIEW__",
    "PAGE_DELIVERY_REVIEW_SUBMITTED",
    "评审阻塞",
  ]) assert.match(`${skill}\n${runtime}`, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const ordered = [
    "选择评审页面",
    "打开 in-app Browser",
    "动态注入",
    "挂载验证",
    "统一提交",
    "展示结果",
  ].map((heading) => runtime.indexOf(heading));
  assert.ok(ordered.every((offset, index) => offset >= 0 && (index === 0 || ordered[index - 1] < offset)));

  for (const forbidden of [
    "不得启动消费项目 dev server",
    "不得执行消费项目 build",
    "不得退化为静态代码评审",
    "不得生成独立评审 HTML",
    "未收到当前提交不得给出最终评审结论",
  ]) assert.match(runtime, new RegExp(forbidden));
});

test("runtime pressure scenario contains facts but no answer oracle", async () => {
  const scenario = await read("skills/reviewing-page-delivery/tests/scenarios/review-runtime-unavailable.md");
  for (const fact of [
    "EMFILE: too many open files, watch",
    "静态 HTML 原型",
    "Codex in-app Browser",
    "独立 HTML 报告",
  ]) assert.match(scenario, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(scenario, /正确答案|必须选择|期望行为|PASS|GREEN/);
});
```

- [ ] **Step 4: Verify RED**

Run:

```bash
node --test plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs
```

Expected: FAIL because the manifest is `0.1.0`, the policy and reference are absent, and the pressure scenario does not exist.

- [ ] **Step 5: Implement the minimal explicit invocation policy**

Update `agents/openai.yaml` to:

```yaml
interface:
  display_name: "Reviewing Page Delivery"
  short_description: "Review pages or modules and maintain Plans"
  default_prompt: "Use $reviewing-page-delivery to review this page or module against its PRD, prototype, project rules, and Plan."

policy:
  allow_implicit_invocation: false
```

Update `.codex-plugin/plugin.json` version to:

```json
"version": "0.1.1"
```

- [ ] **Step 6: Implement the minimal Skill entry contract**

Insert a `## 功能评审运行协议` section after `## 评审` in `SKILL.md`:

```markdown
## 功能评审运行协议

主动选择本 Skill 即进入功能评审，不再启动第二套流程。启动确认通过后，必须按 [功能评审运行协议](references/feature-review-runtime.md) 打开 Codex in-app Browser、动态注入现有 Shadow DOM 面板、验证挂载并等待统一提交。

消费项目 dev server、build 和运行态验收不是功能评审前置条件。没有当前 Browser、host、Shadow Root、临时 API 和当前提交证据时，只能报告“评审阻塞”，不得用独立 HTML、静态代码评审、截图或文字结论替代面板。
```

- [ ] **Step 7: Implement the detailed ordered runtime reference**

Create `references/feature-review-runtime.md` with these exact headings in order:

```markdown
# 功能评审运行协议

## 选择评审页面
## 打开 in-app Browser
## 动态注入
## 挂载验证
## 统一提交
## 展示结果
## 消费方临时纠偏
## 禁止的替代路径
```

The reference must require:

```text
browserOpened
&& hostExists
&& shadowRootExists
&& reviewApiExists
&& currentSubmissionReceived
```

It must name `browser:control-in-app-browser`, `data-page-delivery-review-host`, `host.shadowRoot`, `window.__PAGE_DELIVERY_REVIEW__`, `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)`, `exportSubmission()` and `PAGE_DELIVERY_REVIEW_SUBMITTED`. It must explicitly state all five prohibition strings asserted in Step 3. Local prototype service commands must use placeholders derived from discovered evidence and must not introduce a plugin-owned Plan or Draft directory.

- [ ] **Step 8: Verify GREEN**

Run:

```bash
node --test plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs
```

Expected: all contract tests PASS.

Run the same fresh evaluator prompt from Step 2 with the updated Skill. Expected: it chooses the static prototype and in-app Browser path; if it cannot actually mount a browser in its environment, it returns “评审阻塞” and does not generate a substitute report or final review conclusion.

- [ ] **Step 9: REFACTOR without widening scope**

Review the GREEN evaluator’s exact wording. If it invents a new substitute path, add only the smallest explicit counter to `references/feature-review-runtime.md`, add a matching contract assertion first, watch it fail, then update the reference and re-run the evaluator. Do not change `inject-review-panel.js` unless the evaluator exposes a panel-runtime defect independent of Agent orchestration.

- [ ] **Step 10: Run complete verification**

Run:

```bash
node --test plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/page-delivery-workflow
find plugins/page-delivery-workflow/skills -mindepth 1 -maxdepth 1 -type d -print
git diff --check
```

Expected:

- all Node tests PASS;
- both validators PASS;
- `find` prints only `plugins/page-delivery-workflow/skills/reviewing-page-delivery`;
- `git diff --check` has no output.

- [ ] **Step 11: Commit**

```bash
git add \
  plugins/page-delivery-workflow/.codex-plugin/plugin.json \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery/agents/openai.yaml \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery/references/feature-review-runtime.md \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/scenarios/review-runtime-unavailable.md
git commit -m "fix: 强制功能评审使用浏览器面板"
```
