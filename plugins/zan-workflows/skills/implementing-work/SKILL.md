---
name: implementing-work
description: Use when an approved TAPD work definition must be implemented and reviewed directly on its verified fixed branch without submitting or publishing it.
---

# Implement TAPD Work

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; do not spawn an agent merely to change models.

Produce one in-memory `ReviewedChange` from one approved
`TapdWorkDefinition`. This skill owns source changes, relevant verification,
and an independent private review. It does not submit, merge to `develop` or
`master`, publish a version, or write a Wiki.

Read [contracts.md](references/contracts.md),
[development-rules.md](references/development-rules.md), plus the shared
[tool-routing policy](../../references/tool-routing.md) before editing. Any
authorized TAPD status write uses `tapd-mcp`, never browser automation by default.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.

## Input gate

Accept only `terminal_state=READY_FOR_HANDOFF` with:

- a verified project/repository fingerprint;
- confirmed scope;
- an exact branch action `CREATE|USE_EXISTING`; and
- a current-conversation confirmation source binding repository, scope, fixed
  branch, source/base, target branch, operation and purpose; and
- status action `WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`,
  with a current-conversation authorization source only for `WRITE_ACTIVE`; and
- public preparation validation `VALIDATION_PASSED`.

Re-read actual repository path, Git root, origin, branch refs, HEAD, and
`git status --short`. A mismatch blocks before edits.
Reuse verified project knowledge, Plan and scope from the handoff. Check the
project's Node/package-manager version and relevant verification commands
before the first project verification command so an avoidable runtime mismatch does not start a
trial-and-error sequence.

## Fixed-branch execution

- `CREATE`: create the exact approved branch from the definition's exact
  verified base ref/SHA using the matching confirmation source, then verify
  the current branch name and ref. Do not ask again while the bound facts match.
- `USE_EXISTING`: check out/use the exact approved existing branch and verify
  its actual ref. Do not require this Bug to have prior commits or generated
  evidence on the branch.
- Work directly in the verified repository on that fixed branch. Do not create
  a temporary branch or worktree, stash unrelated work, or implement on a
  substitute branch.

If pre-existing changes overlap the approved scope or make attribution unsafe,
return `BLOCKED` and explain the overlap. Do not modify or erase them.

## Implementation

1. After the repository/branch/scope gate passes, handle TAPD status by item type:
   - for Story/Task, require `NOT_APPLICABLE_NON_BUG` and perform no status
     validation, authorization request, write, or readback;
   - only for Bug, apply the remaining status rules below;
   - reuse the confirmed `fixing-bug` checklist authorization when it binds the
     same item, current state, `修复中` payload, purpose, branch, and scope;
   - for standalone invocation, display those exact facts and obtain one
     authorization;
   - for `CONTINUE` already in `待测试`, use
     `SKIPPED_ALREADY_WAITING_TEST` and perform no status write;
   - for an item already `修复中`, use `NO_CHANGE`.
   Call [agents/change-reviewer.md](agents/change-reviewer.md) with
   `validation_phase=PRE_STATUS_WRITE` only for `WRITE_ACTIVE`. Read the write
   back immediately. Never ask again merely because authorization came from
   the confirmed checklist.
2. Diagnose the Bug or plan the requested Story/Task within the approved scope.
3. Implement the smallest coherent change. Add or update ordinary project
   tests when appropriate. During edits run focused tests, type/lint checks
   that exercise the changed files; run the broader required suite and build
   once after the coherent diff is stable. Repeat a broad gate only if a later
   change can invalidate its result. Do not rerun `git status`, diff statistics
   or `git diff --check` after every local edit; inspect the final change set
   before review. Run relevant project verification commands.
   Verification output stays in the current execution; do not copy it into a
   workflow evidence directory.
4. Compare the final diff with the starting status and approved scope. Exclude
   unrelated paths.
5. Give the exact diff, scope, repository/branch facts, and verification result
   to [agents/change-reviewer.md](agents/change-reviewer.md) with
   `validation_phase=POST_CHANGE_REVIEW`. The reviewer is
   read-only and returns one private verdict line. Map it to
   `REVIEW_PASSED|REVIEW_FAILED|NOT_RUN`, retain only a normalized reason, and
   discard the private line.
   One coherent final diff gets one independent review. If review feedback
   causes a change, recheck the affected paths and review that delta; do not
   restart the whole preparation and implementation workflow.
6. Return one in-memory `ReviewedChange`. Do not create a report file, runtime
   record, raw data file, or generated test-evidence directory.

## Output rule

Return `REVIEWED` only when repository, branch, scope, verification, and review
all pass. Otherwise return `BLOCKED` with the first truthful blocker. Do not
commit, push, submit, merge, publish, or write a Wiki in this skill.
