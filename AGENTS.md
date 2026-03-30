# Repository Guidelines

## Project Structure & Module Organization

This repository stores reusable agent skills. The root currently contains shared docs such as [`CLAUDE.md`](/Users/cfj/projects/skills/CLAUDE.md) and the main skill package [`tapd-workflow/`](/Users/cfj/projects/skills/tapd-workflow). Inside a skill package, keep the entry point in `SKILL.md`, role prompts in `agents/*.md`, and supporting guidance in `references/*.md`. Treat `docs/` as generated working output; in `tapd-workflow`, `docs/bugs/item-{ID}/` holds `raw-cli.json`, `item-context.md`, `task-plan.md`, and review artifacts.

## Build, Test, and Development Commands

There is no global build step in this repository. Use targeted commands instead:

```bash
npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> <id> --json
git -C tapd-workflow log --oneline -5
git -C tapd-workflow status
```

The `npx` command fetches TAPD data for workflow execution. The `git -C tapd-workflow ...` commands inspect the active skill repo because the top-level `skills/` directory is not itself a Git repository.

## Coding Style & Naming Conventions

Write skill docs in concise Markdown with clear `#`/`##` headings, short rule lists, and fenced command examples. Preserve the existing mix of English headings and Chinese workflow detail where the skill already uses it. Name new skill folders with lowercase kebab-case, keep the entry file exactly `SKILL.md`, and use descriptive agent filenames such as `collector.md` or `reviewer.md`.

## Testing Guidelines

No automated test suite is checked in today. Validate changes by running the relevant TAPD workflow command, reviewing the generated Markdown artifacts, and confirming the documented paths and commands still match the repo layout. If you add scripts or tests later, place them inside the owning skill directory and document the exact command here.

## Commit & Pull Request Guidelines

Recent history in `tapd-workflow` uses short conventional-style subjects such as `docs: ...` and `refactor: ...`. Follow that pattern, for example `docs: clarify worktree cleanup` or `feat: add reviewer guidance`. PRs should describe the affected skill, summarize behavior changes, link the TAPD item or issue when applicable, and include example output or screenshots whenever prompts, generated docs, or review artifacts change.

## Security & Configuration Tips

Do not commit TAPD tokens or generated case data with sensitive details. Keep transient workflow output under ignored `docs/` paths unless the change is intentionally documenting a reusable example.
