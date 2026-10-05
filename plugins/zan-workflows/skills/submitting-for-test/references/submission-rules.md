# Submission rules

## Common write rule

Prepare one consolidated authorization using
[deployment-and-confirmation.md](deployment-and-confirmation.md). For every
external write inside that unchanged authorized plan:

1. The consolidated plan has already displayed the exact target, payload,
   operation and purpose; do not repeat that display or broad discovery for
   each operation.
2. Re-read only the mutable facts for this specific write immediately before
   execution. Reuse the consolidated authorization when they still match;
   obtain a fresh one only when a bound fact or operation changes.
3. Ask the private validator to check this operation, execute only after it
   passes, and read the result back before proceeding.

The Wiki creation/supplementation/comment helper is one `WIKI_WRITE_AND_LINK_BUNDLE`
operation: validate its complete authorized inputs once before invocation,
let the script perform each deterministic readback internally, then validate
the final result. Do not re-enter the per-operation process or run a separate
validator between the helper's month, child create/update and comment calls.

Likewise, validate one `GIT_DELIVERY_BUNDLE` before the unchanged authorized
commit/push/MR sequence. Local Git checks exact reviewed files/diff and reads
back the derived commit/push; `merge-reviewed-branch.mjs` owns MR/CI/merge
checks and source containment. Validate `JENKINS_TEST_DEPLOY` once before its
one Jenkins executor call. Do not spawn validators for each internal check or
poll; retain actual readbacks for the final `POST_WRITE` validation.

Generated IDs and readbacks that follow the authorized derivation are not
changed plan facts and do not require another prompt. If a bound value changed
or a result cannot be proved, return `BLOCKED`. This
simple version does not retry, recover an interrupted operation, or infer that
an earlier call succeeded.

All TAPD, Wiki, GitLab and Jenkins operations follow the shared
[tool-routing policy](../../../references/tool-routing.md). Browser state is never the default
transport for these systems.

## Git delivery

Use the original fixed business branch as source and exactly `develop` as
target. Keep commits already inherited by the branch separate from the current
reviewed change. Never rebuild on `develop`, substitute `merge/*`, or include
unreviewed paths.

When uncommitted, the exact reviewed diff/file list is the commit payload in
the displayed bundle. Commit/push only that payload with local Git, reuse the
derived SHA, then invoke `merge-reviewed-branch.mjs` once with the confirmed
source/target facts. Do not redisplay/revalidate push, MR and merge merely
because the stage changed. Prove current-round containment in
`origin/develop` before any TAPD, Wiki or version write. A real MR metadata
change or conflict gets its own exact plan; no history rewrite or duplicate MR.

## Standard Wiki

Give current work handoffs—not a user-supplied Wiki URL—to
`zan-workflows:drafting-wiki`. Require `terminal_state=VALIDATED` and one target
plan, or `terminal_state=SKIPPED_BY_POLICY` with
`skip_reason=NON_FUNCTIONAL_CONTINUE` and no Wiki operation. Discovery order is
mandatory for the validated path:

1. Read the exact TAPD item and comments once, including detail-only 提测 Wiki
   links. If count is absent, continue full comment pages until a short page;
   with count, require the complete reported set. Repeated/inconsistent pages
   block. Reuse a matching linked Wiki ID immediately, including older months.
2. Otherwise query `get_wiki(name=YYYY-MM)` and select the result whose
   returned `parent_wiki_id` is root `1150372234001008260`.
3. Query the deterministic child title once and compare returned parent IDs.
   Reuse the unique matching child or plan `MM-DD: 中文简述` creation. Never pass
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
`当前版本：canary|latest` for a tooling/library project)
before continuing. For tooling `DEPLOY`, before the Wiki write, require the
successful release result's actual channel to match the draft: `canary` maps
to `canary`, `official` to `latest`. A planned parameter or
develop/master merge alone is insufficient. Under `SKIP`, apply the existing
release-evidence/preservation rules in `drafting-wiki`; do not default to canary
or add deployment queries. A policy skip has no
child write/readback or Wiki update,
but retains any existing target readback needed by an explicitly requested
`going-live` step.

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
Resolve `DEPLOY|SKIP`, finish the deployment gate after develop containment,
then write Wiki/TAPD data. `DEPLOY` requires Jenkins success and expected SHA
proof; `SKIP` records `SKIPPED_BY_INTENT` and must not claim a published test
environment.

Use the status operation appropriate to the work mode. `INITIAL` writes and
reads `待测试` plus the test-version field once. `CONTINUE` already in `待测试`
records `SKIPPED_ALREADY_WAITING_TEST` and performs no duplicate status/version
write. Later failure never erases or disguises an earlier successful action.
