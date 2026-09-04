import json
from pathlib import Path
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
HOOKS_JSON = PLUGIN_ROOT / "hooks" / "hooks.json"
MEMORY_HOOK = PLUGIN_ROOT / "hooks" / "scripts" / "session-start-memory.sh"
GIT_HOOK = PLUGIN_ROOT / "hooks" / "scripts" / "git-branch-safety.mjs"


class HookPackagingTests(unittest.TestCase):
    def test_default_hook_manifest_contains_the_two_local_hooks(self):
        manifest = json.loads(HOOKS_JSON.read_text())

        session_hooks = manifest["hooks"]["SessionStart"]
        pre_tool_hooks = manifest["hooks"]["PreToolUse"]

        self.assertEqual(session_hooks[0]["matcher"], "startup|clear|compact")
        self.assertEqual(pre_tool_hooks[0]["matcher"], "^Bash$")
        self.assertIn("session-start-memory.sh", session_hooks[0]["hooks"][0]["command"])
        self.assertIn("git-branch-safety.mjs", pre_tool_hooks[0]["hooks"][0]["command"])

    def test_hook_commands_are_not_bound_to_the_original_machine(self):
        memory_text = MEMORY_HOOK.read_text()
        git_text = GIT_HOOK.read_text()

        for text in (memory_text, git_text):
            self.assertNotIn("/Users/cfj", text)

        self.assertIn("${PLUGIN_ROOT}", HOOKS_JSON.read_text())
        self.assertIn("AI_SESSION_MEMORY_CONFIG", memory_text)
        self.assertIn("PLUGIN_DATA", memory_text)
        self.assertIn("ZAN_WORKFLOWS_WORKSPACE_ROOT", git_text)
        self.assertIn("rev-parse", git_text)


if __name__ == "__main__":
    unittest.main()
