import assert from "node:assert/strict";
import test from "node:test";

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

test("falls back to the Git email prefix when the user name is not ASCII-safe", () => {
  assert.deepEqual(
    resolveBranchOwner({
      gitUserName: "张三",
      gitUserEmail: "zhang.san@example.com",
      osUserName: "local-user",
    }),
    { branchOwner: "zhang-san", source: "git-config-user.email" },
  );
});

test("falls back to the OS username when Git identity is unavailable", () => {
  assert.deepEqual(
    resolveBranchOwner({
      gitUserName: "",
      gitUserEmail: "",
      osUserName: "Workstation_User",
    }),
    { branchOwner: "workstation-user", source: "os-username" },
  );
});

test("fails instead of inventing an owner", () => {
  assert.throws(
    () =>
      resolveBranchOwner({
        gitUserName: "张三",
        gitUserEmail: "not-an-email",
        osUserName: "李四",
      }),
    /Unable to resolve a safe branch owner/,
  );
});
