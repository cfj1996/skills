---
name: project-memory-context
description: Use before working on a local project when prior AI session memory may provide useful but not fully trusted context; retrieve bounded ai-session-memory context packs for previous AI decisions, failed attempts, repeated errors, context-window trimming, confidence checks, superseded/retracted memory, or project memory lookup.
---

# Project Memory Context

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) only when retrieved
memory conflicts materially with current evidence.

Use this skill before source search or implementation when the task mentions a local project, prior AI work, historical decisions, repeated errors, previous attempts, project memory, confidence of remembered context, context-window pressure, or asks whether something has been done before.

This skill consumes `ai-session-memory` output. That output is fuzzy memory evidence, not a truth database.

## Core Rule

Never inject raw sessions. Retrieve a small context pack, inspect its score and trust signals, and use it as scoped evidence.

Resolve the helper from the directory containing the `SKILL.md` that was loaded for the current
invocation. Do not resolve it from the shell's current working directory or a repository-relative
`skills/` path.

Run:

```bash
skill_dir="<absolute directory containing the currently loaded project-memory-context/SKILL.md>"
"$skill_dir/scripts/context-pack.sh" <project-name> "<task query>"
```

The script calls `ai-session-memory context-pack`. Treat command failure as a real failure; do not silently continue with remembered context.

## Memory Semantics

Use memory as leads for attention, not as final proof. Current user intent, current source code, tests, and durable `project-knowledge` outrank memory.

Primary context-pack signals:

| Signal | Meaning | How to use |
|---|---|---|
| `memory_kind=reviewed_memory` | Reviewed local memory, usually from `approved` or `promoted` items | Treat as strong working context, still verify against current source |
| `memory_kind=memory_hint` | High-relevance fuzzy memory, often from `candidate` items | Treat as a useful clue to verify, not a fact |
| `score` | Retrieval strength for the current task query | Prefer higher score items when deciding what to inspect first |
| `selected_reason` / `selection_notes` | Why the item entered the pack | Use this to understand whether it matched query text, entity, or review status |
| `promoted` | Reviewed and written to durable project knowledge | Treat as strong context, still verify against current source |
| `approved` | Human-reviewed local memory | Treat as reliable working context |
| `candidate` | Auto-extracted, unreviewed memory | Treat as fuzzy memory; use only with source/code verification |
| `rejected` | Explicitly rejected | Ignore |
| `superseded` / `retracted` | Old or withdrawn conclusion | Ignore unless user asks for history |
| `validity=current` | Currently usable | Prefer |
| `validity=outdated/contradicted/failed` | Known stale, wrong, or failed | Do not use as guidance |

Higher usefulness comes from:

- High `score` for the current query.
- `memory_kind=reviewed_memory`.
- `approved` or `promoted` status.
- `validity=current`.
- Evidence points to a concrete source session and source file.
- The memory matches current source code, tests, or project knowledge.
- Multiple independent sessions support the same conclusion.
- It records a verified command/test result rather than an inferred summary.

Lower usefulness comes from:

- Low score or weak query match.
- `memory_kind=memory_hint`.
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
3. Resolve the current skill directory from the loaded `SKILL.md`, then retrieve the context pack
   with that directory's `scripts/context-pack.sh`.
4. Read `selection_notes`, `selected_reason`, `memory_kind`, and `score` before using selected memories.
5. Read `excluded_memory` before acting on memory; excluded items may show superseded, retracted, contradicted, or failed directions to avoid.
6. Use `reviewed_memory` as working context after quick verification.
7. Use `memory_hint` and `candidate` memory as leads for source search, test selection, or questions to verify.
8. Ignore `rejected`, `superseded`, `retracted`, `outdated`, `contradicted`, and `failed` memory by default.
9. If memory conflicts with current source code, prefer current source code and mention that the memory appears stale.
10. Preserve source references when memory affects a decision.
11. Do not let memory replace current source reading, tests, or durable `project-knowledge`.

## Context Pack Fields

- `selected_memory`: bounded memories selected for this task.
- `excluded_memory`: memories deliberately excluded, with reasons.
- `selection_notes`: evidence for why the selected memories were included.
- `memory_kind`: `reviewed_memory` for stronger context or `memory_hint` for fuzzy leads.
- `score`: task-specific retrieval strength.
- `selected_reason`: short explanation for why one memory was selected.
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
