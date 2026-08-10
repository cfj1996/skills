# TAPD Functional Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plugin-packaged monolithic TAPD workflow with six directly triggerable function-like skills while preserving the standalone `skills/tapd-workflow/` directory unchanged.

**Architecture:** Five capability skills own stable business results and their private validation. One orchestration skill composes those results using hard execution constraints and named business policies.

**Tech Stack:** Codex Markdown skills, private subagent prompts, TAPD/Git/GitLab guidance, Python Skill and Plugin validators.

## Global Constraints

- Work on the current `main` branch as explicitly requested; do not create a repository worktree.
- Preserve `/Users/cfj/projects/skills/skills/tapd-workflow/` unchanged; replace only the plugin copy.
- Do not introduce a mutable `TapdTaskContext`.
- Compose `TapdWorkDefinition -> ReviewedChange -> TestSubmissionResult -> MasterMergeResult`.
- Validators/reviewers stay private to the owning skill, are read-only, and return only `验证通过` or `验证不通过：<原因>`.
- Fixed project/repository/branch inputs are verified hard constraints, never hints.
- Project checks, TDD evidence, independent review, user authorization and post-write readback cannot be disabled.
- Submission supports exactly `STANDARD` and `NO_WIKI`; `STANDARD` reuses `drafting-tapd-wiki`, while `NO_WIKI` records `SKIPPED_BY_POLICY` and does not invoke it.
- Master merge is optional and only merges the original repair branch to `master`, then optionally marks an existing Wiki as merged.
- Run a RED pressure scenario, a GREEN replay and the official validator for each new skill before moving on.
- Fix packaging defects only in plugin copies; do not modify standalone source skills.

---

### Task 1: Implement `resolving-tapd-work`

**Files:**
- Create: `plugins/zan-workflows/skills/resolving-tapd-work/SKILL.md`
- Create: `plugins/zan-workflows/skills/resolving-tapd-work/agents/validator.md`
- Create: `plugins/zan-workflows/skills/resolving-tapd-work/references/contracts.md`
- Create: `plugins/zan-workflows/skills/resolving-tapd-work/references/collection-and-resume.md`
- Create: `plugins/zan-workflows/skills/resolving-tapd-work/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: TAPD URL; optional fixed project/repository/branch, `AUTO | CREATE | REUSE_FIXED`, user increment; `zan-workflows:workspace-project-knowledge`.
- Produces: `TapdWorkDefinition` with work identity, evidence/conflicts, three confidence judgments, verified project fingerprint, branch/source, resume decision, confirmed scope/history policy and acceptance criteria.

- [ ] **Step 1:** Run a fresh read-only RED subagent with two project candidates, the wrong shell repository, a fixed branch and pressure to edit. Record project guessing, wrong-repo search, blind trust, missing confidence evidence or premature editing.
- [ ] **Step 2:** Create the skill with frontmatter name `resolving-tapd-work` and a `Use when...` description covering TAPD understanding, scoping, routing, constraints and resumption.
- [ ] **Step 3:** Adapt correct entity routing, collection, prototype, local resume, `PreviousContext + LatestTapdRefresh + UserIncrement`, confidence and project-fingerprint rules from the old monolith. Do not preserve stage-number coupling.
- [ ] **Step 4:** Add a private evidence-to-conclusion validator and scenarios for wrong type, unresolved project, multiple refs, history overwrite, constraint mismatch, ambiguous project and unconfirmed scope.
- [ ] **Step 5:** Replay GREEN; expect a verified target or explicit block and no edit. Run `quick_validate.py plugins/zan-workflows/skills/resolving-tapd-work`.

### Task 2: Implement `repairing-tapd-work`

**Files:**
- Create: `plugins/zan-workflows/skills/repairing-tapd-work/SKILL.md`
- Create: `plugins/zan-workflows/skills/repairing-tapd-work/agents/change-reviewer.md`
- Create: `plugins/zan-workflows/skills/repairing-tapd-work/references/contracts.md`
- Create: `plugins/zan-workflows/skills/repairing-tapd-work/references/development-rules.md`
- Create: `plugins/zan-workflows/skills/repairing-tapd-work/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: approved `TapdWorkDefinition`, or a TAPD URL resolved through Task 1.
- Produces: `ReviewedChange` with unchanged project fingerprint, actual branch/worktree, changes, tests/evidence, review verdict and risks.

- [ ] **Step 1:** Run RED with a fingerprint/current-repo mismatch, a reusable branch and pressure to edit; record skipped checks, path confirmation, TDD evidence or independent review.
- [ ] **Step 2:** Create `repairing-tapd-work`; keep status transition, actual project verification, branch/worktree setup, exact-path confirmation, Superpowers planning, TDD, evidence and private review together.
- [ ] **Step 3:** Adapt branch/worktree, development execution, prototype and reviewer guidance. The reviewer rejects fingerprint mismatch, scope drift, missing tests, fabricated evidence and unrelated changes.
- [ ] **Step 4:** Add scenarios for wrong repository, develop-based feature branch, unexpected actual path, early edit, missing evidence and review bypass.
- [ ] **Step 5:** Replay GREEN; expect pre-edit blocking or a fully reviewed result. Run `quick_validate.py plugins/zan-workflows/skills/repairing-tapd-work`.

### Task 3: Implement `drafting-tapd-wiki`

**Files:**
- Create: `plugins/zan-workflows/skills/drafting-tapd-wiki/SKILL.md`
- Create: `plugins/zan-workflows/skills/drafting-tapd-wiki/agents/wiki-validator.md`
- Create: `plugins/zan-workflows/skills/drafting-tapd-wiki/references/contracts.md`
- Create: `plugins/zan-workflows/skills/drafting-tapd-wiki/references/wiki-template.md`
- Create: `plugins/zan-workflows/skills/drafting-tapd-wiki/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: current conversation and supplied TAPD/work/change/delivery/draft facts.
- Produces: `ValidatedWikiDraft` rendered as copyable Markdown; never writes externally.

- [ ] **Step 1:** Run RED with missing tester data, conflicting branches and an existing draft; record invented facts, hidden gaps, narration, external writes or self-review.
- [ ] **Step 2:** Create `drafting-tapd-wiki`; preserve noncritical gaps as `待补充`, block critical contradictions, and produce copyable Markdown only after private semantic validation.
- [ ] **Step 3:** Adapt the canonical Wiki body fields and content rules, excluding target-location/writeback behavior.
- [ ] **Step 4:** Add scenarios for missing facts, conflicting branches, existing-draft preservation, copy-only output and validator failure.
- [ ] **Step 5:** Replay GREEN; expect no write and directly copyable output. Run `quick_validate.py plugins/zan-workflows/skills/drafting-tapd-wiki`.

### Task 4: Implement `submitting-tapd-for-test`

**Files:**
- Create: `plugins/zan-workflows/skills/submitting-tapd-for-test/SKILL.md`
- Create: `plugins/zan-workflows/skills/submitting-tapd-for-test/agents/submission-validator.md`
- Create: `plugins/zan-workflows/skills/submitting-tapd-for-test/references/contracts.md`
- Create: `plugins/zan-workflows/skills/submitting-tapd-for-test/references/submission-rules.md`
- Create: `plugins/zan-workflows/skills/submitting-tapd-for-test/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: `TapdWorkDefinition`, `ReviewedChange`, and exactly `STANDARD` or `NO_WIKI`.
- Produces: `TestSubmissionResult` with source/develop/commits, MR/merge, TAPD state, test-version, Wiki result and readbacks.

- [ ] **Step 1:** Run RED once with `NO_WIKI` pressure to create a Wiki and once with `STANDARD` pressure to write a suspicious draft without confirmation.
- [ ] **Step 2:** Create `submitting-tapd-for-test`. Both profiles verify source/target/commits, obtain merge authorization, merge to develop, update TAPD status, publish a test version and read back effects.
- [ ] **Step 3:** For `STANDARD`, require `zan-workflows:drafting-tapd-wiki`, show the full draft, obtain confirmation, write and read back. For `NO_WIKI`, never invoke Wiki drafting/validation and record `SKIPPED_BY_POLICY`.
- [ ] **Step 4:** Adapt merge, inherited-base, exact-comment, Wiki write and test-version evidence rules. Add scenarios for policy confusion, changed commits, wrong target, missing authorization/readback and partial failure.
- [ ] **Step 5:** Replay both GREEN scenarios. Run `quick_validate.py plugins/zan-workflows/skills/submitting-tapd-for-test`.

### Task 5: Implement `merging-tapd-work-to-master`

**Files:**
- Create: `plugins/zan-workflows/skills/merging-tapd-work-to-master/SKILL.md`
- Create: `plugins/zan-workflows/skills/merging-tapd-work-to-master/agents/master-merge-validator.md`
- Create: `plugins/zan-workflows/skills/merging-tapd-work-to-master/references/contracts.md`
- Create: `plugins/zan-workflows/skills/merging-tapd-work-to-master/references/acceptance-scenarios.md`

**Interfaces:**
- Consumes: `TestSubmissionResult`, original repair branch and optional existing-Wiki mark request.
- Produces: `MasterMergeResult` with source/master facts, commits, merge result and optional Wiki mark/readback.

- [ ] **Step 1:** Run RED for “上线” with an original repair branch, unrelated develop changes, no production publish requirement and an optional Wiki.
- [ ] **Step 2:** Create `merging-tapd-work-to-master`; require the original repair branch, actual commit display, authorization, merge/readback and optional existing-Wiki mark/readback.
- [ ] **Step 3:** Explicitly exclude develop-to-master, production publishing, smoke tests, TAPD status changes and mandatory Wiki creation.
- [ ] **Step 4:** Add scenarios for wrong source, unrelated commits, missing authorization, no Wiki, existing Wiki and changed facts.
- [ ] **Step 5:** Replay GREEN. Run `quick_validate.py plugins/zan-workflows/skills/merging-tapd-work-to-master`.

### Task 6: Implement `fixing-tapd-bug` and retire the plugin monolith

**Files:**
- Create: `plugins/zan-workflows/skills/fixing-tapd-bug/SKILL.md`
- Create: `plugins/zan-workflows/skills/fixing-tapd-bug/references/contracts.md`
- Create: `plugins/zan-workflows/skills/fixing-tapd-bug/references/workflow.md`
- Create: `plugins/zan-workflows/skills/fixing-tapd-bug/references/acceptance-scenarios.md`
- Delete: `plugins/zan-workflows/skills/tapd-workflow/**`
- Preserve: `skills/tapd-workflow/**`

**Interfaces:**
- Consumes: TAPD URL, optional project/branch constraints, submission profile and optional master merge request.
- Produces: the declared result chain and final report.

- [ ] **Step 1:** Run RED with an ambiguous project, fixed branch, `NO_WIKI` and no master merge; record context mutation, default selection, Wiki creation, unconditional merge or duplicated rules.
- [ ] **Step 2:** Create `fixing-tapd-bug`; require the five capability skills by name, pass contracts and constraints, stop on blocks/authorization, and invoke master merge only when requested.
- [ ] **Step 3:** Keep cleanup/final reporting at the orchestration boundary and do not reproduce capability rules.
- [ ] **Step 4:** Delete only the plugin `tapd-workflow`, add composition scenarios, replay GREEN and run `quick_validate.py plugins/zan-workflows/skills/fixing-tapd-bug`.
- [ ] **Step 5:** Prove `git diff --exit-code -- skills/tapd-workflow` succeeds and the plugin monolith path no longer exists.

### Task 7: Harden and verify the complete plugin

**Files:**
- Modify: `plugins/zan-workflows/.codex-plugin/plugin.json`
- Modify plugin copies only: `plugins/zan-workflows/skills/login-token-workflow/**`
- Modify plugin copies only: `plugins/zan-workflows/skills/project-memory-context/**`
- Modify plugin copies only: `plugins/zan-workflows/skills/managed-mr-review/**`
- Modify plugin copies only: `plugins/zan-workflows/skills/team-identity-map/**`
- Add existing scaffold output: `.agents/plugins/marketplace.json`
- Add approved documentation: `docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md`
- Add implementation plans: `docs/superpowers/plans/2026-08-10-zan-workflows-plugin.md`, `docs/superpowers/plans/2026-08-10-tapd-functional-skills.md`
- Preserve: root `skills/**`, `plugins/page-delivery-workflow/**`, and `package.json`

**Interfaces:**
- Consumes: six validated TAPD skills and existing packaging-review findings.
- Produces: a valid marketplace-backed plugin with usable packaged paths and no packaged reusable secret.

- [ ] **Step 1:** In plugin copies only, remove the reusable test password, keep packaged roster data to non-secret platform identity fields and require runtime enterprise-directory lookup for private contact details, make the memory script path resolve after installation, prevent managed-MR source-branch auto-deletion, and package its reviewer role under the owning skill.
- [ ] **Step 2:** Update manifest copy for functional TAPD skills and run `update_plugin_cachebuster.py plugins/zan-workflows`.
- [ ] **Step 3:** Run `quick_validate.py` for every plugin skill and `validate_plugin.py plugins/zan-workflows`.
- [ ] **Step 4:** Verify root `skills`, `plugins/page-delivery-workflow` and `package.json` are unchanged; verify one marketplace entry, six new TAPD skills, no plugin monolith, and `git diff --check`.
- [ ] **Step 5:** Complete final whole-package review and commit with Conventional Commits.
