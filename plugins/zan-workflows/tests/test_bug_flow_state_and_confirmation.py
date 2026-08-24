from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
FIXING = (PLUGIN_ROOT / "skills/fixing-bug/SKILL.md").read_text()
FIXING_WORKFLOW = (
    PLUGIN_ROOT / "skills/fixing-bug/references/workflow.md"
).read_text()
PREPARING = (PLUGIN_ROOT / "skills/preparing-work/SKILL.md").read_text()
BRANCH_RULES = (
    PLUGIN_ROOT / "skills/preparing-work/references/collection-and-branch.md"
).read_text()
IMPLEMENTING = (PLUGIN_ROOT / "skills/implementing-work/SKILL.md").read_text()
SUBMITTING = (PLUGIN_ROOT / "skills/submitting-for-test/SKILL.md").read_text()
DEPLOYMENT = (
    PLUGIN_ROOT
    / "skills/submitting-for-test/references/deployment-and-confirmation.md"
).read_text()


class BugFlowStateAndConfirmationTests(unittest.TestCase):
    def test_continue_reuses_original_branch_without_new_status_cycle(self):
        self.assertIn("work_mode=AUTO|INITIAL|CONTINUE", FIXING)
        self.assertIn("Never create a “follow-up” branch", FIXING)
        self.assertIn("CONTINUE", PREPARING)
        self.assertIn("Never derive a second branch", BRANCH_RULES)
        self.assertIn("SKIPPED_ALREADY_WAITING_TEST", IMPLEMENTING)
        self.assertIn("Do not create another branch or reset TAPD status", FIXING_WORKFLOW)

    def test_deployment_is_optional_and_direct_submit_is_supported(self):
        self.assertIn("deployment_mode=AUTO|DEPLOY|SKIP", FIXING)
        self.assertIn("`DEPLOY`", DEPLOYMENT)
        self.assertIn("`SKIP`", DEPLOYMENT)
        self.assertIn("otherwise select `SKIP`", DEPLOYMENT)
        self.assertIn("SKIPPED_BY_INTENT", DEPLOYMENT)

    def test_deploy_must_finish_before_wiki_and_waiting_test_writes(self):
        deployment_gate = SUBMITTING.index("Resolve the deployment gate")
        wiki_write = SUBMITTING.index("execute the authorized Wiki plan")
        status_write = SUBMITTING.index("Apply the status policy")
        self.assertLess(deployment_gate, wiki_write)
        self.assertLess(wiki_write, status_write)
        self.assertIn("FAILED|UNKNOWN", SUBMITTING)
        self.assertIn("blocks every later Wiki/TAPD write", SUBMITTING)

    def test_normal_flow_uses_two_confirmations_and_reuses_derived_ids(self):
        self.assertIn("exact branch action and verified base ref/SHA", FIXING)
        self.assertIn(
            "scope/start confirmation -> consolidated submit confirmation",
            FIXING_WORKFLOW,
        )
        self.assertIn("one complete `SubmissionPlan`", DEPLOYMENT)
        self.assertIn("do not require another confirmation", DEPLOYMENT)
        self.assertIn("commit SHA, MR ID, Wiki/month/child ID", DEPLOYMENT)


if __name__ == "__main__":
    unittest.main()
