# Test deployment and confirmation

## Wiki choice

Reuse a still-valid explicit choice from the current checklist; otherwise use
`STANDARD` by default, including `AUTO`; ordinary repair/development defaults
to test delivery with merge, test build/deploy and Wiki all selected. Respect
explicit implementation-only, plan-only, branch-only or disabled choices.
Show “是否需要提测 Wiki：需要/不需要” with merge and test-build
choices in the same complete checklist, without a separate preference prompt.
Before confirmation, label it 确定清单; approved current content is 执行清单.
Its overview lists all selected projects. Show merge/deployment per project,
with one Story/Bug Wiki choice and the applicable multi-project template.
For `STANDARD`, show the canonical template preview before the implementation
confirmation. A confirmed complete execution checklist may authorize filling
that template from reviewed implementation/actual delivery facts and writing
the scoped final body/patch. The template alone grants no authority and cannot
claim future success. Standalone submission still displays its complete body
and operation plan for its own confirmation.

## Deployment mode

Resolve exactly one mode without creating a separate prompt when user intent is
clear:

| Mode | Trigger | Result requirement |
| --- | --- | --- |
| `DEPLOY` | “发布测试环境”“发布版本”“部署并提测” or a named project policy requiring deployment | Jenkins must accept the exact confirmed test build; continue on `BUILD_SUBMITTED` without waiting |
| `SKIP` | “直接提测”“跳过发布”“不发测试环境” | No build/deploy/parameter/poll calls; allow only missing canonical Wiki Job metadata lookup; record `SKIPPED_BY_INTENT` |
| `AUTO` | No explicit override within selected test delivery | Select `DEPLOY`; preserve an explicit `SKIP` or overall non-delivery scope |

Never silently downgrade an explicit `DEPLOY` request. If the user changes from
`DEPLOY` to `SKIP` before Jenkins is triggered, update the choice and show the
complete current plan again, then wait for its confirmation; do not treat the
changed option as approval of an undisplayed operation set. Retain actual
completed effects rather than replaying them. This uses the same confirmation
question, not a separate deployment preference prompt.

## Consolidated submission authorization

Follow [execution-checklist confirmation reuse](../../../references/execution-checklist.md#执行清单的确认复用).
After `ReviewedChange` passes, prepare one complete `SubmissionPlan` before the
first submission write. `submission_phase=PLAN` is always read-only and returns
`AWAITING_CONFIRMATION`; this technical state does not itself require another
human turn. There are two authorization paths:

- From `fixing-bug`/`developing-requirement`: consume the complete execution
  checklist, actual human confirmation and current handoffs. Compare each
  selected operation and derived fact to that scope, validate the accurate
  plan and call `submission_phase=EXECUTE` directly when fully covered. Do not
  redisplay an unchanged full plan or ask “是否执行正式提测计划”.
- Standalone skill invocation: display the complete exact plan/body, ask for
  its confirmation and stop. A later matching human confirmation permits
  EXECUTE. Merely mentioning a prior repair, supplying a true flag or having
  implementation results does not establish orchestrated authority.

The applicable confirmed checklist/standalone plan must cover:

- repository, reviewed paths/diff identity, original source branch, verified
  test target (`dev` or `develop`), and commit/push/MR create-or-update/merge intent;
- `STANDARD|NO_WIKI`, owner/hierarchy/entry scope, template and evidence-based
  completion rule, or the exact final body/patch when confirmed standalone;
- `DEPLOY|SKIP`; for `DEPLOY`, target project, release target, test environment,
  Jenkins Job, exact confirmed test-target ref/SHA identity, version/build parameter,
  test release channel, and purpose;
- deterministic `Bug|Story|Task` Wiki-link comment and final TAPD status/owner/
  test-version actions, including a bounded version-text derivation rule;
- status behavior from `work_mode`.

Exact post-review diff/SHA, final Wiki body/patch/hashes, release parameters
and metadata bindings must still be calculated and validated before writing.
An approved business scope is not a guessed future diff or permission to
deploy unrelated target commits. Keep the exact reviewed/source containment
and mutable-fact checks; populate derived technical fields only from evidence.

The plan shows “需要提测 Wiki” or “不需要提测 Wiki”, mapped internally to
`STANDARD|NO_WIKI`; do not show only “标准流程” or raw profile codes. For `NO_WIKI`, list Wiki discovery,
read, create, update and comment as omitted operations.

Repair-only/implementation-only confirmation, “修复完成就提测”, defaults, or an
unconfirmed checklist do not authorize missing delivery operations. If the
main execution checklist already explicitly covers those operations, reuse
it; do not reject it merely because its confirmation preceded implementation.

The same authorization remains valid while scope and authorized semantics
remain unchanged. Generated commit SHA, MR ID, Wiki/month/child ID, Jenkins
queue/build ID, verified implementation/results and template completion do not require another confirmation
when they follow the authorized derivation. Pure technical binding refreshes
still stop the stale write and require a fresh accurate validated plan; they
do not automatically require another human approval. Validate each complete operation bundle once;
scripts still check and read back every write without another Agent invocation.

Require fresh authorization when project/repository, business scope or key
approach, source/target branch, operation set, Wiki owner/body semantics,
Jenkins Job/environment/channel or parameter semantics, TAPD target/personnel,
or purpose extends/changes the approved scope. Automatic A → C → B conflict
handling consumes the conditional scope already included in the main checklist;
otherwise show and confirm that exact additional scope. A `master` operation
requires explicit source/target/purpose authority and is never inferred from
test delivery. Preserve separately required cleanup authority.
When those facts or the merge/Wiki/deployment choices change, re-display the
whole current checklist and submission operation set, including applicable Wiki
body/patch, before asking for confirmation. A changed preference alone does not
authorize remaining writes; an unchanged affirmative answer consumes the valid
plan without another loop. Follow the shared
[revised-checklist rules](../../../references/execution-checklist.md#用户调整后的重新展示).

## Execution order

Prepare and validate the exact Wiki draft before its write, but defer Wiki/TAPD writes until
every included repository's deployment gate is resolved:

```text
Each repository: Git commit/push/MR -> confirmed test-target containment
  -> DEPLOY: confirmed ref/SHA + accepted exact Jenkins queue (BUILD_SUBMITTED)
     SKIP: no Jenkins deployment call + SKIPPED_BY_INTENT
All required repositories pass:
  -> one shared Wiki create/update/readback when STANDARD
  -> idempotent Bug/Story/Task Wiki-link comment when applicable
  -> one Bug registration with waiting-test/test-version writes when required
```

For `DEPLOY`, resolve the exact Job and preview its parameters/fingerprints once.
Use the [scripted delivery executors](../../../references/scripted-delivery.md)
with `completionMode=TRIGGER_ACCEPTED` in both PLAN and EXECUTE, reusing the
unchanged consolidated authority. The helper refreshes symbolic ref/SHA before
triggering once; pin the delivered merge SHA when supported. A changed source
blocks rather than silently including later commits. Package adapter/version/
whole-project scope checks remain required before submission.

An accepted response must identify the exact Job and a valid queue URL/ID on
the same instance. Retain the helper's `BUILD_SUBMITTED` receipt, including
submitted params and planned source identity, in `prerequisites.deploymentReceipt`.
Do not poll the queue/build, wait for startup or terminal SUCCESS, or fetch logs.
Unknown/missing receipts block later writes; do not retry the trigger. Report
“构建任务已提交” with its queue link. Actual deployment, checkout and package
versions remain unverified; a source SHA must never become a package version.
For tooling Wiki entries preserve an evidenced current channel or use
`当前版本：待发布` if none exists; do not infer publication from queue acceptance.
Standalone/official releases and go-live keep `BUILD_TERMINAL` and their full
source/publication verification; this shortcut belongs only to test submission.

Deployment states are:

```text
BUILD_SUBMITTED | DEPLOYED | SKIPPED_BY_INTENT | FAILED | UNKNOWN | NOT_ATTEMPTED
```

- `BUILD_SUBMITTED` permits later Wiki/TAPD writes with the exact queue receipt.
- `DEPLOYED` permits later Wiki/TAPD writes only after `SUCCESS` and ref/SHA
  proof.
- `SKIPPED_BY_INTENT` permits direct提测 but the result must say the test
  environment was not published.
- `FAILED|UNKNOWN` blocks later Wiki/TAPD status/test-version writes; keep the
  Bug's existing status and report any completed Git effects truthfully.

## TAPD status policy

- `INITIAL`: after `BUILD_SUBMITTED`, `DEPLOYED` or `SKIPPED_BY_INTENT`, write/read `待测试`, the
  waiting-test owner and the test-version field exactly once.
- `CONTINUE` while already `待测试`: use
  `SKIPPED_ALREADY_WAITING_TEST`; do not write `修复中`, `待测试`, or the same
  test-version field again; leave the current owner unchanged.
- `CONTINUE` while still `修复中`: write `待测试` once after the deployment gate
  and Wiki steps complete, assigning its waiting-test owner at the same time.
- Any other current state requires an explicit policy/user decision; do not
  guess a transition.

Run `register-test-submission.mjs` once after the other gates pass. The
read-only preview resolves actual workflow labels/transitions and native or
enabled writable custom version fields. For each Bug status transition, set
`current_owner` to non-empty `te` (测试人员), otherwise `reporter` (创建人).
Missing both blocks; never fall back to the old developer/owner. Bind the
selected owner and old `te`/`reporter`/`current_owner` values; changes before
execution require a fresh plan. The resolved owner satisfies a required
`current_owner` field; other required fields still need existing values.
The preview checks required values and
fingerprints metadata. Validate the resolved preview once; do not manually
reinterpret the same mapping. Execute consumes those exact facts and the same consolidated
authorization, combining applicable status/owner/version writes and readback.
Owner readback must match the selected TAPD account(s). A mismatch blocks
with actual completed effects and no automatic retry or rollback.
No item/metadata rediscovery or private Agent call is needed between fields.
