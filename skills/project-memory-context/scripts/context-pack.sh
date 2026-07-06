#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: context-pack.sh <project-name> [task query]" >&2
  exit 2
fi

PROJECT_NAME="$1"
shift || true
QUERY="${*:-$PROJECT_NAME}"
CONFIG_PATH="${AI_SESSION_MEMORY_CONFIG:-$HOME/.ai-session-memory/config.yaml}"

if ! command -v ai-session-memory >/dev/null 2>&1; then
  echo "ai-session-memory command not found on PATH" >&2
  exit 127
fi

ai-session-memory --config "$CONFIG_PATH" context-pack "$PROJECT_NAME" --query "$QUERY"
