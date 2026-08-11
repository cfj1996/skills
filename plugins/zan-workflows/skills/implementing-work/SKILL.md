---
name: implementing-work
description: Use when an approved TAPD work definition must be implemented and reviewed directly on its verified fixed branch without submitting or publishing it.
---

# Implement TAPD Work

Produce one in-memory `ReviewedChange` from one approved
`TapdWorkDefinition`. This skill owns source changes, relevant verification,
and an independent private review. It does not submit, merge to `develop` or
`master`, publish a version, or write a Wiki.

Read [contracts.md](references/contracts.md),
[development-rules.md](references/development-rules.md), and
[acceptance-scenarios.md](references/acceptance-scenarios.md) before editing.

## Input gate

Accept only `terminal_state=READY_FOR_HANDOFF` with:

- a verified project/repository fingerprint;
- confirmed scope;
- an exact branch action `CREATE|USE_EXISTING`; and
- public preparation validation `VALIDATION_PASSED`.

Re-read actual repository path, Git root, origin, branch refs, HEAD, and
`git status --short`. A mismatch blocks before edits.

## Fixed-branch execution

- `CREATE`: create the exact approved branch from the definition's exact
  verified base ref/SHA, then verify the current branch name and ref.
- `USE_EXISTING`: check out/use the exact approved existing branch and verify
  its actual ref. Do not require this Bug to have prior commits or generated
  evidence on the branch.
- Work directly in the verified repository on that fixed branch. Do not create
  a temporary branch or worktree, stash unrelated work, or implement on a
  substitute branch.

If pre-existing changes overlap the approved scope or make attribution unsafe,
return `BLOCKED` and explain the overlap. Do not modify or erase them.

## Implementation

1. After the repository/branch/scope gate passes, display the exact TAPD item,
   active-state operation, payload, and purpose. Obtain explicit authorization,
   then call [agents/change-reviewer.md](agents/change-reviewer.md) with
   `validation_phase=PRE_STATUS_WRITE`. Only a passing private verdict permits
   the write. Change the item to its active state when required and read it
   back immediately.
2. Diagnose the Bug or plan the requested Story/Task within the approved scope.
3. Implement the smallest coherent change. Add or update ordinary project
   tests when appropriate and run relevant project verification commands.
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
6. Return one in-memory `ReviewedChange`. Do not create a report file, runtime
   record, raw data file, or generated test-evidence directory.

## Output rule

Return `REVIEWED` only when repository, branch, scope, verification, and review
all pass. Otherwise return `BLOCKED` with the first truthful blocker. Do not
commit, push, submit, merge, publish, or write a Wiki in this skill.
