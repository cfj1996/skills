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

Give the exact target Wiki URL and current work handoffs to
`zan-workflows:drafting-wiki`, consume its complete in-memory result, and
require `terminal_state=VALIDATED`. The drafter reads the target, resolves all
entry fields, locates or creates `# 前端`, calculates the next sequence or
re-test position, and initializes a new entry with `是否上线：否`. Show its
complete resulting Markdown, minimal patch, and exact target, and obtain exact
authorization. Apply only that patch and read back the page before continuing.
Retain the target and original source branch for `going-live`.

For a Bug, write exactly:

```text
提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})
```

Do not append implementation, MR, build, or verification text. Materialize the
comment from the exact existing target Wiki ID and verify it after the Wiki
readback.

## No Wiki

`NO_WIKI` omits every Wiki-related capability and operation. Do not invoke the
Wiki drafter or validator, discover a Wiki target, read/create/update a page,
or write a Wiki-link comment.

## TAPD status and test version

Use the operation appropriate to the TAPD work type. Display and authorize the
exact status and the structured test-version payload. Validate, write, and
read back status first; then validate, publish, and read back the version.
Later failure never erases or disguises an earlier successful write.
