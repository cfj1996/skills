# Repository Guidelines

## Project Structure & Module Organization

This repository stores reusable agent skills and installable Codex plugins. Keep standalone skills under [`skills/`](/Users/cfj/projects/skills/skills), complete plugins under [`plugins/`](/Users/cfj/projects/skills/plugins), and the remote marketplace manifest at [`.agents/plugins/marketplace.json`](/Users/cfj/projects/skills/.agents/plugins/marketplace.json). Inside a skill package, keep the entry point in `SKILL.md`, role prompts in `agents/*.md`, and supporting guidance in `references/*.md`. Treat `docs/` as generated working output and prefer the owning workflow's current conventions over older artifact examples.

## Build, Test, and Development Commands

There is no global build step in this repository. Use targeted commands instead:

```bash
npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> <id> --json
git log --oneline -5 -- skills/tapd-workflow
git status --short
node --test plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/*.test.mjs
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/page-delivery-workflow/skills/reviewing-page-delivery
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/page-delivery-workflow
```

The `npx` command fetches TAPD data for workflow execution. Run Git commands from this repository root; use a pathspec such as `-- skills/tapd-workflow` when history should be limited to one standalone skill. The remaining commands run the page-delivery plugin's complete Node test suite and official Skill/Plugin validators.

## Coding Style & Naming Conventions

Write skill docs in concise Markdown with clear `#`/`##` headings, short rule lists, and fenced command examples. Preserve the existing mix of English headings and Chinese workflow detail where the skill already uses it. Name new skill folders with lowercase kebab-case, keep the entry file exactly `SKILL.md`, and use descriptive agent filenames such as `collector.md` or `reviewer.md`.

## Testing Guidelines

The `page-delivery-workflow` plugin currently has 86 Node tests under `plugins/page-delivery-workflow/skills/reviewing-page-delivery/tests/`; run the complete suite and both official validators for every plugin change. For a standalone skill, run its owning workflow's targeted command, validate `skills/<skill-name>` with `skill-creator/scripts/quick_validate.py`, inspect generated artifacts when applicable, and confirm documented paths and commands still match the repository layout. Keep new scripts and tests inside their owning skill or plugin directory and document the exact command here.

## Commit & Pull Request Guidelines

Recent history in `tapd-workflow` uses short conventional-style subjects such as `docs: ...` and `refactor: ...`. Follow that pattern, for example `docs: clarify worktree cleanup` or `feat: add reviewer guidance`. PRs should describe the affected skill, summarize behavior changes, link the TAPD item or issue when applicable, and include example output or screenshots whenever prompts, generated docs, or review artifacts change.

## Security & Configuration Tips

Do not commit TAPD tokens or generated case data with sensitive details. Keep transient workflow output under ignored `docs/` paths unless the change is intentionally documenting a reusable example.
