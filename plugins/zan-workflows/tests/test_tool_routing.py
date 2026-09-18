from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


class ToolRoutingTests(unittest.TestCase):
    def test_shared_policy_requires_mcp_before_browser(self):
        policy = (PLUGIN_ROOT / "references/tool-routing.md").read_text()
        for server in ["tapd-mcp", "gitlab-mcp", "jenkins-mcp", "yapi-mcp"]:
            self.assertIn(server, policy)
        self.assertIn("专用 MCP → 官方 API/受控 CLI → 浏览器降级", policy)
        self.assertIn("不得静默打开浏览器登录页替代", policy)
        self.assertIn("浏览器降级不继承旧授权", policy)

    def test_external_workflow_skills_link_shared_policy(self):
        skills = [
            "fixing-bug",
            "preparing-work",
            "implementing-work",
            "submitting-for-test",
            "drafting-wiki",
            "going-live",
            "managed-mr-review",
        ]
        for skill in skills:
            with self.subTest(skill=skill):
                text = (PLUGIN_ROOT / f"skills/{skill}/SKILL.md").read_text()
                self.assertIn("../../references/tool-routing.md", text)

    def test_submission_routes_each_external_system_to_its_mcp(self):
        text = (PLUGIN_ROOT / "skills/submitting-for-test/SKILL.md").read_text()
        self.assertIn("`gitlab-mcp`", text)
        self.assertIn("`jenkins-mcp`", text)
        self.assertIn("`tapd-mcp`", text)
        self.assertIn("submission_phase=PLAN|EXECUTE", text)
        self.assertIn("AWAITING_CONFIRMATION", text)

        validator = (
            PLUGIN_ROOT
            / "skills/submitting-for-test/agents/submission-validator.md"
        ).read_text()
        self.assertIn("tool_route=local-git-cli", validator)
        self.assertIn("tool_route=gitlab-mcp", validator)
        self.assertIn("tool_route=jenkins-mcp", validator)
        self.assertIn("tool_route=tapd-mcp", validator)
        self.assertIn("Browser automation is invalid", validator)


if __name__ == "__main__":
    unittest.main()
