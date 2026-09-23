from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
LINKING = (PLUGIN_ROOT / "skills/linking-tapd-wiki/SKILL.md").read_text()
CONTRACT = (
    PLUGIN_ROOT / "skills/linking-tapd-wiki/references/contracts.md"
).read_text()
VALIDATOR = (
    PLUGIN_ROOT / "skills/linking-tapd-wiki/agents/comment-validator.md"
).read_text()
SUBMITTING = (PLUGIN_ROOT / "skills/submitting-for-test/SKILL.md").read_text()
SUBMISSION_RULES = (
    PLUGIN_ROOT / "skills/submitting-for-test/references/submission-rules.md"
).read_text()


class LinkingTapdWikiTests(unittest.TestCase):
    def test_supports_bug_story_and_task_with_exact_comment(self):
        for item_type in ["Bug", "Story", "Task"]:
            self.assertIn(item_type, LINKING)
        self.assertIn(
            "提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}]",
            LINKING,
        )
        self.assertIn("tapd-mcp", LINKING)
        self.assertIn("是否补写以上 Wiki 链接评论？", LINKING)

    def test_is_idempotent_and_blocks_conflicting_wikis(self):
        combined = LINKING + CONTRACT
        self.assertIn("ALREADY_LINKED", combined)
        self.assertIn("BLOCKED_CONFLICT", combined)
        self.assertIn("canonical Wiki ID", combined)
        self.assertIn("never append a second", CONTRACT)

    def test_standalone_and_orchestrated_confirmations_are_separate(self):
        self.assertIn("link_phase=PLAN|EXECUTE", LINKING)
        self.assertIn("confirmation_mode=STANDALONE|DEFER_TO_ORCHESTRATOR", LINKING)
        self.assertIn("confirmed `SubmissionPlan`", CONTRACT)
        self.assertIn("zan-workflows:linking-tapd-wiki", SUBMITTING)
        self.assertIn("LINKED|ALREADY_LINKED", SUBMITTING)
        self.assertIn("LINKED|ALREADY_LINKED", SUBMISSION_RULES)

    def test_comment_write_cannot_mutate_other_workflow_state(self):
        combined = LINKING + CONTRACT + VALIDATOR
        for forbidden_scope in [
            "TAPD status/version",
            "Git delivery",
            "deployment",
            "master merge",
            "local cleanup",
        ]:
            self.assertIn(forbidden_scope, combined)
        self.assertIn("no different 提测 Wiki link conflicts", VALIDATOR)


if __name__ == "__main__":
    unittest.main()
