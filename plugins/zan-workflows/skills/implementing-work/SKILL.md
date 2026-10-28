---
name: implementing-work
description: Use when an approved TAPD work definition must be implemented and reviewed directly on its verified fixed branch without submitting or publishing it.
---

# Implement TAPD Work

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; do not spawn an agent merely to change models.

Produce one in-memory `ReviewedChange` from an approved `TapdWorkDefinition`:
implement the confirmed scope, verify relevant behavior, and obtain independent
review. Submission, merge, publication and Wiki writes belong to separately
authorized capabilities owned by the orchestrator, never this implementation worker.
For approved work spanning projects, accept `work_definitions`: the complete set
of single-project definitions for one Bug, or one Story and its selected Tasks.
Verify the parent Story and selected scope before grouping requirement work;
do not add sibling Tasks. Return per-repository `reviewed_changes` only after
all required work passes. A grouped Bug shares one start/completion record.
Single-definition calls keep the original input/result. Do not combine different
Bugs or Stories, or drop a required project to close early.
Consume the [same execution checklist](../../references/execution-checklist.md#围绕同一清单编排)
and existing definitions/brief/Plan. Return actual results to their bound scope;
do not repeat global collection, ordinary preparation validation or user confirmation.

Read [contracts.md](references/contracts.md),
[development-rules.md](references/development-rules.md) and
[变更与文档一致性](../../references/change-consistency.md), plus the
[tool-routing policy](../../references/tool-routing.md) before editing.
For Bugs also load [status and repair owner](references/bug-repair-owner.md)
and [repair records](references/bug-repair-record.md). Load
[acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
ambiguous case or regression check.

## 1. Verify the approved input and fixed branch

Require `READY_FOR_HANDOFF`, confirmed scope, verified project/repository,
exact branch action `CREATE|USE_EXISTING`, matching current-conversation
branch/scope authorization, and preparation `VALIDATION_PASSED`.
The status action must be
`WRITE_ACTIVE|NO_CHANGE|SKIPPED_ALREADY_WAITING_TEST|NOT_APPLICABLE_NON_BUG`;
only `WRITE_ACTIVE` needs status-write authorization.

For grouped work, first verify all definitions, their confirmed complete scope,
repository/branch bindings and the same Bug or verified parent Story identity.
Bug definitions also agree on the common status/repair-account facts.
Deduplicate subprojects sharing the same repository and fixed branch; conflicting
bindings block. Re-read every repository path, Git root, origin, refs, HEAD and
working-tree status before the first write. One invalid definition blocks the Bug.

For each repository, immediately before its source work refresh mutable Git
facts. For `CREATE`, create the exact approved branch from the verified base
ref/SHA and confirm its actual ref. For `USE_EXISTING`, select the approved
branch and confirm its ref; prior commits for this Bug are not required.
Reuse matching authorization without another prompt. Changed facts or
overlapping pre-existing edits block; preserve unrelated changes.

Work directly on the fixed branch. Do not create a temporary branch/worktree,
move implementation elsewhere, or stash/reset unrelated work.

Apply [external dependencies](../../references/external-data-dependencies.md)
and [Mock development](../../references/mock-development.md). Keep business
questions separate from contract/configuration/environment facts and internal
implementation evidence. Validate the approved current steps and stage, not
future integration prerequisites unrelated to those steps. Preserve future
blockers and never describe a partial UI/Mock result as the whole Story done.
Every Mock has a stable `MOCK-*`/`MOCK_ONLY` identity, paths, scenarios, real-call
boundary, reset/switch and exit conditions in the same Plan/brief. Unknown
contracts permit only approved feature-data fixtures, never invented HTTP facts.

## 2. Check scope, task links and Bug records

Reuse the approved `implementationBrief`, Bug investigation summary or formal
Plan. A brief covers behavior, exclusions, current evidence, ordered steps and
verification. Small changes need no formal Plan, Task creation or estimate;
existing formal Plan/Task requirements and blockers remain binding.

For formal requirement Task/Plan work, apply the
[task contract](../breaking-down-requirement/references/contracts.md): require
`TASKS_READY`, real selected Task IDs, verified owners, positive final estimates,
dependencies, acceptance and Plan `tapdTaskKey` links. Check current readbacks;
stale scope/owner/hours or unmapped steps return to task preparation. Execute
only selected Tasks on the original branch. A completed step does not authorize
a Task status write. Show only one `N 小时` value. New/revised estimates must
carry the current independent review under the
[effort rules](../breaking-down-requirement/references/effort-estimation.md);
unchanged historical Task hours use their verified retained binding. New scope
or a needed total-effort change returns to affected Task assessment/review and
confirmation. Internal remaining-work changes alone never update TAPD effort.

Bug work does not acquire requirement-only Task/Plan gates. Run the following
once per Bug before any repository's source edits, using the complete approved
repair scope. A successful shared status/owner change is an expected effect;
reuse its readback for the other definitions instead of replaying their old payload:

1. Refresh the Bug state, owner and repair-account evidence using the
   [owner rules](references/bug-repair-owner.md). Reuse the checklist's exact
   authorization; a standalone call obtains any missing authorization through
   the same Chinese TAPD/record preview. Changed facts require an updated preview.
2. For `WRITE_ACTIVE`, the lead uses the owner helper plus actual current
   status/owner/member evidence and the checklist's exact Chinese preview/authority
   to check the complete payload. Helpers do not prove membership or permission;
   retain those sources and the actual validation basis, not a self-filled flag.
   Missing/conflicting facts block. Routine deterministic matching needs no
   separate Agent; substantive interpretation ambiguity may use
   [change-reviewer](agents/change-reviewer.md) with `PRE_STATUS_WRITE` after
   collecting its evidence. Once checks pass, send one `tapd-mcp` `update_bug`
   containing both status and `current_owner`; immediately read both back and
   run the owner's helper validation. Partial readback blocks source edits,
   retaining actual effects without automatic rollback or retry.
3. `NO_CHANGE` requires matching active state and repair owner. A waiting-test
   `CONTINUE` preserves both fields using `SKIPPED_ALREADY_WAITING_TEST`.
4. Apply the [record rules](references/bug-repair-record.md): diagnose and
   verify introduction evidence, then create/reuse the authorized start comment
   and read it back before the first edit. Preserve unknown history explicitly,
   omit an absent related requirement, and keep one flat record per Bug.

Story/Task uses `NOT_APPLICABLE_NON_BUG` and skips Bug status and record writes.
Use `tapd-mcp` for authorized writes, following the shared tool-routing policy.

Only when the user requests scheduling or date handling, load
[implementation-schedule.md](references/implementation-schedule.md). A formal
Task alone does not trigger scheduling, date writes or a new confirmation.

## 3. Implement and verify

The lead runs this skill and owns shared operations. For multiple implementation
steps, apply [多任务实施](references/parallel-execution.md): use the lead directly
for small work; dispatch independent, ready scopes to
[开发子代理](agents/task-implementer.md), normally at most two concurrently and
never more than three. Dependency, file ownership and shared-resource checks
apply across all projects. Unavailable delegation or inseparable changes use
serial execution, without creating extra Plans, Tasks, branches or ledgers.

Keep each repository's baseline, actual diff and verification separately. The
lead verifies predecessor outputs before releasing dependent work, and retains
completed effects when a task blocks. Pause affected dependents; independent
authorized work can continue only while its scope/resources remain valid.
Before integration and final review, stop related writers and verify they have
finished; then run agreed cross-task/cross-repository acceptance on stable code.
Missing required work blocks the whole handoff. A Bug also cannot publish its
completion comment or hand out a partly eligible `ReviewedChange`.
When the precise missing predecessor is an authorized dependency-output node,
return its provider's actual diff/verification/independent-review facts and the
remaining gap under [dependency-output rules](../../references/execution-checklist.md#前置依赖产出与整体完成).
The orchestrator may perform only that node through its original Git/release
capabilities and then resume this same scope/branch/Task/Plan. This skill still
does not submit or publish, partial progress is not an eligible REVIEWED collection,
and failed/unknown writes, missing authority or explicit IMPLEMENT restrictions
cannot use this route to continue delivery.

Use current requirement/acceptance references and confirmed amendments to
identify behaviors to preserve, change or remove. Existing code and reference
implementations do not override those requirements. For adopted Zan projects,
reuse the effective `ZAN-SCOPE-MINIMAL-001` rule from the verified context.

Implement the smallest coherent change in observable behavior slices. Check
the assumption most likely to invalidate the approach first, then verify each
slice before expanding. Concrete risks such as permissions, amounts, data
consistency and shared interfaces determine failure, regression and compatibility
coverage; a small diff does not lower that coverage.

Before verification, apply [local verification budgets](../../references/local-verification.md):
inspect the project's runtime and actual script scope, then select the smallest
sufficient behavior tests/reproduction and affected file/package checks. Do not
automatically chain whole-project lint, typecheck and build after development.
Apply its project-check selection matrix: absent checks create no installation
work; diagnose existing configuration failures once and distinguish optional
gaps from actual required-check or delivery blockers. Do not repair an unrelated
toolchain to make a nonessential command pass. Equivalent evidence must cover
the same acceptance and risks; required gaps still block dependent work.
Broaden only for an explicit requirement or a concrete uncovered risk; retain
required checks as blockers when incomplete. Keep heavy checks serial across
repositories/workers and run them with the bounded executor. Tests should observe
public behavior rather than mirror private implementation. Reuse valid evidence;
repeat only checks invalidated by later changes. Record actual scope, results and
gaps in memory, without workflow evidence files. Never report unrun, timed-out or
resource-limited checks as passed.

## 4. Review, complete records and return

Compare the final diff with the starting baseline and approved scope. Exclude
unrelated paths; check removed, moved or disconnected logic against authorized
behavior changes or a reachable equivalent replacement.
Reconcile the full pending delivery diff and the delta since the last reviewed
revision, including manual edits and conflict resolutions. Retain each material
behavior's basis, code evidence, direct/indirect impact and verification in
Change/Verification/Review. Necessary technical work may support the approved
goal; an extra behavior needs its own scope basis. Record documentation changes
needed by later delivery, without requiring a Wiki or writing it in IMPLEMENT.
For delegated work, the lead reconciles actual task/path changes and verification
coverage before review. Worker self-checks are evidence, not independent review.
Use one whole-project review where it covers multiple tasks; parallel read-only
reviews of stable independent repositories still need integration acceptance.

Give the exact diff, approved scope, Plan/brief, behavior expectations and their
sources, repository/branch facts, concrete risks and verification results/gaps
to [change-reviewer](agents/change-reviewer.md) with `POST_CHANGE_REVIEW`.
For a specifically approved predecessor-output node, identify that exact purpose
and provider scope in this review. Obtain independent review of the provider's
current code and required pre-delivery checks while keeping later integration
acceptance and the whole-Bug final-comment review pending. That local pass only
supplies provider facts for the orchestrator; it is not a partial eligible
ReviewedChange, a completed Task/Story/Bug or an exemption from the atomic
Git/release capability's own gates. Review the actual complete Bug comment when
the required scope is all ready, reusing unchanged provider code-review evidence.
For a grouped Bug, obtain this review for every required repository, supply the
full Bug boundary and applicable cross-repository acceptance, and attribute
comment claims to the evidence each review covers. Do not infer that one
repository's review accepts another repository.
For whole-work Bug review include start-record readback, record authorization
and the proposed complete final comment; an explicitly scoped predecessor
review uses the narrow rule above and leaves that complete-comment review pending.
One independent review covers requirement behavior and
engineering design/test coupling. Map its private line to
`REVIEW_PASSED|REVIEW_FAILED|NOT_RUN`, retain a concise reason and discard the raw
line. If review causes edits, verify and review the affected delta.

After all required repositories and cross-repository acceptance pass verification
and review, refresh their source/diff facts; changed evidence reopens only the
affected checks/review. Aggregate the reviewed claims into one flat Bug completion
record, append/reuse it once and read it back under the same authorization. A comment failure blocks
handoff while preserving the actual code/review result; resume only missing work.
Story/Task has no repair-record obligation.

Return `REVIEWED` only when repository, branch, scope, verification, review and
applicable Bug records pass; otherwise return `BLOCKED` with the actual gap.
Keep one in-memory `ReviewedChange`, or `reviewed_changes` for grouped work,
paired to definitions by canonical repo/origin/fixed_branch, not array position.
Each grouped result retains its selected scope and the confirmed required set;
Bug results also reference the same complete repair record. Until the whole scope closes, report `BLOCKED` plus actual
per-repository progress without labelling partial results `REVIEWED`. On resume,
verify existing comments and completed source/review evidence, then only finish
missing or invalidated work. Add no report file or runtime ledger.
Do not commit, push, submit, merge, publish, or write a Wiki in this skill.

On contract arrival, resume the original branch/Task/Plan and refresh only
affected contract bindings, code/manual changes, verification and review. Pure
technical fact completion preserves business approval; new integration outside
the old Mock-only authorization or material behavior/operation changes require
the complete current checklist and affected approval. Active Mock is local-only
by default. Carry the current Mock inventory, dependency evidence and real
verification limits to delivery; ordinary implementation approval grants no
Mock test-delivery authority and no production authority.
