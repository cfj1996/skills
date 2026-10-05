# Test deployment and confirmation

## Deployment mode

Resolve exactly one mode without creating a separate prompt when user intent is
clear:

| Mode | Trigger | Result requirement |
| --- | --- | --- |
| `DEPLOY` | “发布测试环境”“发布版本”“部署并提测” or a named project policy requiring deployment | Jenkins test deployment must succeed and prove the expected ref/SHA |
| `SKIP` | “直接提测”“跳过发布”“不发测试环境” | Do not call Jenkins; record `SKIPPED_BY_INTENT` |
| `AUTO` | No explicit deployment wording | Use a named project policy when present; otherwise select `SKIP` |

Never silently downgrade an explicit `DEPLOY` request. If the user changes from
`DEPLOY` to `SKIP` before Jenkins is triggered, that instruction itself is the
new authorization; display the updated concise plan but do not ask an extra
yes/no question.

## Consolidated submission authorization

After `ReviewedChange` passes, prepare one complete `SubmissionPlan` before the
first submission write. `submission_phase=PLAN` displays it and returns
`AWAITING_CONFIRMATION`; it must stop before all writes. A later
`submission_phase=EXECUTE` obtains one authorization covering:

- repository, reviewed paths/diff identity, original source branch, target
  `develop`, and commit/push/MR create-or-update/merge intent;
- `STANDARD|NO_WIKI`, exact Wiki target plan and complete rendered body when
  applicable;
- `DEPLOY|SKIP`; for `DEPLOY`, target project, release target, test environment,
  Jenkins Job, expected `develop` ref/SHA identity, version/build parameter,
  test release channel, and purpose;
- deterministic `Bug|Story|Task` Wiki-link comment and final TAPD status/test-version actions;
- status behavior from `work_mode`.

The plan must show the exact profile as `STANDARD（Wiki）` or
`NO_WIKI（无 Wiki 调用）`, never “标准流程”. For `NO_WIKI`, list Wiki discovery,
read, create, update and comment as omitted operations.

Initial Bug checklist confirmation, implementation authorization, “修复完成就
提测”, or a generic confirmation that did not answer this displayed plan does
not authorize submission writes.

The same authorization remains valid while those bound facts are unchanged.
Generated commit SHA, MR ID, Wiki/month/child ID, Jenkins queue/build ID, and
readback values do not require another confirmation when they are deterministic
results of the authorized plan. Validate each complete operation bundle once;
scripts still check and read back every write without another Agent invocation.

Require fresh authorization only when project/repository, reviewed paths or
diff, source/target branch, operation set, Wiki target/body semantics, Jenkins
Job/environment/ref/parameters, TAPD payload, or purpose changes; also require
it for conflict handling or any `master` operation.

## Execution order

Prepare the Wiki draft before confirmation, but defer Wiki/TAPD writes until
the deployment gate is resolved:

```text
Git commit/push/MR -> develop containment
  -> DEPLOY: Jenkins SUCCESS + expected ref/SHA proof
     SKIP: no Jenkins call + SKIPPED_BY_INTENT
  -> Wiki create/update/readback when STANDARD
  -> idempotent Bug/Story/Task Wiki-link comment when applicable
  -> TAPD waiting-test/test-version writes when status policy requires them
```

For `DEPLOY`, resolve the Jenkins Job through workspace project knowledge and
the release-safety policy. Jenkins success alone is insufficient: read back the
build parameters and repository-specific SCM evidence needed to prove it built the expected
`origin/develop` commit. Use that SHA as the release identity when the job has
no semantic version parameter.

Use the [scripted delivery executors](../../../references/scripted-delivery.md).
Preview exact Job/ref/version/channel selections once; pass the unchanged
configuration or explicitly displayed metadata-only binding fingerprints and
consolidated authority into one execution. Use one live workflow session for
preview/execution and later helpers. Actual parameter names and supported
computed-version policies come from the Job adapter; an entire-project
package release scope must be displayed before confirmation.
Queue/build waiting stays in the process with bounded backoff and state-change
progress. Do not repeatedly fetch rules, branch history, console logs or Job
definitions while waiting. The helper checks a symbolic source ref once
immediately before trigger and verifies the actual target SCM revision after
completion. Pin the delivered merge SHA when the Job supports it; a later
external target advancement is a real changed fact and cannot be silently
included. For a package release, retain `releaseKind=package` and actual
`RELEASED` evidence while mapping to the existing `DEPLOYED` gate; report the
package result, not an application-environment deployment.

Deployment states are:

```text
DEPLOYED | SKIPPED_BY_INTENT | FAILED | UNKNOWN | NOT_ATTEMPTED
```

- `DEPLOYED` permits later Wiki/TAPD writes only after `SUCCESS` and ref/SHA
  proof.
- `SKIPPED_BY_INTENT` permits direct提测 but the result must say the test
  environment was not published.
- `FAILED|UNKNOWN` blocks later Wiki/TAPD status/test-version writes; keep the
  Bug's existing status and report any completed Git effects truthfully.

## TAPD status policy

- `INITIAL`: after `DEPLOYED` or `SKIPPED_BY_INTENT`, write/read `待测试` and the
  test-version field exactly once.
- `CONTINUE` while already `待测试`: use
  `SKIPPED_ALREADY_WAITING_TEST`; do not write `修复中`, `待测试`, or the same
  test-version field again.
- `CONTINUE` while still `修复中`: write `待测试` once after the deployment gate
  and Wiki steps complete.
- Any other current state requires an explicit policy/user decision; do not
  guess a transition.

Run `register-test-submission.mjs` once after the other gates pass. The
read-only preview resolves actual workflow labels/transitions and native or
enabled writable custom version fields, checks required current values and
fingerprints metadata. Validate the resolved preview once; do not manually
reinterpret the same mapping. Execute consumes those exact facts and the same consolidated
authorization, combining applicable status/version writes and readback.
No item/metadata rediscovery or private Agent call is needed between fields.
