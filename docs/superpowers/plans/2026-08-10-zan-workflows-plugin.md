# SUPERSEDED — DO NOT EXECUTE

This scaffold plan is superseded by
[the TAPD functional-skills implementation plan](/Users/cfj/projects/skills/docs/superpowers/plans/2026-08-10-tapd-functional-skills.md).
Do not run any scaffold, copy, validation, staging, or commit command below;
in particular, do not execute the obsolete `cp -R` commands that recreate the
plugin monolith. This file is retained only as historical design context.

# Zan Workflows Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `zan-workflows` Codex plugin and package the six repository-root skills without changing their existing standalone copies.

**Architecture:** Use the official plugin scaffold to create a repository-local plugin and append its marketplace entry. The plugin owns physical copies of the six standalone skill directories under `plugins/zan-workflows/skills/`; no synchronization or parity mechanism is added.

**Tech Stack:** Codex plugin JSON, Markdown skills, Python Skill/Plugin validators, repository-local marketplace JSON.

## Global Constraints

- Plugin identifier: `zan-workflows`.
- Initial version: `0.1.0`.
- Plugin skill entry: `./skills/`.
- Copy only the six skills currently under the repository-root `skills/` directory.
- Preserve all repository-root `skills/*` directories unchanged.
- Do not migrate or modify `plugins/page-delivery-workflow`.
- Do not add synchronization scripts, symlinks, parity tests, or other consistency mechanisms.
- Append the marketplace entry; do not reorder or rewrite the existing entry.
- Work directly on the current `main` branch as explicitly requested.

---

### Task 1: Create and populate the Zan Workflows plugin

**Files:**

- Create: `plugins/zan-workflows/.codex-plugin/plugin.json`
- Create: `plugins/zan-workflows/skills/login-token-workflow/**`
- Create: `plugins/zan-workflows/skills/managed-mr-review/**`
- Create: `plugins/zan-workflows/skills/project-memory-context/**`
- Create: `plugins/zan-workflows/skills/tapd-workflow/**`
- Create: `plugins/zan-workflows/skills/team-identity-map/**`
- Create: `plugins/zan-workflows/skills/workspace-project-knowledge/**`
- Modify: `.agents/plugins/marketplace.json`

**Interfaces:**

- Consumes: the six complete repository-root skill directories and the existing `cfj-skills` marketplace.
- Produces: a discoverable `zan-workflows` plugin whose `skills` manifest field points to `./skills/`.

- [ ] **Step 1: Confirm scaffold preconditions**

Run:

```bash
test ! -e plugins/zan-workflows
! rg -n '"name": "zan-workflows"' .agents/plugins/marketplace.json
```

Expected: both commands exit with status 0. If either fails, stop instead of overwriting an existing plugin or marketplace entry.

- [ ] **Step 2: Run the official repository-local plugin scaffold**

Run:

```bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py \
  zan-workflows \
  --path /Users/cfj/projects/skills/plugins \
  --marketplace-path /Users/cfj/projects/skills/.agents/plugins/marketplace.json \
  --with-skills \
  --with-marketplace
```

Expected: the command creates `plugins/zan-workflows/.codex-plugin/plugin.json`, creates an empty `plugins/zan-workflows/skills/`, and appends one marketplace entry.

- [ ] **Step 3: Replace the scaffold manifest with final metadata**

Set `plugins/zan-workflows/.codex-plugin/plugin.json` to:

```json
{
  "name": "zan-workflows",
  "version": "0.1.0",
  "description": "Company workflow skills for Codex.",
  "author": {
    "name": "Local developer"
  },
  "skills": "./skills/",
  "interface": {
    "displayName": "Zan Workflows",
    "shortDescription": "Company workflow skills for Codex.",
    "longDescription": "Bundles project context, TAPD delivery, GitLab MR review, debug tokens, team identity, and project memory workflows.",
    "developerName": "Local developer",
    "category": "Productivity",
    "capabilities": [
      "Interactive",
      "Write"
    ],
    "defaultPrompt": [
      "Use the appropriate Zan workflow skill for this task.",
      "Resolve this company project and load its context.",
      "Run the applicable TAPD or MR review workflow."
    ]
  }
}
```

- [ ] **Step 4: Copy the six standalone skills into the plugin**

Run:

```bash
cp -R \
  skills/login-token-workflow \
  skills/managed-mr-review \
  skills/project-memory-context \
  skills/tapd-workflow \
  skills/team-identity-map \
  skills/workspace-project-knowledge \
  plugins/zan-workflows/skills/
```

Expected: the plugin contains exactly the six named skill directories. The original `skills/*` directories remain in place.

- [ ] **Step 5: Validate each plugin-packaged skill**

Run:

```bash
for skill in \
  login-token-workflow \
  managed-mr-review \
  project-memory-context \
  tapd-workflow \
  team-identity-map \
  workspace-project-knowledge; do
  python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
    "plugins/zan-workflows/skills/$skill"
done
```

Expected: all six validator invocations report success and the loop exits with status 0.

- [ ] **Step 6: Validate the complete plugin**

Run:

```bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/zan-workflows
```

Expected: the validator reports that `zan-workflows` is valid.

- [ ] **Step 7: Verify the marketplace entry**

Run:

```bash
node -e 'const m=require("./.agents/plugins/marketplace.json"); const e=m.plugins.filter((p)=>p.name==="zan-workflows"); if(e.length!==1||e[0].source?.path!=="./plugins/zan-workflows"||e[0].policy?.installation!=="AVAILABLE"||e[0].policy?.authentication!=="ON_INSTALL"||e[0].category!=="Productivity") process.exit(1)'
```

Expected: exit status 0.

- [ ] **Step 8: Confirm excluded paths remain untouched**

Run:

```bash
git diff --exit-code -- skills plugins/page-delivery-workflow package.json
```

Expected: no output and exit status 0.

- [ ] **Step 9: Inspect the final change set**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the implementation plan, `.agents/plugins/marketplace.json`, and `plugins/zan-workflows/**` appear as uncommitted changes.

- [ ] **Step 10: Commit the plugin**

Run:

```bash
git add \
  docs/superpowers/plans/2026-08-10-zan-workflows-plugin.md \
  .agents/plugins/marketplace.json \
  plugins/zan-workflows
git commit -m "feat: 添加 zan-workflows 插件"
```

Expected: one Conventional Commit contains the implementation plan, plugin manifest, six packaged skills, and marketplace registration.
