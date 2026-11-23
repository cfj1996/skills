from pathlib import Path
import re
import unittest

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILLS = PLUGIN_ROOT / "skills"
SKILL = (SKILLS / "developing-requirement/SKILL.md").read_text()
BRANCH = (SKILLS / "developing-requirement/references/branch-checklist.md").read_text()


class RequirementDevelopmentFlowTests(unittest.TestCase):
    def test_branch_naming_and_no_tracking_are_preserved(self):
        for rule in ["feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>", "scripts/resolve-branch-owner.mjs",
                     "USER_NAME", "git config user.name", "本机用户名", "Asia/Shanghai",
                     "git check-ref-format --branch", "git switch --no-track -c"]:
            self.assertIn(rule, BRANCH)
        self.assertIn("CONTINUE 复用已证实原分支", BRANCH)
        self.assertIn("feature/alice.0918.1080800.供应商分账限制", BRANCH)
        self.assertNotIn("feature/cfj.", SKILL + BRANCH)


    def test_project_and_task_writers_are_retired_at_every_skill_entry(self):
        self.assertFalse((SKILLS / "breaking-down-requirement").exists())
        self.assertFalse((SKILLS / "writing-plans/assets/page-delivery-plan-template.md").exists())
        manifest = (PLUGIN_ROOT / ".codex-plugin/plugin.json").read_text()
        for entry in [manifest, *(f.read_text() for f in SKILLS.glob("*/SKILL.md"))]:
            self.assertNotRegex(entry, r"\bcreate_tasks?\b|phase=PLAN_WRITE|\$breaking-down-requirement")

    def test_new_skills_and_references_are_portable(self):
        for name in ("collecting-requirements", "executing-tapd-plan"):
            root = SKILLS / name
            self.assertIn("$" + name, (root / "agents/openai.yaml").read_text())
            for path in [root / "SKILL.md", *root.glob("references/*.md")]:
                for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text()):
                    if "://" not in target and not target.startswith("#"):
                        self.assertTrue((path.parent / target.split("#", 1)[0]).exists(), (path, target))

    def test_story_and_existing_task_keep_bug_only_mutations_out(self):
        source = (SKILLS / "preparing-work/SKILL.md").read_text()
        self.assertIn("Only Bug definitions may carry a `WRITE_ACTIVE`", source)
        handoff = (SKILLS / "executing-tapd-plan/references/executing.md").read_text()
        for contract in ("registration.entryType=stories", "statusAction=NONE",
                         "registration.entryType=bug", "statusAction=WAITING_TEST"):
            self.assertIn(contract, handoff)


if __name__ == "__main__":
    unittest.main()
