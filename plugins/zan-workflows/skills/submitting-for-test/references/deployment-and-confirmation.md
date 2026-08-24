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
first submission write. Display it once and obtain one authorization covering:

- repository, reviewed paths/diff identity, original source branch, target
  `develop`, and commit/push/MR create-or-update/merge intent;
- `STANDARD|NO_WIKI`, exact Wiki target plan and complete rendered body when
  applicable;
- `DEPLOY|SKIP`; for `DEPLOY`, target project, release target, test environment,
  Jenkins Job, expected `develop` ref/SHA identity, version/build parameter,
  test release channel, and purpose;
- deterministic Wiki-link comment and final TAPD status/test-version actions;
- status behavior from `work_mode`.

The same authorization remains valid while those bound facts are unchanged.
Generated commit SHA, MR ID, Wiki/month/child ID, Jenkins queue/build ID, and
readback values do not require another confirmation when they are deterministic
results of the authorized plan. Validate and read back every operation anyway.

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
  -> deterministic Bug Wiki-link comment when applicable
  -> TAPD waiting-test/test-version writes when status policy requires them
```

For `DEPLOY`, resolve the Jenkins Job through workspace project knowledge and
the release-safety policy. Jenkins success alone is insufficient: read back the
build parameters/changes/console evidence needed to prove it built the expected
`origin/develop` commit. Use that SHA as the release identity when the job has
no semantic version parameter.

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
