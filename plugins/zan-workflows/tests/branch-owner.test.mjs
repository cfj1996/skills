import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeBranchOwner,
  resolveBranchOwner,
} from "../skills/developing-requirement/scripts/resolve-branch-owner.mjs";

test("normalizes a Git user name into a safe branch owner", () => {
  assert.equal(normalizeBranchOwner(" Alice O'Connor "), "alice-o-connor");
  assert.deepEqual(
    resolveBranchOwner({
      gitUserName: "Alice O'Connor",
      gitUserEmail: "ignored@example.com",
      osUserName: "ignored",
    }),
    { branchOwner: "alice-o-connor", source: "git-config-user.name" },
  );
});

test("prefers the configured user-prompt name over Git and computer usernames", () => {
  assert.deepEqual(
    resolveBranchOwner({
      userName: "李四",
      gitUserName: "张三",
      osUserName: "local-user",
    }),
    { branchOwner: "李四", source: "user-prompt-USER_NAME" },
  );
  execFileSync("git", ["check-ref-format", "--branch", "feature/李四.1019.1080800.订单导出"]);
  assert.equal(normalizeBranchOwner(" 张三 / Web.Dev "), "张三-web-dev");
});

test("falls back to Git user.name when the user prompt has no username", () => {
  for (const userName of [undefined, "", "  "]) {
    assert.deepEqual(resolveBranchOwner({ userName, gitUserName: "张三", osUserName: "local-user" }),
      { branchOwner: "张三", source: "git-config-user.name" });
  }
});

test("falls back to the OS username when Git identity is unavailable", () => {
  assert.deepEqual(
    resolveBranchOwner({
      gitUserName: "",
      gitUserEmail: "ignored@example.com",
      osUserName: "Workstation_User",
    }),
    { branchOwner: "workstation-user", source: "os-username" },
  );
});

test("fails instead of inventing an owner", () => {
  assert.throws(
    () =>
      resolveBranchOwner({
        userName: "!!!",
        gitUserName: "",
        osUserName: "",
      }),
    /Unable to resolve a safe branch owner/,
  );
});

const script = fileURLToPath(new URL("../skills/developing-requirement/scripts/resolve-branch-owner.mjs", import.meta.url));

test("CLI accepts the username already loaded from the current user prompt", () => {
  const value = execFileSync(process.execPath, [script, "--cwd", os.tmpdir(), "--user-name", "李四"], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(value), { branchOwner: "李四", source: "user-prompt-USER_NAME" });
});

test("CLI reads only an explicitly selected user-prompt file and rejects conflicting assignments", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "branch-owner-"));
  const prompt = path.join(root, "custom-user-prompt.md");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, "empty-git-config"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Git Fallback" };
  writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  const run = () => spawnSync(process.execPath, [script, "--cwd", root, "--user-prompt-file", prompt], { encoding: "utf8", env });
  try {
    writeFileSync(prompt, "# User settings\r\nUSER_NAME=陈方杰\r\n");
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { branchOwner: "陈方杰", source: "user-prompt-USER_NAME" });
    writeFileSync(prompt, "# Old prompt without USER_NAME\n");
    result = run();
    assert.deepEqual(JSON.parse(result.stdout), { branchOwner: "git-fallback", source: "git-config-user.name" });
    writeFileSync(prompt, "USER_NAME=Alice\nUSER_NAME=Bob\n");
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conflicting USER_NAME/);
    rmSync(prompt);
    result = run();
    assert.deepEqual(JSON.parse(result.stdout), { branchOwner: "git-fallback", source: "git-config-user.name" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
