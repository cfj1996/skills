import re
import unittest
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = PLUGIN_ROOT / "skills"
EXPECTED_SKILLS = {
    "drafting-wiki",
    "fixing-bug",
    "going-live",
    "implementing-work",
    "login-token-workflow",
    "managed-mr-review",
    "preparing-work",
    "project-memory-context",
    "submitting-for-test",
    "team-identity-map",
    "workspace-project-knowledge",
}


class SkillNamesTest(unittest.TestCase):
    def test_skill_directories_and_frontmatter_match_exact_roster(self):
        actual = {path.name for path in SKILLS_ROOT.iterdir() if path.is_dir()}
        self.assertEqual(actual, EXPECTED_SKILLS)

        for skill_name in sorted(EXPECTED_SKILLS):
            skill_text = (SKILLS_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            match = re.search(r"(?m)^name: ([a-z0-9-]+)$", skill_text)
            self.assertIsNotNone(match, skill_name)
            self.assertEqual(match.group(1), skill_name)


if __name__ == "__main__":
    unittest.main()
