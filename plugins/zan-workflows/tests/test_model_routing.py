from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


def agent_frontmatter(relative_path):
    text = (PLUGIN_ROOT / relative_path).read_text()
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise AssertionError(f"missing frontmatter: {relative_path}")
    values = {}
    for line in parts[1].strip().splitlines():
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip()
    return values


class ModelRoutingTests(unittest.TestCase):
    def test_every_skill_exposes_shared_model_policy(self):
        skill_files = sorted((PLUGIN_ROOT / "skills").glob("*/SKILL.md"))
        self.assertGreaterEqual(len(skill_files), 11)
        for skill_file in skill_files:
            with self.subTest(skill=skill_file.parent.name):
                self.assertIn(
                    "../../references/model-routing.md",
                    skill_file.read_text(),
                )

    def test_skill_default_profiles_match_risk(self):
        expected = {
            "fixing-bug": "CRITICAL",
            "preparing-work": "CRITICAL",
            "implementing-work": "CRITICAL",
            "submitting-for-test": "CRITICAL",
            "going-live": "CRITICAL",
            "drafting-wiki": "BALANCED",
            "workspace-project-knowledge": "BALANCED",
            "project-memory-context": "BALANCED",
            "login-token-workflow": "FAST",
            "team-identity-map": "FAST",
        }
        for skill_name, profile in expected.items():
            with self.subTest(skill=skill_name):
                skill = (
                    PLUGIN_ROOT / f"skills/{skill_name}/SKILL.md"
                ).read_text()
                self.assertIn(f"profile: `{profile}`", skill)

        managed = (
            PLUGIN_ROOT / "skills/managed-mr-review/SKILL.md"
        ).read_text()
        self.assertIn("发现阶段默认 `BALANCED`", managed)
        self.assertIn("高风险审核和所有合并决策使用\n`CRITICAL`", managed)

    def test_critical_validators_use_frontier_high_profile(self):
        critical_agents = [
            "skills/preparing-work/agents/validator.md",
            "skills/implementing-work/agents/change-reviewer.md",
            "skills/submitting-for-test/agents/submission-validator.md",
            "skills/going-live/agents/master-merge-validator.md",
            "skills/managed-mr-review/agents/mr-critical-reviewer.md",
        ]
        for agent in critical_agents:
            with self.subTest(agent=agent):
                values = agent_frontmatter(agent)
                self.assertEqual(values["model"], "gpt-5.6-sol")
                self.assertEqual(values["reasoning_effort"], "high")

    def test_balanced_reviewers_use_terra_medium_profile(self):
        balanced_agents = [
            "skills/drafting-wiki/agents/wiki-validator.md",
            "skills/managed-mr-review/agents/mr-code-reviewer.md",
        ]
        for agent in balanced_agents:
            with self.subTest(agent=agent):
                values = agent_frontmatter(agent)
                self.assertEqual(values["model"], "gpt-5.6-terra")
                self.assertEqual(values["reasoning_effort"], "medium")

    def test_managed_mr_review_routes_by_risk_without_spark(self):
        skill = (
            PLUGIN_ROOT / "skills/managed-mr-review/SKILL.md"
        ).read_text()
        self.assertIn("`HIGH` 使用 `agents/mr-critical-reviewer.md`", skill)
        self.assertIn("`ROUTINE` 使用 `agents/mr-code-reviewer.md`", skill)
        self.assertNotIn("gpt-5.3-codex-spark", skill)
        self.assertNotIn("Spark", skill)

    def test_low_model_availability_never_weakens_gates(self):
        policy = (PLUGIN_ROOT / "references/model-routing.md").read_text()
        self.assertIn("never block, ask the user to switch models", policy)
        self.assertIn("Never lower a required authorization", policy)
        self.assertIn("`login-token-workflow` | `FAST`", policy)
        self.assertIn("`team-identity-map` | `FAST`", policy)


if __name__ == "__main__":
    unittest.main()
