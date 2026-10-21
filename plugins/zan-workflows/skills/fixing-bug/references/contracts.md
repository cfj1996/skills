# Orchestration contract

`fixing-bug` is a stateless sequential composition. It owns preflight ordering,
checklist formatting, execution ordering, and the final summary; producer
skills own all business validation and external writes.

## Request

| Field | Required | Rule |
| --- | --- | --- |
| `tapd_urls` | yes | One Bug URL or an ordered list; exact duplicates are removed. |
| `fixed_project` | yes | Hard constraint shared by every Bug. |
| `fixed_repo_path` | yes | Canonical repository path shared by every Bug. |
| `fixed_branch` | yes | Exact repair branch shared by every Bug. |
| `work_mode` | yes | `INITIAL|CONTINUE`; infer from current and prior work evidence. |
| `branch_mode` | yes | `AUTO`, `CREATE`, or `USE_EXISTING`. |
| `delivery_mode` | yes | `IMPLEMENT|SUBMIT|GO_LIVE`; “修复” defaults to `IMPLEMENT`; submission/go-live require the corresponding user intent. |
| `workflow_profile` / `verification_risk` | derived per Bug | Shared adaptive-workflow rules select preparation depth and independent verification risk from that Bug's scope/evidence; the same branch may hold different profiles. Neither expands delivery authority. |
| `implementationBrief` | eligible QUICK Bug | Reuse the existing scope summary with `behaviors`, `exclusions`, `evidence`, `steps`, `verification`; carry it through preparation into implementation without new persistence or confirmation. |
| `create_base_ref` | conditional | Exact base when creation may occur, unless verified workspace policy supplies it. |
| `submission_profile` | for `SUBMIT|GO_LIVE` | `AUTO|STANDARD|NO_WIKI`; resolve AUTO only from named policy, otherwise show `PENDING_SUBMISSION_PROFILE` and both exact choices. Not required or resolved for `IMPLEMENT`. |
| `deployment_mode` | for `SUBMIT|GO_LIVE` | `AUTO|DEPLOY|SKIP`; infer explicit publish/direct-submit wording. Not required or resolved for `IMPLEMENT`. |

`USE_EXISTING` means begin this Bug on the supplied existing branch. It is not
a resume request and carries no requirement for prior Bug-specific evidence.

`CONTINUE` reuses context, the original branch and only the incremental scope;
it never creates a follow-up branch. Reuse the previously explicit delivery
endpoint when still applicable and not changed by the current request; the
current explicit endpoint takes precedence.
Status, existing Wiki or test feedback alone never selects submission. Reuse
the original Wiki only when entering the selected submission flow.

A Wiki URL is not a request field. Under `STANDARD`, the submission capability
derives the target by checking TAPD details/comments and the fixed Wiki
hierarchy; absence of a user-supplied Wiki URL never blocks preflight.

For a multi-Bug request that starts with `CREATE`, the effective mode changes
to `USE_EXISTING` immediately after the exact branch is created and its ref is
read back. Later items must not repeat `CREATE`. If an item fails before branch
creation, the next item may still use `CREATE`; if creation occurred before a
later failure, the next item uses `USE_EXISTING`.

## Preflight checklist

Before any write, the orchestrator derives one user-visible row from each
producer-owned preflight snapshot. Display the delivery endpoint above the
table and bind it to confirmation. `IMPLEMENT` uses the five common columns;
only `SUBMIT|GO_LIVE` adds the two submission columns:

| Column | Source |
| --- | --- |
| Bug | TAPD identity or short ID |
| 项目/仓库 | verified selected project and canonical repository |
| 分支 | exact fixed branch identity; exclude `CREATE` or `USE_EXISTING` |
| 修复范围 | concise producer-derived in-scope work |
| 提测策略 (submission only) | exact `STANDARD（Wiki）` or `NO_WIKI（无 Wiki 调用）` |
| 部署 (submission only) | exact resolved `DEPLOY` or `SKIP` |
| 待确认 | normalized missing decision/blocker, or `无` |

The initial repair request is item selection, not checklist confirmation. An
unconfirmed checklist permits no write capability. A `PENDING` or `BLOCKED`
snapshot remains producer-owned, appears in `待确认`, and keeps the whole
request read-only.

After explicit confirmation or valid `CONTINUE` incremental-scope authorization,
each Bug is prepared again immediately before
implementation. Only a `READY_FOR_HANDOFF` whose visible project/repository,
branch, and scope match the confirmed row may become a handoff. Any changed
visible field invalidates confirmation and returns the updated checklist.
The normal effective-action transition from `CREATE` to `USE_EXISTING` is not
a visible field change and does not invalidate confirmation.

The checklist and confirmation live only in the current conversation. They do
not add request fields, persistence, runtime IDs, or recovery state.

For `INITIAL`, checklist confirmation also authorizes the displayed exact
branch action/base, active-state transition, and implementation. Its authorization
summary also binds each Bug's old status/`current_owner`, verified repair account
and evidence, and the combined status+owner payload. The person summary is a
visible bound fact outside the checklist columns.
An already-active Bug with a different handler still requires this authorized
correction; only matching status and repair owner allow `NO_CHANGE`. Missing or
ambiguous repair identity is `PENDING`. For
`CONTINUE`, an already-`待测试` Bug has
`status_action=SKIPPED_ALREADY_WAITING_TEST`; no active/final status rewrite or
repair-owner rewrite or duplicate test-version write is allowed.

`IMPLEMENT` stops at `REVIEWED` after the necessary initial authorization and
independent review. It neither asks for submission settings nor calls submission
PLAN. Repair with submission has at most two confirmation points: initial
scope/implementation authorization when needed, then one consolidated
submission authorization. `going-live` remains a separate master/Wiki
confirmation, and local cleanup is another separate exact confirmation only
when verified candidates exist.
The second authorization must answer the complete current `SubmissionPlan`;
the first confirmation never authorizes submission writes.

## In-memory handoffs

| Producer | Successful output | Next consumer |
| --- | --- | --- |
| `preparing-work` | `TapdWorkDefinition` with `READY_FOR_HANDOFF` | `implementing-work` |
| `implementing-work` | `ReviewedChange` with `REVIEWED` | final per-Bug result for `IMPLEMENT`; `submitting-for-test` only for `SUBMIT|GO_LIVE` |
| `submitting-for-test` | `TestSubmissionResult` with `SUBMITTED` | optional `going-live`, as the complete input |
| `going-live` `DELIVER` | `MasterMergeResult` with `MERGED`, involved tooling latest release/consumer verification/Wiki readbacks, and cleanup state/plan | final summary or deferred cleanup confirmation |
| `going-live` `CLEANUP` | updated cleanup result with `CLEANED|PARTIAL|BLOCKED` | final summary |
| `going-live` waiting | `AWAITING_MERGE`, exact MR/read-only continuation and completed effects | pause the shared-branch queue; `已合并，继续上线` requests verification before remaining delivery |

Preflight snapshots are not handoffs. Handoffs live only for the current
execution, begin only after checklist confirmation or valid `CONTINUE`
incremental-scope authorization plus execution-time re-preparation, and are not
serialized or written to the repository.

A later explicit submission request may reuse a still-current `ReviewedChange`
after the receiver verifies repository, branch, exact diff and verification.
Refresh invalidated evidence, not the whole repair flow. Initial repair
authorization never authorizes the later submission writes.

## Per-Bug result

The orchestrator retains only enough in the current conversation to report:

| Field | Values |
| --- | --- |
| Bug | supplied URL or derived short ID |
| Status | `成功`, `失败`, `待确认` |
| Last capability | capability name or `未开始` |
| Deployment | `DEPLOYED|SKIPPED_BY_INTENT|FAILED|UNKNOWN|未执行` |
| Cleanup | `NO_CANDIDATE|AWAITING_CONFIRMATION|CLEANED|PARTIAL|BLOCKED|未执行` |
| Reason | first blocker or required confirmation; empty on success |

Execution-time `preparing-work` returning `PENDING` or `BLOCKED` pauses the entire queue.
A downstream failure from `implementing-work`, `submitting-for-test`, or `going-live`
does not cancel later Bugs unless it invalidates a shared constraint. The final list
preserves input order.
