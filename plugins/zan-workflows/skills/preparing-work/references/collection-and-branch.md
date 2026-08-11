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

## Result classification

- Missing/unavailable data that can still be supplied: `PENDING`.
- Proven repository mismatch, ref mismatch, or invalid mode combination:
  `BLOCKED`.
- Fully verified and confirmed facts: `READY_FOR_HANDOFF`.
