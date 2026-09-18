from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


class RequirementDevelopmentFlowTests(unittest.TestCase):
    def test_orchestrator_composes_existing_skills_in_order(self):
        text = (PLUGIN_ROOT / "skills/developing-requirement/SKILL.md").read_text()
        composition = text[text.index("## Composition contract"):text.index("## 1. Resolve affected projects")]
        ordered = [
            "zan-workflows:workspace-project-knowledge",
            "zan-workflows:writing-plans` with `phase=SCOPE_REVIEW",
            "zan-workflows:preparing-work",
            "zan-workflows:writing-plans` with `phase=PLAN_WRITE",
            "zan-workflows:implementing-work",
        ]
        offsets = [composition.index(marker) for marker in ordered]
        self.assertEqual(offsets, sorted(offsets))
        self.assertIn("origin/master", text)
        self.assertIn("delivery_mode=PLAN_ONLY|BRANCH_ONLY|IMPLEMENT", text)
        self.assertIn("PENDING_TAPD_STORY_OR_TASK", text)
        self.assertIn("fixed_branch", text)

    def test_orchestrator_stops_before_delivery_workflows(self):
        text = (PLUGIN_ROOT / "skills/developing-requirement/SKILL.md").read_text()
        self.assertIn("does not commit", text)
        self.assertIn("submit for test", text)
        self.assertIn("merge to master", text)

    def test_writing_plans_routes_simple_and_complex_scope_before_branch_plan(self):
        text = (PLUGIN_ROOT / "skills/writing-plans/SKILL.md").read_text()
        ordered = [
            "根据需求、PRD 或原型确定受影响项目",
            "获取并验证最新远程 `origin/master`",
            "根据范围复杂度选择评审模式",
            "输出 `ConfirmedRequirementScope`",
            "消费已验证的分支定义",
            "输出 branch-bound Plan",
        ]
        offsets = [text.index(marker) for marker in ordered]
        self.assertEqual(offsets, sorted(offsets))
        self.assertIn("`DIALOGUE`", text)
        self.assertIn("`PANEL`", text)
        self.assertIn("选择 `DIALOGUE` 时禁止仅为形式完整而启动面板", text)

    def test_skill_has_zan_ui_metadata(self):
        yaml = (PLUGIN_ROOT / "skills/developing-requirement/agents/openai.yaml").read_text()
        self.assertIn('display_name: "zan:需求开发"', yaml)
        self.assertIn("$developing-requirement", yaml)

    def test_story_and_task_never_use_bug_active_status(self):
        preparing = (PLUGIN_ROOT / "skills/preparing-work/SKILL.md").read_text()
        implementing = (PLUGIN_ROOT / "skills/implementing-work/SKILL.md").read_text()
        orchestrator = (PLUGIN_ROOT / "skills/developing-requirement/SKILL.md").read_text()
        for text in [preparing, implementing, orchestrator]:
            self.assertIn("NOT_APPLICABLE_NON_BUG", text)
        self.assertIn("Only Bug definitions may carry a `WRITE_ACTIVE`", preparing)
        self.assertIn("for Story/Task", implementing)

    def test_scope_review_is_read_only(self):
        text = (PLUGIN_ROOT / "skills/writing-plans/SKILL.md").read_text()
        self.assertIn("`SCOPE_REVIEW` 只读取现有规则", text)
        self.assertIn("不得写 `AGENTS.md`", text)

    def test_requirement_branch_format_and_single_checklist_confirmation(self):
        skill = (PLUGIN_ROOT / "skills/developing-requirement/SKILL.md").read_text()
        branch_rules = (
            PLUGIN_ROOT
            / "skills/developing-requirement/references/branch-checklist.md"
        ).read_text()
        self.assertIn("feature/cfj.<MMDD>.<短ID>.<描述slug>", skill)
        self.assertIn("feature/cfj.0918.1080800.supplier-split-bill-restrictions", branch_rules)
        self.assertIn("是否按此清单执行？", skill)
        self.assertIn("Do not ask separately", skill)
        self.assertIn("git switch --no-track -c", branch_rules)

    def test_checklist_confirmation_is_reused_by_prepare_and_implement(self):
        preparing = (PLUGIN_ROOT / "skills/preparing-work/SKILL.md").read_text()
        implementing = (PLUGIN_ROOT / "skills/implementing-work/SKILL.md").read_text()
        self.assertIn("confirmation_source", preparing)
        self.assertIn("Do not ask again", implementing)


if __name__ == "__main__":
    unittest.main()
