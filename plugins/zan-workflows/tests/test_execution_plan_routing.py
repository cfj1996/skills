from pathlib import Path
import re
import unittest


SKILLS = Path(__file__).resolve().parents[1] / "skills"
PLANNER = "../collecting-requirements/SKILL.md"
EXECUTOR = "../executing-tapd-plan/SKILL.md"


def entry(name):
    return (SKILLS / name / "SKILL.md").read_text()


def sections(name):
    body = entry(name)
    intake, continuation = body.split("## 按原执行 Wiki 开工\n", 1)
    start, exceptions = continuation.split("## 已有资料与窄范围请求\n", 1)
    return intake, start, exceptions


class ExecutionPlanRoutingTests(unittest.TestCase):
    def assert_in_order(self, body, *markers):
        start = 0
        for marker in markers:
            offset = body.find(marker, start)
            self.assertNotEqual(offset, -1, f"expected {marker!r} after offset {start}")
            start = offset + len(marker)

    def test_normal_requests_reach_the_planner_before_any_legacy_route(self):
        for name, ordinary in (("developing-requirement", "开发这个需求"), ("fixing-bug", "修复这个 Bug")):
            with self.subTest(name=name):
                intake, start, exceptions = sections(name)
                self.assert_in_order(intake, ordinary, PLANNER, "P →", "TC", "`PLAN`", "确认",
                                     "`SAVE → READ`", "回链", "新会话")
                for field in ("现状", "基线", "分支", "规范", "前置 F", "产出", "D", "UI", "TC"):
                    self.assertIn(field, intake)
                self.assertNotIn("legacy-execution.md", intake + start)
                self.assertNotIn("implementationBrief", intake)
                self.assertIn(EXECUTOR, start)
                self.assertIn("SESSION", intake)
                self.assertIn("TAPD_PLAN", intake)
                self.assertIn("执行", start)
                self.assertIn("新会话中用户明确", start)
                self.assertIn("确认版本", start)
                self.assertIn("人工检查", start)
                self.assertIn("submitting-for-test/SKILL.md", start)
                self.assertIn("仅请求命令时只返回命令", exceptions)
                legacy_links = re.findall(r'\]\((references/legacy-execution\.md[^)]*)\)', exceptions)
                if name == "fixing-bug":
                    self.assertEqual(legacy_links, ["references/legacy-execution.md#4-按请求交付"])
                    self.assertIn("只剩提测或上线", exceptions)
                else:
                    self.assertEqual(legacy_links, [])

    def test_selected_task_and_old_work_keep_their_scope(self):
        intake, _, exceptions = sections("developing-requirement")
        self.assertIn("无需为它创建 TAPD Task 或项目本地 Plan", intake)
        self.assertIn("核实其父 Story", exceptions)
        self.assertIn("所选范围", exceptions)
        self.assertIn("只读", exceptions)

    def test_batch_bugs_share_one_confirmation_but_each_has_a_plan_and_a_record(self):
        intake, start, exceptions = sections("fixing-bug")
        self.assert_in_order(intake, "实际与预期", "回归验证", "一次确认", "每个 Bug 做只读",
                             "版本/指纹", "确认后逐 Bug", "独立执行 Wiki", "唯一回链", "一 Bug 一页")
        self.assertIn("一份[完整修复记录]", start)
        self.assertIn("所选终点就绪后再实施", start)
        self.assertIn("待测试", exceptions)

    def test_entrypoint_links_resolve(self):
        for name in ("developing-requirement", "fixing-bug"):
            for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", entry(name)):
                if "://" not in target and not target.startswith("#"):
                    with self.subTest(name=name, target=target):
                        self.assertTrue((SKILLS / name / target.split("#", 1)[0]).is_file())


if __name__ == "__main__":
    unittest.main()
