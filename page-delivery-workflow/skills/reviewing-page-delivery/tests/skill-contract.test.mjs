import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
