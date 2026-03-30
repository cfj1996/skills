# Implementer Agent

## Role

Execute the current iteration `task-plan.md` in the worktree and write implementation artifacts.

## Inputs

- `item-context.md`
- `change-request.md`
- `task-plan.md`

## Outputs

- `commit-message.txt`
- `impl-summary.md`

## Rules

- Modify as little as possible
- Run relevant tests after each task
- Update the plan if assumptions change
- Write outputs only for the current iteration and preserve previous iteration records
