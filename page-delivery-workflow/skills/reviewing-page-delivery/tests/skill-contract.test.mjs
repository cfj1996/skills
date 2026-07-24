import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const isStagingLayout = (directory) =>
  path.basename(directory) === "page-delivery-workflow" &&
  path.basename(path.dirname(directory)) === "tests";
const resolvePluginRoot = (directory) =>
  isStagingLayout(directory)
    ? path.resolve(directory, "..", "..", "page-delivery-workflow")
    : path.resolve(directory, "..", "..", "..");
const pluginRoot = resolvePluginRoot(testDir);
const skillRoot = path.join(pluginRoot, "skills", "reviewing-page-delivery");
const scenarioPath = path.join(testDir, "scenarios", "review-conflicted-login.md");
const require = createRequire(import.meta.url);
const { STATUS_MODEL } = require(path.join(skillRoot, "scripts", "validate-page-plan.js"));

const read = (relativePath) => readFile(path.join(pluginRoot, relativePath), "utf8");
const visibleMarkdown = (markdown) => markdown.replace(/<!--[\s\S]*?-->/g, "");

const sectionContaining = (markdown, marker) => {
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  const rest = markdown.slice(start);
  const nextHeading = rest.slice(1).search(/^##\s+/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
};

const visibleLineContaining = (markdown, marker) => {
  const line = visibleMarkdown(markdown)
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(marker));
  assert.ok(line, `missing visible line: ${marker}`);
  return line;
};

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

const genericResourcePaths = [
  ".codex-plugin/plugin.json",
  "skills/reviewing-page-delivery/SKILL.md",
  "skills/reviewing-page-delivery/agents/openai.yaml",
  "skills/reviewing-page-delivery/references/page-review-standard.md",
  "skills/reviewing-page-delivery/references/status-model.md",
  "skills/reviewing-page-delivery/references/api-contract-stages.md",
  "skills/reviewing-page-delivery/assets/page-delivery-plan-template.md",
  "skills/reviewing-page-delivery/scripts/inject-review-panel.js",
  "skills/reviewing-page-delivery/scripts/calculate-progress.js",
  "skills/reviewing-page-delivery/scripts/validate-page-plan.js",
  "skills/reviewing-page-delivery/tests/fixtures/panel-host.html",
  "skills/reviewing-page-delivery/tests/fixtures/page-plan-model.json",
  "skills/reviewing-page-delivery/tests/fixtures/review-session.json",
];

test("plugin manifest and the only first-version skill exist", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  assert.equal(manifest.name, "page-delivery-workflow");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Page Delivery Workflow");
});

test("skill declares the review workflow and required gates", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
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
    "页面或模块",
    "产物位置规则",
    "不得提供默认目录",
    "两道独立门禁",
  ]) {
    assert.match(skill, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("workflow gates have an enforced order and explicit visible prohibitions", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
  const startupConfirmation = skill.indexOf("启动确认");
  const unifiedReview = skill.indexOf("统一提交评审");
  const planConfirmation = skill.indexOf("确认更新 Plan");
  assert.ok(
    startupConfirmation < unifiedReview && unifiedReview < planConfirmation,
    "启动确认、统一提交评审、确认更新 Plan 必须按此顺序出现",
  );

  const locationRules = sectionContaining(skill, "产物位置规则");
  assert.match(locationRules, /不得提供默认目录/);
  assert.match(locationRules, /两道独立门禁/);
  assert.match(visibleLineContaining(skill, "不得生成 Draft"), /不得生成 Draft/);
  assert.match(
    visibleLineContaining(skill, "不得在确认前写 Plan"),
    /不得在确认前写 Plan/,
  );
});

test("review references define all dimensions, status groups, and artifact gates", async () => {
  const standard = await read("skills/reviewing-page-delivery/references/page-review-standard.md");
  const statusModel = await read("skills/reviewing-page-delivery/references/status-model.md");
  const apiStages = await read("skills/reviewing-page-delivery/references/api-contract-stages.md");

  for (const dimension of dimensions) assert.match(standard, new RegExp(dimension));
  for (const field of [
    "临时卡片编号", "评审域", "关联", "来源证据", "评审目标", "设计方案",
    "页面区域、布局和组件", "交互状态", "关联 API", "Mock 场景", "验收标准", "用户备注",
  ]) assert.match(standard, new RegExp(field));
  for (const rule of [
    "证据优先级", "项目规范发现", "首次全量", "后续复评", "两阶段确认", "展示冲突",
    "一次确认", "AGENTS.md", "不得提供默认目录",
  ]) assert.match(standard, new RegExp(rule));
  for (const status of statuses) assert.match(statusModel, new RegExp(status));
  assert.match(statusModel, /页面完成百分比/);
  assert.match(statusModel, /禁止/);
  for (const rule of [
    "正式来源搜索顺序", "不得猜", "reviewing", "不得生成 Draft", "planning",
    "method", "URL", "Schema", "AGENTS.md", "全部确认",
  ]) assert.match(apiStages, new RegExp(rule));
});

test("artifact-location candidates must be confirmed, solidified, reread, and uniquely resolved before review continues", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
  const standard = await read("skills/reviewing-page-delivery/references/page-review-standard.md");

  for (const document of [skill, standard]) {
    const confirm = document.indexOf("用户确认完整候选");
    const solidify = document.indexOf("固化至最近适用公共作用域");
    const reread = document.indexOf("重新读取");
    const resolve = document.indexOf("唯一解析");
    const continueReview = document.indexOf("才能继续");
    assert.ok(
      confirm < solidify && solidify < reread && reread < resolve && resolve < continueReview,
      "确认 → 固化 → 重新读取 → 唯一解析 → 才能继续 必须按顺序出现",
    );
    assert.match(document, /未经用户确认不得固化/);
  }
});

test("plan template keeps stable human-readable sections and prohibits unsafe defaults", async () => {
  const template = await read("skills/reviewing-page-delivery/assets/page-delivery-plan-template.md");
  for (const section of [
    "页面定义", "路由与参数", "功能点与业务规则", "组件与功能实现方案", "UI 与交互状态",
    "API 与 Mock", "权限与安全", "页面依赖", "实施任务", "验收步骤与证据", "评审批次",
    "客观统计", "遗留问题",
  ]) assert.match(template, new RegExp(`^## .*${section}`, "m"));
  for (const required of [
    "交付单元类型：页面/模块", "deliveryUnit.kind", "产物位置规则来源", "稳定编号", "关联",
    "双向关联", "Plan 内容指纹", "产物位置规则指纹", "冲突检查", "一个页面或一个内聚功能模块对应一个 Plan",
  ]) assert.match(template, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const forbidden of [
    "页面完成率", "隐藏 JSON", "自动生成 Draft", "从 Markdown 解析", "插件默认 Plan 目录", "插件默认 Draft 目录",
  ]) assert.match(template, new RegExp(`不得.*${forbidden}`));
});

test("plan template limits validated bidirectional links to feature, API, and task triples", async () => {
  const template = await read("skills/reviewing-page-delivery/assets/page-delivery-plan-template.md");
  const lineWith = (id) => template.split(/\r?\n/).find((line) => line.startsWith(`- \`${id}\``));

  for (const [id, expected] of [
    ["F-001", "双向关联：`<API-001, T-001>`"],
    ["API-001", "双向关联：`<F-001, T-001>`"],
    ["T-001", "双向关联：`<F-001, API-001>`"],
  ]) assert.match(lineWith(id), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const id of [
    "PAGE-001", "ROUTE-001", "DESIGN-001", "UI-001", "MOCK-001", "SEC-001",
    "DEP-001", "AC-001", "E-001", "RR-001", "ISSUE-001",
  ]) {
    const line = lineWith(id);
    assert.match(line, /关联：/);
    assert.doesNotMatch(line, /双向关联：/);
  }
  assert.match(template, /功能点↔API、功能点↔任务、API↔任务/);
  assert.match(template, /其他关联只校验目标存在或一致性/);
});

test("template uses evidence-selected exemption statuses instead of inventing API or dependency facts", async () => {
  const template = await read("skills/reviewing-page-delivery/assets/page-delivery-plan-template.md");
  assert.match(template, /API-001.*状态：`<证据确认后从接口固定状态集合选择>`/);
  assert.match(template, /DEP-001.*状态：`<证据确认后从页面依赖固定状态集合选择>`/);
  assert.match(template, /“不涉及接口”状态必须有不适用证据/);
  assert.match(template, /“不涉及”状态必须有不适用证据/);
  assert.doesNotMatch(template, /API-001.*状态：`不涉及接口`/);
  assert.doesNotMatch(template, /DEP-001.*状态：`不涉及`/);
});

test("documentation status terms match the validator and generic assets contain no project defaults", async () => {
  const content = (await Promise.all(genericResourcePaths.map(read))).join("\n");
  const statusTerms = Object.values(STATUS_MODEL).flat();
  for (const status of statusTerms) assert.match(content, new RegExp(status));
  assert.match(content, /不得提供默认目录|不得使用插件默认目录/);
  assert.doesNotMatch(
    content,
    /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix|product\/plans\/|engineering\/implementation-plans\/|api\/drafts\/|contracts\/openapi\//i,
  );
});

test("generic resource scanner covers distributable resources and excludes test code and pressure scenarios", () => {
  const expected = [
    ".codex-plugin/plugin.json",
    "skills/reviewing-page-delivery/SKILL.md",
    "skills/reviewing-page-delivery/agents/openai.yaml",
    "skills/reviewing-page-delivery/references/page-review-standard.md",
    "skills/reviewing-page-delivery/references/status-model.md",
    "skills/reviewing-page-delivery/references/api-contract-stages.md",
    "skills/reviewing-page-delivery/assets/page-delivery-plan-template.md",
    "skills/reviewing-page-delivery/scripts/inject-review-panel.js",
    "skills/reviewing-page-delivery/scripts/calculate-progress.js",
    "skills/reviewing-page-delivery/scripts/validate-page-plan.js",
    "skills/reviewing-page-delivery/tests/fixtures/panel-host.html",
    "skills/reviewing-page-delivery/tests/fixtures/page-plan-model.json",
    "skills/reviewing-page-delivery/tests/fixtures/review-session.json",
  ];
  assert.deepEqual([...genericResourcePaths].sort(), expected.sort());
  assert.ok(!genericResourcePaths.some((file) => file.endsWith(".test.mjs")));
  assert.ok(!genericResourcePaths.some((file) => file.includes("tests/scenarios/")));
});

test("skill links its detailed references without duplicating them", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
  for (const resource of [
    "references/page-review-standard.md", "references/status-model.md", "references/api-contract-stages.md",
    "assets/page-delivery-plan-template.md",
  ]) assert.match(skill, new RegExp(resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(skill, /Plan 路径模式/);
  assert.match(skill, /Draft OpenAPI 路径模式/);
  assert.match(skill, /交付单元命名/);
  assert.match(skill, /编号规则/);
  assert.match(skill, /路径变量/);
  assert.match(skill, /既有文件/);
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
  const forbidden = /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix|plans\/<项目>|contracts\/drafts\//i;
  for (const file of files) assert.doesNotMatch(await read(file), forbidden, file);
});

test("skill root follows the standard skill layout", async () => {
  const yaml = await readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
  assert.match(yaml, /display_name:\s*"Reviewing Page Delivery"/);
  assert.match(yaml, /\$reviewing-page-delivery/);
});

test("test location resolves the plugin root without the current working directory", () => {
  const repoRoot = path.dirname(pluginRoot);
  const stagingPath = path.join(repoRoot, "tests", "page-delivery-workflow");
  const movedTestPath = path.join(
    pluginRoot,
    "skills",
    "reviewing-page-delivery",
    "tests",
  );

  assert.equal(path.basename(pluginRoot), "page-delivery-workflow");
  assert.equal(path.basename(path.dirname(pluginRoot)), "skills");
  assert.equal(isStagingLayout(stagingPath), true);
  assert.equal(resolvePluginRoot(stagingPath), pluginRoot);
  assert.equal(isStagingLayout(movedTestPath), false);
  assert.equal(resolvePluginRoot(testDir), pluginRoot);
  assert.equal(resolvePluginRoot(movedTestPath), pluginRoot);
});

test("pressure scenario preserves required facts and excludes answer oracles", async () => {
  const scenario = await readFile(scenarioPath, "utf8");
  const actionOracle =
    /(?:必须|应当|应该)(?:立即|直接)?(?:拒绝|禁止|停止)(?:生成|创建|编写)\s*(?:任何\s*)?(?:Draft(?:\s*OpenAPI)?|Plan)/i;
  assert.match("必须拒绝生成 Draft", actionOracle);
  assert.doesNotMatch("必须给出本轮评审决策", actionOracle);

  for (const required of [
    "优先使用项目既有的组件体系",
    "没有给出组件库名称",
    "两个紧密关联的页面",
    "可独立实施和验收",
    "AGENTS.md",
    "product/plans/",
    "engineering/implementation-plans/",
    "api/drafts/",
    "contracts/openapi/",
    "账号密码登录",
    "手机号加一次性验证码登录",
    "已确认",
    "待修改",
    "没有 HTTP method、URL、请求字段、响应字段或错误码等机器事实",
    "直接生成 Draft，并把页面设为可实施",
  ]) {
    assert.match(scenario, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of [
    /预期(?:正确)?行为/,
    /答案\s*(?:oracle|标准|样例)/i,
    /(?:正确做法|唯一正确(?:答案|行为)|应当(?:选择|执行|先|不要)|应该(?:选择|执行|先|不要))/,
    actionOracle,
  ]) {
    assert.doesNotMatch(scenario, forbidden);
  }
});
