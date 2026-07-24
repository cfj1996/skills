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
    "页面或模块",
    "产物位置规则",
    "不得提供默认目录",
    "两道独立门禁",
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
  const forbidden = /Vantix|@zan\/ui-vue3|Element Plus|UnoCSS|仓配|\/Users\/cfj\/projects\/vantix|plans\/<项目>|contracts\/drafts\//i;
  for (const file of files) assert.doesNotMatch(await read(file), forbidden, file);
});

test("skill root follows the standard skill layout", async () => {
  const yaml = await readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
  assert.match(yaml, /display_name:\s*"Reviewing Page Delivery"/);
  assert.match(yaml, /\$reviewing-page-delivery/);
});
