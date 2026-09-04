#!/usr/bin/env bash

set -u

# The memory integration is optional. Keep the lifecycle hook harmless on
# machines that do not have the ai-session-memory CLI installed.
if ! command -v ai-session-memory >/dev/null 2>&1; then
  exit 0
fi

config_path="${AI_SESSION_MEMORY_CONFIG:-${HOME}/.ai-session-memory/config.yaml}"
data_dir="${PLUGIN_DATA:-${HOME}/.codex/plugin-data/zan-workflows}"

# PLUGIN_DATA is writable plugin-scoped storage supplied by Codex. The
# fallback keeps local/manual executions safe when that variable is absent.
if ! mkdir -p "$data_dir" 2>/dev/null; then
  exit 0
fi

log_path="$data_dir/hook-touch.log"
ai-session-memory --config "$config_path" hook-touch >>"$log_path" 2>&1 || true
