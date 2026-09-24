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

The Wiki creation/comment helper is one `WIKI_CREATE_AND_LINK_BUNDLE`
operation: validate its complete authorized inputs once before invocation,
let the script perform each deterministic readback internally, then validate
the final result. Do not re-enter the per-operation process or run a separate
validator between the helper's month, child and comment calls.

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

When the reviewed change is uncommitted, the exact reviewed diff is the commit
payload. After commit readback provides the real SHA, display/validate the push
payload; then display/validate the MR payload; finally display/validate the
merge. Prove current-round commit containment in `origin/develop` before any
TAPD, Wiki, or version write.

## Standard Wiki

Give current work handoffs—not a user-supplied Wiki URL—to
`zan-workflows:drafting-wiki`. Require `terminal_state=VALIDATED` and one target
plan, or `terminal_state=SKIPPED_BY_POLICY` with
`skip_reason=NON_FUNCTIONAL_CONTINUE` and no Wiki operation. Discovery order is
mandatory for the validated path:

1. Read the exact TAPD item and its comments once; page comments only when the
   reported count exceeds the returned page. Reuse a matching linked 提测 Wiki
   ID immediately.
2. Otherwise query `get_wiki(name=YYYY-MM)` and select the result whose
   returned `parent_wiki_id` is root `1150372234001008260`.
3. Query the deterministic child title once and compare returned parent IDs.
   Reuse the unique matching child or plan `MM-DD: 中文简述` creation. Never pass
   unsupported `parent_wiki_id` to `get_wiki`, list all Wiki pages, or repeat
   an unchanged query with a different page size/order.

Include the complete resulting child Markdown and every exact create/update
payload in the consolidated `SubmissionPlan` for the validated path. After the
deployment gate permits later writes, execute only that authorized plan when
the drafter returned `VALIDATED`. For a new child or an existing linked child
whose body needs no patch, call `scripts/ensure-test-wiki.mjs` once. Its minimum
inputs are the full TAPD item URL (or workspace/type/ID) and original source branch; creating a
page also needs creator, approved Markdown file and optionally an approved
title. The script defaults to read-only preview. Pass `--execute` only after
the consolidated plan has been confirmed; this performs the complete
TAPD-detail → comments → linked Wiki or month/child → create/readback →
comment/readback sequence through `tapd-mcp`.
For an orchestrated invocation, materialize the already validated Markdown
in a transient local file outside the repository immediately before the call,
pass it as `--body-file`, and remove it afterward. This file is only the exact
authorized request payload, not a saved workflow record or evidence artifact.

```bash
node skills/submitting-for-test/scripts/ensure-test-wiki.mjs \
  --tapd-url '<full-story-url>' --source-branch '<feature-branch>' \
  --creator <tapd-user> --body-file <approved-wiki-markdown> \
  --wiki-title '<approved-MM-DD-title>' \
  --expect-target CREATE_CHILD --execute --json
```

The example is run from the plugin root. `bug` and `tasks` are also supported.
An existing matching comment needs no creation parameters. The script never
calls `get_wiki` without an exact ID or name, and it stops on ambiguity or
unknown write effects instead of blindly retrying. Its final `LINKED` or
`ALREADY_LINKED` result includes the actual Wiki ID/URL. Do not call
`zan-workflows:linking-tapd-wiki` again on this path. The built-in root Wiki ID
applies only to workspace `50372234`; for another workspace supply its exact
verified `--root-wiki-id` before creation. Replace `CREATE_CHILD` in the
example with the confirmed target action. If the current target action or
month ID differs from the plan, the script stops before writing; pass
`--expected-month-id` when the plan bound an existing month.

For a functional `CONTINUE` that must patch an existing Wiki body, keep the
minimal authorized update path below; the helper does not replace that patch:

- `REUSE_EXISTING`: re-read the child and apply the minimal patch.
- `CREATE_CHILD|CREATE_MONTH_AND_CHILD`: use the helper for the complete
  initial body; it creates and reads back the month only when absent, then
  creates and reads back the child.

Never write the canonical entry body into the month page. For the validated
path, read back the final child, retain its actual ID/URL and original source
branch for `going-live`, and require the expected body including the resolved
status (`未合并` for a business project or `无需上线` for a tooling/library
project) before continuing. A policy skip has no
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

For a functional `CONTINUE` patched outside the helper and still missing a
link, invoke `zan-workflows:linking-tapd-wiki` to write or verify exactly:

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
