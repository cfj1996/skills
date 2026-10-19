#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import os from "node:os";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function normalizeBranchOwner(value) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function resolveBranchOwner({ userName, gitUserName, osUserName }) {
  const candidates = [
    ["user-prompt-USER_NAME", userName],
    ["git-config-user.name", gitUserName],
    ["os-username", osUserName],
  ];

  for (const [source, value] of candidates) {
    const branchOwner = normalizeBranchOwner(value);
    if (branchOwner) return { branchOwner, source };
  }

  throw new Error(
    "Unable to resolve a safe branch owner from user-prompt USER_NAME, Git user.name, or the OS username.",
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

function readPromptUserName(file) {
  if (!file) return "";
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
  const names = [...contents.matchAll(/^USER_NAME=([^\r\n]*)\r?$/gm)]
    .map(match => match[1].trim()).filter(Boolean);
  if (new Set(names).size > 1) throw new Error("Conflicting USER_NAME values in the user prompt.");
  return names[0] || "";
}

export function resolveBranchOwnerFromSystem(cwd = process.cwd(), { userName, userPromptFile } = {}) {
  let osUserName = "";
  try {
    osUserName = os.userInfo().username;
  } catch {
    osUserName = process.env.USER || process.env.USERNAME || "";
  }

  return resolveBranchOwner({
    userName: userName ?? readPromptUserName(userPromptFile),
    gitUserName: readGitConfig("user.name", cwd),
    osUserName,
  });
}

function parseArgs(argv) {
  const options = { cwd: process.cwd() };
  const keys = { "--cwd": "cwd", "--user-name": "userName", "--user-prompt-file": "userPromptFile" };
  for (let index = 0; index < argv.length; index += 2) {
    const key = keys[argv[index]];
    if (!key || !argv[index + 1] || Object.hasOwn(options, key) && key !== "cwd") {
      throw new Error("Usage: resolve-branch-owner.mjs [--cwd <repository-root>] [--user-name <USER_NAME> | --user-prompt-file <current-tool-user-prompt>]");
    }
    options[key] = argv[index + 1];
  }
  if (options.userName !== undefined && options.userPromptFile !== undefined) {
    throw new Error("Choose --user-name or --user-prompt-file, not both.");
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { cwd, ...options } = parseArgs(process.argv.slice(2));
    const result = resolveBranchOwnerFromSystem(cwd, options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
