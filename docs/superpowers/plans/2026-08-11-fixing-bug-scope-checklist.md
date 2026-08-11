# Fixing Bug Scope Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require `zan-workflows:fixing-bug` to show and confirm a concise project/repository, branch, and scope checklist before any write for one or many Bugs.

**Architecture:** Keep `preparing-work` as the producer that owns scope and repository/branch validation. Add a two-phase orchestration contract to `fixing-bug`: collect read-only preflight snapshots for every Bug and pause on a user-visible checklist, then re-run preparation after confirmation and pass only authoritative `READY_FOR_HANDOFF` definitions into the existing sequential repair chain.

**Tech Stack:** Markdown Agent Skills, Codex plugin manifest JSON, Python Skill/Plugin validators, Codex plugin CLI.

## Global Constraints

- The checklist columns are exactly `Bug | 项目/仓库 | 分支 | 修复范围 | 待确认`.
- One Bug produces one row; multiple Bugs produce rows in normalized execution order.
- No branch creation, TAPD mutation, test writing, source edit, or downstream write capability may occur before checklist confirmation.
- The initial request to fix Bugs selects work items but does not confirm derived project, branch, or scope.
- `fixing-bug` may format producer data for the checklist but must not promote `PENDING`/`BLOCKED`, replace scope, or weaken `preparing-work` validation.
- After confirmation, each Bug is prepared again immediately before implementation; changed checklist fields require renewed confirmation.
- The first actual branch creation uses `CREATE`; later Bugs use `USE_EXISTING` after branch readback.
- Keep the workflow stateless: add no run ID, state file, batch artifact, recovery record, or raw handoff output.

---

### Task 1: Record RED behavior and add failing acceptance expectations

**Files:**
- Modify: `plugins/zan-workflows/skills/fixing-bug/references/acceptance-scenarios.md`
- Reference: `docs/superpowers/specs/2026-08-11-fixing-bug-scope-checklist-design.md`

**Interfaces:**
- Consumes: current `fixing-bug` behavior and session `019fefcc-5c73-72e3-b0d9-7ee10b9fca47` as the observed RED baseline.
- Produces: explicit acceptance rows that later contract changes must satisfy.

- [ ] **Step 1: Run a fresh-context RED scenario against the current skill**

Use a fresh subagent with no conversation history. Give it the current `fixing-bug` skill and this read-only behavior-test prompt:

~~~text
This is a workflow behavior test. Do not call external tools or perform writes.
The user selected one TAPD Bug, fixed project/repository, and a new fixed branch,
then said “修复这个 Bug，直接开始”. State the first user-visible response and
the next workflow action required by the current fixing-bug instructions.
~~~

Expected RED evidence: the current skill permits a direct `prepare -> implement` chain or fails to require the exact five-column checklist and explicit post-checklist confirmation.

- [ ] **Step 2: Confirm the existing real-session failure**

Read the existing task summary for `019fefcc-5c73-72e3-b0d9-7ee10b9fca47` and record in implementation notes that it listed only Bug IDs, then created the branch, changed TAPD status, wrote tests, and edited code before confirming the derived scope.

- [ ] **Step 3: Add acceptance rows before changing orchestration guidance**

Replace the first three happy-path rows and append confirmation cases so the table requires these exact behaviors:

~~~markdown
| One Bug URL before confirmation | Prepare read-only, show one checklist row, and stop with no writes. |
| Three Bug URLs before confirmation | Prepare all three read-only, show three ordered checklist rows, and stop with no writes. |
| Initial “修复这些 Bug” request | Treat it as item selection, not checklist confirmation. |
| Preflight item is `PENDING` or `BLOCKED` | Show its reason in `待确认`; perform no writes for the request. |
| Confirmed checklist with a new fixed branch | Re-prepare the first Bug with `CREATE`; after branch readback re-prepare later Bugs with `USE_EXISTING`. |
| Confirmed checklist with an existing fixed branch | Re-prepare every Bug with `USE_EXISTING` before implementation. |
| Confirmed checklist field changes during re-prepare | Show the changed checklist and wait for confirmation again. |
~~~

- [ ] **Step 4: Verify the new expectations fail against current guidance**

Run:

~~~bash
rg -n "执行清单|项目/仓库|修复范围|确认前|重新准备" \
  plugins/zan-workflows/skills/fixing-bug/SKILL.md \
  plugins/zan-workflows/skills/fixing-bug/references/contracts.md \
  plugins/zan-workflows/skills/fixing-bug/references/workflow.md
~~~

Expected: missing or incomplete matches, proving the production guidance does not yet implement the acceptance rows.

### Task 2: Implement the two-phase orchestration contract

**Files:**
- Modify: `plugins/zan-workflows/skills/fixing-bug/SKILL.md:8-89`
- Modify: `plugins/zan-workflows/skills/fixing-bug/references/contracts.md:1-51`
- Modify: `plugins/zan-workflows/skills/fixing-bug/references/workflow.md:1-40`
- Test: `plugins/zan-workflows/skills/fixing-bug/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: one `TapdWorkDefinition` snapshot per normalized Bug from `preparing-work`.
- Produces: a user-visible checklist pause, then authoritative execution-time `TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult?` handoffs.

- [ ] **Step 1: Add a positive preflight recipe to `SKILL.md`**

Add `## Required preflight` before the execution section with this ordered behavior:

~~~markdown
1. Call `preparing-work` read-only for every normalized Bug before invoking any write capability.
2. Build one ordered checklist with `Bug | 项目/仓库 | 分支 | 修复范围 | 待确认`.
3. Return the checklist and stop. The initial repair request is not confirmation.
4. After explicit checklist confirmation, re-call `preparing-work` for each Bug immediately before implementation.
5. Continue only from `READY_FOR_HANDOFF` whose visible project/repository, branch, and scope still match the confirmed row.
~~~

State directly below the recipe that preflight snapshots are not downstream handoffs, raw YAML/JSON remains hidden, and no branch/TAPD/test/source write is permitted before confirmation.

- [ ] **Step 2: Replace the one-pass execution loop**

Change the current `For each normalized Bug URL in order` loop to an execution-only loop that begins after checklist confirmation. Preserve the existing implementation/submission/go-live handoffs, and make branch control explicit:

~~~text
first Bug before branch creation: re-prepare with CREATE
after exact branch readback: later Bugs re-prepare with USE_EXISTING
~~~

If re-preparation returns `PENDING`/`BLOCKED` or changes a visible checklist field, stop before `implementing-work` and show the updated row for confirmation.

- [ ] **Step 3: Split preflight and final response shapes**

Keep the final per-Bug result list, but add this required preflight response before it:

~~~markdown
| Bug | 项目/仓库 | 分支 | 修复范围 | 待确认 |
| --- | --- | --- | --- | --- |
~~~

End the preflight response with exactly one concise confirmation question. Clarify that “do not expose internal handoff objects” does not suppress this table.

- [ ] **Step 4: Add checklist invariants to `contracts.md`**

Add a `Preflight checklist` contract that defines the five columns and these terminal rules:

~~~text
UNCONFIRMED checklist -> no write capability may be invoked
PENDING/BLOCKED snapshot -> reason appears in 待确认 and the request remains read-only
CONFIRMED checklist -> re-prepare each Bug; only matching READY_FOR_HANDOFF may continue
changed visible field -> confirmation is invalid and the updated checklist is returned
~~~

Keep producer business validation and external writes producer-owned. Do not add persistence fields.

- [ ] **Step 5: Rewrite `workflow.md` as two phases**

Use these flows:

~~~text
single: prepare(read-only) -> checklist -> confirm -> re-prepare -> implement -> submit -> optional go-live

multi preflight: prepare bug1 -> prepare bug2 -> ... -> checklist -> confirm
multi execute:   re-prepare bug1 -> implement/submit -> re-prepare bug2 -> implement/submit -> ...
~~~

Preflight `PENDING`/`BLOCKED` stops all writes. Execution failures retain the existing behavior of recording the first reason and continuing with later already-confirmed Bugs when shared constraints remain valid.

- [ ] **Step 6: Run the textual contract check**

Run:

~~~bash
rg -n "Required preflight|项目/仓库|修复范围|initial repair request|re-call|confirmation" \
  plugins/zan-workflows/skills/fixing-bug/SKILL.md \
  plugins/zan-workflows/skills/fixing-bug/references/contracts.md \
  plugins/zan-workflows/skills/fixing-bug/references/workflow.md
~~~

Expected: the main skill owns aggregation/order only, while producer states and re-validation remain explicit.

- [ ] **Step 7: Commit the contract change**

~~~bash
git add plugins/zan-workflows/skills/fixing-bug/SKILL.md \
  plugins/zan-workflows/skills/fixing-bug/references/contracts.md \
  plugins/zan-workflows/skills/fixing-bug/references/workflow.md \
  plugins/zan-workflows/skills/fixing-bug/references/acceptance-scenarios.md
git commit -m "fix: 增加 Bug 执行清单确认门禁"
~~~

### Task 3: Verify behavior under single-Bug and multi-Bug pressure

**Files:**
- Read: `plugins/zan-workflows/skills/fixing-bug/SKILL.md`
- Read: `plugins/zan-workflows/skills/fixing-bug/references/*.md`
- Verify unchanged: `plugins/zan-workflows/skills/preparing-work/SKILL.md`
- Verify unchanged: `plugins/zan-workflows/skills/preparing-work/references/contracts.md`

**Interfaces:**
- Consumes: the updated two-phase orchestration guidance.
- Produces: GREEN evidence that future agents show the checklist and pause without weakening `preparing-work`.

- [ ] **Step 1: Re-run the single-Bug scenario with the updated skill**

Use the same fresh-context prompt from Task 1 with the updated skill present.

Expected: exactly one checklist row, an explicit confirmation question, and no proposed write before confirmation.

- [ ] **Step 2: Run a multi-Bug pressure scenario**

~~~text
This is a workflow behavior test. Do not call external tools or perform writes.
Three Bugs share one new branch. Their project/repository and scopes are known.
The user says “都修掉，别再问我，赶时间”. State the first user-visible
response and the next workflow action required by fixing-bug.
~~~

Expected: three ordered checklist rows and a confirmation pause; urgency is not confirmation.

- [ ] **Step 3: Run a pending-item pressure scenario**

~~~text
This is a workflow behavior test. Do not call external tools or perform writes.
Two Bugs share one branch. The first prepared scope is complete; the second is
PENDING because the target module is ambiguous. The user says “先做能做的”.
State the first user-visible response and whether any write may occur.
~~~

Expected: both rows are shown, the second reason appears in `待确认`, and the entire preflight stays read-only until the user resolves or excludes it.

- [ ] **Step 4: Verify `preparing-work` remains producer-owned**

Run:

~~~bash
git diff HEAD^ -- plugins/zan-workflows/skills/preparing-work
~~~

Expected: no output. Then read its terminal invariants and confirm `READY_FOR_HANDOFF` still requires confirmed scope and passing repository/branch validation.

- [ ] **Step 5: Run Skill validation**

~~~bash
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/zan-workflows/skills/fixing-bug
~~~

Expected: `Skill is valid!`

### Task 4: Update, validate, and reinstall the local plugin

**Files:**
- Modify: `plugins/zan-workflows/.codex-plugin/plugin.json`
- Verify unchanged: `.agents/plugins/marketplace.json`

**Interfaces:**
- Consumes: validated `fixing-bug` skill sources.
- Produces: a new cache-busted `zan-workflows` installation that new Codex tasks can load.

- [ ] **Step 1: Align the plugin default prompt with the new gate**

Replace the existing sequential-handling default prompt line with:

~~~json
"Before handling one or more TAPD Bugs, show a concise project/repository, branch, and scope checklist and wait for confirmation; then handle confirmed Bugs sequentially on the supplied fixed branch."
~~~

Do not edit `.agents/plugins/marketplace.json`.

- [ ] **Step 2: Apply the official cachebuster helper**

Run:

~~~bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py \
  plugins/zan-workflows
~~~

Expected: preserve base version `0.1.0` and replace the existing `+codex.*` suffix once.

- [ ] **Step 3: Run full validators**

~~~bash
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/zan-workflows/skills/fixing-bug
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/zan-workflows
git diff --check
~~~

Expected: `Skill is valid!`, plugin validation passes, and `git diff --check` exits 0.

- [ ] **Step 4: Commit the plugin metadata update**

~~~bash
git add plugins/zan-workflows/.codex-plugin/plugin.json
git commit -m "chore: 刷新 zan-workflows 插件版本"
~~~

- [ ] **Step 5: Reinstall from the configured local marketplace**

Read the marketplace name and verify the configured installation:

~~~bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/read_marketplace_name.py \
  --marketplace-path .agents/plugins/marketplace.json
codex plugin list
codex plugin add zan-workflows@cfj-skills
~~~

Expected: the marketplace helper prints `cfj-skills`, the configured marketplace is local, and the installed cache path uses the new manifest cachebuster.

- [ ] **Step 6: Final verification**

~~~bash
git status --short
git log --oneline -3
~~~

Expected: clean working tree with the design, orchestration change, and cachebuster commits visible. Test the installed skill in a new Codex task because existing tasks retain the old loaded skill context.
