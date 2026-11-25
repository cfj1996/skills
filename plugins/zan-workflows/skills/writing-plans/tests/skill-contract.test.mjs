import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { inspectGenericResourcePolicy } from "./helpers/generic-resource-policy.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const isStagingLayout = (directory) =>
  path.basename(directory) === "zan-workflows" &&
  path.basename(path.dirname(directory)) === "tests";
const resolvePluginRoot = (directory) =>
  isStagingLayout(directory)
    ? path.resolve(directory, "..", "..", "plugins", "zan-workflows")
    : path.resolve(directory, "..", "..", "..");
const pluginRoot = resolvePluginRoot(testDir);
const repositoryRoot =
  path.basename(path.dirname(pluginRoot)) === "plugins"
    ? path.resolve(pluginRoot, "..", "..")
    : path.dirname(pluginRoot);
const skillRoot = path.join(pluginRoot, "skills", "writing-plans");
const scenarioPath = path.join(testDir, "scenarios", "review-conflicted-login.md");
const require = createRequire(import.meta.url);
const { STATUS_MODEL } = require(path.join(skillRoot, "scripts", "validate-page-plan.js"));

const resolveRelativePath = (relativePath) =>
  relativePath.replaceAll("skills/reviewing-page-delivery", "skills/writing-plans");
const read = (relativePath) =>
  readFile(path.join(pluginRoot, resolveRelativePath(relativePath)), "utf8");
const visibleMarkdown = (markdown) => markdown.replace(/<!--[\s\S]*?-->/g, "");

const sectionContaining = (markdown, marker) => {
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  const rest = markdown.slice(start);
  const nextHeading = rest.slice(1).search(/^##\s+/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
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
  "skills/reviewing-page-delivery/scripts/inject-review-panel.js",
  "skills/reviewing-page-delivery/scripts/calculate-progress.js",
  "skills/reviewing-page-delivery/scripts/validate-page-plan.js",
  "skills/reviewing-page-delivery/tests/fixtures/panel-host.html",
  "skills/reviewing-page-delivery/tests/fixtures/page-plan-model.json",
  "skills/reviewing-page-delivery/tests/fixtures/review-session.json",
];

const listFiles = async (relativeDirectory) => {
  const entries = await readdir(path.join(pluginRoot, resolveRelativePath(relativeDirectory)), {
    withFileTypes: true,
  });
  const nested = await Promise.all(entries.map((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
  }));
  return nested.flat();
};

const listDistributableResourcePaths = async () => [
  ".codex-plugin/plugin.json",
  "skills/reviewing-page-delivery/SKILL.md",
  ...await listFiles("skills/reviewing-page-delivery/scripts"),
  ...await listFiles("skills/reviewing-page-delivery/references"),

];

const semanticGenericResourcePolicy = {
  forbiddenPatterns: [
    { id: "legacy-page-completion-field", pattern: /pageCompletionRate/g },
    { id: "fixed-plan-directory-pattern", pattern: /plans\/<项目>/g },
    { id: "fixed-draft-directory", pattern: /contracts\/drafts\//g },
    {
      id: "acceptance-project-hardcoding",
      pattern: /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix/gi,
    },
  ],
  literalAllowlists: [
    {
      literal: "页面完成率",
      occurrences: [
        {
          path: "skills/reviewing-page-delivery/references/status-model.md",
          line: "允许报告本轮评审总数及各结论数量、待复评数量、功能/接口/页面依赖/验收状态数量、任务总数/完成数/验证数和 Draft operation 数量。禁止使用单一页面完成百分比，也不得将不同性质状态折算为页面完成率。",
        },
      ],
    },
    {
      literal: "默认 Plan 目录",
      occurrences: [
      ],
    },
    {
      literal: "默认 Draft 目录",
      occurrences: [
      ],
    },
  ],
};

test("Zan plugin manifest exposes its skills through the two main workflows", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  assert.equal(manifest.name, "zan-workflows");
  assert.match(manifest.version, /^\d+\.\d+\.\d+\+codex\.[a-z0-9-]+$/);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Zan Workflows");
  assert.match(manifest.description, /Bug repair and requirement development/i);
  for (const entry of ["$fixing-bug", "$developing-requirement"]) {
    assert.ok(manifest.interface.defaultPrompt.some((prompt) => prompt.includes(entry)));
  }
});

test("repository exposes the plugin through the canonical marketplace layout", async () => {
  assert.equal(
    pluginRoot,
    path.join(repositoryRoot, "plugins", "zan-workflows"),
  );

  const marketplace = JSON.parse(
    await readFile(
      path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"),
      "utf8",
    ),
  );
  assert.equal(marketplace.name, "cfj-skills");
  assert.deepEqual(marketplace.plugins.filter(plugin => plugin.name === "page-delivery-workflow"), []);
  assert.deepEqual(marketplace.plugins.filter(plugin => plugin.name === "zan-workflows"), [
    {
      name: "zan-workflows",
      source: {
        source: "local",
        path: "./plugins/zan-workflows",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Productivity",
    },
  ]);
});

test("prototype review hands collection and persistence to their owning skill", async () => {
  const skill = await read("skills/writing-plans/SKILL.md");
  assert.match(skill, /collecting-requirements\/SKILL\.md/);
  assert.match(skill, /会话稿或一份 TAPD Plan/);
  assert.doesNotMatch(skill, /PLAN_WRITE|create_tasks?\b/);
});

test("review references define module contracts, evidence and status groups", async () => {
  const standard = await read("skills/reviewing-page-delivery/references/page-review-standard.md");
  const statusModel = await read("skills/reviewing-page-delivery/references/status-model.md");
  const apiStages = await read("skills/reviewing-page-delivery/references/api-contract-stages.md");

  for (const dimension of dimensions) assert.match(standard, new RegExp(dimension));
  for (const field of [
    "模块稳定编号", "职责与范围", "inputs", "outputs", "rules", "scenarios",
    "questions", "change", "revision", "父模块", "内部实现",
  ]) assert.match(standard, new RegExp(field));
  for (const rule of [
    "sourceEvidence", "reviewGoal", "regionAndComponents", "interactionStates",
  ]) assert.match(standard, new RegExp(rule));
  for (const status of statuses) assert.match(statusModel, new RegExp(status));
  assert.match(statusModel, /页面完成百分比/);
  assert.match(statusModel, /禁止/);
  for (const rule of [
    "正式来源搜索顺序", "不得猜", "reviewing", "不得生成 Draft", "planning",
    "method", "URL", "Schema", "AGENTS.md", "全部确认",
  ]) assert.match(apiStages, new RegExp(rule));
});

test("API review is gated by consumer needs and never assigns an API to a page or module", async () => {
  const skill = visibleMarkdown(await read("skills/reviewing-page-delivery/SKILL.md"));
  const standard = await read("skills/reviewing-page-delivery/references/page-review-standard.md");
  const apiStages = await read("skills/reviewing-page-delivery/references/api-contract-stages.md");
  const scenario = await readFile(
    path.join(testDir, "scenarios", "review-app-shell-current-user.md"),
    "utf8",
  );

  for (const required of [
    "消费需求清单",
    "能力归属",
    "运行时范围",
    "本次交付关系",
    "正式来源搜索",
    "接口事实清单",
  ]) {
    assert.match(`${skill}\n${standard}\n${apiStages}`, new RegExp(required));
  }

  assert.match(apiStages, /消费需求清单[\s\S]*正式来源搜索[\s\S]*接口事实清单[\s\S]*(?:Mock|Draft)/);
  assert.match(apiStages, /“不涉及接口”[\s\S]*具体消费需求/);
  assert.match(apiStages, /不得[\s\S]*页面[\s\S]*模块[\s\S]*接口归属/);
  assert.match(standard, /应用壳层[\s\S]*跨页面[\s\S]*会话级/);

  assert.match(scenario, /Layout 用户区/);
  assert.match(scenario, /首页内容区/);
  assert.match(scenario, /当前登录用户/);
  assert.match(scenario, /正式接口来源/);
});

test("API consumer evidence stays inside module cards without forcing one card per technical dimension", async () => {
  const standard = await read("skills/reviewing-page-delivery/references/page-review-standard.md");
  assert.match(standard, /Agent 后台检查清单/);
  assert.match(standard, /API 消费点不单独强制成卡/);
  assert.match(standard, /折叠.*实现依据/);
  for (const field of ["regionAndComponents", "relatedApis", "sourceEvidence", "能力归属", "运行时范围", "本次交付关系"]) {
    assert.match(standard, new RegExp(field));
  }
  assert.match(standard, /required\/none\/unknown/);
  assert.match(standard, /不代表每个内部消费点都依赖接口/);
  assert.doesNotMatch(standard, /每个消费需求生成一张独立的 API 设计卡|首次全量生成全部评审维度/);
});

test("module behavior and implementation readiness are independent while ready contracts remain evidence-backed", async () => {
  const [skill, standard, runtime] = await Promise.all([
    read("skills/reviewing-page-delivery/SKILL.md"),
    read("skills/reviewing-page-delivery/references/page-review-standard.md"),
    read("skills/reviewing-page-delivery/references/feature-review-runtime.md"),
  ]);

  for (const required of [
    "implementationPlan",
    "怎么实现",
    "怎么联动",
    "数据怎么走",
    "怎么验收",
    "实现依据",
    "具体组件",
    "代码落点",
    "触发条件",
    "状态变化",
    "项目规范",
    "阻塞",
  ]) {
    assert.match(`${skill}\n${standard}\n${runtime}`, new RegExp(required));
  }
  assert.match(standard, /status.*ready.*blocked/s);
  assert.match(standard, /structure.*linkage.*dataFlow.*acceptanceFocus.*evidenceIds.*blockers/s);
  assert.match(standard, /只有.*structure.*linkage.*dataFlow.*acceptanceFocus.*齐全.*ready/s);
  assert.match(standard, /conclusion.*implementationPlan.status.*独立/s);
  assert.match(standard, /阶段 Plan 可以保存已确认需求、待修改需求和未决问题/);
  assert.match(runtime, /仍允许需求选择“已确认”/);
  assert.doesNotMatch(runtime, /非阻塞结论不可选择/);
  assert.match(runtime, /四块|4\s*块/);
  assert.match(runtime, /折叠|展开/);
});

test("module review schema and normalized Plan preserve hierarchy, revisions, and separate conclusions", async () => {
  const [standard, status] = await Promise.all([
    read("skills/reviewing-page-delivery/references/page-review-standard.md"),
    read("skills/reviewing-page-delivery/references/status-model.md"),
  ]);
  assert.match(standard, /ReviewSession.*schemaVersion=3/s);
  assert.match(standard, /旧.*schemaVersion=2.*可读取评审/s);
  assert.doesNotMatch(standard, /仍接受旧|兼容旧版|schemaVersion=1/);
  assert.match(standard, /schemaVersion=4.*features\[\]\.module.*features\[\]\.reviewConclusion/s);
  assert.match(standard, /阶段.*blocked.*保存|阶段 Plan 仍可保存/s);
  assert.match(standard, /questions.*必须为空.*才能进入可实施/s);
  assert.match(standard, /阶段 Plan 仍可保存这些问题/);
  for (const field of ["parentId", "inputs", "outputs", "rules", "scenarios", "given", "when", "then", "questions", "impact", "owner", "recommendation", "change", "revision"]) {
    assert.match(standard, new RegExp(field));
  }
  assert.match(standard, /不得悬空、自引用或形成环/);
  assert.match(status, /需求已确认 · 实现方案待补充 · 评审记录已保存/);
});

test("dialogue additions use the session update API without losing input or revising submitted snapshots", async () => {
  const runtime = await read("skills/reviewing-page-delivery/references/feature-review-runtime.md");
  const additions = sectionContaining(runtime, "## 对话补充功能");
  assert.match(additions, /updateReviewSession\(nextSession\)/);
  assert.match(additions, /未提交时保持当前.*reviewRound/s);
  assert.match(additions, /reviewRound \+ 1.*原提交不可变/s);
  assert.match(additions, /module\.revision \+ 1/);
  assert.match(additions, /保留未变化模块的最新意见和现场位置/);
  assert.match(additions, /遗漏旧模块|不从完整清单静默消失/);
  assert.doesNotMatch(additions, /没有增量更新 API/);
  assert.match(additions, /implementationPlan.*外部依赖事实.*保留需求结论/s);
  assert.match(additions, /业务待确认问题.*owner 为 user 还是 agent.*重置/s);
  assert.match(additions, /技术变更待复核/);
  assert.match(additions, /added\/modified\/unchanged.*单独变化不要求递增版本或重开/s);
  assert.match(additions, /进入或退出 removed.*递增并重开/s);
});

test("panel results hand off to collection for the actual Wiki save", async () => {
  const runtime = await read("skills/writing-plans/references/feature-review-runtime.md");
  assert.match(sectionContaining(runtime, "## 交回收集"), /collecting-requirements\/SKILL\.md/);
  assert.doesNotMatch(runtime, /进入 PLAN_WRITE|Agent 才能写入适用 Agent 文件/);
});

test("automatic notifications bind a temporary local bridge and never replace submission or confirmation evidence", async () => {
  const skill = await read("skills/reviewing-page-delivery/SKILL.md");
  const runtime = await read("skills/reviewing-page-delivery/references/feature-review-runtime.md");
  const bridge = sectionContaining(runtime, "## 连接自动通知");
  for (const required of [
    "codex queue --help", "CODEX_THREAD_ID", "review-wake-bridge.mjs", "--thread", "--origin",
    "--config", "127.0.0.1", "2 小时", "connectWakeBridge(config)", "POST /health",
    "connection.connected === true", "review-submitted", "plan-confirm-requested",
    "exportSubmission()", "getPlanConfirmationRequest()",
  ]) assert.ok(bridge.includes(required), `missing bridge protocol: ${required}`);
  assert.match(skill, /功能评审运行协议/);
  assert.match(bridge, /禁止进入 ReviewSession、state、draft、\s*submission/);
  assert.match(bridge, /网页不能指定消息正文、目标任务或命令/);
  assert.match(bridge, /旧通知丢弃/);
  assert.match(bridge, /不重复 `applyResult\(\)`，也不清除待确认请求/);
  assert.match(bridge, /resumeSubmission: exportedSnapshot/);
  assert.match(bridge, /验证成功才替换旧 runtime/);
  assert.match(bridge, /`notifyExistingSubmission` 默认为 `false`/);
  assert.match(bridge, /普通重连不重放历史通知/);
  assert.match(bridge, /投递结果\s*未知时禁止用它重试/);
  assert.match(bridge, /不确定失败时不得盲目重试/);
  assert.match(bridge, /运行中不会中断当前轮/);
  assert.match(bridge, /不能绕过 CSP 或浏览器安全设置/);
  const wait = sectionContaining(runtime, "## 刷新、重挂载与等待");
  assert.match(wait, /先读取现有 API，不要无条件重挂载/);
  assert.match(wait, /停止本次创建的桥接进程，再删除对应/);
  assert.match(wait, /普通交回用户等待操作时保留进程/);
});

test("documentation status terms match the validator and generic assets contain no project defaults", async () => {
  const content = (await Promise.all(genericResourcePaths.map(read))).join("\n");
  const statusTerms = Object.values(STATUS_MODEL).flat();
  for (const status of statusTerms) assert.match(content, new RegExp(status));
  assert.doesNotMatch(
    content,
    /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix|product\/plans\/|engineering\/implementation-plans\/|api\/drafts\/|contracts\/openapi\//i,
  );
});

test("semantic resource policy allows only approved prohibition statements", async () => {
  const distributableResourcePaths = await listDistributableResourcePaths();
  const resources = await Promise.all(distributableResourcePaths.map(async (relativePath) => ({
    path: relativePath,
    content: await read(relativePath),
  })));
  const violations = inspectGenericResourcePolicy(resources, semanticGenericResourcePolicy);

  assert.deepEqual(violations, []);
});

test("semantic resource policy rejects extra wording and operational defaults", async () => {
  const distributableResourcePaths = await listDistributableResourcePaths();
  const resources = await Promise.all(distributableResourcePaths.map(async (relativePath) => ({
    path: relativePath,
    content: await read(relativePath),
  })));
  resources.push({
    path: "skills/reviewing-page-delivery/assets/unapproved-example.md",
    content: [
      "字段：pageCompletionRate",
      "Plan 路径模式：plans/<项目>",
      "Draft OpenAPI 路径模式：contracts/drafts/",
      "模板值：页面完成率",
    ].join("\n"),
  });

  const violationCodes = inspectGenericResourcePolicy(
    resources,
    semanticGenericResourcePolicy,
  ).map(({ code }) => code);

  assert.ok(violationCodes.includes("legacy-page-completion-field"));
  assert.ok(violationCodes.includes("fixed-plan-directory-pattern"));
  assert.ok(violationCodes.includes("fixed-draft-directory"));
  assert.ok(violationCodes.includes("literal-not-allowlisted"));
});

test("generic resource scanner covers distributable resources and excludes test code and pressure scenarios", () => {
  const expected = [
    ".codex-plugin/plugin.json",
    "skills/reviewing-page-delivery/SKILL.md",
    "skills/reviewing-page-delivery/agents/openai.yaml",
    "skills/reviewing-page-delivery/references/page-review-standard.md",
    "skills/reviewing-page-delivery/references/status-model.md",
    "skills/reviewing-page-delivery/references/api-contract-stages.md",
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
  ]) assert.match(skill, new RegExp(resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(skill, /需求收集/);
});

test("Zan plugin exposes the migrated skill alongside its existing skills", async () => {
  const skillDirectories = await readdir(path.join(pluginRoot, "skills"), {
    withFileTypes: true,
  });
  assert.ok(skillDirectories.filter((entry) => entry.isDirectory()).some((entry) => entry.name === "writing-plans"));
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
  assert.match(yaml, /display_name:\s*"zan:原型评审"/);
  assert.match(yaml, /\$writing-plans/);
});

test("test location resolves the Zan plugin root without the current working directory", () => {
  const stagingPath = path.join(repositoryRoot, "tests", "zan-workflows");
  const movedTestPath = path.join(
    pluginRoot,
    "skills",
    "writing-plans",
    "tests",
  );

  assert.equal(path.basename(pluginRoot), "zan-workflows");
  assert.equal(path.basename(path.dirname(pluginRoot)), "plugins");
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

test("feature review is explicit-only and the Zan plugin has one cachebuster", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  const yaml = await read("skills/reviewing-page-delivery/agents/openai.yaml");
  assert.match(manifest.version, /^\d+\.\d+\.\d+\+codex\.[a-z0-9-]+$/);
  assert.equal((manifest.version.match(/\+codex\./g) ?? []).length, 1);
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
  ].map((heading) => runtime.indexOf(`## ${heading}`));
  assert.ok(ordered.every((offset, index) => offset >= 0 && (index === 0 || ordered[index - 1] < offset)));
  assert.match(sectionContaining(runtime, "## 挂载验证"),
    /browserOpened\s*&&\s*hostExists\s*&&\s*shadowRootExists\s*&&\s*reviewApiExists\s*```/);
  assert.match(
    sectionContaining(runtime, "## 展示结果"),
    /browserOpened\s*&&\s*hostExists\s*&&\s*shadowRootExists\s*&&\s*reviewApiExists\s*&&\s*currentSubmissionReceived/,
  );

  const submission = sectionContaining(runtime, "## 统一提交");
  for (const identity of [
    "sessionId",
    "submissionVersion",
    "planFingerprint",
    "artifactRuleFingerprint",
  ]) assert.match(submission, new RegExp(identity));
  assert.match(submission, /submissionVersion > 0/);
  assert.match(submission, /exportSubmission\(\)/);
  assert.match(submission, /轮询/);
  assert.match(submission, /PAGE_DELIVERY_REVIEW_SUBMITTED.*仅.*诊断/);
  assert.match(submission, /不得.*单独.*currentSubmissionReceived/);

  for (const forbidden of [
    "不得启动消费项目 dev server",
    "不得执行消费项目 build",
    "不得执行消费项目运行态验收",
    "不得退化为静态代码评审",
    "不得生成独立评审 HTML",
    "未收到当前提交不得给出最终评审结论",
    "独立评审 HTML 不得替代动态面板",
    "独立评审 Markdown 不得替代动态面板",
    "独立评审 JSON 不得替代动态面板",
    "截图不得替代动态面板",
    "文字报告不得替代动态面板",
  ]) assert.match(runtime, new RegExp(forbidden));
});

test("runtime supports secure remote prototypes without leaking their URLs into review state", async () => {
  const [skill, runtime, panel] = await Promise.all([
    read("skills/reviewing-page-delivery/SKILL.md"),
    read("skills/reviewing-page-delivery/references/feature-review-runtime.md"),
    read("skills/reviewing-page-delivery/scripts/inject-review-panel.js"),
  ]);

  assert.match(`${skill}\n${runtime}`, /远程.*HTTPS|HTTPS.*远程/s);
  assert.match(runtime, /远程.*直接.*in-app Browser|in-app Browser.*直接.*远程/s);
  assert.match(runtime, /本地.*loopback|loopback.*本地/s);
  assert.match(runtime, /已有登录态|现有登录态/);
  assert.match(runtime, /重定向.*最终 URL|最终 URL.*重定向/s);
  assert.match(runtime, /跨域 iframe.*不得.*selector|跨域 iframe.*无法.*DOM/s);
  assert.match(runtime, /不得.*ReviewSession.*原型 URL|原型 URL.*不得.*ReviewSession/s);
  assert.doesNotMatch(panel, /prototypeUrl\s*:/);
});

test("the plugin ships a real interactive review-panel preview fixture", async () => {
  const preview = await read("skills/reviewing-page-delivery/tests/fixtures/panel-preview.html");
  const previewServer = await read("skills/reviewing-page-delivery/tests/preview-review-panel.mjs");
  assert.match(preview, /inject-review-panel\.js/);
  assert.match(preview, /review-session\.json/);
  assert.match(preview, /EventSource/);
  assert.match(preview, /data-preview-prototype/);
  assert.match(previewServer, /__reload/);
  assert.match(previewServer, /panel-preview\.html/);
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
