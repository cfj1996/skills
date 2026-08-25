from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
