# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a skills repository for Claude Code. Each skill is a self-contained directory with a `SKILL.md` entry point and supporting reference/agent files.

## Current Skills

### tapd-workflow

End-to-end workflow for processing TAPD (project management tool) bugs and stories.

### yapi-workflow

使用 YAPI 查询接口详情、生成 TypeScript 声明，用于 API 对接开发场景。

**Key command:**
```bash
npx --package=@zan/tapd-cli@canary zan-tapd-cli <type> <id> --json
```

**Workflow phases:**
1. Collect: Run CLI, extract context to `docs/bugs/item-{ID}/item-context.md`
2. Plan: Generate `task-plan.md` with branch/worktree details
3. Create Worktree: Isolate development in separate git worktree
4. Implement: Execute in worktree, produce `impl-summary.md`
5. Review: Verify against requirements, output `REVIEW_PASSED` or `review-report.md`

**File structure:**
- `SKILL.md` - Entry point and overview
- `agents/*.md` - Agent role definitions (collector, planner, implementer, reviewer)
- `references/*.md` - Phase-specific guidance documents

**Directory conventions:**
- Work files: `docs/bugs/item-{ID}/`
- Bug branches: `fixbug/{git-user}.{date},{slug}-{id-7}`
- Story branches: `feature/{git-user}.{date},{slug}-{id-7}`
- Worktree path: `./.worktree/{short-desc}-{id-7}`
