# Read-only requirement preparation scenarios

All identities, paths and code observations below are simulated fixtures. Use the current
`developing-requirement`, `breaking-down-requirement` and `writing-plans` instructions to
prepare the next user-facing response and identify the next permitted actions. Do not
access company APIs, create files, branches or Tasks, or claim that an estimate review
or write occurred. Limit reads to the plugin's instructions and these supplied facts.

## A. PC management request

User request:

> 开发这条需求的 PC 部分。先用本地功能数据完成页面交互，真实接口以后接；
> 本轮仅开发验证，不提交、不提测。先把准备方案完整列出来。
> 我用 Zan 做普通后台的经验是一天三个 CRUD 页面、一天对接四个页面接口。

Verified fixture facts:

- Story: workspace `123`, ID `111230010000101`; no existing PC Tasks or Plans.
- One verified developer account: `dev-a`, assigned by this user and read back as assignable.
- Ten selected pages: member list, member edit, review queue, gift catalog, gift edit,
  asset overview, asset ledger, exchange review, points ledger and points rule.
- The first eight belong to `app-a`, the final two to `app-b`; both repositories use Zan.
  Each page has its own behavior and acceptance. The same developer owns the selection.
- Existing branch `feature/dev-a.1028.PC页面开发` contains static views; no interactive
  implementation is complete. Verified remote baselines and continuation refs are available.
- Current source evidence shows reusable tables, forms, filters, export, request wrappers
  and permission utilities. Basic page adaptation and its necessary verification each have
  concrete source-backed hour estimates available; neither framework setup nor rebuilding
  shared components is needed. Asset ledger additionally needs transaction-ratio snapshots;
  exchange review additionally needs rejection/resubmission states, with separate verification.
- A local scenario store/reset adapter is needed once, consumed by all pages. There is no
  verified need for installing new tooling. Formal transport fields/endpoints are unavailable.
- The user did not state hours per workday or whether the day reference is already a final
  budget. No independent estimate review has run yet.
- Both projects' applicable rules currently bind one file:
  `docs/requirements/<story-id>/task-plan.md`. No module directories are declared.
- No permission has been given to write Tasks, Plans or project rules. Business rules and
  local-only Mock scope are already decided; real integration is outside this round.

Return a preparation proposal, what remains needed for a confirmable checklist, and how
the work should resume after real API contracts arrive. Do not invent concrete source facts
or an exact hourly estimate absent from the supplied evidence.

## B. Shared copy change

User request:

> 把八个列表页共用的空态文案改成“暂无记录”，仅开发验证。

Verified fixture facts:

- One exact Story, one repository, no Task or Plan.
- All eight pages consume the same unchanged shared empty-state component.
- The selected change is one string; the evidence shows no distinct page behavior,
  API change, external dependency or permission change. Acceptance is the new string at
  the shared component and one representative consumer; current branch facts are available.

Return the needed preparation and next actions.

## C. Selected Task continuation

User request:

> 只继续这一个积分接口对接 Task，其他页面不要动，先检查还缺什么。

Verified fixture facts:

- Exact Task `111230020000501` belongs to the Story in A, assigned to `dev-a`.
- Readback: retained final effort 5 hours; scope is points-ledger API mapping, real
  integration and exit of this module's Mock; the existing module Plan covers this Task
  and a completed page-development Task. The selected Task has unchanged scope and hours.
- Real contract has now arrived; the original branch and module Plan still exist.
- Other pages and their Tasks are outside the user's selection. The previous approval
  covered local Mock work only; this request asks for inspection, not execution or delivery.

Return the needed preparation and next actions.
