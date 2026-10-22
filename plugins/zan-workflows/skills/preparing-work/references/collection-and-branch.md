# Collection and branch selection

## TAPD collection

Fetch the supplied item read-only. Prefer direct TAPD fields over summaries,
retain contradictory claims, and cite the source for each material conclusion.
Classify confidence independently for context, project, and scope as
`HIGH|MEDIUM|LOW`, with reasons and missing evidence.

No collected data is written to a raw file. It remains input to the current
in-memory definition only.

## Project selection

When `fixed_project` or `fixed_repo_path` is supplied, verify exact equality.
Then verify actual canonical path, Git root, and origin remote. A matching
directory name or current working directory is not proof. Multiple plausible
projects require a user choice before handoff.

## Branch modes

### New branch author

When deriving an author segment for a new requirement or Bug branch, use the
current tool's user-level prompt `USER_NAME`, then the target repository's
Git `user.name`, then the OS username. Preserve Chinese names; do not use an
email prefix. Use the shared
[branch-owner resolver](../../developing-requirement/scripts/resolve-branch-owner.mjs)
with `--cwd <repository-root>` and `--user-name <USER_NAME>` when present,
or `--user-prompt-file <current-tool-user-prompt>` for its exact configured file.
Do not read another tool's prompt or infer a TAPD assignee from this identity.
An explicitly supplied exact branch and `CONTINUE` retain their original identity.

### New branch names

Read the applicable workspace `git-safety.md` before every branch-creation
proposal, including repository maintenance and tooling work. Its naming rule is:

| Work identity | Format |
| --- | --- |
| Verified TAPD Story/Task/Bug | `<prefix>/<branch-owner>.<MMDD>.<短ID>.<中文描述>` |
| No associated TAPD item | `<prefix>/<branch-owner>.<MMDD>.<中文描述>` |

Use `feature` for features/maintenance and `fixbug` for defect repair. Keep the
same owner resolution, Asia/Shanghai proposal date and Chinese description in
both formats; omit only the ID segment for non-TAPD work, never fabricate one.
Check the complete format and Chinese description, then run
`git check-ref-format --branch <name>` before creation. Git's ref check alone
does not enforce the naming convention. Existing branches keep their identity.
`merge/*` follows the separate authorized conflict-flow naming.

The non-TAPD naming format applies to ordinary repository work; it does not
remove this skill's exact TAPD URL requirement or allow a fake work item.

### Continue gate

Run this before `AUTO|CREATE|USE_EXISTING`. Classify the work as `CONTINUE`
when the same TAPD item is resumed after incomplete work, test feedback,
post-deployment reproduction, or an omitted entrypoint is discovered.

Recover the original source branch in this order:

1. current-conversation `TapdWorkDefinition`, `ReviewedChange`, or
   `TestSubmissionResult`;
2. an existing提测 Wiki `代码分支名`;
3. the source branch of a prior MR for this TAPD item;
4. an exact branch in TAPD comments;
5. matching verified local/remote `feature/*` or `fixbug/*` refs.

One mutually consistent candidate selects `USE_EXISTING`. No or competing
candidates are `PENDING` with their evidence. Never derive a second branch
name, append “后续修复”, or use `CREATE` for `CONTINUE`. If the original remote
branch was deleted, require an explicit recovery decision rather than
recreating it from `develop`.

### `CREATE`

Verify that the exact `fixed_branch` is absent locally and remotely. Return a
planned create action for `implementing-work`; do not create it here. Resolve
and verify the exact base ref and current SHA from explicit input or a named
workspace policy, and include both in the handoff. Missing or unavailable base
evidence is `PENDING`; never guess the base.

### `USE_EXISTING`

Verify the exact `fixed_branch` exists in the selected repository. If both
local and remote refs exist, require equal SHAs. Select the exact branch.

This mode is independent of the current TAPD item. The branch may be empty,
may contain earlier Bugs, or may have been created for a larger feature. Do not
require Bug-associated commits, `raw.*`, Wiki content, generated test evidence,
or a previous workflow result.

### `AUTO`

Inspect only the exact `fixed_branch`. Choose `USE_EXISTING` when its existing
ref is verified; choose `CREATE` when local and remote absence is verified.
Never search for or substitute another branch.

`AUTO` may choose `CREATE` only for `INITIAL`. It must not convert `CONTINUE`
into `CREATE` merely because a newly derived branch name is absent.

## Result classification

- Missing/unavailable data that can still be supplied: `PENDING`.
- Proven repository mismatch, ref mismatch, or invalid mode combination:
  `BLOCKED`.
- Fully verified and confirmed facts: `READY_FOR_HANDOFF`.
