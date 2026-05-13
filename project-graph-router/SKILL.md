---
name: project-graph-router
description: Use when answering questions about local projects, project architecture, module relationships, code ownership, code locations, or cross-project dependencies in /Users/cfj/projects or /Users/cfj/graph-workspaces.
---

# project-graph-router

Use the router before raw file search for local project questions.

## Required Flow

1. Run:

```bash
/Users/cfj/graph-workspaces/.graph-router/route.py --cwd "$PWD" --query "<user question>" --json
```

2. If it returns `mode: single-graph`, read the returned `report` before using `rg`, `find`, `grep`, or reading source files.
3. For relationship questions, prefer:

```bash
graphify query "<user question>" --graph "<returned graph>"
```

4. If it returns `mode: multi-graph`, read each candidate report first. Use the candidate graph paths explicitly, or create a merged graph only when cross-group traversal is necessary.
5. If no graph matches, continue with normal project inspection.

## Maintenance

After changing symlinks or graph groups, refresh the router index:

```bash
/Users/cfj/graph-workspaces/.graph-router/route.py --rebuild --json
```
