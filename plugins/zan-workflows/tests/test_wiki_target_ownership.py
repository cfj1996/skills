from pathlib import Path
import re
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
FIXING = (PLUGIN_ROOT / "skills/fixing-bug/SKILL.md").read_text()
FIXING_CONTRACT = (
    PLUGIN_ROOT / "skills/fixing-bug/references/contracts.md"
).read_text()
DRAFTING = (PLUGIN_ROOT / "skills/drafting-wiki/SKILL.md").read_text()
DRAFTING_RULES = (
    PLUGIN_ROOT / "skills/drafting-wiki/references/wiki-template.md"
).read_text()
DRAFTING_CONTRACT = (
    PLUGIN_ROOT / "skills/drafting-wiki/references/contracts.md"
).read_text()
SUBMITTING = (PLUGIN_ROOT / "skills/submitting-for-test/SKILL.md").read_text()
SUBMISSION_RULES = (
    PLUGIN_ROOT / "skills/submitting-for-test/references/submission-rules.md"
).read_text()
GOING_LIVE = (PLUGIN_ROOT / "skills/going-live/SKILL.md").read_text()
GOING_LIVE_VALIDATOR = (
    PLUGIN_ROOT / "skills/going-live/agents/master-merge-validator.md"
).read_text()
GOING_LIVE_CONTRACT = (
    PLUGIN_ROOT / "skills/going-live/references/contracts.md"
).read_text()
PROJECT_KNOWLEDGE = (
    PLUGIN_ROOT / "skills/workspace-project-knowledge/SKILL.md"
).read_text()
PROJECT_RELATIONS = (
    PLUGIN_ROOT
    / "skills/workspace-project-knowledge/references/project-relations.yaml"
).read_text()


class WikiTargetOwnershipTests(unittest.TestCase):
    def test_fixing_bug_never_requires_user_wiki_target(self):
        self.assertNotIn("target_wiki_url", FIXING + FIXING_CONTRACT)
        self.assertIn("Never ask the user for a\nWiki URL", FIXING)
        self.assertIn(
            "absence of a user-supplied Wiki URL never blocks preflight",
            FIXING_CONTRACT,
        )
        self.assertIn("Infer `STANDARD` from an explicit request", FIXING)
        self.assertIn("must never appear in `待确认`", FIXING)

    def test_drafter_resolves_existing_before_planning_creation(self):
        linked = DRAFTING.index("all historical comments")
        hierarchy = DRAFTING.index("fixed `提测文档` hierarchy")
        create = DRAFTING.index("plan creation")
        self.assertLess(linked, hierarchy)
        self.assertLess(hierarchy, create)
        self.assertIn("1150372234001008260", DRAFTING_RULES)
        self.assertIn("CREATE_MONTH_AND_CHILD", DRAFTING_RULES)
        self.assertIn("CREATE_CHILD", DRAFTING_RULES)

    def test_submission_owns_month_and_child_writes(self):
        self.assertNotIn("target_wiki_url", SUBMITTING + SUBMISSION_RULES)
        self.assertIn("WIKI_MONTH_CREATE", (
            PLUGIN_ROOT / "skills/submitting-for-test/agents/submission-validator.md"
        ).read_text())
        self.assertIn("CREATE_MONTH_AND_CHILD", SUBMISSION_RULES)
        self.assertIn("Never write the canonical entry body into the month page", SUBMISSION_RULES)

    def test_continue_wiki_policy_distinguishes_functional_impact(self):
        drafting = DRAFTING + DRAFTING_RULES + DRAFTING_CONTRACT
        self.assertIn("FUNCTIONAL_IMPACT|NON_FUNCTIONAL", drafting)
        self.assertIn("SKIPPED_BY_POLICY", drafting)
        self.assertIn("NON_FUNCTIONAL_CONTINUE", drafting)
        self.assertIn("affected module/page", drafting)
        self.assertIn("影响范围", drafting)
        self.assertNotIn("re-test note", drafting)
        self.assertIn("For `SKIPPED_BY_POLICY`, perform no Wiki", SUBMITTING)

    def test_wiki_template_uses_jenkins_project_and_type_aware_merge_status(self):
        self.assertIn(
            "[{Jenkins Job 名称}]({Jenkins Job 地址})",
            DRAFTING_RULES,
        )
        self.assertIn("- 项目名称：[{项目名称}]({Git 仓库地址})", DRAFTING_RULES)
        self.assertIn("{服务类型}", DRAFTING_RULES)
        self.assertIn("`更新服务` for a business project", DRAFTING_RULES)
        self.assertIn("`工具服务-无需上线` for a tooling/library project", DRAFTING_RULES)
        self.assertIn("`未合并` for test submission", DRAFTING_RULES)
        self.assertIn("`无需上线`. An unresolved project type", DRAFTING_RULES)
        self.assertIn("Jenkins Job 名称` is the exact Job name", DRAFTING_RULES)
        self.assertIn("Jenkins Job 地址` is the exact clickable URL", DRAFTING_RULES)
        self.assertNotIn("{git地址}", DRAFTING_RULES)
        self.assertNotIn("- 环境：联团 老生产", DRAFTING_RULES)

    def test_wiki_service_type_is_normalized_by_project_knowledge(self):
        normalization = PROJECT_KNOWLEDGE.split(
            "Wiki service-type normalization:", 1
        )[1].split("Important routing examples:", 1)[0]
        categories = {
            match.strip().strip("'\"")
            for match in re.findall(
                r"^\s+category:\s*([^\n#]+)", PROJECT_RELATIONS, re.MULTILINE
            )
        }
        missing = sorted(
            category for category in categories if f"`{category}`" not in normalization
        )
        self.assertEqual([], missing)
        self.assertIn("`BUSINESS`", normalization)
        self.assertIn("`TOOLING`", normalization)
        self.assertIn("BLOCKED_UNMAPPED_WIKI_SERVICE_TYPE", normalization)

    def test_going_live_rejects_old_statuses_and_skips_tool_wiki_authorization(self):
        going_live = GOING_LIVE + GOING_LIVE_VALIDATOR + GOING_LIVE_CONTRACT
        self.assertNotIn("`是否上线：否`", going_live)
        self.assertNotIn("`是否上线：是`", going_live)
        self.assertIn("no old-template migration is allowed", GOING_LIVE_VALIDATOR)
        self.assertIn("`是否上线：已合并`", going_live)
        self.assertIn("requires no Wiki-write\n  authorization", GOING_LIVE_CONTRACT)
        self.assertIn("requires no Wiki-write\n   authorization", GOING_LIVE)

    def test_continue_resets_current_business_status_for_new_round(self):
        drafting = DRAFTING + DRAFTING_RULES + DRAFTING_CONTRACT
        self.assertIn("`已合并` back to `未合并`", drafting)
        self.assertIn("tooling entry preserves `无需上线`", drafting)


if __name__ == "__main__":
    unittest.main()
