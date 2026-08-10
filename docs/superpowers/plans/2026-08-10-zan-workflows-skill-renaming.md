# Zan Workflows TAPD Skill Renaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically rename the six functional TAPD skills to concise business-stage names without changing their inputs, outputs, side effects, validation, orchestration, or V1 recovery behavior.

**Architecture:** Keep the `zan-workflows` plugin namespace and all skill internals intact while moving six skill packages and replacing every active skill identifier. Add an exact plugin-skill roster regression test first, then migrate plugin references and canonical documentation, and finish with zero-old-name scans plus official validators.

**Tech Stack:** Markdown skill packages, Python 3.10 `unittest`, Codex Skill/Plugin validators, Git.

## Global Constraints

- Use exactly these mappings: `resolving-tapd-work -> preparing-work`, `repairing-tapd-work -> implementing-work`, `drafting-tapd-wiki -> drafting-wiki`, `submitting-tapd-for-test -> submitting-for-test`, `merging-tapd-work-to-master -> going-live`, `fixing-tapd-bug -> fixing-bug`.
- Do not retain old skill directories, aliases, compatibility wrappers, or implicit persisted-run migration.
- Do not change any business input/output schema, validator protocol, external-effect sequence, authorization gate, or `run_id` recovery rule.
- `going-live` remains limited to merging the original repair branch to `master` and optionally marking an existing Wiki; it does not deploy or publish production.
- Keep the root standalone `skills/**`, `plugins/page-delivery-workflow/**`, `.agents/plugins/marketplace.json`, and `package.json` unchanged.
- Old names may remain only in the naming migration design and this plan because those files document the exact mapping.

## File Structure

- Move six complete packages under `plugins/zan-workflows/skills/`; every moved package keeps its current `agents/` and `references/` structure.
- Create `plugins/zan-workflows/tests/test_skill_names.py` as the exact 11-skill roster and frontmatter regression test.
- Modify `plugins/zan-workflows/tests/test_workflow_runtime.py` for new persisted `skill` and `current_skill` identifiers.
- Modify `plugins/zan-workflows/references/workflow-runtime.md` and all moved skill Markdown files that name a capability.
- Modify `docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md` and `docs/superpowers/plans/2026-08-10-tapd-functional-skills.md` as the canonical functional design and original implementation guide.
- Modify `plugins/zan-workflows/.codex-plugin/plugin.json` only through the official cachebuster helper after plugin content changes.

---

### Task 1: Atomically rename the six plugin skill packages

**Files:**
- Create: `plugins/zan-workflows/tests/test_skill_names.py`
- Move: `plugins/zan-workflows/skills/resolving-tapd-work/` to `plugins/zan-workflows/skills/preparing-work/`
- Move: `plugins/zan-workflows/skills/repairing-tapd-work/` to `plugins/zan-workflows/skills/implementing-work/`
- Move: `plugins/zan-workflows/skills/drafting-tapd-wiki/` to `plugins/zan-workflows/skills/drafting-wiki/`
- Move: `plugins/zan-workflows/skills/submitting-tapd-for-test/` to `plugins/zan-workflows/skills/submitting-for-test/`
- Move: `plugins/zan-workflows/skills/merging-tapd-work-to-master/` to `plugins/zan-workflows/skills/going-live/`
- Move: `plugins/zan-workflows/skills/fixing-tapd-bug/` to `plugins/zan-workflows/skills/fixing-bug/`
- Modify: `plugins/zan-workflows/references/workflow-runtime.md`
- Modify: `plugins/zan-workflows/tests/test_workflow_runtime.py`
- Modify: every moved `SKILL.md`, `agents/*.md`, and `references/*.md` containing an old skill identifier
- Modify: `plugins/zan-workflows/.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: the six approved name mappings and the existing exact skill contracts.
- Produces: six callable skills named `preparing-work`, `implementing-work`, `drafting-wiki`, `submitting-for-test`, `going-live`, and `fixing-bug`; persisted runtime identifiers use those same strings.

- [ ] **Step 1: Write the failing exact-roster test**

Create `plugins/zan-workflows/tests/test_skill_names.py` with this content:

```python
import re
import unittest
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = PLUGIN_ROOT / "skills"
EXPECTED_SKILLS = {
    "drafting-wiki",
    "fixing-bug",
    "going-live",
    "implementing-work",
    "login-token-workflow",
    "managed-mr-review",
    "preparing-work",
    "project-memory-context",
    "submitting-for-test",
    "team-identity-map",
    "workspace-project-knowledge",
}


class SkillNamesTest(unittest.TestCase):
    def test_skill_directories_and_frontmatter_match_exact_roster(self):
        actual = {path.name for path in SKILLS_ROOT.iterdir() if path.is_dir()}
        self.assertEqual(actual, EXPECTED_SKILLS)

        for skill_name in sorted(EXPECTED_SKILLS):
            skill_text = (SKILLS_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            match = re.search(r"(?m)^name: ([a-z0-9-]+)$", skill_text)
            self.assertIsNotNone(match, skill_name)
            self.assertEqual(match.group(1), skill_name)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the roster test and verify the old package names fail**

Run:

```bash
python3 -m unittest plugins/zan-workflows/tests/test_skill_names.py
```

Expected: FAIL with a set difference containing the six approved new names and the six current old names.

- [ ] **Step 3: Move the six directories without changing their internal structure**

Run these exact commands from `/Users/cfj/projects/skills`:

```bash
mv plugins/zan-workflows/skills/resolving-tapd-work plugins/zan-workflows/skills/preparing-work
mv plugins/zan-workflows/skills/repairing-tapd-work plugins/zan-workflows/skills/implementing-work
mv plugins/zan-workflows/skills/drafting-tapd-wiki plugins/zan-workflows/skills/drafting-wiki
mv plugins/zan-workflows/skills/submitting-tapd-for-test plugins/zan-workflows/skills/submitting-for-test
mv plugins/zan-workflows/skills/merging-tapd-work-to-master plugins/zan-workflows/skills/going-live
mv plugins/zan-workflows/skills/fixing-tapd-bug plugins/zan-workflows/skills/fixing-bug
```

- [ ] **Step 4: Replace every active plugin identifier using the approved mapping**

Apply these exact substitutions only under `plugins/zan-workflows`:

```text
resolving-tapd-work            -> preparing-work
repairing-tapd-work            -> implementing-work
drafting-tapd-wiki             -> drafting-wiki
submitting-tapd-for-test       -> submitting-for-test
merging-tapd-work-to-master    -> going-live
fixing-tapd-bug                -> fixing-bug
```

This updates frontmatter names, self-identification in validator prompts and contracts,
`fixing-bug` capability lists and routing enums, nested Wiki references, standalone workflow
names, runtime test fixtures, and `workflow-runtime.md`. Do not alter artifact type names such as
`TapdWorkDefinition`, `ReviewedChange`, `ValidatedWikiDraft`, `TestSubmissionResult`,
`MasterMergeResult`, or `FixingTapdBugReport`.

- [ ] **Step 5: Update the plugin cachebuster with the official helper**

Run:

```bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py plugins/zan-workflows
```

Expected: one `0.1.0+codex.<UTC timestamp>` version with no second cachebuster suffix.

- [ ] **Step 6: Run the roster and runtime tests**

Run:

```bash
python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_*.py'
```

Expected: 15 tests PASS: the existing 14 runtime tests plus the new roster test.

- [ ] **Step 7: Prove the plugin contains no old callable identifiers**

Run:

```bash
if rg -n 'resolving-tapd-work|repairing-tapd-work|drafting-tapd-wiki|submitting-tapd-for-test|merging-tapd-work-to-master|fixing-tapd-bug' plugins/zan-workflows; then exit 1; fi
```

Expected: no matches and exit 0.

- [ ] **Step 8: Validate the six renamed TAPD skills**

Run:

```bash
for skill_name in preparing-work implementing-work drafting-wiki submitting-for-test going-live fixing-bug; do
  python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py "plugins/zan-workflows/skills/$skill_name"
done
```

Expected: six `Skill is valid!` lines.

- [ ] **Step 9: Commit the atomic plugin rename**

Stage only `plugins/zan-workflows/**`, verify the staged diff, then commit:

```bash
git add -- plugins/zan-workflows
git diff --cached --check
git commit -m "refactor: 简化 TAPD 技能名称"
```

### Task 2: Update canonical workflow documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-tapd-functional-skills.md`
- Preserve mapping history: `docs/superpowers/specs/2026-08-10-zan-workflows-skill-naming-design.md`
- Preserve mapping history: `docs/superpowers/plans/2026-08-10-zan-workflows-skill-renaming.md`

**Interfaces:**
- Consumes: the six renamed plugin skills from Task 1.
- Produces: canonical design examples, workflow diagrams, directory trees, commands, and validator paths that use only the new callable names.

- [ ] **Step 1: Show that canonical documentation still contains old identifiers**

Run:

```bash
rg -n 'resolving-tapd-work|repairing-tapd-work|drafting-tapd-wiki|submitting-tapd-for-test|merging-tapd-work-to-master|fixing-tapd-bug' docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md docs/superpowers/plans/2026-08-10-tapd-functional-skills.md
```

Expected: matches in workflow diagrams, headings, commands, directory paths, and task descriptions.

- [ ] **Step 2: Apply the exact six-name mapping to both canonical documents**

Use the same substitutions from Task 1 in both files. Keep artifact schema names and prose behavior unchanged. The resulting command examples must include:

```text
$zan-workflows:preparing-work <TAPD URL>
$zan-workflows:implementing-work <TapdWorkDefinition>
$zan-workflows:drafting-wiki
$zan-workflows:submitting-for-test 使用 STANDARD 或 NO_WIKI
$zan-workflows:going-live <TestSubmissionResult>
$zan-workflows:fixing-bug <TAPD Bug URL>
```

- [ ] **Step 3: Prove only migration mapping documents retain old names**

Run:

```bash
if rg -n 'resolving-tapd-work|repairing-tapd-work|drafting-tapd-wiki|submitting-tapd-for-test|merging-tapd-work-to-master|fixing-tapd-bug' plugins/zan-workflows docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md docs/superpowers/plans/2026-08-10-tapd-functional-skills.md; then exit 1; fi
```

Expected: no matches and exit 0. Do not include the approved naming design or this implementation plan in this scan because they preserve the migration mapping.

- [ ] **Step 4: Check documentation formatting and scope exclusions**

Run:

```bash
git diff --check
git diff --quiet -- skills plugins/page-delivery-workflow .agents/plugins/marketplace.json package.json
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the documentation migration**

```bash
git add -- docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md docs/superpowers/plans/2026-08-10-tapd-functional-skills.md
git diff --cached --check
git commit -m "docs: 更新 TAPD 技能调用名称"
```

### Task 3: Verify the complete renamed plugin

**Files:**
- Verify: `plugins/zan-workflows/skills/*/SKILL.md`
- Verify: `plugins/zan-workflows/.codex-plugin/plugin.json`
- Verify: `plugins/zan-workflows/tests/test_skill_names.py`
- Verify: `plugins/zan-workflows/tests/test_workflow_runtime.py`
- Verify: canonical functional design and implementation documents from Task 2

**Interfaces:**
- Consumes: the atomic plugin rename and canonical documentation migration.
- Produces: evidence that the new callable names are complete, unique, packaged, and behavior-preserving.

- [ ] **Step 1: Run every plugin skill validator**

```bash
skill_validator=/Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py
skill_count=0
for skill_dir in plugins/zan-workflows/skills/*; do
  python3 "$skill_validator" "$skill_dir"
  skill_count=$((skill_count + 1))
done
test "$skill_count" -eq 11
```

Expected: 11 `Skill is valid!` lines and exit 0.

- [ ] **Step 2: Run the complete runtime and roster regression suite**

```bash
python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_*.py'
```

Expected: 15 tests PASS.

- [ ] **Step 3: Validate the plugin manifest and JSON files**

```bash
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/zan-workflows
python3 -m json.tool plugins/zan-workflows/.codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
```

Expected: plugin validation passes and both JSON commands exit 0.

- [ ] **Step 4: Re-run exact name and scope checks**

```bash
if rg -n 'resolving-tapd-work|repairing-tapd-work|drafting-tapd-wiki|submitting-tapd-for-test|merging-tapd-work-to-master|fixing-tapd-bug' plugins/zan-workflows docs/superpowers/specs/2026-08-10-tapd-functional-skills-design.md docs/superpowers/plans/2026-08-10-tapd-functional-skills.md; then exit 1; fi
git diff --check HEAD~2
git diff --quiet HEAD~2 -- skills plugins/page-delivery-workflow .agents/plugins/marketplace.json package.json
```

Expected: no old-name matches, no whitespace errors, and no excluded-path changes.

- [ ] **Step 5: Inspect the final repository state**

```bash
git status --short
git log -3 --oneline
```

Expected: a clean worktree with the plugin rename commit and documentation migration commit at the top of `main`.
