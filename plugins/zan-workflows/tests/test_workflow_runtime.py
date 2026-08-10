import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PLUGIN_ROOT / "scripts" / "workflow_runtime.py"


class WorkflowRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def cli(self, *args):
        completed = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--state-root",
                str(self.state_root),
                *args,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def init_run(self):
        return self.cli(
            "init",
            "--workflow",
            "fixing-tapd-bug",
            "--workflow-version",
            "1",
            "--request-json",
            json.dumps(
                {
                    "tapd_url": "https://www.tapd.cn/1/bugtrace/bugs/view/2",
                    "submission_profile": "NO_WIKI",
                }
            ),
        )

    def test_records_skill_input_output_and_resumes_from_next_skill(self):
        created = self.init_run()
        run_id = created["run_id"]

        started = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:resolving-tapd-work",
            "--input-json",
            json.dumps({"tapd_url": "https://www.tapd.cn/1/bugtrace/bugs/view/2"}),
        )
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            started["invocation_id"],
            "--status",
            "SUCCEEDED",
            "--output-json",
            json.dumps({"terminal_state": "READY_FOR_HANDOFF", "project": "order-admin"}),
            "--validation-state",
            "PASSED",
            "--next-skill",
            "zan-workflows:repairing-tapd-work",
        )

        resumed = self.cli("resume", "--run-id", run_id)
        run = self.cli("show", "--run-id", run_id)

        self.assertEqual(resumed["current_skill"], "zan-workflows:repairing-tapd-work")
        self.assertEqual(resumed["status"], "RUNNING")
        self.assertEqual(resumed["completed_outputs"][0]["skill_version"], "1")
        self.assertEqual(
            resumed["completed_outputs"][0]["input_hash"],
            run["invocations"][0]["input"]["hash"],
        )
        self.assertEqual(run["invocations"][0]["status"], "SUCCEEDED")
        self.assertEqual(run["invocations"][0]["output"]["value"]["project"], "order-admin")
        self.assertEqual(len(run["invocations"][0]["input"]["hash"]), 64)
        self.assertEqual(len(run["invocations"][0]["output"]["hash"]), 64)

    def test_records_external_effect_progress_and_readback(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TAPD_STATUS",
            "--target-json",
            json.dumps({"bug_id": "2"}),
            "--payload-json",
            json.dumps({"status": "已修复"}),
        )["effect_id"]

        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "EXECUTING",
            "--validation-state",
            "PASSED",
            "--authorization-json",
            json.dumps({"actor": "user", "text": "确认更新 TAPD 状态"}),
        )
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "APPLIED",
            "--actual-json",
            json.dumps({"status": "已修复"}),
        )
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "VERIFIED",
            "--readback-json",
            json.dumps({"status": "已修复"}),
        )

        run = self.cli("show", "--run-id", run_id)
        effect = run["effects"][0]
        self.assertEqual(effect["status"], "VERIFIED")
        self.assertEqual(effect["actual"]["value"]["status"], "已修复")
        self.assertEqual(effect["readback"]["value"]["status"], "已修复")
        self.assertEqual(len(effect["intended_effect_hash"]), 64)
        self.assertEqual(len(effect["actual"]["hash"]), 64)
        self.assertEqual(effect["validation"]["state"], "PASSED")
        self.assertEqual(effect["authorization"]["value"]["actor"], "user")

    def test_adopts_existing_effect_without_execution_fields(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "STANDARD"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "WIKI_WRITE",
            "--target-json",
            json.dumps({"wiki_id": "10"}),
            "--payload-json",
            json.dumps({"content": "expected"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "ADOPTED_EXISTING_EFFECT",
            "--validation-state",
            "PASSED",
            "--readback-json",
            json.dumps({"content": "expected"}),
            "--confirmation-json",
            json.dumps({"actor": "user", "text": "确认采用已有 Wiki 结果"}),
        )

        effect = self.cli("show", "--run-id", run_id)["effects"][0]
        self.assertEqual(effect["status"], "ADOPTED_EXISTING_EFFECT")
        self.assertIsNone(effect["executing_at"])
        self.assertIsNone(effect["actual"])
        self.assertEqual(effect["readback"]["hash"], effect["intended_effect_hash"])
        self.assertEqual(len(effect["adoption_scope_hash"]), 64)

    def test_unknown_effect_pauses_run_and_can_be_reconciled(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TEST_VERSION",
            "--target-json",
            json.dumps({"service": "order-admin"}),
            "--payload-json",
            json.dumps({"version": "v1"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "EXECUTING",
            "--validation-state",
            "PASSED",
            "--authorization-json",
            json.dumps({"actor": "user", "text": "确认发布测试版本"}),
        )
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "UNKNOWN",
        )
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "INTERRUPTED",
            "--output-json",
            json.dumps({"terminal_state": "INTERRUPTED"}),
            "--reason",
            "provider outcome unknown",
        )

        interrupted = self.cli("resume", "--run-id", run_id)
        self.assertEqual(interrupted["status"], "INTERRUPTED")
        self.assertEqual(interrupted["pending_effects"][0]["status"], "UNKNOWN")
        self.assertEqual(interrupted["pending_effects"][0]["target"]["value"]["service"], "order-admin")
        self.assertEqual(interrupted["pending_effects"][0]["intended_payload"]["value"]["version"], "v1")
        self.assertEqual(interrupted["current_invocation"]["invocation_id"], invocation_id)
        self.assertEqual(interrupted["current_invocation"]["input"]["value"]["profile"], "NO_WIKI")

        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "VERIFIED",
            "--readback-json",
            json.dumps({"version": "v1"}),
        )
        resumed = self.cli("resume", "--run-id", run_id)
        self.assertEqual(resumed["status"], "RUNNING")
        self.assertEqual(resumed["pending_effects"], [])
        self.assertEqual(resumed["current_invocation"]["status"], "RUNNING")

        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "SUCCEEDED",
            "--validation-state",
            "PASSED",
            "--output-json",
            json.dumps({"terminal_state": "SUBMITTED"}),
        )
        run = self.cli("show", "--run-id", run_id)
        self.assertEqual(run["status"], "SUCCEEDED")
        self.assertEqual(len(run["invocations"][0]["returns"]), 2)
        self.assertEqual(run["invocations"][0]["returns"][0]["status"], "INTERRUPTED")
        self.assertEqual(run["invocations"][0]["returns"][1]["status"], "SUCCEEDED")

    def test_redacts_secrets_and_private_validator_protocol(self):
        run_id = self.cli(
            "init",
            "--workflow",
            "standalone:resolving-tapd-work",
            "--workflow-version",
            "1",
            "--request-json",
            json.dumps(
                {
                    "token": "secret-token",
                    "nested": {"password": "secret-password", "safe": "kept"},
                    "validator_result": "验证通过",
                }
            ),
        )["run_id"]

        run = self.cli("show", "--run-id", run_id)
        stored = run["request"]["value"]
        self.assertEqual(stored["token"], "[REDACTED]")
        self.assertEqual(stored["nested"]["password"], "[REDACTED]")
        self.assertEqual(stored["nested"]["safe"], "kept")
        self.assertEqual(stored["validator_result"], "[PRIVATE_VALIDATION_RESULT_DISCARDED]")

    def test_unknown_effect_can_reconcile_to_blocked_on_same_invocation(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TEST_VERSION",
            "--target-json",
            json.dumps({"service": "order-admin"}),
            "--payload-json",
            json.dumps({"version": "v1"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "EXECUTING",
            "--validation-state",
            "PASSED",
            "--authorization-json",
            json.dumps({"actor": "user"}),
        )
        self.cli("mark-effect", "--run-id", run_id, "--effect-id", effect_id, "--status", "UNKNOWN")
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "INTERRUPTED",
            "--reason",
            "provider outcome unknown",
        )
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "BLOCKED",
            "--reason",
            "readback cannot prove the expected effect",
        )
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "BLOCKED",
            "--validation-state",
            "FAILED",
            "--reason",
            "readback cannot prove the expected effect",
        )

        run = self.cli("show", "--run-id", run_id)
        self.assertEqual(run["status"], "BLOCKED")
        self.assertEqual(run["invocations"][0]["status"], "BLOCKED")
        self.assertEqual(len(run["invocations"][0]["returns"]), 2)

    def test_invalidates_only_selected_suffix_for_reexecution(self):
        run_id = self.init_run()["run_id"]
        resolver = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:resolving-tapd-work",
            "--input-json",
            json.dumps({"tapd_url": "https://www.tapd.cn/1/bugtrace/bugs/view/2"}),
        )["invocation_id"]
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            resolver,
            "--status",
            "SUCCEEDED",
            "--validation-state",
            "PASSED",
            "--output-json",
            json.dumps({"terminal_state": "READY_FOR_HANDOFF"}),
            "--next-skill",
            "zan-workflows:repairing-tapd-work",
        )
        repair = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:repairing-tapd-work",
            "--input-json",
            json.dumps({"terminal_state": "READY_FOR_HANDOFF"}),
        )["invocation_id"]
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            repair,
            "--status",
            "SUCCEEDED",
            "--validation-state",
            "PASSED",
            "--output-json",
            json.dumps({"terminal_state": "REVIEWED"}),
            "--next-skill",
            "zan-workflows:submitting-tapd-for-test",
        )

        self.cli(
            "invalidate-suffix",
            "--run-id",
            run_id,
            "--from-invocation-id",
            repair,
            "--current-skill",
            "zan-workflows:repairing-tapd-work",
            "--reason",
            "scope changed",
        )
        resumed = self.cli("resume", "--run-id", run_id)
        run = self.cli("show", "--run-id", run_id)

        self.assertEqual(resumed["current_skill"], "zan-workflows:repairing-tapd-work")
        self.assertEqual([item["skill"] for item in resumed["completed_outputs"]], ["zan-workflows:resolving-tapd-work"])
        self.assertEqual(run["invocations"][1]["status"], "INVALIDATED")
        self.assertEqual(run["invocations"][1]["invalidation_reason"], "scope changed")

    def test_success_requires_passed_validation(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:resolving-tapd-work",
            "--input-json",
            json.dumps({"tapd_url": "https://www.tapd.cn/1/bugtrace/bugs/view/2"}),
        )["invocation_id"]

        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "finish-skill",
                "--run-id",
                run_id,
                "--invocation-id",
                invocation_id,
                "--status",
                "SUCCEEDED",
                "--validation-state",
                "FAILED",
                "--output-json",
                json.dumps({"terminal_state": "READY_FOR_HANDOFF"}),
            )

        run = self.cli("show", "--run-id", run_id)
        self.assertEqual(run["status"], "RUNNING")
        self.assertEqual(run["invocations"][0]["status"], "RUNNING")

    def test_blocked_run_must_be_invalidated_before_retry(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TAPD_STATUS",
            "--target-json",
            json.dumps({"bug_id": "2"}),
            "--payload-json",
            json.dumps({"status": "已修复"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "BLOCKED",
            "--reason",
            "readback failed",
        )
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "BLOCKED",
            "--validation-state",
            "FAILED",
            "--reason",
            "readback failed",
        )

        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "begin-skill",
                "--run-id",
                run_id,
                "--skill",
                "zan-workflows:submitting-tapd-for-test",
                "--input-json",
                json.dumps({"profile": "NO_WIKI"}),
            )

        invalidated = self.cli(
            "invalidate-suffix",
            "--run-id",
            run_id,
            "--from-invocation-id",
            invocation_id,
            "--reason",
            "retry after correcting readback",
        )
        self.assertEqual(invalidated["current_skill"], "zan-workflows:submitting-tapd-for-test")
        retry = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )
        self.assertEqual(retry["status"], "RUNNING")
        run = self.cli("show", "--run-id", run_id)
        self.assertIsNotNone(run["effects"][0]["invalidated_at"])

    def test_records_public_report_and_checks_optional_prior_report(self):
        run_id = self.init_run()["run_id"]
        report = {
            "run_id": run_id,
            "terminal_state": "PAUSED",
            "history": {"superseded_results": [{"skill": "resolver", "reason": "scope changed"}]},
        }
        recorded = self.cli(
            "record-report",
            "--run-id",
            run_id,
            "--report-json",
            json.dumps(report),
        )
        self.assertEqual(recorded["revision"], 1)

        resumed = self.cli(
            "resume",
            "--run-id",
            run_id,
            "--prior-report-json",
            json.dumps(report),
        )
        self.assertEqual(resumed["public_report"]["value"], report)
        self.assertEqual(resumed["public_report_revision"], 1)

        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "resume",
                "--run-id",
                run_id,
                "--prior-report-json",
                json.dumps({**report, "terminal_state": "SUCCEEDED"}),
            )

    def test_nested_drafter_invalidation_starts_at_parent_submission(self):
        run_id = self.init_run()["run_id"]
        submission = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "STANDARD"}),
        )["invocation_id"]
        drafter = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:drafting-tapd-wiki",
            "--parent-invocation-id",
            submission,
            "--input-json",
            json.dumps({"title": "test wiki"}),
        )["invocation_id"]
        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "finish-skill",
                "--run-id",
                run_id,
                "--invocation-id",
                submission,
                "--status",
                "SUCCEEDED",
                "--validation-state",
                "PASSED",
                "--next-skill",
                "zan-workflows:merging-tapd-work-to-master",
                "--output-json",
                json.dumps({"terminal_state": "SUBMITTED"}),
            )
        child_finish = self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            drafter,
            "--status",
            "SUCCEEDED",
            "--validation-state",
            "PASSED",
            "--output-json",
            json.dumps({"terminal_state": "VALIDATED", "rendered_markdown": "draft v1"}),
        )
        self.assertEqual(child_finish["current_skill"], "zan-workflows:submitting-tapd-for-test")
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            submission,
            "--status",
            "SUCCEEDED",
            "--validation-state",
            "PASSED",
            "--output-json",
            json.dumps({"terminal_state": "SUBMITTED", "wiki": "draft v1"}),
        )

        invalidated = self.cli(
            "invalidate-suffix",
            "--run-id",
            run_id,
            "--from-invocation-id",
            drafter,
            "--reason",
            "draft facts changed",
        )
        self.assertEqual(invalidated["invalidated_invocation_ids"], [submission, drafter])
        self.assertEqual(invalidated["current_skill"], "zan-workflows:submitting-tapd-for-test")
        resumed = self.cli("resume", "--run-id", run_id)
        self.assertEqual(resumed["completed_outputs"], [])

    def test_cannot_invalidate_suffix_with_unreconciled_effect(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TAPD_STATUS",
            "--target-json",
            json.dumps({"bug_id": "2"}),
            "--payload-json",
            json.dumps({"status": "已修复"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "EXECUTING",
            "--validation-state",
            "PASSED",
            "--authorization-json",
            json.dumps({"actor": "user"}),
        )
        self.cli("mark-effect", "--run-id", run_id, "--effect-id", effect_id, "--status", "UNKNOWN")
        self.cli(
            "finish-skill",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--status",
            "INTERRUPTED",
            "--reason",
            "provider outcome unknown",
        )

        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "invalidate-suffix",
                "--run-id",
                run_id,
                "--from-invocation-id",
                invocation_id,
                "--reason",
                "try to skip reconciliation",
            )

        resumed = self.cli("resume", "--run-id", run_id)
        self.assertEqual(resumed["status"], "INTERRUPTED")
        self.assertEqual(resumed["pending_effects"][0]["status"], "UNKNOWN")

    def test_blocked_effect_prevents_successful_skill_completion(self):
        run_id = self.init_run()["run_id"]
        invocation_id = self.cli(
            "begin-skill",
            "--run-id",
            run_id,
            "--skill",
            "zan-workflows:submitting-tapd-for-test",
            "--input-json",
            json.dumps({"profile": "NO_WIKI"}),
        )["invocation_id"]
        effect_id = self.cli(
            "plan-effect",
            "--run-id",
            run_id,
            "--invocation-id",
            invocation_id,
            "--operation",
            "TAPD_STATUS",
            "--target-json",
            json.dumps({"bug_id": "2"}),
            "--payload-json",
            json.dumps({"status": "已修复"}),
        )["effect_id"]
        self.cli(
            "mark-effect",
            "--run-id",
            run_id,
            "--effect-id",
            effect_id,
            "--status",
            "BLOCKED",
            "--reason",
            "readback failed",
        )

        with self.assertRaises(subprocess.CalledProcessError):
            self.cli(
                "finish-skill",
                "--run-id",
                run_id,
                "--invocation-id",
                invocation_id,
                "--status",
                "SUCCEEDED",
                "--validation-state",
                "PASSED",
                "--output-json",
                json.dumps({"terminal_state": "SUBMITTED"}),
            )

    def test_updates_snapshot_with_atomic_replace(self):
        created = self.init_run()
        run_path = Path(created["path"])
        self.assertTrue(run_path.is_file())
        self.assertEqual(list(run_path.parent.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
