from pathlib import Path
import re
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILL_PATH = PLUGIN_ROOT / "skills/developing-requirement/SKILL.md"
SKILL = SKILL_PATH.read_text()
BRANCH = (SKILL_PATH.parent / "references/branch-checklist.md").read_text()
PROGRESS = (SKILL_PATH.parent / "references/progress-guidance.md").read_text()


def read(relative):
    return (PLUGIN_ROOT / relative).read_text()


class RequirementDevelopmentFlowTests(unittest.TestCase):
    def test_main_sequence_keeps_scope_confirmation_write_and_review_boundaries(self):
        sections = ["## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7."]
        offsets = [SKILL.index(section) for section in sections]
        self.assertEqual(offsets, sorted(offsets))
        for capability in ["workspace-project-knowledge", "writing-plans", "breaking-down-requirement",
                           "preparing-work", "implementing-work", "submitting-for-test", "going-live"]:
            self.assertIn(capability, SKILL)
        self.assertIn("origin/master", SKILL)
        self.assertIn("delivery_mode=PLAN_ONLY|BRANCH_ONLY|IMPLEMENT|SUBMIT|GO_LIVE", SKILL)
        self.assertIn("PENDING_TAPD_STORY_OR_TASK", SKILL)
        self.assertIn("确认前不创建分支、保存 Plan、写 Task 或源码", SKILL)

    def test_task_plan_are_need_based_without_removed_profile_defaults(self):
        for removed in ["workflow_profile", "verification_risk", "QUICK", "FULL"]:
            self.assertNotIn(removed, SKILL + BRANCH + PROGRESS)
        self.assertIn("implementationBrief", SKILL)
        self.assertIn("没有 Task/Plan 不强制创建", SKILL)
        self.assertIn("已有正式 Plan", SKILL)
        self.assertIn("Task 输入只检查或调整所选 Task", SKILL)
        self.assertIn("TaskBreakdownResult.terminal_state=TASKS_READY", SKILL)
        self.assertIn("tapdTaskKey", SKILL)
        self.assertIn("不能用", SKILL[SKILL.index("正式需求实施必须"):])
        self.assertIn("默认不生成 scheduleRecommendation", SKILL)

    def test_task_readback_and_plan_fill_do_not_expand_authority(self):
        for required in ["phase=PLAN", "phase=EXECUTE", "REUSE 只准确读回", "禁止直接重试创建",
                         "phase=PLAN_WRITE", "准确读回 ID/链接", "confirmPlan", "保存回执"]:
            self.assertIn(required, SKILL)
        self.assertIn("任务创建不改变原分支身份", SKILL)
        self.assertIn("不自动标 Task done", SKILL)
        self.assertIn("人员、工时、范围或方案变化必须另展示差异", SKILL)

    def test_checklist_is_shared_and_not_separate_scope_or_branch_approval(self):
        self.assertIn("../../references/execution-checklist.md", SKILL)
        self.assertIn("| 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 待决事项 |", SKILL)
        self.assertIn("#01", SKILL)
        self.assertIn("是否按以上确定清单执行？", SKILL)
        self.assertIn("不另问一轮范围或分支", SKILL)
        self.assertIn("真实", SKILL)
        self.assertIn("等待批准算成缺口", SKILL)
        self.assertIn("不查询未选择的 Jenkins", SKILL)
        self.assertIn("refs", BRANCH)

    def test_requirement_and_implementation_readiness_are_distinct(self):
        checklist = read("skills/writing-plans/references/requirement-readiness-checklist.md")
        self.assertIn("requirement-readiness-checklist.md", SKILL)
        for gate in ["REQUIREMENT_BLOCKER", "IMPLEMENTATION_BLOCKER", "NON_BLOCKING"]:
            self.assertIn(gate, checklist)
        for field in ["项目/模块", "类别", "检查项", "状态", "当前证据", "责任方", "影响", "门禁", "建议动作"]:
            self.assertIn(field, checklist)
        for count in ["requirement_blocker_count=0", "implementation_blocker_count=0"]:
            self.assertIn(count, SKILL)
        self.assertIn("PLAN_ONLY 可保留实施缺口", SKILL)
        self.assertIn("不受未来实现缺口阻塞", SKILL)

    def test_branch_naming_and_no_tracking_are_preserved(self):
        for rule in ["feature/<branch-owner>.<MMDD>.<短ID>.<中文描述>", "scripts/resolve-branch-owner.mjs",
                     "USER_NAME", "git config user.name", "本机用户名", "Asia/Shanghai",
                     "git check-ref-format --branch", "git switch --no-track -c"]:
            self.assertIn(rule, BRANCH)
        self.assertIn("CONTINUE 复用已证实原分支", BRANCH)
        self.assertIn("feature/alice.0918.1080800.供应商分账限制", BRANCH)
        self.assertNotIn("feature/cfj.", SKILL + BRANCH)

    def test_story_task_never_inherits_bug_status_or_record_obligation(self):
        for text in [SKILL, read("skills/preparing-work/SKILL.md"), read("skills/implementing-work/SKILL.md")]:
            self.assertIn("NOT_APPLICABLE_NON_BUG", text)
        self.assertIn("Only Bug definitions may carry a `WRITE_ACTIVE`", read("skills/preparing-work/SKILL.md"))

    def test_delivery_has_exact_plan_then_separate_execution(self):
        for marker in ["submission_phase=PLAN", "submission_phase=EXECUTE", "shared-test-wiki.md",
                       "AWAITING_MERGE", "userAction.message", "zan-workflows:going-live"]:
            self.assertIn(marker, SKILL)
        self.assertIn("初始开发清单不能替代", SKILL)
        self.assertIn("不按 Task 新建 Wiki", SKILL)
        self.assertIn("业务应用生产部署不由本入口推导", SKILL)
        self.assertIn("不能提前删除其他项目仍使用的分支/工作树", SKILL)

    def test_progress_reports_actual_results_and_no_next_stage_on_blocker(self):
        self.assertIn("references/progress-guidance.md", SKILL)
        self.assertIn("不能推荐提交测试", PROGRESS)
        self.assertIn("不重复创建", PROGRESS)
        self.assertIn("userAction.message", PROGRESS)
        self.assertIn("不能把待人工处理算成功", PROGRESS)
        self.assertIn("用户选择保留后不反复询问", PROGRESS)
        self.assertNotIn("## 你可以选择", PROGRESS)

    def test_scope_review_remains_read_only_and_panels_conditional(self):
        writing = read("skills/writing-plans/SKILL.md")
        self.assertIn("`SCOPE_REVIEW` 只读取现有规则", writing)
        self.assertIn("不得写 `AGENTS.md`", writing)
        self.assertIn("DIALOGUE", writing)
        self.assertIn("PANEL", writing)
        self.assertIn("选择 `DIALOGUE` 时禁止仅为形式完整而启动面板", writing)
        self.assertIn("不加载未采用的面板运行时", SKILL)

    def test_skill_metadata_and_local_references_are_valid(self):
        metadata = read("skills/developing-requirement/agents/openai.yaml")
        self.assertIn('display_name: "zan:需求开发"', metadata)
        self.assertIn("$developing-requirement", metadata)
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", SKILL):
            if "://" not in target and not target.startswith("#"):
                with self.subTest(target=target):
                    self.assertTrue((SKILL_PATH.parent / target.split("#", 1)[0]).is_file())


if __name__ == "__main__":
    unittest.main()
