# Development rules

These rules turn an approved `TapdWorkDefinition` into an auditable repair.
They deliberately describe capabilities and gates, not numbered workflow
stages.

## Pre-edit gate

Before any source or generated-file edit, output and retain:

```text
PRE_EDIT_GATE: PASS
```

Only emit it after all of the following are true:

- The definition is approved, scope is confirmed, and its exact project
  fingerprint still matches actual Git root and origin remote.
- The current CWD has not been used as a substitute for the verified repository.
- A baseline `git status --short`, current HEAD, current branch, and worktree
  list have been captured in the selected repository.
- The user explicitly chose and confirmed the exact branch and execution path.
- The created or reused branch/worktree was re-read, and expected/actual
  branch/path checks are `PASS` or an evidenced `REUSE`.
- A new branch has a verified allowed baseline (`origin/master` unless the
  approved definition explicitly names another allowed source), never
  `origin/develop` or `origin/dev`.
- The required TAPD active status was written and read back successfully.
- The applicable planning route and test strategy are present.

If any item is false, return `BLOCKED`; do not "make a small edit first".

## Branch and worktree decisions

Compute the expected branch and absolute worktree path before asking for a
choice. Present their actual values after creation/reuse, including the source
ref and reason. A reusable branch is recorded as `REUSE`, not forced through a
new-branch naming rule.

Use a new worktree only in `<verified-repo>/.worktrees/`, verify it is ignored,
and verify the requested path is not already used by a different task. If a
collision requires a suffix, display the new expected path and obtain a new
confirmation before creating it. Do not create a worktree in a sibling,
temporary, home, or arbitrary directory.

When reusing a branch, verify it is the exact branch approved for this TAPD and
that its existing changes/history are attributable before writing. A dirty
baseline calls for isolation or explicit scope reconciliation; it never grants
permission to absorb those changes.

## Planning, prototype, and implementation

- For a defect repair, use `superpowers:systematic-debugging` followed by
  `superpowers:writing-plans`. For new Story/Task behavior, use
  `superpowers:brainstorming` followed by `superpowers:writing-plans`.
- Keep a plan with relevant files, small work items, approved in/out scope,
  acceptance criteria, risks, and an executable test strategy.
- If TAPD evidence includes a prototype, inspect only the default visible
  requirement document and the cited screenshots/links. Record the link,
  default-document summary, primary interaction path, constraints, and any
  inaccessible or uninspected material. Do not invent content or silently scan
  unrelated prototype documents.
- Implement with `superpowers:test-driven-development`. Retain the real focused
  failing RED run before the minimal change and the matching passing GREEN run.
  Follow the target repository's test layout; do not create fake tests merely
  to satisfy an evidence field.

## Evidence and verification

Record evidence in the `ReviewedChange` bundle, with stable paths or command
references where the target repository requires files. For every planned test,
build, lint, or targeted verification command, preserve:

- the exact command;
- exit code and concise stdout/stderr excerpt;
- `PASS`, `FAIL`, or `SKIPPED`; and
- a concrete blocker reason whenever it did not pass.

After implementation, compare the final status and diff against the baseline.
List every changed path and explain its relation to the approved scope. Do not
stage, commit, push, create/update an MR, merge, write a Wiki, submit for test,
or deploy. Supply the complete unmodified bundle to the private reviewer.
