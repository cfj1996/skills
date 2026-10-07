# Zan Workflows hooks

This plugin bundles the two lifecycle hooks used by the local Codex setup:

- `SessionStart` runs `ai-session-memory hook-touch` for `startup`, `clear`, and
  `compact` events when the optional `ai-session-memory` command is available.
- `PreToolUse` checks Bash commands that invoke Git and blocks unsafe branch
  creation and cross-base rebases.

Ordinary `git branch -d/--delete` cleanup is classified as deletion, not branch
creation, so it does not require an `origin/master` start ref or `--no-track`.
The hook rejects force deletion, remote-tracking deletion, baseline branches
and the current branch (including the repository selected by `git -C`). It
continues checking later commands in the same shell request. Passing this
syntax check does not authorize deletion: `going-live` still requires the
exact user-confirmed cleanup plan and a fresh delivery/data/occupancy check.

The hooks are portable across machines:

- Plugin scripts are resolved from `${PLUGIN_ROOT}`.
- Memory configuration uses `AI_SESSION_MEMORY_CONFIG`, defaulting to
  `~/.ai-session-memory/config.yaml`.
- Memory logs use `${PLUGIN_DATA}` when Codex provides it.
- Git safety defaults to the current repository root. Set
  `ZAN_WORKFLOWS_WORKSPACE_ROOT` when a broader workspace boundary is needed.

After installing or enabling the plugin, review and trust the bundled hooks in
`/hooks` before testing them.
