# Reviewing Page Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task by task, with a fresh implementer and two-stage review for each task.

**Goal:** 创建可安装的 `page-delivery-workflow` Codex 插件，并以严格 RED → GREEN → REFACTOR 顺序交付首个 `reviewing-page-delivery` Skill；Skill 能从当前会话的结构化评审数据向 in-app 浏览器动态注入隔离面板、收集多轮评审指令、返回结构化结果，并在用户确认前保持目标项目零写入。

**Architecture:** 插件仅作为安装和分发容器，首版只包含一个自包含 Skill。Codex 负责读取项目规范、PRD、原型、Plan 和契约并在当前会话中提取结构化数据；三个无依赖 CommonJS 脚本分别负责浏览器面板运行时、客观统计和结构化 Plan 模型校验，禁止解析 Markdown 业务语义。浏览器面板通过 CDP 动态注入、Shadow DOM 隔离和 `window.__PAGE_DELIVERY_REVIEW__` 临时接口工作，不修改原型源码；Plan 始终是唯一长期事实源。

**Tech Stack:** Codex plugin/skill Markdown、Node.js CommonJS、`node:test`、Codex in-app Browser CDP、原生 DOM/Shadow DOM、JSON、Markdown。

---

## 全局约束

- 工作目录固定为 `/Users/cfj/projects/skills`，在用户指定的当前分支执行，不创建 worktree。
- 开始每个任务前重新检查 `git status --short`，不得覆盖或混入用户无关改动。
- 创建插件必须使用 `plugin-creator`；创建 Skill 必须使用 `skill-creator`。
- Skill 行为设计、实现和验证必须使用 `superpowers:writing-skills` 与 `superpowers:test-driven-development`。
- 首版只创建 `reviewing-page-delivery`，不得创建另外三个 Skill 或空占位目录。
- 插件核心、模板和测试夹具不得出现 Vantix、Zan、Element Plus、UnoCSS、仓配登录页或固定公司路径等项目事实。
- 所有脚本只接收 Codex 已提取的 JSON；不得从 Markdown Plan 猜测或解析业务语义。
- 用户确认“更新 Plan”前，不得创建或修改任何目标项目文件。
- 页面 Plan 固定遵循“一页一 Plan”，路径为 `plans/<项目>/<两位序号>-<中文页面名>.md`；同一页面持续更新同一文件。
- reviewing 阶段不生成 Draft OpenAPI；后续 planning 满足机器事实门禁后才可写入 `contracts/drafts/<项目>/<业务域>/<页面>.openapi.json`。
- 只报告客观计数、任务完成率和任务验证率；不得输出 `pageCompletionRate` 或单一“页面完成百分比”。
- 每次声称完成前执行 `superpowers:verification-before-completion`。

## 目标文件

```text
/Users/cfj/projects/skills/page-delivery-workflow/
├── .codex-plugin/
│   └── plugin.json
└── skills/
    └── reviewing-page-delivery/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        ├── scripts/
        │   ├── inject-review-panel.js
        │   ├── calculate-progress.js
        │   └── validate-page-plan.js
        ├── references/
        │   ├── page-review-standard.md
        │   ├── status-model.md
        │   └── api-contract-stages.md
        ├── assets/
        │   └── page-delivery-plan-template.md
        └── tests/
            ├── skill-contract.test.mjs
            ├── calculate-progress.test.mjs
            ├── validate-page-plan.test.mjs
            ├── review-panel-state.test.mjs
            ├── review-panel-browser.assertions.js
            ├── fixtures/
            │   ├── panel-host.html
            │   ├── page-plan-model.json
            │   └── review-session.json
            └── scenarios/
                └── review-conflicted-login.md
```

## 固定结构化契约

后续测试与实现使用同一最小模型，字段只能向后兼容扩展：

```js
{
  schemaVersion: 1,
  sessionId: "session-generic-login",
  pageKey: "sample/login",
  reviewRound: 1,
  planFingerprint: "sha256:fixture",
  submissionVersion: 0,
  mode: "input", // input | reviewing | result
  currentCardIndex: 0,
  viewScope: "round", // round | all
  cards: [{
    id: "REV-001",
    dimension: "页面定义",
    links: {
      features: ["F-001"],
      apis: [],
      uiStates: ["UI-001"],
      dependencies: [],
      tasks: ["T-001"],
      evidence: ["E-001"]
    },
    sourceEvidence: [{ id: "E-001", kind: "prototype", label: "登录表单", selector: "#login-form" }],
    reviewGoal: "确认页面职责",
    design: "提供身份验证入口",
    regionAndComponents: "主内容区中的登录表单",
    interactionStates: ["初始", "提交中", "失败", "成功"],
    relatedApis: [],
    mockScenarios: [],
    acceptanceCriteria: ["输入有效凭据后触发提交"],
    conclusion: "未评审",
    userNote: "",
    reviewResult: null,
    reopened: false,
    evidenceChanged: false
  }]
}
```

结构化页面 Plan 模型使用稳定编号和显式双向关联：

```js
{
  schemaVersion: 1,
  page: { id: "PAGE-001", name: "示例登录", status: "评审中" },
  features: [{ id: "F-001", status: "待实施", apiRefs: [], taskRefs: ["T-001"], evidenceRefs: ["E-001"] }],
  uiStates: [{ id: "UI-001", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  apis: [],
  dependencies: [],
  tasks: [{ id: "T-001", status: "待实施", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  acceptances: [{ id: "A-001", status: "未验证", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  evidence: [{ id: "E-001", kind: "prototype", locator: "#login-form" }],
  reviewBatches: []
}
```

### Task 1: 建立无 Skill 的 RED 基线

**Files:**

- Create: `/Users/cfj/projects/skills/tests/page-delivery-workflow/skill-contract.test.mjs`
- Create: `/Users/cfj/projects/skills/tests/page-delivery-workflow/scenarios/review-conflicted-login.md`
- Test: `/Users/cfj/projects/skills/tests/page-delivery-workflow/skill-contract.test.mjs`

**Step 1: 确认目标尚不存在**

Run:

```bash
test ! -e page-delivery-workflow
```

Expected: exit 0。若目录已存在，先检查是否为本计划未完成产物；不得直接删除用户文件。

**Step 2: 写入行为契约 RED**

`skill-contract.test.mjs` 使用 `node:test` 和 `node:assert/strict`，至少包含以下完整断言：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "page-delivery-workflow");
const skillRoot = path.join(pluginRoot, "skills", "reviewing-page-delivery");

const read = (relativePath) => readFile(path.join(pluginRoot, relativePath), "utf8");

test("plugin manifest and the only first-version skill exist", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  assert.equal(manifest.name, "page-delivery-workflow");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Page Delivery Workflow");
});

test("skill declares the review workflow and required gates", async () => {
  const skill = await read("skills/reviewing-page-delivery/SKILL.md");
  assert.match(skill, /^---\n[\s\S]*name: reviewing-page-delivery[\s\S]*\n---/);
  for (const required of [
    "superpowers:brainstorming",
    "superpowers:writing-plans",
    "superpowers:subagent-driven-development",
    "superpowers:verification-before-completion",
    "启动确认",
    "统一提交评审",
    "确认更新 Plan",
    "Plan 内容指纹",
    "in-app 浏览器",
    "Shadow DOM",
  ]) {
    assert.match(skill, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("first version contains no future skill placeholders", async () => {
  const skillDirectories = await readdir(path.join(pluginRoot, "skills"), {
    withFileTypes: true,
  });
  assert.deepEqual(
    skillDirectories.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ["reviewing-page-delivery"],
  );
});

test("generic core does not hardcode the acceptance project", async () => {
  const files = [
    ".codex-plugin/plugin.json",
    "skills/reviewing-page-delivery/SKILL.md",
  ];
  const forbidden = /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix/i;
  for (const file of files) assert.doesNotMatch(await read(file), forbidden, file);
});

test("skill root follows the standard skill layout", async () => {
  const yaml = await readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
  assert.match(yaml, /display_name:\s*"Reviewing Page Delivery"/);
  assert.match(yaml, /\$reviewing-page-delivery/);
});
```

场景 `review-conflicted-login.md` 必须是通用虚构项目，包含：

- 项目规范要求优先使用其组件体系，但未给出组件库名称。
- PRD 与原型对登录方式存在冲突。
- 已有 Plan 有一项“已确认”、一项“待修改”。
- API 只有业务目的，没有 method、URL 或字段机器事实。
- 用户要求“直接生成 Draft 并把页面设为可实施”。
- 预期正确行为：读规范、显式报告冲突、不猜接口、不生成 Draft、不跳过确认门禁、后续轮次只复评遗留或变化项。

**Step 3: 运行 RED**

Run:

```bash
node --test tests/page-delivery-workflow/skill-contract.test.mjs
```

Expected: FAIL，首个失败应为 `ENOENT .../.codex-plugin/plugin.json`，证明目标能力尚不存在。

**Step 4: 记录无 Skill 行为基线**

使用一个全新子代理，只提供场景文件内容，不提供设计文档、未来 Skill 或正确答案；要求其输出评审决策和下一步。记录它是否：

- 跳过项目规范发现；
- 猜测 API 字段；
- 直接生成 Draft；
- 跳过用户确认；
- 覆盖已确认项；
- 给出单一页面完成百分比。

这是 `superpowers:writing-skills` 的行为 RED。至少观察到一个真实缺口才进入 GREEN；如果全部偶然满足，增强压力条件并重跑，而不是伪造失败。

**Step 5: 提交 RED**

```bash
git add tests/page-delivery-workflow
git commit -m "test: 建立页面交付评审基线"
```

### Task 2: 使用官方创建器完成最小 GREEN 骨架

**Files:**

- Create: `/Users/cfj/projects/skills/page-delivery-workflow/.codex-plugin/plugin.json`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/agents/openai.yaml`
- Move: `/Users/cfj/projects/skills/tests/page-delivery-workflow/**`
- To: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/**`

**Step 1: 创建插件容器**

Run:

```bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py \
  page-delivery-workflow \
  --path /Users/cfj/projects/skills \
  --with-skills
```

Expected: 创建 `.codex-plugin/plugin.json` 和 `skills/`；不得带 `--with-marketplace`。

**Step 2: 创建首个且唯一 Skill**

Run:

```bash
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  reviewing-page-delivery \
  --path /Users/cfj/projects/skills/page-delivery-workflow/skills \
  --resources scripts,references,assets \
  --interface display_name="Reviewing Page Delivery" \
  --interface short_description="Review pages and maintain delivery Plans" \
  --interface default_prompt='Use $reviewing-page-delivery to review this page against its PRD, prototype, project rules, and Plan.'
```

Expected: 创建标准 `SKILL.md`、`agents/openai.yaml`、`scripts/`、`references/` 和 `assets/`。

**Step 3: 移动 RED 测试**

```bash
mkdir -p page-delivery-workflow/skills/reviewing-page-delivery/tests
git mv tests/page-delivery-workflow/* page-delivery-workflow/skills/reviewing-page-delivery/tests/
rmdir tests/page-delivery-workflow
```

若 `tests/` 已无其他内容，再删除空目录；不得递归删除。

**Step 4: 写最小 manifest**

`.codex-plugin/plugin.json` 最终内容：

```json
{
  "name": "page-delivery-workflow",
  "version": "0.1.0",
  "description": "Reusable page review and delivery-plan workflow for Codex.",
  "author": {
    "name": "Local developer"
  },
  "skills": "./skills/",
  "interface": {
    "displayName": "Page Delivery Workflow",
    "shortDescription": "Review pages and maintain delivery Plans.",
    "longDescription": "Adds a reusable, project-aware page review workflow with an in-app browser review panel and structured Plan handoff.",
    "developerName": "Local developer",
    "category": "Productivity",
    "capabilities": [
      "Interactive",
      "Write"
    ],
    "defaultPrompt": "Review this page against its PRD, prototype, project rules, and existing delivery Plan."
  }
}
```

**Step 5: 写最小 Skill 行为**

`SKILL.md` frontmatter 只保留：

```yaml
---
name: reviewing-page-delivery
description: Use when reviewing a page against a PRD, prototype, project rules, API evidence, dependencies, or an existing page delivery Plan, especially when Codex must collect decisions through the in-app browser and preserve multi-round review state.
---
```

正文最小但必须明确：

1. 启动前调用 `superpowers:brainstorming` 处理未确定事项。
2. 读取项目适用的 `AGENTS.md`、依赖和现有约束，不预设组件体系。
3. 启动确认通过前保持只读。
4. Codex 语义读取 Plan，脚本不得解析 Markdown。
5. 首轮全量生成，后续轮次默认只含遗留项和证据变化项。
6. in-app 浏览器动态注入 Shadow DOM 单卡面板。
7. 用户统一提交后才评审；展示拟更新内容；用户确认更新 Plan 后才写文件。
8. reviewing 阶段页面只能是“评审中”或“阻塞”，不得生成 Draft OpenAPI。
9. 评审完成后调用 `superpowers:writing-plans`；执行使用 `superpowers:subagent-driven-development`；完成声明前使用 `superpowers:verification-before-completion`。

**Step 6: 运行最小 GREEN 和结构校验**

Run:

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  page-delivery-workflow/skills/reviewing-page-delivery
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  page-delivery-workflow
```

Expected: contract tests、两个官方 validator 全部 PASS。这里的 GREEN 只证明插件骨架、唯一 Skill 和强制门禁成立，不代表脚本、reference 或浏览器能力已经实现。

**Step 7: 提交骨架**

```bash
git add page-delivery-workflow
git commit -m "feat: 初始化页面交付工作流插件"
```

### Task 3: TDD 实现客观统计

**Files:**

- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/calculate-progress.test.mjs`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/calculate-progress.js`

**Step 1: 写统计 RED**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { calculateObjectiveMetrics, countByStatus } = require("../scripts/calculate-progress.js");

test("counts statuses without inventing an aggregate page percentage", () => {
  const metrics = calculateObjectiveMetrics({
    reviewCards: [
      { conclusion: "已确认" },
      { conclusion: "待修改" },
      { conclusion: "阻塞" },
    ],
    features: [
      { status: "已完成" },
      { status: "已验证" },
      { status: "不适用" },
    ],
    tasks: [
      { status: "已完成" },
      { status: "已验证" },
      { status: "待实施" },
      { status: "不适用" },
    ],
    apis: [{ status: "Mock已接入" }],
    dependencies: [{ status: "路由契约待确认" }],
    acceptances: [{ status: "部分通过" }],
    draftOperations: [{ operationId: "login" }],
  });

  assert.deepEqual(metrics.tasks, {
    total: 3,
    completed: 2,
    verified: 1,
    completionRate: 66.67,
    verificationRate: 33.33,
  });
  assert.equal(metrics.review.byStatus["待修改"], 1);
  assert.equal(metrics.review.pendingRecheck, 2);
  assert.equal(metrics.draftOperationCount, 1);
  assert.equal("pageCompletionRate" in metrics, false);
});

test("returns zero rates for no applicable tasks", () => {
  const metrics = calculateObjectiveMetrics({ tasks: [{ status: "不适用" }] });
  assert.equal(metrics.tasks.total, 0);
  assert.equal(metrics.tasks.completionRate, 0);
  assert.equal(metrics.tasks.verificationRate, 0);
});

test("countByStatus does not mutate input", () => {
  const rows = Object.freeze([Object.freeze({ status: "待实施" })]);
  assert.deepEqual(countByStatus(rows), { "待实施": 1 });
});
```

**Step 2: 运行 RED**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/calculate-progress.test.mjs
```

Expected: FAIL `MODULE_NOT_FOUND ../scripts/calculate-progress.js`。

**Step 3: 写最小实现**

实现并只导出：

```js
"use strict";

function countByStatus(items = [], field = "status") {
  return items.reduce((counts, item) => {
    const value = item?.[field];
    if (typeof value === "string" && value.length > 0) {
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }, {});
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function calculateObjectiveMetrics(model = {}) {
  const tasks = (model.tasks || []).filter((item) => item.status !== "不适用");
  const completed = tasks.filter((item) => ["已完成", "已验证"].includes(item.status)).length;
  const verified = tasks.filter((item) => item.status === "已验证").length;
  const reviewByStatus = countByStatus(model.reviewCards, "conclusion");

  return {
    review: {
      total: (model.reviewCards || []).length,
      byStatus: reviewByStatus,
      pendingRecheck:
        (reviewByStatus["未评审"] || 0) +
        (reviewByStatus["待修改"] || 0) +
        (reviewByStatus["阻塞"] || 0),
    },
    features: countByStatus(model.features),
    tasks: {
      total: tasks.length,
      completed,
      verified,
      completionRate: percentage(completed, tasks.length),
      verificationRate: percentage(verified, tasks.length),
    },
    apis: countByStatus(model.apis),
    dependencies: countByStatus(model.dependencies),
    acceptances: countByStatus(model.acceptances),
    draftOperationCount: (model.draftOperations || []).length,
  };
}

module.exports = { calculateObjectiveMetrics, countByStatus };
```

**Step 4: 运行 GREEN**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/calculate-progress.test.mjs
```

Expected: 3 tests PASS。

**Step 5: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "feat: 添加页面交付客观统计"
```

### Task 4: TDD 实现结构化 Plan 校验

**Files:**

- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/page-plan-model.json`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/validate-page-plan.test.mjs`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/validate-page-plan.js`

**Step 1: 写校验 RED**

测试覆盖：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validatePagePlanModel } = require("../scripts/validate-page-plan.js");

const validModel = {
  schemaVersion: 1,
  page: { id: "PAGE-001", name: "示例登录", status: "评审中" },
  features: [{ id: "F-001", status: "待实施", apiRefs: ["API-001"], taskRefs: ["T-001"], evidenceRefs: ["E-001"] }],
  uiStates: [{ id: "UI-001", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  apis: [{ id: "API-001", status: "Draft已确认", featureRefs: ["F-001"], taskRefs: ["T-001"], evidenceRefs: ["E-001"] }],
  dependencies: [{ id: "DEP-001", status: "路由契约待确认", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  tasks: [{ id: "T-001", status: "待实施", featureRefs: ["F-001"], apiRefs: ["API-001"], evidenceRefs: ["E-001"] }],
  acceptances: [{ id: "A-001", status: "未验证", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  evidence: [{ id: "E-001", kind: "prototype", locator: "#login-form" }],
  reviewBatches: [],
};

test("accepts a normalized model with reciprocal links", () => {
  assert.deepEqual(validatePagePlanModel(validModel), { valid: true, errors: [] });
});

test("rejects an unsupported status", () => {
  const model = structuredClone(validModel);
  model.page.status = "快完成了";
  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /page\.status/);
});

test("rejects missing and one-way references", () => {
  const model = structuredClone(validModel);
  model.apis[0].featureRefs = [];
  model.tasks[0].apiRefs = ["API-404"];
  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /reciprocal|API-404/);
});

test("does not accept markdown as input", () => {
  const result = validatePagePlanModel("# 页面 Plan");
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /normalized object/);
});
```

**Step 2: 运行 RED**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/validate-page-plan.test.mjs
```

Expected: FAIL `MODULE_NOT_FOUND`。

**Step 3: 写最小校验器**

`validate-page-plan.js` 必须：

- 导出 `STATUS_MODEL` 与 `validatePagePlanModel`；
- 固定设计文档中的五组状态词；
- 拒绝字符串、数组和缺少 `schemaVersion: 1` 的输入；
- 对 `features`、`uiStates`、`apis`、`dependencies`、`tasks`、`acceptances`、`evidence` 检查同类唯一 ID；
- 检查所有 `*Refs` 均指向对应集合；
- 检查 feature ↔ API、feature ↔ task、API ↔ task 的双向关联；
- 返回全部错误 `{ valid, errors }`，不在首个错误处抛异常；
- 不读文件、不解析 Markdown、不改输入。

实现时使用小函数：

```js
function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function indexById(items, collectionName, errors) {
  const index = new Map();
  for (const item of items) {
    addError(errors, item && typeof item.id === "string", `${collectionName} item requires id`);
    if (!item?.id) continue;
    addError(errors, !index.has(item.id), `${collectionName} duplicate id: ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}
```

其余实现按测试逐步补齐，不增加 Markdown 解析入口。

**Step 4: 运行 GREEN**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/validate-page-plan.test.mjs
```

Expected: 4 tests PASS。

**Step 5: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "feat: 校验页面交付计划模型"
```

### Task 5: TDD 实现多轮评审状态机

**Files:**

- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/review-session.json`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-state.test.mjs`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/inject-review-panel.js`

**Step 1: 写纯状态 RED**

覆盖以下行为：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildStorageKey,
  clampPanelPosition,
  createReviewState,
  reduceReviewState,
  selectRoundCards,
} = require("../scripts/inject-review-panel.js");

const session = {
  schemaVersion: 1,
  sessionId: "session-1",
  pageKey: "sample/login",
  reviewRound: 2,
  planFingerprint: "sha256:fixture",
  cards: [
    { id: "REV-001", conclusion: "已确认", reopened: false, evidenceChanged: false },
    { id: "REV-002", conclusion: "待修改", reopened: false, evidenceChanged: false },
    { id: "REV-003", conclusion: "已确认", reopened: true, evidenceChanged: false },
    { id: "REV-004", conclusion: "不适用", reopened: false, evidenceChanged: true },
  ],
};

test("later rounds include only unresolved, reopened, or changed cards", () => {
  assert.deepEqual(selectRoundCards(session.cards, 2).map((card) => card.id), [
    "REV-002",
    "REV-003",
    "REV-004",
  ]);
  assert.equal(selectRoundCards(session.cards, 1).length, 4);
});

test("navigation keeps a single current card and saves edits", () => {
  let state = createReviewState(session);
  state = reduceReviewState(state, { type: "EDIT_CARD", patch: { userNote: "需补证据" } });
  state = reduceReviewState(state, { type: "NEXT" });
  assert.equal(state.cards[0].userNote, "需补证据");
  assert.equal(state.currentCardIndex, 1);
});

test("submission versions increase and stale results are rejected", () => {
  let state = reduceReviewState(createReviewState(session), { type: "SUBMIT" });
  assert.equal(state.mode, "reviewing");
  assert.equal(state.submissionVersion, 1);
  state = reduceReviewState(state, {
    type: "APPLY_RESULT",
    sessionId: "session-1",
    submissionVersion: 0,
    results: [],
  });
  assert.equal(state.mode, "reviewing");
  assert.match(state.lastError, /stale/i);
});

test("storage keys isolate project pages and position stays visible", () => {
  assert.equal(buildStorageKey("project-a/login"), "page-delivery-review:v1:project-a/login");
  assert.deepEqual(clampPanelPosition({ x: 999, y: -10 }, { width: 320, height: 500 }, { width: 800, height: 600 }), {
    x: 480,
    y: 0,
  });
});
```

再补充断言：

- `SUBMIT` 冻结深拷贝快照，不受随后草稿编辑影响；
- `APPLY_RESULT` 必须同时匹配 `sessionId` 和 `submissionVersion`；
- 结果排序优先级为“阻塞 → 待修改 → 冲突 → 其他”；
- `CONFIRM_PLAN` 只能在 result 模式触发；
- `planFingerprint` 在整个会话中不被 reducer 隐式改写。

**Step 2: 运行 RED**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-state.test.mjs
```

Expected: FAIL `MODULE_NOT_FOUND`。

**Step 3: 写最小 UMD/CommonJS 状态实现**

文件包装必须同时支持 Node 和浏览器：

```js
(function initPageDeliveryReview(globalObject, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalObject) globalObject.PageDeliveryReviewPanel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  // pure functions and mountReviewPanel
  return {
    buildStorageKey,
    clampPanelPosition,
    createReviewState,
    reduceReviewState,
    selectRoundCards,
    mountReviewPanel,
  };
});
```

先只实现纯函数使状态测试通过；`mountReviewPanel` 可暂时抛出明确的 `Not implemented`，浏览器能力留在下一任务继续 RED。

**Step 4: 运行 GREEN**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-state.test.mjs
```

Expected: 所有状态测试 PASS。

**Step 5: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "feat: 添加多轮评审状态机"
```

### Task 6: TDD 实现 Shadow DOM 单卡浏览器面板

**Files:**

- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/panel-host.html`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-browser.assertions.js`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/inject-review-panel.js`

**Step 1: 写浏览器 RED**

使用 `browser:control-in-app-browser` 和 in-app Browser CDP 运行断言，不新增 Playwright、JSDOM 或其他 npm 依赖。夹具必须包含 `#login-form` 证据节点和一条宿主样式污染规则。

`review-panel-browser.assertions.js` 定义可直接在页面上下文调用的异步函数：

```js
globalThis.runPageDeliveryBrowserAssertions = async function runPageDeliveryBrowserAssertions() {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const host = document.querySelector("[data-page-delivery-review-host]");
  check(Boolean(host), "review host should exist");
  check(Boolean(host?.shadowRoot), "review host should use an open Shadow Root");
  check(
    host?.shadowRoot?.querySelectorAll("[data-review-card]").length === 1,
    "exactly one review card should be rendered",
  );

  // 后续步骤补充导航、草稿、拖动、提交、结果和清理断言。
  return { valid: failures.length === 0, failures };
};
```

并覆盖：

- 重复 `mountReviewPanel(session)` 只保留一个宿主节点；
- 上一个/下一个只切换单张卡；
- 切换、收起、拖动后 localStorage 草稿恢复；
- 拖动不会超出视口，靠近左右边缘后吸附；
- 点击原型证据只创建临时覆盖层，不改目标节点的 `style` 属性；
- 统一提交后输入被冻结并进入 `reviewing`；
- 浏览器 console 仅发出 `PAGE_DELIVERY_REVIEW_SUBMITTED`、会话号和版本，不打印完整数据；
- `window.__PAGE_DELIVERY_REVIEW__.exportSubmission()` 返回完整快照；
- `applyResult()` 后优先显示阻塞、待修改和冲突项；
- 最后结果卡提供“确认更新 Plan”，并只发确认事件，不直接写文件；
- `destroy()` 清理 host、overlay、listener 和全局临时接口。

**Step 2: 运行 RED**

1. 用可控 PTY 启动夹具服务：

```bash
python3 -m http.server 17881 \
  --bind 127.0.0.1 \
  --directory page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures
```

2. 在 in-app 浏览器打开 `http://127.0.0.1:17881/panel-host.html`。
3. 用 CDP `Runtime.evaluate` 依次加载面板脚本、session fixture 和 assertions。
4. 调用 `PageDeliveryReviewPanel.mountReviewPanel(reviewSession)`，再调用 `runPageDeliveryBrowserAssertions()`。

Expected: `valid: false` 或 `mountReviewPanel` 抛出 `Not implemented`。记录失败后停止服务。

**Step 3: 实现最小 DOM 运行时**

`mountReviewPanel(session, options = {})` 必须：

1. 验证 `document`、session 和 cards。
2. 复用或创建带 `data-page-delivery-review-host` 的宿主节点。
3. 使用 `host.attachShadow({ mode: "open" })`。
4. 在 Shadow Root 内创建内联 `<style>`、标题栏、进度计数、单卡正文、结论选择、备注、上下页按钮和提交按钮。
5. 所有事件统一登记到 cleanup 列表。
6. 使用 pointer events 拖动标题栏；pointer up 时按阈值吸附左右。
7. 使用 `clampPanelPosition` 处理 resize。
8. 每次状态变化保存允许的草稿字段，不保存证据正文、敏感信息或评审结果。
9. 使用覆盖层高亮 evidence selector；不改原元素属性。
10. 暴露：

```js
window.__PAGE_DELIVERY_REVIEW__ = {
  getState,
  exportSubmission,
  applyResult,
  destroy,
};
```

11. 提交时发：

```js
console.debug("PAGE_DELIVERY_REVIEW_SUBMITTED", {
  sessionId: state.sessionId,
  submissionVersion: state.submissionVersion,
});
```

12. 确认 Plan 时发：

```js
console.debug("PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED", {
  sessionId: state.sessionId,
  submissionVersion: state.submissionVersion,
  planFingerprint: state.planFingerprint,
});
```

不得执行文件系统、网络、Cookie 或凭证读取。

**Step 4: 运行 GREEN**

先运行：

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-state.test.mjs
```

再重复 Step 2 的 in-app Browser CDP 流程。

Expected: 状态测试 PASS，`runPageDeliveryBrowserAssertions()` 返回 `{ valid: true, failures: [] }`。

**Step 5: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "feat: 注入页面交付评审面板"
```

### Task 7: TDD 固化评审规范、状态和 Plan 模板

**Files:**

- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/references/page-review-standard.md`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/references/status-model.md`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/references/api-contract-stages.md`
- Create: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/assets/page-delivery-plan-template.md`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md`

**Step 1: 扩充文档契约 RED**

在 contract test 中加入固定数组并逐项断言：

```js
const dimensions = [
  "页面定义",
  "URL、路由与参数",
  "UI 布局",
  "组件与功能实现方案",
  "功能点与业务规则",
  "交互状态",
  "API 设计",
  "Mock 设计",
  "权限与安全",
  "路由、会话及跨页面状态",
  "验收步骤和证据",
];

const statuses = [
  "评审中", "可实施", "开发中", "待对接", "待验收", "已交付", "阻塞",
  "待实施", "已完成", "已验证", "不适用",
  "不涉及接口", "Draft已确认", "Mock已接入", "已同步正式契约", "联调中", "已验收",
  "不涉及", "路由契约待确认", "待目标页面实现", "占位页可达", "页面对接中", "已对接",
  "未验证", "部分通过", "已通过", "验收阻塞",
];
```

还要断言模板包含以下稳定章节：

```text
页面定义
路由与参数
功能点与业务规则
组件与功能实现方案
UI 与交互状态
API 与 Mock
权限与安全
页面依赖
实施任务
验收步骤与证据
评审批次
客观统计
遗留问题
```

断言每个实体示例都有稳定 ID 和显式 `关联` 字段，并禁止：

```text
页面完成率
隐藏 JSON
自动生成 Draft
从 Markdown 解析
```

**Step 2: 运行 RED**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs
```

Expected: FAIL，缺少 references/assets 或缺少固定内容。

**Step 3: 写最小参考资料**

- `page-review-standard.md`：写 11 个维度、每卡字段、证据优先级、项目规范发现、首次全量/后续复评、两阶段确认和冲突展示。
- `status-model.md`：写五组固定状态、证据门禁和允许的客观统计；明确禁止单一页面完成百分比。
- `api-contract-stages.md`：写正式来源搜索顺序、不得猜字段、reviewing 不生成 Draft、后续 planning 生成 Draft 的全部机器事实门禁和固定路径格式。
- `page-delivery-plan-template.md`：人类可读 Markdown；一页一 Plan；固定章节、稳定编号、双向关联、评审批次、指纹冲突检查说明；不内嵌 JSON。
- `SKILL.md`：通过直接链接按需加载三个 reference 和模板，避免把全部内容重复进主文件。

**Step 4: 运行 GREEN**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/skill-contract.test.mjs
```

Expected: 所有 contract tests PASS。

**Step 5: 官方校验**

```bash
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  page-delivery-workflow/skills/reviewing-page-delivery
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  page-delivery-workflow
```

Expected: 两者 PASS。

**Step 6: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "docs: 添加页面交付评审规范"
```

### Task 8: REFACTOR 多轮、冲突和恢复边界

**Files:**

- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-state.test.mjs`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/review-panel-browser.assertions.js`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/inject-review-panel.js`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/validate-page-plan.test.mjs`
- Modify: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/validate-page-plan.js`

**Step 1: 先增加遗漏测试**

新增并先确认失败：

- 同一 `pageKey` 不同 `planFingerprint` 时，不自动恢复旧评审选择，只恢复安全 UI 偏好。
- Plan 指纹变化后，提交返回 `plan-conflict`，不得进入可确认写入状态。
- 二次评审保留已确认项；`viewScope=round` 只显示遗留、重开和证据变化；`viewScope=all` 可查看全部。
- “已确认”卡证据变化后重新进入本轮，但原结论保留为 previousConclusion。
- 关闭后再次挂载没有重复 resize/pointer/console 监听器。
- evidence selector 无效或跨域 frame 不可达时显示“无法定位”，不抛出未捕获异常。
- localStorage 不可用时仍能在内存中工作。
- 同一 API/任务引用关系不对称时输出确定性的排序错误列表。

Run:

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
```

Expected: 新增测试至少一项 FAIL。

**Step 2: 最小重构**

- 把持久化拆为 `loadDraft` / `saveDraft` / `sanitizeDraft`。
- 把监听器登记拆为 `createCleanupRegistry`。
- 把证据定位拆为 `highlightEvidence`。
- 把结果排序拆为纯函数 `prioritizeReviewResults`。
- 把 Plan 冲突判断拆为 `assertPlanFingerprint(expected, actual)`。
- 对所有返回错误使用稳定 `code`，UI显示人类可读 message。

不要增加项目识别逻辑到脚本；项目识别仍由 Skill 指导 Codex完成。

**Step 3: 全量复测**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
```

Expected: 全部 PASS。

**Step 4: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "refactor: 完善多轮页面评审"
```

### Task 9: 使用 writing-skills 做行为 GREEN 与压力复测

**Files:**

- Modify if needed: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md`
- Modify if needed: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/references/*.md`
- Test: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/scenarios/review-conflicted-login.md`

**Step 1: 用新鲜子代理运行有 Skill 场景**

向未参与实现的新鲜子代理提供：

- `SKILL.md`；
- Skill明确要求读取的 reference；
- 与 Task 1 完全相同的压力场景；
- 要求输出它将采取的顺序、允许写入的内容、阻塞项、评审轮次和下一道用户门禁。

不得给出预期答案。

**Step 2: 对比 RED 基线**

必须确认新输出：

- 先发现项目规则，组件体系不明确时标记待确认；
- 显式报告 PRD/原型冲突；
- 不猜 method、URL、字段或 Schema；
- reviewing 阶段不生成 Draft；
- 不把页面设为可实施；
- 用户确认前不写 Plan；
- 第二轮只处理遗留、重开和证据变化；
- 不输出单一页面完成百分比。

**Step 3: REFACTOR Skill**

若子代理仍能合理误读，按 `superpowers:writing-skills` 修复根因：

- 新增明确门禁，不只补一个示例；
- 去除重复段落；
- 把详细规则移到对应 reference；
- 保持 `SKILL.md` 简洁且强制；
- 重跑同一压力场景直到通过。

**Step 4: 两阶段审查**

1. 规格审查子代理：只检查实现是否遗漏或超出设计。
2. 质量审查子代理：只检查可读性、危险默认值、脆弱约定和测试盲区。

先修规格问题并复审通过，再进行质量审查；不得并行混合反馈。

**Step 5: 提交**

```bash
git add page-delivery-workflow/skills/reviewing-page-delivery
git commit -m "test: 验证页面交付评审行为"
```

### Task 10: in-app 浏览器通用夹具验收

**Files:**

- Test: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/panel-host.html`
- Test: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/review-session.json`
- Modify if needed: `/Users/cfj/projects/skills/page-delivery-workflow/skills/reviewing-page-delivery/scripts/inject-review-panel.js`

**Step 1: 记录夹具哈希**

```bash
shasum -a 256 \
  page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures/panel-host.html
```

保存输出用于结束对比。

**Step 2: 启动只读夹具服务**

```bash
python3 -m http.server 17881 \
  --bind 127.0.0.1 \
  --directory page-delivery-workflow/skills/reviewing-page-delivery/tests/fixtures
```

让进程在可控 PTY 中运行，验收后发送 Ctrl-C；不得后台遗留服务。

**Step 3: 使用 in-app Browser CDP 注入**

1. 打开 `http://127.0.0.1:17881/panel-host.html`。
2. 读取 `inject-review-panel.js` 和 `review-session.json`。
3. 通过 `Runtime.evaluate` 执行脚本，再调用：

```js
PageDeliveryReviewPanel.mountReviewPanel(reviewSession)
```

4. 不通过 `<script src>` 写入夹具，不编辑 HTML。

**Step 4: 人机验收**

逐项确认：

- Shadow Root 存在；
- 默认右侧停靠；
- 单次只显示一张卡；
- 上一个/下一个有效；
- 修改结论和备注后切换，草稿仍在；
- 可收起并恢复；
- 拖动可避让需求区域，边缘自动吸附，窗口缩放后仍可见；
- 证据点击高亮 `#login-form`，原节点属性未变化；
- 统一提交后 console 只有轻量事件；
- Codex 能用 `exportSubmission()` 读取完整固定结构；
- `applyResult()` 后问题项优先展示；
- 确认按钮只产生请求，不写文件；
- `destroy()` 后页面恢复。

**Step 5: 验证零源码修改**

再次运行相同 `shasum`，Expected: 与 Step 1 完全相同。

**Step 6: 停止服务并复测**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
```

Expected: 全部 PASS。

### Task 11: Vantix Operation 真实样本只读验收

**Files:**

- Read only: `/Users/cfj/projects/AGENTS.md`
- Read only: `/Users/cfj/projects/vantix/AGENTS.md` if present
- Read only: `/Users/cfj/projects/vantix/frontend/AGENTS.md`
- Read only: `/Users/cfj/projects/vantix/frontend/apps/operation/AGENTS.md`
- Read only: `/Users/cfj/projects/vantix/documents/产品需求/仓配系统_v1.0/仓配作业系统PRD.md`
- Read only: `/Users/cfj/projects/vantix/documents/产品原型/仓配作业系统/index.html`
- Read only: `/Users/cfj/projects/vantix/frontend/plans/operation/01-登录页面.md`

**Step 1: 重新加载运行时项目规则**

按 workspace 和项目 `AGENTS.md` 委托链读取适用规范，确认组件体系、样式体系、路由/API门禁来自目标项目，而不是插件核心。

**Step 2: 记录目标文件状态**

```bash
git -C /Users/cfj/projects/vantix status --short
shasum -a 256 \
  /Users/cfj/projects/vantix/documents/产品原型/仓配作业系统/index.html \
  /Users/cfj/projects/vantix/frontend/plans/operation/01-登录页面.md
```

记录已有用户改动，验收不得清理、覆盖或归因于本插件。

**Step 3: 启动用户指定原型服务**

```bash
python3 -m http.server 17880 \
  --bind 127.0.0.1 \
  --directory '/Users/cfj/projects/vantix/documents/产品原型/仓配作业系统'
```

若端口已有正确服务，复用而不是再启动。

**Step 4: 运行 reviewing 流程到确认门禁前**

- 打开 PRD 和原型。
- 自动发现既有登录页面 Plan。
- 将用户已确认的登录业务结论作为显式运行时输入。
- 首轮全量生成 11 维度的评审内容。
- 动态注入面板并逐卡模拟选择、备注和保存。
- 统一提交，Codex执行评审并结构化读取结果。
- 面板展示冲突、待修改、阻塞和拟更新 Plan 摘要。
- 停在“确认更新 Plan”前，不点击确认，不写 Vantix Plan。

**Step 5: 验收项目规则动态识别**

确认运行时输出识别目标项目当前规则，包括目标项目规定的组件库、样式和 token；再用源码搜索证明插件核心不含这些字符串：

```bash
rg -n \
  'Vantix|@zan/ui-vue3|Element Plus|UnoCSS|仓配|/Users/cfj/projects/vantix' \
  page-delivery-workflow/.codex-plugin/plugin.json \
  page-delivery-workflow/skills/reviewing-page-delivery/SKILL.md \
  page-delivery-workflow/skills/reviewing-page-delivery/scripts \
  page-delivery-workflow/skills/reviewing-page-delivery/references \
  page-delivery-workflow/skills/reviewing-page-delivery/assets
```

Expected: 无匹配，exit 1。

**Step 6: 验证 Vantix 零写入**

重复 Step 2 的 `git status` 和 `shasum`。Expected:

- 两个哈希不变；
- 没有新增由验收产生的 Vantix 源码或 Plan 改动；
- 浏览器清理后原型 DOM 中无评审 host 和 overlay。

停止本轮启动的服务。

### Task 12: 最终验证与交付

**Files:**

- Verify: `/Users/cfj/projects/skills/page-delivery-workflow/**`
- Verify: `/Users/cfj/projects/skills/docs/superpowers/specs/2026-07-23-page-delivery-workflow-design.md`
- Verify: `/Users/cfj/projects/skills/docs/superpowers/plans/2026-07-23-reviewing-page-delivery.md`

**Step 1: 使用 verification-before-completion**

重新读取该 Skill 并按其证据门禁执行，不使用较早测试结果代替当前结果。

**Step 2: 运行完整自动化验证**

```bash
node --test page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  page-delivery-workflow/skills/reviewing-page-delivery
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  page-delivery-workflow
git diff --check
```

Expected: tests 全部 PASS；两个 validator PASS；`git diff --check` 无输出。

**Step 3: 运行范围和硬编码验证**

```bash
find page-delivery-workflow/skills -mindepth 1 -maxdepth 1 -type d -print
rg -n \
  'pageCompletionRate|页面完成率|Vantix|@zan/ui-vue3|Element Plus|UnoCSS|仓配|/Users/cfj/projects/vantix' \
  page-delivery-workflow
```

Expected:

- `find` 只输出 `reviewing-page-delivery`；
- `rg` 无匹配，exit 1。

若测试源码必须断言禁止词，禁止词会合法出现在测试中；此时把检查范围收窄到 `SKILL.md`、`scripts/`、`references/`、`assets/` 和 manifest，并在交付证据中说明。

**Step 4: 检查 Git 范围**

```bash
git status --short
git diff --stat HEAD
git log --oneline -10
```

Expected: 只包含本插件、设计文档和实施计划的预期变更；无 Vantix 文件。

**Step 5: 最终提交**

若最后一轮修复仍有未提交文件：

```bash
git add page-delivery-workflow docs/superpowers/specs/2026-07-23-page-delivery-workflow-design.md docs/superpowers/plans/2026-07-23-reviewing-page-delivery.md
git commit -m "feat: 完成页面交付评审工作流"
```

**Step 6: 交付报告**

报告必须包含：

- 插件和 Skill 路径；
- RED 基线的真实失败；
- 自动化测试数量与最新通过输出；
- 官方 plugin/skill validator 输出；
- 通用夹具与 Vantix in-app 浏览器验收结果；
- 原型和 Vantix Plan 哈希未变证据；
- 多轮评审、Plan 指纹和确认门禁证据；
- 当前分支和提交；
- 明确说明首版没有创建后续三个 Skill、没有安装/发布插件。

不得声称 `planning-page-delivery`、`tracking-page-delivery` 或 `verifying-page-delivery` 已完成。
