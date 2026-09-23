#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import os from "node:os";
import { pathToFileURL } from "node:url";

export function normalizeBranchOwner(value) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function emailLocalPart(value) {
  if (typeof value !== "string") return "";
  const separator = value.indexOf("@");
  return separator > 0 ? value.slice(0, separator) : "";
}

export function resolveBranchOwner({ gitUserName, gitUserEmail, osUserName }) {
  const candidates = [
    ["git-config-user.name", gitUserName],
    ["git-config-user.email", emailLocalPart(gitUserEmail)],
    ["os-username", osUserName],
  ];

  for (const [source, value] of candidates) {
    const branchOwner = normalizeBranchOwner(value);
    if (branchOwner) return { branchOwner, source };
  }

  throw new Error(
    "Unable to resolve a safe branch owner from Git user.name, Git user.email, or the OS username.",
  );
}

function readGitConfig(key, cwd) {
  try {
    return execFileSync("git", ["config", "--get", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveBranchOwnerFromSystem(cwd = process.cwd()) {
  let osUserName = "";
  try {
    osUserName = os.userInfo().username;
  } catch {
    osUserName = process.env.USER || process.env.USERNAME || "";
  }

  return resolveBranchOwner({
    gitUserName: readGitConfig("user.name", cwd),
    gitUserEmail: readGitConfig("user.email", cwd),
    osUserName,
  });
}

function parseCwd(argv) {
  if (argv.length === 0) return process.cwd();
  if (argv.length === 2 && argv[0] === "--cwd" && argv[1]) return argv[1];
  throw new Error("Usage: resolve-branch-owner.mjs [--cwd <repository-root>]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = resolveBranchOwnerFromSystem(parseCwd(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
