# Submission rules

## Common write rule

Prepare one consolidated authorization using
[deployment-and-confirmation.md](deployment-and-confirmation.md). For every
external write inside that unchanged authorized plan:

1. The main execution checklist has confirmed the operation/target/purpose
   and allowed derivations, or the standalone plan has confirmed the exact
   payload. Calculate and validate the current exact bindings before writing;
   do not repeat user display/approval or broad discovery for each operation.
2. Re-read only the mutable facts for this specific write immediately before
   execution. Reuse the consolidated authorization when they still match;
   stop stale bindings and refresh the accurate plan when needed. Reuse
   authority for permitted technical derivations; material scope/operation
   changes need fresh approval.
3. Require the complete plan's independent review below, then let the owning
   executor check this operation's actual prerequisites and read its result
   back before proceeding. Do not start another Agent for unchanged inputs.

## Whole-plan review

Before the first delivery write, give the complete `SubmissionPlan` to the
private submission validator once with `PRE_SUBMISSION_PLAN`: all repository
reviews, authority, Git actions, exact deployment selections, complete Wiki
body/patch and ownership evidence, and registration preview. Under STANDARD,
include the Wiki validator's criteria in this same review; NO_WIKI loads no
Wiki capability. A prepared draft is not yet
`VALIDATED`. Map a passing review to the plan and its Wiki validation together.
An independently validated unchanged draft may instead reuse its existing
review; do not review that document again merely to change phases.
Standalone PLAN can be reviewed with its proposed human authority pending;
only the later matching real confirmation permits EXECUTE. An orchestrator
instead verifies its already-confirmed complete checklist. Review is not approval.
For the skill's sole record-only Bug correction PLAN exception, keep the
corrected comment readback/full REVIEWED handoff pending while verifying all
current code reviews, history and required repositories. Review the exact first
comment action and require its readback/full-gate restoration before any other
delivery write. No other missing input is deferred by whole-plan review.

Future commit/MR/queue/Wiki identifiers are unknown at planning time. Review
their exact derivation and dependency rules, never invent successful receipts.
Each executor must refresh its own mutable facts, require the preceding real
receipt before writing, and perform its immediate readback. A failed or unknown
effect stops dependent steps immediately, not at the final summary.

At the end the lead checks all actual receipts once using `POST_WRITE`'s
criteria. This is a deterministic result check, not another routine private
Agent call. A material plan/body semantic change, unreviewed diff, conflict
resolution or ambiguous receipt needs scoped independent review; one initial
review is not a limit on necessary later reviews. Standalone individual actions
may still use `PRE_GIT_WRITE|PRE_SUBMISSION_WRITE|POST_WRITE` for their exact scope.
Do not use them in addition to an unchanged complete plan review.

The Wiki creation/supplementation/comment helper is one `WIKI_WRITE_AND_LINK_BUNDLE`
operation: include its complete authorized inputs in the plan review,
let the script perform each deterministic readback internally, then have the lead
check the final result. Do not re-enter the per-operation process or run a separate
validator between the helper's month, child create/update and comment calls.

Likewise, include one `GIT_DELIVERY_BUNDLE` in the unchanged authorized
commit/push/MR sequence. Local Git checks exact reviewed files/diff and reads
back the derived commit/push; `merge-reviewed-branch.mjs` owns MR/CI/merge
checks and source containment. Include `JENKINS_TEST_DEPLOY` in that same review
before its one executor call. Do not spawn validators for each internal check or
poll; retain actual readbacks for the lead's final `POST_WRITE` check.

Generated IDs and readbacks that follow the authorized derivation are not
changed plan facts and do not require another prompt. If a bound value changed
or a result cannot be proved, return `BLOCKED`. This
simple version does not retry or automatically recover an interrupted operation,
or infer that an earlier call succeeded. A later continuation may retain completed
effects only after reliable exact current readbacks establish them under the
skill's normal continuation gates; an old UNKNOWN flag/summary is not proof and
cannot bypass a session write barrier.

All TAPD, Wiki, GitLab and Jenkins operations follow the shared
[tool-routing policy](../../../references/tool-routing.md). Browser state is never the default
transport for these systems.

## Git delivery

Use the original fixed business branch as source and the verified, confirmed
`dev` or `develop` branch as target. Preserve the upstream exact selection;
standalone calls resolve it from project policy and remote evidence before
confirmation. Both existing names without a selected target are an unresolved gap. Keep commits already inherited by the branch separate from the current
reviewed change. Never rebuild on the test target, substitute `merge/*`, or include
unreviewed paths.

When delivery is already present, or merging is explicitly disabled, run the
merge helper read-only with `mergeMode=CONTAINMENT_ONLY`, exact reviewed source
SHA and actual dev/develop target. Require its `VERIFIED`/
`VERIFY_CONTAINMENT_ONLY` receipt, containment and zero writes; no MR is needed
and no new merge may be claimed. Use its verified target `deliveredSha` for
testing. All reviewed delivery changes must already be committed in the bound
source SHA; pending uncommitted delivery changes or missing/unknown containment
block before any commit/push, without silently enabling merge.
For an ordinary authorized merge, when uncommitted, the exact reviewed diff/file list is the commit payload in
the displayed bundle. Run [commit readiness](../../../references/commit-readiness.md)
once for the exact message and planned commit environment before its first commit;
correct a blocked environment/message without attempting Git writes or bypassing Hooks.
Commit/push only that payload with local Git, reuse the
derived SHA, then invoke `merge-reviewed-branch.mjs` once with the confirmed
source/target facts. Do not redisplay/revalidate push, MR and merge merely
because the stage changed. Prove current-round containment in
the exact confirmed remote test target before any TAPD, Wiki or version write. A real MR metadata
change or conflict gets its own exact plan; no history rewrite or duplicate MR.

## Standard Wiki

Apply [shared-test-wiki.md](../../../references/shared-test-wiki.md): default
to one owner Story/Bug page across projects, branches and child Tasks. One
shared body/target is planned for a batch; project plans cannot silently split
it into Task-titled pages. Preserve separate repository/branch entries.

Apply [change consistency](../../../references/change-consistency.md) before
delivery writes: the final reviewed behavior, impact and verification must be
covered by the draft. Continuations revise stale current-entry content instead
of only appending module names. NON_FUNCTIONAL may skip only when the retained
entry remains materially accurate; NO_WIKI still preserves scope/impact checks.

Give current work handoffs—not a user-supplied Wiki URL—to
`zan-workflows:drafting-wiki`. Require `terminal_state=VALIDATED` and one target
plan, or `terminal_state=SKIPPED_BY_POLICY` with
`skip_reason=NON_FUNCTIONAL_CONTINUE`, a verified existing owner page/current
repository+branch entry with retained target/body readback, and no Wiki
operation. Missing history follows normal drafting. Discovery order is
mandatory for both paths:

1. Resolve the common owner and check its/current-item links; when the Story
   has no link, check its exact child Tasks and their comments as described in
   the shared rule. Read the exact TAPD item and comments once, including detail-only 提测 Wiki
   links. If count is absent, continue full comment pages until a short page;
   with count, require the complete reported set. Repeated/inconsistent pages
   block. Reuse a matching linked Wiki ID immediately, including older months.
2. Otherwise query `get_wiki(name=YYYY-MM)` and select the result whose
   returned `parent_wiki_id` is root `1150372234001008260`.
3. Query the owner-based deterministic child title once and compare returned parent IDs.
   A same-title child without an owner link blocks; repository/branch matching
   is not ownership evidence. If absent, plan `MM-DD: 中文简述` creation. Never pass
   unsupported `parent_wiki_id` to `get_wiki`, list all Wiki pages, or repeat
   an unchanged query with a different page size/order.

Include the complete resulting child Markdown and every exact create/update
payload in the consolidated `SubmissionPlan` for the validated path. After the
deployment gate permits later writes, execute only that authorized plan when
the drafter returned `VALIDATED`. Call `scripts/ensure-test-wiki.mjs` once for
creation, supplementation or unchanged reuse, including functional `CONTINUE`.
The default is read-only preview; identity and original source branch are
enough to discover a target without a body file or creator. Preview returns
the fixed target/month/title, exact IDs, existing body and `beforeBodySha256`,
Wiki/comment operations and comment-check evidence. Reuse these facts when
calculating the minimal resulting body; do not repeat discovery.
After confirmation, `--execute` performs the entire approved Wiki write,
readback and idempotent comment write/readback through `tapd-mcp`.
For an orchestrated invocation, materialize the already validated Markdown
in a transient local file outside the repository immediately before the call,
pass it as `--body-file`, and remove it afterward. This file is only the exact
authorized request payload, not a saved workflow record or evidence artifact.

```bash
node skills/submitting-for-test/scripts/ensure-test-wiki.mjs \
  --tapd-url '<full-story-url>' --source-branch '<feature-branch>' \
  --creator <tapd-user> --body-file <approved-wiki-markdown> \
  --month '<planned-YYYY-MM>' --wiki-title '<approved-MM-DD-title>' \
  --expected-month-id '<verified-existing-month-id>' \
  --expect-target CREATE_CHILD --execute --json
```

The example is run from the plugin root. `bug` and `tasks` are also supported.
An existing matching comment and unchanged body need no creation parameters.
For `CREATE_MONTH_AND_CHILD`, omit `--expected-month-id` but keep the planned
month/title. For `REUSE_EXISTING`, copy the exact ID, parent and body hash from
the approved draft; `--body-file` contains the complete approved body after
the minimal supplementation, not an isolated fragment:

```bash
node skills/submitting-for-test/scripts/ensure-test-wiki.mjs \
  --tapd-url '<full-story-url>' --source-branch '<feature-branch>' \
  --expected-wiki-id '<approved-wiki-id>' \
  --expected-month-id '<approved-parent-id>' --wiki-title '<approved-title>' \
  --expected-body-sha256 '<approved-original-body-sha256>' \
  --body-file '<approved-resulting-markdown>' --comment-author '<tapd-user>' \
  --expect-target REUSE_EXISTING --execute --json
```

The helper checks the original hash immediately before update, writes only
`id` and `markdown_description`, and reads back title, parent and exact body.
`wikiState=UPDATED` with `commentState=ALREADY_LINKED` is a successful
supplementation with no duplicate comment. A fully completed repeated call
is read-only only when the current body equals the approved result and its
same-ID comment exists; stale/conflicting inputs never trigger a retry.
The script never
calls `get_wiki` without an exact ID or name, and it stops on ambiguity or
unknown write effects instead of blindly retrying. Its final `LINKED` or
`ALREADY_LINKED` result includes the actual Wiki ID/URL, final `bodySha256`,
`wikiState=CREATED|UPDATED|UNCHANGED` and separate `commentState`. Do not call
`zan-workflows:linking-tapd-wiki` again on this path. The built-in root Wiki ID
applies only to workspace `50372234`; for another workspace supply its exact
verified `--root-wiki-id` before creation. Replace `CREATE_CHILD` in the
example with the confirmed target action. Bound target, parent, title or body
changes block writes; never derive a fresh month/title during execution.
On failure, the helper's `BLOCKED` output identifies the failed phase and
known completed writes. Do not restart it automatically or proceed to status
or version writes.

Never write the canonical entry body into the month page. For the validated
path, read back the final child, retain its actual ID/URL and original source
branch for `going-live`, and require the expected body including the resolved
status (`是否上线：未合并` for a business project, or
`当前版本：canary|latest|待发布` for a tooling/library project)
before continuing. For tooling submission with `TRIGGER_ACCEPTED`, the exact
`BUILD_SUBMITTED` receipt permits Wiki writes without waiting for publication.
Preserve an evidenced prior channel or use `当前版本：待发布` when none exists.
Only a verified release may change the field to its actual published channel:
`canary` maps to `canary`, `official` to `latest`. Queue acceptance, a planned
parameter or develop/master merge alone is insufficient publication evidence. Under `SKIP`, apply the existing
release-evidence/preservation rules in `drafting-wiki`; do not default to canary
or add deployment queries. A policy skip has no child write or post-write
readback, but must retain the verified owner page and matching current entry's
exact target/body readback for `going-live`.

Use the TAPD workspace from the current work item for every Wiki operation:

- Month create payload: `name=YYYY-MM`,
  `parent_wiki_id=1150372234001008260`, resolved `creator`, and no entry body.
- Child create payload: `name=MM-DD: 中文简述`,
  `parent_wiki_id=<verified/read-back month ID>`, resolved `creator`, and
  `markdown_description=<complete validated child body>`.
- Existing-child update payload: exact child `id` and
  `markdown_description=<validated resulting body>`; preserve its title and
  parent unless the user explicitly requested a move or rename.

Immediately read back every created/updated page. A create response without a
real Wiki ID, a parent mismatch, or a body readback mismatch blocks all later
Wiki comments, TAPD status changes, and test-version writes.

Task ensure bundles write/read back the owner anchor first, then the originating
Task link, with both exact targets displayed in `commentOperations`. Bind the
preview `wikiOwner` using `--expected-owner-type` and `--expected-owner-id`, and
select a shared-page entry with `--entry-repo-url` plus the original branch.
Independent `--mode link` still writes only the originating item comment.
The helper writes or verifies exactly:

```text
提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})
```

Do not append implementation, MR, build, or verification text. Materialize the
comment from the final existing-or-created child ID. The consolidated plan
authorizes this deterministic comment derivation; pass it as the orchestrator
confirmation, check historical comments by canonical Wiki ID, and require
`LINKED|ALREADY_LINKED` without another prompt. A different existing 提测 Wiki
link is a blocking conflict.

## No Wiki

`NO_WIKI` omits every Wiki-related capability and operation. Do not invoke the
Wiki drafter or validator, discover a Wiki target, read/create/update a page,
or write a Wiki-link comment.

## Test deployment and TAPD status

Follow [deployment-and-confirmation.md](deployment-and-confirmation.md).
Resolve `DEPLOY|SKIP`, finish the deployment gate after confirmed test-target containment,
then write Wiki/TAPD data. First reuse any completed selected predecessor only
after [current delivery checks](../../../references/execution-checklist.md#已完成交付的复用);
retain its original `BUILD_SUBMITTED|DEPLOYED|RELEASED` state. A package's
`RELEASED` satisfies only its tooling row, with real available versions/content,
not a consumer deployment. Do not repeat a fulfilled action or replay UNKNOWN.
For a new selected build, `DEPLOY` uses `TRIGGER_ACCEPTED`: verify the expected
target ref/SHA before trigger, require the exact `BUILD_SUBMITTED` queue receipt,
and continue without waiting for the build. Retain the receipt for registration
and report only build submission. A queued or building task is sufficient;
do not require a build number, terminal result, actual checkout or publication
readback before Wiki/TAPD. A missing, rejected or unknown trigger receipt blocks
later writes and must not be retried automatically.
`SKIP` records `SKIPPED_BY_INTENT` and must not claim a published test
environment.

Use the status operation appropriate to the work mode. `INITIAL` writes and
reads `待测试`, its `current_owner` and the test-version field once. On a Bug
transition, assign non-empty `te` (测试人员), otherwise `reporter` (创建人);
missing both blocks. Confirm the selected owner and old assignment fields,
then verify owner readback in the same registration bundle.
`CONTINUE` already in `待测试`
records `SKIPPED_ALREADY_WAITING_TEST` and performs no duplicate status/version
or owner write. Later failure never erases or disguises an earlier successful action.
