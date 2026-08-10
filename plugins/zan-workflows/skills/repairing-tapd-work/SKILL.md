---
name: repairing-tapd-work
description: Use when an approved TAPD work definition must be repaired in its verified repository and returned as a tested, independently reviewed change without submitting, merging, or publishing it.
---

# Repair TAPD work

Produce one `ReviewedChange` from an approved `TapdWorkDefinition`. This skill
owns the safe repair loop: re-verifying the target, choosing and confirming the
actual execution location, implementing with a plan and TDD, recording real
evidence, and obtaining a private read-only review.

It does not submit for test, create or merge an MR, merge branches, publish,
write a Wiki, or claim a deployment result. Those are separate capabilities.

## Inputs and result

Read [contracts.md](references/contracts.md) before acting. Accept either:

- an approved, non-blocked `TapdWorkDefinition`; or
- a TAPD URL, in which case call `zan-workflows:resolving-tapd-work` first and
  stop unless it returns an approved definition.

Return a schema-shaped `ReviewedChange` only when every pre-edit, development,
verification, and review gate passes. Otherwise return a schema-shaped
`ReviewedChange` with `terminal_state=BLOCKED`, the true blocker, and no
invented changes or evidence.

## Non-negotiable boundaries

- The input fingerprint is a hard constraint. Re-read Git root and origin from
  the selected repository; a mismatch, an unresolved value, or a CWD-only
  assumption blocks the run. Never substitute a similarly named repository.
- Keep an initial `git status --short` snapshot. Existing or unrelated changes
  are not this repair and must not be included, overwritten, staged, or
  attributed to it.
- An approved scope is not an execution-location choice. Before writing, obtain
  confirmation of the exact branch and exact worktree/current-project path.
- Never edit, format, generate code, create a branch/worktree, or update TAPD
  before `PRE_EDIT_GATE: PASS` is evidenced.
- A request to "test or review later" cannot waive planning, RED/GREEN evidence,
  verification, or independent review.
- Do not commit, push, create/update/merge an MR, merge, submit for test, write
  a Wiki, or deploy as part of this skill.

## Repair procedure

1. Validate the input is approved: its terminal state permits handoff, project
   fingerprint is verified, scope is confirmed, branch constraints are
   satisfied, and its required confirmations are present. Missing input facts
   are a blocked result, not a reason to reconstruct them by guessing.
2. In the input's exact repository, capture actual selected project, canonical
   repository path, Git root, common Git directory, origin remote, current ref,
   HEAD, worktree list, and dirty-state baseline. Compare every actual value
   with the input fingerprint. A worktree is equivalent only under the explicit
   canonical-common-Git-directory rule in `contracts.md`; its matching branch
   or directory name is insufficient. Record the initial baseline so unrelated
   changes cannot later be claimed by this work.
3. Read [development-rules.md](references/development-rules.md). Derive and
   display the expected branch and expected execution path. Ask for one
   explicit choice: the existing confirmed worktree/current project path, a
   new branch plus worktree, or a confirmed reusable branch plus a new
   worktree. Do not infer the choice from urgency or a generic request to fix.
4. After confirmation, create or reuse only the selected branch/worktree and
   immediately capture its actual branch and absolute path. Confirm both equal
   their expected values (or record `REUSE` for a confirmed reusable branch).
   A new repair branch must be based on the verified allowed baseline, never
   `develop`/`dev`; stop on any divergence.
5. Change the TAPD item to its active repair state only after the preceding
   checks and authorization are complete: Bug uses `修复中`; Story or Task uses
   `进行中`. Read it back and record the actual status. A failed write/readback
   blocks before editing.
6. Complete the applicable Superpowers planning route, including prototype
   evidence when the definition cites a prototype: repair work uses systematic
   debugging then planning; new Story/Task behavior uses brainstorming then
   planning. Keep the approved in-scope/out-of-scope boundary in the plan.
7. Implement with `superpowers:test-driven-development`: before the change, run
   a focused target-behavior **test** command and record its non-zero exit,
   output proving the target failure, and `EXPECTED_FAILURE` RED result. After
   the change, run that same command and record its zero-exit GREEN result. A
   different GREEN command is valid only when the evidence explicitly maps it
   to the same target behavior; lint, build, setup failures, and passing
   pre-change commands are never RED evidence. Run project-relevant
   verification commands and retain actual command, exit code, output excerpt,
   and blocker reason for every failure or skipped command. Follow
   [development-rules.md](references/development-rules.md) for evidence and
   prototype handling.
8. Compare the final diff and status with the baseline and approved scope.
   Stop if unrelated changes, an unexpected path, or untracked generated
   artifacts would be attributed to the repair.
9. Give the exact diff, scope, baseline comparison, branch/worktree facts, plan,
   and unmodified evidence bundle to the isolated reviewer described in
   [agents/change-reviewer.md](agents/change-reviewer.md). It must be read-only
   and must return exactly one approved Chinese verdict line. At this producer
   boundary, map a passing private verdict to the public
   `review.verdict=REVIEW_PASSED`. Map a failing private verdict to
   `review.verdict=REVIEW_FAILED`, copy only its reason into
   `review.failure_reason` and `blocker_reason`, and block delivery. Never store
   the private raw verdict in `ReviewedChange`. Tool unavailability or missing
   inputs maps to `review.verdict=NOT_RUN` and blocks delivery; the implementing
   agent may not self-approve.
10. Re-read [acceptance-scenarios.md](references/acceptance-scenarios.md). Only
    after the public mapped review state is `REVIEW_PASSED` return the complete
    `ReviewedChange`, including known risks. A result is reusable evidence for
    a later skill, not authorization for any further external write.

## Required response

Return exactly one fenced YAML or JSON `ReviewedChange`, followed by one line:

```text
REVIEWED_CHANGE_READY
```

For a blocked run, return the same shape with `terminal_state=BLOCKED`, then:

```text
REPAIR_BLOCKED: <truthful reason>
```
