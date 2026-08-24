# Submission rules

## Common write rule

For every external write:

1. Read the current target facts.
2. Display the exact target, payload, operation, and purpose.
3. Obtain explicit authorization when required.
4. Re-read the facts immediately before execution.
5. Ask the private validator to check that one planned operation.
6. Execute only after validation passes.
7. Read the result back before proceeding.

If any value changed or a result cannot be proved, return `BLOCKED`. This
simple version does not retry, recover an interrupted operation, or infer that
an earlier call succeeded.

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
plan. Discovery order is mandatory:

1. Read TAPD details and all historical comments; reuse any linked 提测 Wiki.
2. Otherwise inspect root `1150372234001008260`, the current `YYYY-MM` month,
   and related children by TAPD ID/short ID/original branch.
3. Reuse one related child, or plan `MM-DD: 中文简述` creation. Create the month
   first only when absent.

Show the complete resulting child Markdown and every exact create/update
payload, then obtain authorization. Execute only the plan:

- `REUSE_EXISTING`: re-read the child and apply the minimal patch.
- `CREATE_CHILD`: create the child under the verified month with the complete
  initial body.
- `CREATE_MONTH_AND_CHILD`: create/read the month under `提测文档`, then use its
  real ID in a separately displayed/authorized child create payload.

Never write the canonical entry body into the month page. Read back the final
child, retain its actual ID/URL and original source branch for `going-live`, and
require the expected body including `是否上线：否` before continuing.

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

For a Bug, write exactly:

```text
提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})
```

Do not append implementation, MR, build, or verification text. Materialize the
comment from the final existing-or-created child ID. If creation produced the
ID during this run, display and authorize the materialized comment after the
child readback.

## No Wiki

`NO_WIKI` omits every Wiki-related capability and operation. Do not invoke the
Wiki drafter or validator, discover a Wiki target, read/create/update a page,
or write a Wiki-link comment.

## TAPD status and test version

Use the operation appropriate to the TAPD work type. Display and authorize the
exact status and the structured test-version payload. Validate, write, and
read back status first; then validate, publish, and read back the version.
Later failure never erases or disguises an earlier successful write.
