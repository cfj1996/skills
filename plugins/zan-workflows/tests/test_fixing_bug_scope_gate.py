from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILL = (PLUGIN_ROOT / "skills/fixing-bug/SKILL.md").read_text()
CONTRACTS = (PLUGIN_ROOT / "skills/fixing-bug/references/contracts.md").read_text()
WORKFLOW = (PLUGIN_ROOT / "skills/fixing-bug/references/workflow.md").read_text()
SCENARIOS = (
    PLUGIN_ROOT / "skills/fixing-bug/references/acceptance-scenarios.md"
).read_text()


class FixingBugScopeGateTests(unittest.TestCase):
    def test_preflight_has_exact_visible_contract(self):
        self.assertIn("| Bug | 项目/仓库 | 分支 | 修复范围 | 待确认 |", SKILL)
        self.assertIn("`是否按此清单执行？`", SKILL)
        self.assertIn("Before confirmation", SKILL)
        self.assertIn("do not create a branch", SKILL)

    def test_branch_confirmation_binds_identity_not_action(self):
        self.assertIn(
            "exact fixed branch identity; exclude `CREATE` or `USE_EXISTING`",
            CONTRACTS,
        )
        self.assertRegex(
            SKILL,
            r"The expected `CREATE` to\s+`USE_EXISTING` transition does not invalidate confirmation",
        )
        self.assertIn(
            "Branch action is execution control flow, not a visible checklist field",
            WORKFLOW,
        )

    def test_execution_time_preparation_failure_pauses_entire_queue(self):
        self.assertRegex(
            SKILL,
            r"If execution-time `preparing-work`\s+returns `PENDING` or `BLOCKED`, pause the entire queue",
        )
        self.assertRegex(
            SKILL,
            r"Only\s+`implementing-work`, `submitting-for-test`, or `going-live`",
        )
        self.assertIn(
            "Execution-time preparation becomes `PENDING` or `BLOCKED`",
            SCENARIOS,
        )
        self.assertIn(
            "Execution-time `preparing-work` returning `PENDING` or `BLOCKED` pauses the entire queue",
            CONTRACTS,
        )
        self.assertIn(
            "A downstream failure from `implementing-work`, `submitting-for-test`, or `going-live`",
            CONTRACTS,
        )
        self.assertNotIn("A failed Bug does not cancel later Bugs.", CONTRACTS)


if __name__ == "__main__":
    unittest.main()
