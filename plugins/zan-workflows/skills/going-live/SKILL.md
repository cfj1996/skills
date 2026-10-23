---
name: going-live
description: Use when submitted TAPD changes must merge original fixed branches to master, verify involved tooling latest publications and release only when needed, upgrade and verify affected consuming projects, maintain Wiki status, and optionally clean up confirmed local resources.
---

# Go Live

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
or delegation is available; model availability never weakens merge gates.

Accept `operation=DELIVER|CLEANUP|CLEANUP_REMOTE`. `DELIVER` consumes one
`TestSubmissionResult` plus related submitted projects when tooling dependencies
are involved, and returns one in-memory `MasterMergeResult`. Merge each original
fixed branch directly to `master`. Before tooling delivery writes, first check
whether the package latest publication covers this delivery, then check whether
each affected project resolves that latest version. Only after both read-only
checks decide whether Jenkins publication or dependency upgrades are needed.
Execute only those needed actions before the consumers' final merges.
Then maintain business Wiki `是否上线：已合并` and tooling Wiki
`当前版本：latest`. A master merge alone never proves package publication.

Here `master` denotes the verified default delivery branch. Use actual `main`
only when remote evidence confirms it as the default; keep that exact name in
the visible plan, executor and containment refs. Never infer it from cwd.

After verified master delivery, `DELIVER` also checks associated local branches
and worktrees, including evidenced temporary test-merge branches and their
worktrees, and creates an exact `CleanupPlan` for safe candidates. Original
development resources are never deleted in the delivery turn. A conflict's
temporary C resources may already be cleaned under the exact upfront authority
in [conflict-merge.md](../../references/conflict-merge.md); retain that outcome.
`CLEANUP` consumes the prior merged result
and a separate exact cleanup confirmation, revalidates every candidate, and may
remove the confirmed local resources plus explicitly listed remote temporary
test-merge branches under the remote checks below.

Include the delivery's associated remote temporary `merge/*` branches in the
same concise cleanup preview after the checks in
[remote-cleanup.md](references/remote-cleanup.md). A combined confirmation must
explicitly include remote temporary branches. Remote feature/fixbug development
branches remain retained unless separately requested with exact authority;
that separate operation is `CLEANUP_REMOTE`. A generic local cleanup reply
never authorizes remote deletion.

Every delivery final response must include the local cleanup outcome. After
all required delivery gates pass and the completed check yields safe
candidates, standalone delivery shows their exact plan and ends
with `是否删除以上本地开发环境？` for a local-only plan, or
`是否清理以上资源（含远程临时分支）？` for a combined plan; a cleanup-state code or a generic cleanup
recommendation alone is insufficient in that standalone confirmation flow.
When invoked by fixing-bug/developing-requirement, report the check and cleanup
candidates as next-step advice; do not append a new approval question or delete
original development resources. Explicitly requested CLEANUP still requires its
own exact resource confirmation. Existing exact conditional conflict cleanup
retains its already-approved scope.

Read [contracts.md](references/contracts.md) and
[tool-routing policy](../../references/tool-routing.md) before any write.
Read [acceptance-scenarios.md](references/acceptance-scenarios.md) only for an
edge case or regression check.
When the submitted change or delivery dependencies involve a tooling package,
read [tooling-latest.md](references/tooling-latest.md) before preparing the
complete checklist. It owns package/consumer ordering and final latest checks.
GitLab operations use `gitlab-mcp`; Wiki operations use `tapd-mcp`.
Confirmed local cleanup uses only ordinary local Git CLI commands described
below.

Reuse a live [workflow session](../../scripts/workflow-session.mjs) for merge,
closeout and Wiki actions when available; its MCP pool saves initialization
without caching source refs, occupancy, Wiki state or authorization. Individual
helpers remain the fallback for a standalone action.
Use the pinned helper runtime and wait for `SESSION_READY`; avoid manual TTY
repair. The merge helper verifies supported rule/counter/edition formats and
records approval evidence; an unknown or denied check remains blocking.

## Manual merge handoff

Developers may create MRs without permission to merge protected targets. Use
`mergeMode=MANUAL` in the displayed plan when that restriction is known;
otherwise `AUTO` hands off on explicit `user.can_merge=false` or a merge-call
HTTP 403. Read, approval, creation, network and other API failures remain
blockers rather than guessed permission issues.

The executor creates/reuses the exact MR and returns `AWAITING_MERGE`, its
URL, repository/branches/source SHA, completed effects and read-only
`resumePlan`. For a STANDARD business submission, update the matching Wiki entry
to `是否上线：待合并` under the conditional patch authority described below;
read it back before reporting the Wiki update as successful. Report
`等待有权限人员合并` with the exact link, Wiki update result and paused next
stage. Surface the executor's `userAction.message` in the final response:
explicitly ask the user to contact a colleague with permission to review and
merge the original branch into the exact target, then reply
`已合并，继续上线`. A waiting status alone is insufficient. Known permission
denial may say `当前账号没有合并权限`; a planned manual merge must not invent
that evidence. If a later check finds the MR still open, repeat the action
reminder with the same MR link. This handoff takes place in the conversation;
it needs no enterprise WeChat robot, team hierarchy lookup or external message.
Do not repeat merge attempts, create a replacement MR, switch accounts,
approve on the user's behalf or continue dependent publication, consumer
delivery, final merged/latest Wiki updates or cleanup. The sole waiting-stage
write is the approved business `未合并 → 待合并` status patch. This normal handoff is not a failed delivery;
conflict, CI and changed-source blockers remain distinct.

On that reply, reuse the same in-conversation submissions and delivery plan.
Run the exact `resumePlan` with `mergeMode=VERIFY_ONLY` and no `--execute`
(session `PLAN`). The reply prompts a read, never proves completion: require
the same MR's merged state, unchanged source SHA, required CI and source
containment in the freshly fetched target. A maintainer-deleted source branch
or unrelated target advancement is acceptable only with that proof; never
recreate the branch. An open MR remains waiting; changed source/identity,
closed MR or missing proof needs investigation/new review. After `MERGED`,
continue only the first unfinished dependent stage under unchanged prior
authorization, refreshing mutable refs/latest/Wiki facts. Do not replay
completed merges/publications. Changed action scope needs a new actual preview
and confirmation. Keep the handoff in the conversation only; create no
persistent recovery record or automatic scheduled monitor.

### 待合并 Wiki 补丁

上线清单中提前展示两条条件路径：正常合并后的 `未合并 → 已合并`，以及
没有合并权限时的 `未合并 → 待合并 → 已合并`。列出准确 Wiki ID/父页/标题、
项目条目标题、仓库和原分支、各阶段最小补丁及完整结果正文/指纹。一次确认
可以覆盖完整展示的两条路径，不因转人工合并再重复确认相同补丁。
原清单未包含待合并补丁时，先展示该补丁并取得授权，不能只继承 MR 创建许可。

推荐通过 workflow session 的 merge 请求携带 `pendingWiki`，由
[pending-merge-wiki.mjs](../../scripts/pending-merge-wiki.mjs) 在真实
AWAITING_MERGE 后自动执行并读回。参数和预览见
[脚本化交付说明](../../references/scripted-delivery.md#待合并-wiki-状态)。
同页可能有多个项目共用分支名，必须用项目条目标题 + 仓库 + 原分支唯一
定位，不得全页替换。先核实 MR 已创建/复用且仍打开、源 SHA 不变、目标是
实际默认分支，再将该业务条目的唯一状态改为待合并；已有待合并且正文与
批准结果完全一致时不重复写入。未成功创建 MR、冲突/CI/网络等其它失败
不能冒充无合并权限。已合并条目不得回退为待合并。

NO_WIKI 不读写 Wiki；TOOLING 保持当前版本字段，不新增是否上线。Wiki
更新失败、权限不足或读回不符时保留已创建 MR，分别报告“等待人工合并”
和 Wiki 阻塞，不宣称已更新，不自动重试未知写操作。继续上线前保留并
核实待合并补丁读回的正文指纹；只允许以该明确中间结果为基准执行已获准
的 `待合并 → 已合并`，任何其它正文变化都需新的实际预览与确认。

## Input gate

For `operation=DELIVER`, require:

- `TestSubmissionResult.terminal_state=SUBMITTED`;
- the exact original `feature/*` or `fixbug/*` repair branch from that result;
- verified repository/source/current-round commit facts; and
- resolved project category/service type; and
- an explicit current-conversation request to go live.

A multi-repository Bug submission retains the same per-project delivery rows.
Match each by verified repository/origin and original fixed branch, and include
every required repository in the go-live plan; never interpret the first row
as completion of the Bug. Preserve each row's exact submitted test target
(`dev` or `develop`) as delivery evidence; it is neither the go-live source nor
the default delivery target. Single-project handoffs remain valid unchanged.

Identify involved tooling packages from the submitted diff/dependency evidence,
not only the primary project's category. Accept related `SUBMITTED` handoffs for
package owners and affected consuming projects in the same delivery. Each
project needs its verified repo, approved original branch and reviewed scope;
resolve missing project/branch approval through the existing preparation gate
before including it. Never silently expand to all consumers of a shared package.

Reuse the exact source branch, project category and Wiki ID from the submitted
result. Read that Wiki by ID; do not rediscover the hierarchy or enumerate
other entries. Refresh source/master refs and the exact Wiki body at their
write boundaries, not the entire submission preflight.

When the upstream profile is `STANDARD`, require the exact existing Wiki target
and readback retained by submission, whether the submission Wiki state is
`WRITTEN` or `SKIPPED_BY_POLICY`. A policy skip means no test-submission Wiki
write occurred; it does not remove the historical target needed to maintain
the type-specific Wiki status. A `NO_WIKI` submission has no Wiki maintenance step.

Never substitute `develop`, `dev`, `master`, `merge/*`, a release branch, or a
rebuilt branch as the source.

For `operation=CLEANUP`, require:

- the exact prior `MasterMergeResult.terminal_state=MERGED`;
- `cleanup_state=AWAITING_CONFIRMATION` with one exact displayed `CleanupPlan`;
- a current-conversation confirmation binding `intended_operation`, `purpose`,
  current branch, every `branch_to_delete`, and every
  `worktree_to_remove`; and
- the same verified repository and association evidence used by that plan.

When `CleanupPlan.remoteTemporary` exists, also require its complete
`RemoteCleanupPlan` and the explicit reply `确认清理（含远程临时分支）` (or
equivalent exact authority). That scope accepts only associated `merge/*`
refs, never remote feature/fixbug branches. Validate the entire combined plan
before any deletion; execute local cleanup first, then the remote temporary
stage under the same unchanged confirmation. A failed stage stops later writes.

A request to go live, a merge authorization, or a generic earlier “继续” never
authorizes cleanup. `CLEANUP` never repeats the master MR or Wiki operations.

For `operation=CLEANUP_REMOTE`, require the completed delivery and explicit
remote-deletion request, then bind the exact repository, remote push URL,
full branch refs and observed SHAs in a `RemoteCleanupPlan`. Apply the separate
preview, confirmation and fresh checks in [remote-cleanup.md](references/remote-cleanup.md).
Local cleanup completion or local candidate status is not a prerequisite or
proof of remote candidacy. A generic `确认清理` authorizes local resources only;
for a combined plan it is insufficient, so perform no deletion until the
user specifies whether to include or exclude the remote temporary rows.

## Delivery procedure

1. Re-read repository fingerprint, original source ref, `master` ref, existing
   MR state, and current-round commits.
2. Prepare one complete delivery checklist with repository, original source,
   exact default target, source/target SHAs, commits, MR actions and purpose.
   Resolve involved packages and include their complete `ToolingLatestPlan`
   with package latest check, subsequent consumer-version checks, and the
   resulting release/upgrade/no-op decision (or evidenced
   `NOT_APPLICABLE`) and the Wiki actions below before showing
   this checklist. One explicit current-conversation confirmation can bind
   merge, official package release, scoped consumer upgrades/delivery and exact
   Wiki-patch authority when fully displayed. An omitted scope still
   needs its own confirmation; changed facts require a fresh actual preview.
   A main entry's complete execution checklist may already supply that explicit
   go-live authority. Apply [confirmation reuse](../../references/execution-checklist.md#执行清单的确认复用),
   compare the exact delivery/derived facts and continue without another user
   turn when covered. Standalone going-live still displays and confirms its
   own complete plan; test-delivery approval never implies master/production.
3. For a `STANDARD` submission, read its exact Wiki target and uniquely locate
   the entry by the original source branch. Resolve the project category and
   service type before planning the Wiki operation:
   - for an involved tooling package, require exactly one valid `当前版本`
     field with `canary` or `latest`, and no `是否上线` field. Plan
     `UPDATED_LATEST` for the minimal `canary` to `latest` patch, or
     `ALREADY_LATEST` for unchanged readback. Both require verified official
     publication and affected consumers at the registry's current latest;
   - for a tooling project with no involved publishable package, preserve its
     valid channel and record `SKIPPED_TOOL_PROJECT`; no version write is needed;
   - for a business project, accept current `是否上线：未合并` or verified
     `是否上线：待合并`. Plan the exact conditional pending patch and final
     transition to `是否上线：已合并`. A missing field or any other value
     blocks; do not migrate an old template. The transition requires verified
     master containment;
   - record `ALREADY_MERGED` when a business entry is already `已合并`.
   For any business or tooling entry that needs a patch, display the minimal
   patch and resulting body and obtain exact authorization for that Wiki write. This is
   a separately identified authority scope in the same complete checklist;
   do not ask a second question when its target/body/purpose were already
   fully shown and confirmed.
   An unchanged tooling entry requires no Wiki-write authorization, but an
   involved package still requires release and consumer checks.
   Duplicate/conflicting fields or ambiguous entries block
   before the merge. For `NO_WIKI`, record `SKIPPED_NO_WIKI`; never create a
   Wiki. For STANDARD business delivery using workflow session, include the
   confirmed `pendingWiki` conditional plan in the merge input. Standalone Git
   executors require the caller to invoke the same pending-Wiki helper after
   the exact awaiting result; the Git-only executor does not write TAPD.
4. Run the private read-only
   [master-merge-validator.md](agents/master-merge-validator.md) before the
   first write. Supply the complete ordered tooling plan, derived-version rules
   and conditional release/consumer/Wiki gates when applicable; future
   successful readbacks are not prerequisites for plan validation.
   Map its response to a public validation state, retain only a
   concise failure reason, and discard the private line.
5. When tooling packages are involved, reuse the complete package and consumer
   prechecks from the plan; refresh only changed mutable facts. Execute the
   decided owner merge, verified reuse or required official Jenkins release,
   and only needed consumer upgrades/delivery under
   [tooling-latest.md](references/tooling-latest.md) in dependency order. Use
   the same merge executor for each exact original branch and refresh reviews,
   source SHAs and required checks after consumer edits. Perform step 6 after
   each successful master merge, retaining its result even if a later release
   or upgrade blocks. Do not merge a consumer before its latest upgrade.
   When no tooling package is involved, run
   [merge-reviewed-branch.mjs](../../scripts/merge-reviewed-branch.mjs)
   once for the exact original-source-to-default-target plan. It checks fresh
   refs/approvals, waits for CI itself, creates or reuses the exact MR, merges
   once and verifies containment. Require `MERGED` plus actual readback and
   containment; pending auto-merge is not completion. Do not repeat whole
   preparation, review, private validation or Agent polling between its steps.
   A real metadata edit or conflict needs its own exact authorized action.
   For a conflict, use the shared [A → C → B flow](../../references/conflict-merge.md)
   under the main checklist's already-covered conditional scope, or confirm
   the standalone ACB plan when absent. Do not ask again for covered conflict
   resolution; temporary cleanup needs explicit exact authority and honors
   retention overrides. Keep A as the business source; retain
   separate C → B merge/containment evidence rather than passing C to the
   ordinary original-branch executor.
6. After each successful merge readback and `origin/master` containment, run the
   read-only [local closeout check](references/local-closeout.md) through
   [check-local-closeout.mjs](../../scripts/check-local-closeout.mjs) once.
   Supply only the original branch and explicitly evidenced related branches
   and current task location. Include the temporary `merge/*` branches used for
   test submission and their worktrees from exact submission/MR evidence; check
   them against their own merged dev/develop target, not master. Explicitly
   report absent resources or missing association evidence. It automatically collects one fresh scoped
   Codex task/process snapshot; a supported external collector snapshot may
   replace that collection when already available.
   It batches target fetch/ref/worktree reads and parallel local inspections;
   unknown occupancy/data yields `VERIFY`, never assumed idle. Do not repeat
   these reads manually or introduce deletion into this check. Retain its
   result even if subsequent Wiki maintenance fails. A partial or unavailable
   local check does not block Wiki maintenance or change the confirmed merge.
   Reuse a complete check already performed during step 5; do not repeat it at
   this stage. Resources needed by unfinished package/consumer work are retained.
7. Only after successful merge readback and `origin/master` containment, for a
   `STANDARD` business submission re-read the Wiki. If the authorized patch
   still applies, reuse the prevalidated exact Wiki authority and invoke
   [ensure-test-wiki.mjs](../submitting-for-test/scripts/ensure-test-wiki.mjs)
   once in `--mode update --execute`, with the existing ID/parent/title,
   original body SHA-256 and approved full resulting body.
   For shared-page entries with the same branch, also bind entryHeading and
   entryRepoUrl (CLI --entry-heading / --entry-repo-url) to the selected project.
   This mode performs only Wiki update/readback, with no item/comment read or write. Require
   `UPDATED|UNCHANGED`, approved final body hash and exactly
   `是否上线：已合并`; for `ALREADY_MERGED`, verify the unchanged field instead.
   For involved tooling packages, first require verified existing or newly
   released official publication,
   all bound consumer upgrades/reviews/master deliveries, and fresh registry
   latest checks. Follow `tooling-latest.md` to execute the authorized
   `UPDATED_LATEST` patch with the same update-only helper, or verify
   `ALREADY_LATEST`; require exactly `当前版本：latest` on final readback.
   For `SKIPPED_TOOL_PROJECT`, verify the unchanged
   `当前版本` field and perform no Wiki write. If the page changed,
   stop for a fresh patch and authorization; never overwrite the changed page.
   A `NO_WIKI` submission performs no Wiki read or write. No extra private
   Agent validation is needed for an unchanged fully displayed patch; a changed
   body/patch is a real exception and needs a new preview/authorization.
8. On `AWAITING_MERGE`, first finish or truthfully report the conditional
   business pending-Wiki patch, then return the exact handoff and completed effects, pause
   dependent writes and follow the continuation above. Return `MERGED` only
   when all required merge, tooling release, consumer
   current-version verification and applicable Wiki readbacks pass;
   otherwise return `BLOCKED` with actual completed effects. Include the local
   check result separately, with paths/branches, reasons, and cleanup advice.
   If master delivery was not verified, mark the local check `NOT_TRIGGERED`.
   For a merged result, convert only local `CANDIDATE` resources into one exact
   `CleanupPlan`. Read-only preview associated remote temporary merge refs
   under remote-cleanup.md and attach safe candidates as `remoteTemporary`;
   retain blocked remote refs with reasons. This can produce a remote-only
   temporary plan even when no local candidates remain. The local helper's
   cleanupState describes local scope only; do not copy its NO_CANDIDATE over
   a nonempty remoteTemporary plan. Use `NO_CANDIDATE` only when all selected
   scope checks completed and found no safe candidates; use `BLOCKED` when cleanup evidence is partial or
   unavailable. Otherwise set `cleanup_state=AWAITING_CONFIRMATION`, display
   the plan and apply the completion response below, then stop without deleting
   original development resources. Previously confirmed conflict-C cleanup
   follows the shared conflict flow and does not require another confirmation.

## Completion response and next turn

After reporting the actual merge, release/consumer and Wiki results, always
report the cleanup outcome separately:

For `AWAITING_MERGE`, show `userAction.message` (contact a colleague with merge
permission, exact MR link/target and `已合并，继续上线` next step), plus Wiki
`待合并` readback or its separate blocker
instead of a deletion question. Resources remain retained until delivery ends.

- `AWAITING_CONFIRMATION`: display the exact repository/current branch,
  concise cleanup table and purpose from `CleanupPlan`. Use three rows where
  possible: `开发分支｜本地：<branch>`; `临时合并分支｜本地：<branch>；远程：<remote>/<branch>`;
  `工作树｜<exact paths>`. Mark absent/retained scopes explicitly and list each
  exact name; no wildcards. Keep SHAs, MR/containment/protection evidence and
  deletion order in the in-memory plan rather than expanding the visible table.
  State `远程开发分支保留`. For a combined plan ask
  `是否清理以上资源（含远程临时分支）？`, offering
  `确认清理（含远程临时分支）` or `保留开发环境`. For a local-only plan ask
  `是否删除以上本地开发环境？`, offering `确认清理` or `保留开发环境`.
  Never finish with only “上线完成” or bury this question in progress updates.
- `NO_CANDIDATE`: say `目前没有可安全清理的本地资源。` and give any retention
  reason, especially a current branch/worktree or active task. Do not ask to
  delete resources that failed candidacy.
- `BLOCKED`: explain the missing inspection evidence or unfinished delivery
  gate and the specific next check; do not ask for deletion yet.
- `NOT_TRIGGERED`: explain that default-branch delivery is unverified and
  cleanup has not started.

An immediate `确认清理` or `执行清理` answering the unchanged exact displayed
local-only plan confirms only that list and starts `operation=CLEANUP` on the next turn.
For a combined plan require the explicit remote-temporary confirmation above;
one reply covers the complete displayed local and remote-temporary scopes.
Reuse the prior merged result; do not restart merge, release or Wiki work.
`保留开发环境` ends the flow with no deletion and no repeated cleanup prompt
unless the user later requests it. A changed plan needs a fresh confirmation.
An orchestrator combines duplicate candidates and asks once after all required
deliveries pass; it must preserve retained/blocked reasons in its final output.
Group the plan into development branches, temporary test-merge branches
(label local/remote separately), and worktree paths. Remote development branches
are retained unless explicitly requested; never infer that authority from a
remote-temporary cleanup confirmation.

Conflict-generated temporary resources follow the shared
[A → C → B policy](../../references/conflict-merge.md). Its initial exact
confirmation includes conditional temporary cleanup by default; after the
verified conflict MR and safety checks use that unchanged authority rather
than another go-live cleanup question. The user's explicit retention choice
overrides the default. Preserve per-resource outcomes, exclude already absent
or RETAINED_BY_USER C resources from default cleanup proposals, and keep concise
reasons. Original development resources still use the ordinary post-delivery
cleanup confirmation above.

## Cleanup procedure

Run only for `operation=CLEANUP` after its exact confirmation:

1. Re-read the repository, current task path and branch, `git worktree list`,
   every planned worktree status/ignored/lock/occupancy fact, local branch tips,
   and refreshed target refs. Re-prove full-tip containment and association.
2. If any path, branch, SHA, dirty state, lock, occupancy, or candidate set
   differs from the confirmed plan, perform no deletion. Return the refreshed
   plan with `AWAITING_CONFIRMATION` or classify the resource
   `RETAIN|VERIFY`; never silently narrow or expand the confirmed target set.
3. Reject protected/baseline branches (`main|master|develop|dev`), the current
   checked-out branch, the current task's worktree, active or locked worktrees,
   dirty/untracked worktrees, unpreserved ignored data, undelivered tips, and
   uncertain occupancy. Local candidacy never proves remote candidacy; a
   combined plan's remoteTemporary rows require the independent remote checks.
4. For each unchanged confirmed candidate, remove its associated worktree first
   with ordinary `git worktree remove <exact-absolute-path>` and no force flag;
   read back that the path and worktree registration are gone. Then delete the
   exact local branch from a safe remaining worktree with
   `git branch -d -- <exact-branch>` and read back that the local ref is absent.
   A branch without an associated worktree skips the first operation.
   For a test-merge branch whose verified target is dev/develop, use the
   verified upstream handling in
   [local-closeout.md](references/local-closeout.md#confirmed-cleanup) so `-d`
   checks that exact fetched target even when HEAD is master. Keep the fresh
   full-tip proof; do not force-delete or switch branches to make it succeed.
5. Never use `rm -rf`, `git branch -D`, `git worktree remove --force`, broad
   pruning, branch switching, or process termination. The local stage never
   deletes remote refs; the explicitly confirmed remoteTemporary stage uses
   [remote-cleanup.md](references/remote-cleanup.md) after local success.
   Stop on the first failure and preserve every unprocessed resource.
6. Return cleanup state `CLEANED` only when every confirmed operation and
   readback succeeds. Otherwise return `PARTIAL|BLOCKED` with completed and
   retained resources separately. Cleanup failure never reverses or disguises
   an already verified `MERGED` delivery.

Do not deploy a business application to production, run smoke tests, update
TAPD status or comments, publish a test version, or write local workflow state.
Involved tooling packages require verified official latest publication. Check
existing latest first; only an evidenced `NEEDS_RELEASE` permits a new Jenkins
trigger through `running-release` under the complete delivery plan. No retry or
interruption recovery is built into this skill.
Remove the transient approved Wiki-body Markdown file after its helper call;
it is only a request carrier, never a workflow record. Other explicit version or
environment publications use `running-release` with their exact release plans.

`是否上线：已合并` means that the approved current-round commits are verified
in `origin/master`; it does not claim that a production version was published.
Tooling `当前版本` denotes the latest verified publication channel:
`canary` for `canary`, `latest` for `official`. Latest delivery completion
requires registry, consumer-version and Wiki readbacks as well as merge proof.
