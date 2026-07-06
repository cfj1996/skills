---
name: project-memory-context
description: Use before working on a local project when prior AI session memory may provide useful but not fully trusted context; retrieve bounded ai-session-memory context packs for previous AI decisions, failed attempts, repeated errors, context-window trimming, confidence checks, superseded/retracted memory, or project memory lookup.
---

# Project Memory Context

Use this skill before source search or implementation when the task mentions a local project, prior AI work, historical decisions, repeated errors, previous attempts, project memory, confidence of remembered context, context-window pressure, or asks whether something has been done before.

This skill consumes `ai-session-memory` output. That output is useful evidence, not a guaranteed fact source.

## Core Rule

Never inject raw sessions. Retrieve a small context pack, inspect its trust signals, and use it as scoped evidence.

Run:

```bash
skills/project-memory-context/scripts/context-pack.sh <project-name> "<task query>"
```

The script calls `ai-session-memory context-pack`. Treat command failure as a real failure; do not silently continue with remembered context.

## Trust Levels

Use memory according to status and validity:

| Signal | Meaning | How to use |
|---|---|---|
| `promoted` | Reviewed and written to durable project knowledge | Treat as strong context, still verify against current source |
| `approved` | Human-reviewed local memory | Treat as reliable working context |
| `candidate` | Auto-extracted, unreviewed memory | Treat as a clue only |
| `rejected` | Explicitly rejected | Ignore |
| `superseded` / `retracted` | Old or withdrawn conclusion | Ignore unless user asks for history |
| `validity=current` | Currently usable | Prefer |
| `validity=outdated/contradicted/failed` | Known stale, wrong, or failed | Do not use as guidance |

Higher confidence comes from:

- `approved` or `promoted` status.
- `validity=current`.
- Evidence points to a concrete source session and source file.
- The memory matches current source code, tests, or project knowledge.
- Multiple independent sessions support the same conclusion.
- It records a verified command/test result rather than an inferred summary.

Lower confidence comes from:

- `candidate` status.
- `confidence=inferred`.
- Missing source references.
- Conflicting current source code.
- Old sessions that were later contradicted.
- Failed attempts presented as decisions.

## Workflow

1. Identify the project name from the request, current repository, or workspace routing.
   - For company workspace projects, use `workspace-project-knowledge` first to resolve the target project.
   - Prefer the resolved project name over guessing from the shell cwd.
2. Build a focused query from the user's actual task. Include file names, commands, errors, APIs, or business terms when present.
3. Retrieve the context pack with the helper script.
4. Read `selection_notes` before using selected memories; they explain why items were included.
5. Read `excluded_memory` before acting on memory; excluded items may show superseded, retracted, contradicted, or failed directions to avoid.
6. Use `selected_memory` with `approved/promoted/current` as working context.
7. Use `candidate` memory only as leads to verify in code.
8. Ignore `rejected`, `superseded`, `retracted`, `outdated`, `contradicted`, and `failed` memory by default.
9. If memory conflicts with current source code, prefer current source code and mention that the memory appears stale.
10. Preserve source references when memory affects a decision.
11. Do not let memory replace current source reading, tests, or durable `project-knowledge`.

## Context Pack Fields

- `selected_memory`: bounded memories selected for this task.
- `excluded_memory`: memories deliberately excluded, with reasons.
- `selection_notes`: evidence for why the selected memories were included.
- `status`: review state such as `candidate`, `approved`, or `promoted`.
- `validity`: currentness state such as `current`, `contradicted`, or `failed`.
- `confidence`: extraction confidence such as `extracted` or `inferred`.
- `evidence`: source-backed reason or excerpts when available.
- `supersedes_ids` / `contradicts_ids`: links showing later memory that replaces or disputes earlier memory.

If `selected_memory` is empty, continue with normal project/source analysis and do not invent memory.

## Known Limitations

- Auto-extracted memory can be incomplete or wrong.
- A later session can overturn an earlier conclusion.
- The context pack is intentionally lossy; it favors relevance and token budget over completeness.
- The retrieval query can miss useful memory if the task wording is vague.
- The command can fail when `ai-session-memory` is not installed, not configured, or its SQLite state is unavailable.
- Obsidian notes are human-readable output, not the trust boundary.
- `project-knowledge` remains the durable knowledge source; `ai-session-memory` is the local evidence layer.

## When Not To Use

- General programming questions with no local project context.
- Tasks where current source code is enough and history is irrelevant.
- High-confidence project facts already available in `project-knowledge`.
- Requests that explicitly ask not to use remembered context.
