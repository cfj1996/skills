from pathlib import Path
import re
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILL_PATH = PLUGIN_ROOT / "skills/fixing-bug/SKILL.md"
SKILL = SKILL_PATH.read_text()
CONTRACTS = (SKILL_PATH.parent / "references/contracts.md").read_text()
CHECKLIST = (PLUGIN_ROOT / "references/execution-checklist.md").read_text()


class FixingBugScopeGateTests(unittest.TestCase):
    def test_shared_checklist_is_the_only_presentation_contract(self):
        self.assertIn("../../references/execution-checklist.md", SKILL)
        self.assertIn("| 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 需求待确认 |", SKILL)
        for required in ["#01", "TAPD 更新与修复记录", "是否按以上确定清单执行？"]:
            self.assertIn(required, SKILL)
        self.assertIn("等待授权不是缺口", SKILL)
        self.assertIn("确认前只读", SKILL)
        self.assertIn("表格、编号详情、所引 Plan", SKILL)
        self.assertFalse((SKILL_PATH.parent / "references/workflow.md").exists())

    def test_prepare_is_read_only_until_all_items_and_confirmation_are_bound(self):
        self.assertIn("全部条目预检完成", SKILL)
        self.assertIn("`PENDING` 预检快照不是可执行交接", SKILL)
        self.assertIn("`READY_FOR_HANDOFF`", SKILL)
        self.assertIn("准确分支/基准", SKILL)
        self.assertIn("状态/处理人及确认绑定", SKILL)
        self.assertIn("暂停整个队列", SKILL)
        self.assertIn("失败项不得", CONTRACTS)

    def test_shared_branch_creation_and_revalidation_are_preserved(self):
        self.assertIn("CREATE → USE_EXISTING", SKILL)
        self.assertIn("不增加确认", SKILL)
        self.assertIn("第一次成功创建并读回固定分支后", SKILL)
        self.assertIn("后续 Bug 使用 `USE_EXISTING`", SKILL)
        self.assertIn("已有分支不要求已经包含当前 Bug", SKILL)
        self.assertIn("失败发生在创建前则仍需 CREATE", CONTRACTS)

    def test_owned_local_references_resolve(self):
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", SKILL):
            if "://" not in target and not target.startswith("#"):
                with self.subTest(target=target):
                    self.assertTrue((SKILL_PATH.parent / target.split("#", 1)[0]).is_file())

    def test_scope_inputs_do_not_restore_removed_workflow_routing(self):
        for removed in ["workflow_profile", "verification_risk", "QUICK", "FULL"]:
            self.assertNotIn(removed, SKILL + CONTRACTS)
        self.assertIn("implementationBrief", SKILL)
        self.assertIn("STANDARD|NO_WIKI", SKILL)
        self.assertIn("修复记录", SKILL)


if __name__ == "__main__":
    unittest.main()
