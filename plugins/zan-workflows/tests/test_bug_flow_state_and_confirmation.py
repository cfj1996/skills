from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
FIXING = (PLUGIN_ROOT / "skills/fixing-bug/SKILL.md").read_text()
PREPARING = (PLUGIN_ROOT / "skills/preparing-work/SKILL.md").read_text()
BRANCH_RULES = (PLUGIN_ROOT / "skills/preparing-work/references/collection-and-branch.md").read_text()
IMPLEMENTING = (PLUGIN_ROOT / "skills/implementing-work/SKILL.md").read_text()
SUBMITTING = (PLUGIN_ROOT / "skills/submitting-for-test/SKILL.md").read_text()
DEPLOYMENT = (PLUGIN_ROOT / "skills/submitting-for-test/references/deployment-and-confirmation.md").read_text()


class BugFlowStateAndConfirmationTests(unittest.TestCase):
    def test_continue_reuses_branch_and_preserves_waiting_test_owner(self):
        self.assertIn("work_mode=AUTO|INITIAL|CONTINUE", FIXING)
        self.assertIn("不新建“后续修复”分支", FIXING)
        self.assertIn("原项目、仓库和分支", FIXING)
        self.assertIn("CONTINUE", PREPARING)
        self.assertIn("Never derive a second branch", BRANCH_RULES)
        for text in [FIXING, IMPLEMENTING]:
            self.assertIn("SKIPPED_ALREADY_WAITING_TEST", text)
        self.assertIn("保留状态与处理人", FIXING)

    def test_repair_records_bracket_source_and_review(self):
        self.assertIn("bug-repair-owner.md", FIXING)
        self.assertIn("bug-repair-record.md", FIXING)
        self.assertIn("联合写入读回", FIXING)
        self.assertIn("开始评论读回后改源码", FIXING)
        self.assertIn("验证及独立评审通过后写完成评论", FIXING)
        self.assertIn("评论失败保留已有代码与评审结果", FIXING)

    def test_explicit_implementation_endpoint_stops_before_submission_even_plan(self):
        self.assertIn("delivery_mode=IMPLEMENT|SUBMIT|GO_LIVE", FIXING)
        self.assertIn("普通“修复”默认 `SUBMIT`", FIXING)
        self.assertIn("只修复验证/只开发、不提测", FIXING)
        stop = FIXING.index("`IMPLEMENT` 在 `REVIEWED` 结束")
        delivery = FIXING.index("## 4. 按请求交付")
        self.assertIn("不调用 `submitting-for-test`，包括其 PLAN 阶段", FIXING[stop:delivery])
        self.assertIn("只修复时不解析、不询问 Wiki/Jenkins", FIXING)
        self.assertIn("测试反馈不覆盖本轮明确终点", FIXING)
        self.assertIn("复用仍有效的 `ReviewedChange`", FIXING)

    def test_submission_remains_explicit_optional_and_two_phase(self):
        for marker in ["submission_profile=AUTO|STANDARD|NO_WIKI", "deployment_mode=AUTO|DEPLOY|SKIP",
                       "需要提测 Wiki（会创建/更新）", "不需要提测 Wiki",
                       "submission_phase=PLAN", "submission_phase=EXECUTE", "dev/develop"]:
            self.assertIn(marker, FIXING)
        self.assertIn("初始修复清单不能替代提测计划确认", FIXING)
        self.assertIn("Select `DEPLOY`; preserve an explicit `SKIP`", DEPLOYMENT)
        self.assertIn("SKIPPED_BY_INTENT", DEPLOYMENT)
        self.assertIn("one complete `SubmissionPlan`", DEPLOYMENT)
        self.assertIn("commit SHA, MR ID, Wiki/month/child ID", DEPLOYMENT)
        self.assertIn("do not require another confirmation", DEPLOYMENT)

    def test_deployment_and_wiki_registration_keep_order(self):
        deployment = SUBMITTING.index("deployment gate through `jenkins-mcp`")
        wiki = SUBMITTING.index("execute the authorized Wiki plan")
        status = SUBMITTING.lower().index("apply the status policy")
        self.assertLess(deployment, wiki)
        self.assertLess(wiki, status)
        self.assertIn("blocks every later Wiki/TAPD write", SUBMITTING)

    def test_go_live_and_cleanup_are_delegated_without_early_shared_cleanup(self):
        for marker in ["zan-workflows:going-live", "AWAITING_MERGE", "userAction.message",
                       "已合并，继续上线", "operation=CLEANUP"]:
            self.assertIn(marker, FIXING)
        self.assertIn("续接先只读核实同一 MR", FIXING)
        self.assertIn("全部相关 Bug 结束后", FIXING)
        self.assertIn("单独确认", FIXING)
        self.assertIn("开发远程分支不能由本地清理授权推导删除", FIXING)


if __name__ == "__main__":
    unittest.main()
