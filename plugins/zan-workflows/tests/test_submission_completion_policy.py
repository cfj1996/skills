from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return (PLUGIN_ROOT / relative).read_text()


class SubmissionCompletionPolicyTests(unittest.TestCase):
    def test_legacy_submission_rules_accept_queued_builds_without_terminal_evidence(self):
        rules = read("skills/submitting-for-test/references/submission-rules.md")
        deployment = rules.split("## Test deployment and TAPD status", 1)[1]
        self.assertIn("`TRIGGER_ACCEPTED`", deployment)
        self.assertIn("`BUILD_SUBMITTED`", deployment)
        self.assertIn("A queued or building task is sufficient", deployment)
        self.assertIn("missing, rejected or unknown trigger receipt blocks", deployment)
        self.assertNotIn("requires Jenkins success", rules)
        self.assertNotIn("require the\n   successful release result", rules)

    def test_release_guidance_does_not_force_submission_to_wait_for_checkout(self):
        running = read("skills/running-release/SKILL.md")
        full = read("skills/running-release/references/full-release.md")
        scripted = read("references/scripted-delivery.md")
        self.assertIn("Every test-submission build", running)
        self.assertIn("including a\ncanary package build", running)
        self.assertIn("`BUILD_TERMINAL` reads actual package versions", full)
        self.assertIn("In `BUILD_TERMINAL` only, the configured GET-only API", full)
        self.assertIn('"completionMode": "TRIGGER_ACCEPTED"', scripted)
        self.assertIn("`TRIGGER_ACCEPTED` requires neither an actual checkout nor", scripted)
        self.assertNotIn("the confirmed expected revision and actual checkout evidence", scripted)

    def test_submission_validator_does_not_require_future_build_identity(self):
        validator = read("skills/submitting-for-test/agents/submission-validator.md")
        jenkins = validator.split("For `JENKINS_TEST_DEPLOY`", 1)[1].split("For Wiki operations", 1)[0]
        self.assertIn("no build number\nor actual SCM SHA is required", jenkins)
        self.assertIn("Only an existing `BUILD_TERMINAL` result", jenkins)
        self.assertNotIn("must stay within that instance and Job and bind queue/build/actual SCM SHA", jenkins)

    def test_tooling_wiki_pending_status_is_valid_for_new_and_reused_entries(self):
        contracts = read("skills/drafting-wiki/references/contracts.md")
        validator = read("skills/drafting-wiki/agents/wiki-validator.md")
        self.assertIn("a new entry uses `当前版本：待发布`", contracts)
        self.assertIn("including on a newly created page", contracts)
        self.assertIn("valid for new pages, appended entries and reuse", validator)
        self.assertIn("Queue acceptance is not publication evidence", validator)


if __name__ == "__main__":
    unittest.main()
