# Scripted delivery

This reference covers planned delivery bundles and the full release flow.
Standalone daily dev/test project builds use the direct MCP flow in
[running-release](../skills/running-release/SKILL.md#daily-project-build); they
do not require a workflow session, release PLAN or these executors. Production
releases and all package publications retain the complete flow below.

Use one confirmed in-memory plan per operation bundle. Scripts receive JSON
through stdin and return JSON on stdout; do not save workflow plan/result
files. `--execute` is an execution switch, not evidence of human authorization.
The caller must first bind the actual human confirmation to the current exact
plan: reuse a main entry's complete execution checklist after scope comparison,
or obtain the standalone skill's own plan confirmation. Follow
[confirmation reuse](execution-checklist.md#执行清单的确认复用); a PLAN result or
`confirmed=true` alone is not evidence, and internal preview/execution calls do
not require another human turn when the main authorization already covers them.

## Compose stable checklist operations

Use the current [execution checklist](execution-checklist.md#围绕同一清单编排)
and existing handoffs as scope/authority. Prepare the exact technical inputs
once, then compose a stable, already-authorized segment with the exported
helpers or `WorkflowSession.dispatch()` inside one controlled Node/tool call.
Await and check each real result before deriving the next input; e.g. use the
verified delivered target SHA for the selected build, never a guessed future
merge ID. Stop that segment on a mismatch, missing prerequisite or unknown
effect and return the actual completed effects and first gap to the caller.

Do not return to the model merely to rediscover the plan between deterministic
GETs, fields or unchanged bundles. This is composition of existing capabilities,
not a new JSON execution language or end-to-end engine. Do not blindly pipeline
future requests, bypass each helper's PLAN/confirmation/live checks, or put a
still-unapproved business choice inside the batch. Finish the session before
human/reviewer waits and after the final selected operation.

An explicitly authorized package/test-service predecessor may be executed by
its owning Git/release helpers before the complete work is REVIEWED, under the
shared dependency-output rules. Its provider code review and all exact operation
gates remain mandatory; neither formal submission nor parent completion follows
from that partial output. Verify real package/service availability before
dependent integration. An UNKNOWN write never permits replay or a new session
to bypass the original write barrier.

## Reuse one live MCP session

For successive previews/executions/helpers, start
`volta run --node 22.20.0 node scripts/workflow-session.mjs --allow-execute --json` with stdin kept open
(one terminal/exec session). Send one JSON line per request: unique string
`id`, `action=merge|release|wiki|registration|closeout|job`, `phase=PLAN|EXECUTE`
and the helper's `input` object. Read its response before sending the next
line through the same process. Input names match the exported helpers,
including the Wiki helper's parsed camelCase inputs.

PLAN overrides input `execute=true`. EXECUTE needs the startup capability
flag plus exact current-plan `confirmed=true`; the flag is not business
authorization. Closeout and Job lookup reject EXECUTE. Requests run sequentially; a failed
or unknown execution blocks later writes while allowing read-only inspection.
Duplicate IDs are rejected, not replayed. No workflow file, effect ledger or
interruption recovery exists.

A failed PLAN with no mutation attempt can be corrected and previewed again
under a new ID. It does not poison execution or grant write authority. The
no-retry rule applies to failed/unknown mutations; never use it to forbid
collecting missing evidence or fixing a read-only decoder.

The pool starts/initializes each needed MCP once and shares its connection
and tool catalog. Ref/item/metadata/confirmation/build facts are not cached;
their checks remain fresh. Failed connections stay failed without a relaunch.
The default idle limit is 5 minutes. Reuse a session for consecutive operations;
finish it before a long human/reviewer wait or immediately after the final
selected operation, rather than leaving its MCP processes open for later prose.
Standalone helper CLIs remain available for isolated calls or after a session ended.

Send this read-only control request and require its actual close receipt:

```json
{"id":"finish","action":"finish","phase":"PLAN","input":{}}
```

`SESSION_CLOSED` with `cleanupComplete=true` confirms process cleanup, not business
delivery success. `CLEANUP_FAILED` is nonzero and cannot be reported as clean exit.
The close receipt includes MCP process-group checks, `executionSettled`, tracked
local-child exit checks, and `requestCount/busyMs/idleMs/shutdownMs/lifetimeMs`.
Unknown or uncooperative work keeps the cleanup result unverified; do not infer
success or replay any earlier mutation. Verified group cleanup applies to
macOS/Linux; other platforms report their unverified cleanup scope explicitly.
Programs deliberately escaping the owned process group are outside that proof.

Optional startup flags, in seconds:

- `--idle-timeout-seconds N`: default 300; input gaps do not consume a request's budget.
- `--request-timeout-seconds N`: override the whole-request budget. Otherwise ordinary
  requests use 180 seconds; EXECUTE merge/terminal-release requests retain the original
  CI/build wait budget plus 180 seconds for surrounding checks (default total 33 minutes).
  `TRIGGER_ACCEPTED` test submission uses the ordinary budget and never waits for a build.
- `--shutdown-timeout-seconds N`: default 2, at most 30; bounded cleanup/exit verification.

Structured stderr events identify `REQUEST_STARTED` and `REQUEST_FINISHED` by `requestId`,
action and phase, with ISO timestamps, deadline, active elapsed time and preceding
idle time. The final lifecycle event reports cleanup and totals. Stdout remains one
request/result JSON line with `id` and `result`. Diagnostics never use that top-level
`id`, so ID-based response selection also works when a PTY combines stdout/stderr.
Match the `id` plus `result` envelope, not a state-word substring from diagnostics.
Continue draining output until the close receipt/exit; waiting for a PTY process
without consuming its output can block its writer on a small terminal buffer.
Events do not log request bodies, credentials or Wiki content.
The CLI also copies whitelisted lifecycle metadata to the dedicated local
[execution feedback recorder](execution-feedback.md), linked by an explicit
ZAN_WORKFLOWS_RUN_ID or marked DELIVERY_ONLY. Recording is best-effort and
never shares the stdout/onEvent failure gate. This narrow diagnostic exception
stores no raw plans/results, write authority, effect ledger or recovery state;
feedback upload remains explicitly user-triggered. Process lifetime includes
idle/cleanup and must not be presented as one request's execution time.

A request deadline aborts connected MCP/HTTP/polling and scoped local checks, closes
the session, and prevents late responses from starting later writes. An interrupted
EXECUTE returns `UNKNOWN`, `writes=null`; PLAN reports a blocked read-only operation.
Known public MR/queue/build/Wiki/work-item identities survive the timeout, including helper
facts settled within the same bounded close. Progress-only identifiers remain
under `observedIdentifiers`; they prove neither write completion nor readiness.
Do not treat retained identities as a successful receipt or permission to retry.
First inspect actual remote effects, never automatically retry or restart mutations.
Idle expiry only closes resources; reopening for further work must refresh actual facts
and consume the existing accurate handoff/authority, not restore hidden session state.

Wait for the single `SESSION_READY` event before sending input. On a PTY the
session switches only its own stdin to raw mode, preventing canonical-line
truncation and input echo. Long Chinese JSON is accepted up to 256 KiB;
oversized/malformed requests stop before helper calls. Ctrl-C terminates the
session; Ctrl-D ends its input after the current bounded request. EOF, finish,
signals and idle shutdown restore its original
TTY mode. Do not locate another `/dev/ttys*` or run manual `stty` commands.
The pinned helper runtime is independent of a business project's older Node
version; keep that project's own runtime for its build/install commands.

## Git delivery

`scripts/merge-reviewed-branch.mjs` owns exact MR discovery/reuse/create,
CI waiting, fresh ref/approval checks, one merge and source containment.
It uses `gitlab-mcp`; local Git only checks repository identity and fetches/
verifies ancestry. It does not commit, push, edit MR text, approve an MR,
rewrite history or delete branches. Resolve all reviewed diff/commit facts
before invoking it. If an existing MR title/body really needs an update,
include that explicit update in the plan before this executor; do not create
another MR just to update metadata.

Required plan facts: `projectId`, `repositoryPath`, exact `originUrl`, original
`sourceBranch`, `targetBranch`, `purpose`, current `reviewPassed=true`, explicit
`pipelineRequired` and new-MR title/description when applicable. Preview binds
`sourceSha`, `targetSha` and any exact `mrIid`. Execute also needs the matching
confirmation (`confirmed=true`). Test-delivery targets are the verified
`develop|dev`; default-delivery targets `master|main` must both match the
project's actual default branch during preview and again before merging.
A default-branch change invalidates the plan even when its old ref has not moved.
For test targets only, an AUTO/MANUAL call with no open MR first checks whether
the reviewed source is already contained in the current target. Equal live
tips or fetched ancestry return `state=VERIFIED`,
`operation=VERIFY_CONTAINMENT_ONLY`, `containment=true` and writes=0, without
creating an MR, waiting for CI or claiming an MR merge. `deliveredSha` and
`observedTargetSha` are the verified test-target tip. An unavailable check or
changed target blocks before writing; an evidenced non-containing target may
continue the already-authorized ordinary MR path.

When the checklist disables merging or the developer already delivered the
change, call `mergeMode=CONTAINMENT_ONLY` with `execute=false`, the exact reviewed
source SHA and dev/develop target. It needs only project/target read tools and
never falls through to an MR write if containment is absent. It can verify
the immutable source even if its remote branch is gone. It is a Git delivery
receipt for test submission, not default-branch MR/cleanup evidence, and does
not clear an outstanding exact-MR manual handoff in a workflow session.
Source remains the original
`feature/*|fixbug/*`; conflict branches use the shared
[A → C → B flow](conflict-merge.md), reusing the main checklist's conditional
resolution authority or obtaining standalone confirmation. Temporary cleanup
requires its own exact covered resources; automatic resolution alone grants none.

```bash
node scripts/merge-reviewed-branch.mjs --json <<'PLAN'
{
  "projectId": "<verified-project-id>",
  "repositoryPath": "<exact-repository-root>",
  "originUrl": "<verified-origin>",
  "sourceBranch": "feature/<original-branch>",
  "targetBranch": "develop",
  "title": "feat: <reviewed-change>",
  "purpose": "<delivery-purpose>",
  "reviewPassed": true,
  "pipelineRequired": true
}
PLAN
```

Copy the complete preview and confirmed authority into a later stdin call
with `--execute`. For an uncommitted submission, the one `GIT_DELIVERY_BUNDLE`
validation first binds the exact local diff/file list and commit message.
Commit and push with ordinary local Git, reading back their deterministic
results. The generated source SHA goes into this same authorized merge plan;
it is not a reason to repeat review, display or confirmation. The script
still checks it against the remote branch immediately before merge.

Approval checks accept rule arrays and complete legacy counters. The connected
MCP can normalize `/approvals` and omit its counters/rules. For that recognized
summary, use a same-instance GET-only metadata check to verify the edition;
never infer zero required approvals from missing fields or a 404. Community
Edition approvals are optional, so an unapproved summary is recorded as
`COMMUNITY_OPTIONAL`, while server mergeability, CI and discussion gates remain.
Enterprise Edition reads the exact MR's raw `/approvals` to recover counters
or its satisfied-requirements boolean. Pending approvals, invalid data,
unknown editions and permission/connection failures stop. Report the actual
`approvalEvidence`; no approval write or forced merge exists. Refresh refs
and exact MR readiness after this evidence check, at the merge boundary.

The narrow GET fallback fills fields missing from MCP and reads only
`/metadata` and this project's exact MR `/approvals`, using existing credentials
without redirects. It performs no remote writes. Edition semantics follow
[GitLab approvals API](https://docs.gitlab.com/api/merge_request_approvals/)
and [metadata API](https://docs.gitlab.com/api/metadata/).

CI polls only the exact MR. It never triggers/retries CI, auto-approves,
resolves conflicts, enables source deletion, squashes or treats pending
auto-merge as completion. Ref changes, discussion/approval blockers, failed
CI, conflicts and unknown outcomes stop. `MERGED` requires merged readback
and source ancestry in the fetched target. `deliveredSha` is the actual merge
commit or fast-forward source; `observedTargetSha` may be a later branch tip.
Use the intended delivered revision for deployment and explicitly reconcile
any later target advancement rather than passing the source branch SHA as
though it were the target's merge commit.

### Developers without merge permission

Bind `mergeMode=MANUAL` in the preview when merge permission is known absent.
Execution creates/reuses the exact MR and returns `AWAITING_MERGE`, `mrUrl`,
`reason`, completed effects and a read-only `resumePlan`. `AUTO` also hands off
on explicit `user.can_merge=false` or merge-call HTTP 403 after exact readback;
it never retries a denied merge. Read/approval/creation failures, other HTTP
errors and unknown outcomes stay blocking.

Every awaiting result includes `userAction` with `type=CONTACT_MERGER`,
`message` and `resumePrompt`. Show the message to the user: contact a colleague
with permission to review and merge the named source into the exact target,
using the included MR link. Preserve this reminder even if the pending Wiki
patch fails. Manual mode describes a planned handoff; only explicit denial
claims missing permission. A still-open VERIFY_ONLY result repeats the reminder
without writes. No enterprise WeChat notification or team lookup is involved.
The resume prompt is `已合并，继续上线` for master/main and
`已合并，继续交付` for develop/dev.

Show `等待有权限人员合并` alongside that action; after the resume reply, invoke
`resumePlan` without `--execute`, or session `action=merge`, `phase=PLAN`,
`mergeMode=VERIFY_ONLY`. It uses no mutation tool and requires exact IID/source
SHA, required CI and fetched target containment before `MERGED`. A deleted
source branch is acceptable only with that proof; an open MR stays waiting.
Preserve the actual delivered revision and refresh mutable facts before
dependent actions.

The live session retains pending MR bindings in memory and blocks subsequent
`EXECUTE` actions until all exact pending MRs have verified completion. PLAN
reads remain available; this normal handoff does not poison the session as a
failed write. The caller retains completed steps and runs only unfinished
authorized actions. No durable recovery record, permission/account escalation
or automatic background monitor is added.

### 待合并 Wiki 状态

业务项目上线时，将以下 `pendingWiki` 放入完整 merge PLAN 并展示两个
条件路径的正文补丁：`未合并 → 已合并` 和 `未合并 → 待合并 → 已合并`。
一并确认后，session 的 merge EXECUTE 仅在真实 AWAITING_MERGE 时调用
`scripts/pending-merge-wiki.mjs`，不另开任意 Wiki 写入通道。

```json
{
  "pendingWiki": {
    "profile": "STANDARD",
    "serviceType": "BUSINESS",
    "workspaceId": 12345,
    "wikiId": "<existing-wiki-id>",
    "parentWikiId": "<verified-parent-id>",
    "wikiTitle": "<exact-title>",
    "entryHeading": "<exact-numbered-project-entry-heading>",
    "beforeBodySha256": "<sha256-of-approved-current-markdown>",
    "afterBodySha256": "<sha256-of-approved-pending-markdown>"
  }
}
```

预览时调用纯函数 `pendingWikiPatch(body, {entryHeading, sourceBranch, originUrl})`
取得最小补丁结果，保留全文并计算指纹，不写文件。该函数定位条目标题、
仓库和分支，允许同页其它项目共用分支，保留其它条目和原始换行。
多项目共用一页时，按已展示顺序为每个补丁计算其准确前/后正文指纹；不能
让后一个项目带旧整页指纹覆盖前一个项目的状态。未预览的组合变化重新确认。

运行时只读复核准确 MR 的打开状态、默认目标、仓库和 source SHA，再读取
准确 Wiki ID/父页/标题/正文并只修改该条目的唯一状态。成功返回
UPDATED_PENDING_MERGE，已有准确批准的待合并正文返回 ALREADY_PENDING_MERGE；
不写评论、工作项状态或工具版本。NO_WIKI、TOOLING 不进行该业务状态写入。
失败时 session 保留 AWAITING_MERGE 和 pendingWiki 的独立 BLOCKED 结果，
并阻止继续写入；未知结果不重试。普通后续 EXECUTE 仍受 pendingMerges 阻断。

独立 Git helper 不写 TAPD；调用方使用同一函数
`markPendingMergeWiki(gitlabCall, tapdCall, pendingWiki, mergeResult, {execute:true, confirmed:true})`
处理真实待合并结果，沿用完全相同的预览/授权与读回规则。原清单未授权该
补丁时先展示并确认。人工合并后仍只读 VERIFY_ONLY 核实原 MR，确认 source
包含后，以待合并读回的准确正文指纹执行已授权的最终 已合并 补丁；不能
拿最初的未合并正文指纹覆盖中间结果。
同页其它条目共用分支时，最终 update-only helper 同时传入
`entryHeading` / `entryRepoUrl`（CLI 为 `--entry-heading` / `--entry-repo-url`），
成对限定准确项目条目；旧的单条目调用保持兼容。它仍要求已确认完整正文和
原正文指纹，且不读取或写入评论/工作项。

## External dependencies and Mock safety

Apply [external dependencies](external-data-dependencies.md) and [Mock rules](mock-development.md)
using the same Plan/brief records. Before any selected delivery mutation, run the read-only
`scripts/mock-safety.mjs` gate, including standalone helpers, daily builds and team MR review.
NO_WIKI, SKIP, already-waiting registration or Git containment do not waive it.

The helper accepts one JSON request on stdin; do not persist a workflow input/output file.
`action=inspect` reads the exact repository/origin, base SHA, current source, complete pending
diff, untracked files and declared runtime/activation paths. Bind `repositoryPath`,
`sourceRepository`, `baseSha`, `inspectedPaths`, `runtimePaths`, `mockBindingPaths` to the
actual project. Its zero-write snapshot proves inspected revision/content, not semantic
absence of every possible Mock: current import/build/activation review evidence remains
mandatory, and unexplained explicit marker declarations block.

Carry the result with schemaVersion=1, source identity/SHA, scope/content fingerprints,
paths, evidenceRefs and the original mockModules as `mockSafety` or all `mockSafeties`.
An explicit evidenced empty inventory is valid; absent/unknown is not. `action=check`
consumes the safety collection and an exact context (operation, environmentKind,
targetEnvironment, verified sourceRepository/sourceSha, applicable branch/Job/purpose),
freshly reads evidence and fails closed. The helper is the authoritative input contract.

Active Mock requires `testAuthorization`: ALLOW, actual human confirmation source,
scope/inventory fingerprints, approved source SHA, exact test environment/branch/Job,
purpose and selected operations (git-delivery, test-deploy, test-wiki, test-registration).
The producer must verify that confirmation really came from the human; confirmed=true
is insufficient. Reuse only unchanged exact authority. Proved equivalent content and
containment may mechanically derive new commit/merge identities; content, inventory,
target or purpose changes reopen affected confirmation.

Merge/release bind to independently verified live source refs; input rows cannot replace
those SHAs. Shared Wiki/registration require original requiredRepositories and actual
Git delivery receipts covering every repository/source/test target, not self-reported
mockRepositories. Preserve unrelated changes without attributing them to this work.

For the standalone Wiki CLI, pass `--mock-safeties` (inspection object array),
`--required-repositories` (original repository URL string array), and
`--git-delivery-receipts` (verified Git receipt object array) as JSON arguments,
along with the exact `--target-branch`, `--target-environment` and `--purpose`.
Optional `--mock-repositories` cross-checks identities; it cannot replace receipts.

Production checks source exit/build exclusion before default-branch writes. Retained
isolated development artifacts need actual configuration/content-bound evidence; retired
status or disabled switches are insufficient. Official release uses the actual project
checker and versioned publishing integration through
[project-mock-gate.mjs](../scripts/project-mock-gate.mjs). It does not require Jenkins XML,
parse Groovy, or impose one pipeline shape. Missing project checks or integration block
with that concrete gap; a config-read 403 is not a reason to install or waive a Mock gate.

`projectMockGate` binds `schemaVersion=1`, the exact `repositoryPath`,
`sourceRepository`, `sourceSha`, and:

- `checker`: project-relative `scriptPath`, `contentHash`, `configPath`, `configHash`.
  Read both files from the exact source commit, export that commit to a disposable
  snapshot and actually execute the Node checker with structured arguments for phase
  `source`. Validate its unique `MOCK_SOURCE_GATE` result. Source inspection cannot
  claim that a future artifact has already passed.
- `integration`: exact `repositoryPath`, `sourceRepository`, `sourceSha`, content-bound
  `files` (`path`, `contentHash`), `entrypoint`, actual `checkerInvocation` and
  `publishInvocation`, and `evidenceRefs`. Its `review` binds the same `sourceSha`,
  `state=VERIFIED`, `filesFingerprint=projectMockIntegrationFingerprint(files)`,
  `checkedBeforePublish`, `failClosed`, `noBypass` and actual review `evidenceRefs`.
  Inspect all listed fixed Git objects and the real call chain; the review fingerprint
  covers every path/content hash, and these flags are conclusions supported by source
  review, never standalone proof. The entry may be
  an existing npm lifecycle, a project release script or a fixed Jenkinsfile revision.
  Bind a separate integration repository/ref/SHA explicitly when the actual release
  entry lives outside the package repository; it must match the verified
  `input.pipelineSource` repository and exact `expectedSha`.

PLAN returns `projectMockGateHash` for this complete binding. Official EXECUTE must
carry that unchanged approved hash and revalidate the files before the source check;
missing or changed bindings stop before trigger. The integration checker invocation
is a direct `node|nodejs <accurate scriptPath> --phase artifact --config <accurate
configPath>` command, with supported identity options as needed. `echo`, `node --check`,
shell wrappers and `|| true` cannot prove the checker executes or fails closed. This
direct-call constraint does not constrain the overall Jenkins pipeline shape. For
`integration.kind=npm-prepublishOnly`, the exact `package.json` lifecycle must equal the
checker invocation, and the publication call must not disable lifecycle scripts.

The project performs phase `artifact` in its real Jenkins-driven release entry before
upload/deploy/publish. A failed check must stop that entry; successful post-publication
inspection cannot undo a release. After the build, the actual checker and config bytes
must still match their exact reviewed Git versions. The artifact checker must also
verify the complete inspected source file set and bytes against that commit before
publication; unchanged HEAD alone or a post-publication fingerprint mismatch cannot
enforce this gate. The integration review must establish
that every publish path stops on failure and consumes the same inspected final staging:
no modification, replacement archive or alternate content after the check. Verify the exact resulting
`MOCK_PRODUCTION_GATE` after the build against source SHA, Job URL, build number,
checker/config hashes and artifact fingerprint. Its `sourceFingerprint` must equal
the pre-trigger actual `projectMockSourceReceipt.sourceFingerprint`. Resolve queue identity through the
exact build's readback; do not require a Jenkins `QUEUE_ID` environment variable.
Never accept an invented boolean pass, keyword presence or a caller's receipt without
the source and actual build evidence. Test authorization never permits production Mock.

The self-contained [checker template](../assets/project-mock-check/check-mock.mjs)
and [configuration example](../assets/project-mock-check/config.example.json) can be
copied into an authorized project and adapted to its real source/production entries,
artifacts and runtime configuration. Neither a Query Contract installation nor an
installed local plugin is needed in CI. Template availability does not mean any
existing project or Job is already integrated. Onboarding modifies only the authorized
project and actual release entry; this plugin update changes no business repository or
Jenkins configuration.

Jenkins execution binds `jenkinsContractHash`, `jenkinsProfileHash`, the frozen local
`parameterDefinitionsHash` and `jenkinsParametersValueHash`. The selected local profile
owns environment/channel and exact parameter constraints; all defaults are materialized
and fixed selectors are checked after ref/project/version bindings. Missing or changed
contracts block, without an online fallback. The old caller-supplied `environmentBinding`
and mappingText mechanism is not used; a Job name or test/canary label cannot replace
the fixed profile or its actual-value checks. Any verified production signal takes precedence.
The former `preDeployMockGate` XML/pipeline interface has been removed.
Refresh an old release plan with the actual project script and publishing integration;
do not copy its `VERIFIED` flag or fabricate a future artifact result. The project
checker is executed directly with structured argv, not arbitrary caller-supplied shell.

## Jenkins deployment and package release

Build definitions/defaults/choices and fixed environment profiles are owned by
project-knowledge's `data/workspace/jenkins-build-contracts.json`; see
[fixed Jenkins parameters](frozen-jenkins-parameters.md). The maintenance-only collector
reads Jenkins and atomically refreshes this file. Deploy PLAN/EXECUTE must not call
jenkins_get_job_parameters or parameter-definition endpoints, extract parameters from
Job XML, or silently refresh a missing record. The local resolver validates actual values,
materializes frozen defaults and binds the current Job/profile/parameter-value hashes.
Unavailable or ambiguous records block before a trigger.

`resolve-jenkins-job.mjs` (or session `job` PLAN) resolves an already routed
exact Job name into an evidenced URL. It reads selected instance metadata and
searches only the root/known folder without recursion, rejects similar or
duplicate names and cross-instance/mismatched URLs, and returns writes=0.
Missing static `jenkins_job_urls` is not a blocker until this precise lookup
actually fails. STANDARD+SKIP may use it solely for the required Wiki link;
parameter/build/queue/log queries and triggers stay forbidden under SKIP.

`scripts/run-jenkins-release.mjs` owns one trigger. `completionMode` is
`BUILD_TERMINAL` by default for standalone releases and go-live, with exact
queue/build waiting and source/parameter verification. Test submission uses
`TRIGGER_ACCEPTED`: preview and execute with that mode, return `BUILD_SUBMITTED`
as soon as the exact Job/queue URL/ID is accepted, and perform no queue/build/log
read or wait. Retain submitted parameters and planned ref/SHA in the receipt;
it does not prove actual checkout, deployment or publication. Only canary test
builds may use this mode; official/production releases must wait. Unknown or
missing trigger receipts block later writes without retrying. Job lookup and
release intent stay with the producer; scripts do not guess a Job from cwd.

Required facts: `targetProject`, `releaseTarget` (package name for a package),
`targetEnvironment`, `jobName`, evidenced `jobUrl`, `releaseRef`, `expectedSha`,
`sourceRepository`, `version`, `releaseChannel=canary|official`,
`releaseKind=deployment|package`, `purpose`, exact `params`, `refParameter` and
any `versionParameter`/`channelParameter`. An adapter may resolve these during
preview. No version parameter means a deployment source identity equal to
the confirmed SHA. Package releases require a real version bound to a live Job
parameter or the verified `npm-tools-v1` computed-version contract; a source SHA
or a caller-provided `PIPELINE_COMPUTED` label cannot substitute for either.
Package canary binds a non-official channel; official
versions are stable, explicitly bound or read back through the computed
adapter below. Review the actual Job/channel semantics before confirmation.

Call without `--execute` to obtain `instance`, `jobBindingMode`,
`jobBindingHash`, `adapterHash` and
`parameterDefinitionsHash`; copy them and the exact confirmation into the one
execution call. The caller's existing consolidated submission authorization
is sufficient when it already displayed these exact fields/actions.

### Common Job adapters

`branch-deployment-v1` resolves the real `branch` parameter and its frozen
choices. `explicit-v1` preserves explicit bindings for other Jobs. The default
`READABLE_METADATA` mode reads/fingerprints the exact Job URL/fullName/type/
buildable state and the fixed local parameter contract without calling
`jenkins_get_job_config` or requiring that MCP tool. Include the mode in the
release plan; configuration XML permission is not required for test or official
release. Report binding changes, insufficient project-check evidence and
verification failures. Metadata does not fingerprint hidden configuration or
prove a Mock check ran. Use the actual project script/integration and precise
build result for that evidence. Refresh legacy XML-bound plans rather than retrying
config reads or treating their fingerprints as project-check proof. A binding
mode/identity or parameter change blocks execution. Queue/build/parameters
and actual target repository SHA remain mandatory for `BUILD_TERMINAL`;
`TRIGGER_ACCEPTED` verifies the source ref before triggering and returns only
the accepted queue receipt.

`npm-tools-v1` recognizes `PROJECT_NAME` and `RELEASE_TYPE`. It requires
`pipelineSource` with verified `repositoryPath`, `repositoryUrl`, `ref`, full
`expectedSha` and `scriptPath`. Read that exact Git object without checking
out/editing it; parse the maintained Jenkinsfile's literal project map,
canary/official branch rule and publication-summary contract. Unfamiliar
scripts stop. Bind its body hash, repository and release-type selection;
verify both refs before trigger and, in `BUILD_TERMINAL`, both actual SCM SHAs
afterwards. `TRIGGER_ACCEPTED` returns before checkout/publication, with null
`version`, source `versionIdentity`, and no `publishedPackages`.

This pipeline publishes the whole selected project and computes versions.
Require displayed `releaseScope=PROJECT`, `releaseTarget=targetProject` and
`versionStrategy=PIPELINE_COMPUTED`; never widen a single-package request
silently. Plan `version` is the confirmed source SHA as an identity, not a
predicted npm version. In `BUILD_TERMINAL`, after SUCCESS parse the exact build's bounded
publication summary (at most 2 MiB), matching project/channel and stable
versus prerelease versions. Return actual `publishedPackages`, null `version`
and source `versionIdentity`. Missing publication evidence cannot return
RELEASED. Read only the maintained pipeline's registry-derived summary,
never arbitrary version-looking strings or another build's logs.

```bash
node scripts/run-jenkins-release.mjs --json <<'PLAN'
{
  "targetProject": "<verified-project>",
  "releaseTarget": "<verified-app-or-package>",
  "targetEnvironment": "test",
  "jobName": "<verified-job>",
  "jobUrl": "<evidenced-job-url>",
  "releaseRef": "<approved-ref-or-sha>",
  "expectedSha": "<full-actual-source-sha>",
  "sourceRepository": "<verified-target-source-repository>",
  "version": "<approved-version-or-sha>",
  "releaseChannel": "canary",
  "releaseKind": "deployment",
  "purpose": "<release-purpose>",
  "refParameter": "<actual-ref-parameter>",
  "versionParameter": "<actual-version-parameter>",
  "params": {"<actual-ref-parameter>": "<approved-ref-or-sha>", "<actual-version-parameter>": "<approved-version>"}
}
PLAN
```

The example above is a terminal-release plan. For test submission, also include
`"completionMode": "TRIGGER_ACCEPTED"` in both preview and execution; omitting
it selects the helper's terminal-wait default.

Prefer a fixed SHA ref when the Job supports it. Branch-only Jobs still need
the confirmed expected revision before triggering. In `BUILD_TERMINAL`, require
actual checkout evidence; a changed checkout yields `UNKNOWN`, never a false
successful release. `TRIGGER_ACCEPTED` requires neither an actual checkout nor
a build number, and returns after local validation of the exact queue receipt.
Other package
Jobs without explicit versions or a recognized computed-version contract,
or terminal-release Jobs without target-SCM BuildData, still need a specific
evidence improvement. Do not match any SHA in changes or logs as a substitute.
Before triggering, symbolic branch/tag refs get one controlled read-only Git
query; changed SHAs and branch/tag name collisions block the trigger. Annotated
tags compare their peeled commit. This is a write-boundary check, not another
project/history search.

Writes use `jenkins-mcp`. The connected MCP drops queue executables, build
queueId/parameters and Git BuildData, so `jenkins-readonly.mjs` fills only
those GET gaps using existing credentials. MCP instance URL, configured URL,
exact Job URL/path, queue ID and build number must agree; redirects and other
hosts/Jobs are rejected. No direct HTTP trigger or local publish/deploy command
exists. Queue/build polling shares one deadline (default 30 minutes), sleeps
at most 30 seconds and emits only state changes. Do not replace this with
Agent polling, console downloads or repeated Job/rule discovery.

`BUILD_SUBMITTED` is sufficient for test-submission Wiki/TAPD gates only with
its exact queue receipt. Tooling Wiki preserves an evidenced current channel,
or records `当前版本：待发布`; do not claim canary publication from a submitted Job.
`DEPLOYED|RELEASED` still requires the exact build's `SUCCESS`, planned parameters
and repository-specific actual SCM SHA. `FAILED|UNKNOWN` prevents subsequent
Wiki/TAPD/version writes. A failed/unknown trigger is never repeated. Actual
CI/build duration remains owned by GitLab/Jenkins; this flow removes Agent
overhead, not the build work.

## Default-branch delivery and Wiki maintenance

Show the direct merge and exact minimal Wiki status patch together, identifying
their separate authority scopes. One explicit confirmation can cover both
unchanged scopes; do not ask again after merge. Cleanup/deletion still requires
its separate exact resource confirmation. After verified containment, invoke
the Wiki helper in `--mode update` with its exact ID/parent/title and original
body hash. This mode updates/reads only that Wiki and returns
`UPDATED|UNCHANGED` with `commentState=SKIPPED`; it neither reads nor writes
TAPD item/comments. A changed body/patch is a real new authorization boundary.
The temporary Markdown file carries only the approved request body and is
removed after invocation, never retained as workflow state.

## Final TAPD registration

`scripts/register-test-submission.mjs` uses `tapd-mcp` only. The plan binds
`workspaceId`, `entryType=bug|stories|tasks`, `entryId`, `workMode`, purpose,
`statusAction=WAITING_TEST|NONE` and `versionAction=WRITE|NONE`. Bug automatic
registration uses WAITING_TEST; Story/Task does not receive that status. An
applicable version uses the exact native `version_test` (Bug), `version`
(Story/Task), or a semantically verified `custom_field_*` with the complete
approved string payload in `testVersion`.

Decode actual MCP list wrappers (`base_url/data/count`), direct entity arrays,
status/data API envelopes, structured results and nested JSON strings. Explicit
API failures and ambiguous MCP text blocks still stop; successful acknowledgments
do not replace the required item readback. A pure preview never calls update tools.

Preview reads the item's workflow category when needed, resolves exact
`修复中`/`待测试` labels, verifies an allowed transition (including actual
`StepPrevious`/`StepNext` rows), and checks required fields' existing values.
It never adds unapproved required-field writes. Explicit actual labels are
supported; duplicate labels, unfamiliar shapes or invalid transitions stop.

For a Bug transition, read `te` (测试人员), `reporter` (创建人) and
`current_owner`. Write `current_owner` from non-empty `te`, otherwise
`reporter`, in the same update as the status and applicable version. Missing
both blocks. Preview exposes `assigneeSource`, the selected owner in
`payload.current_owner`, and `expectedAssignee` with the three old field
values. Execution rejects changes to these facts. The resolved owner can
satisfy a required `current_owner`; other required fields still need existing
values. Readback verifies all selected account names, tolerating TAPD's
semicolon separators/order, and reports `ownerState` plus `actualOwner`.

Version mapping uses native fields or enabled writable text/textarea custom
fields with exact `测试版本|提测版本` labels, or an explicit actual label.
Custom codes support numeric and word suffixes (`custom_field_one`);
configuration precedes custom-field use. Caller flags/codes cannot bypass
semantic checks. Preview returns resolved mapping, raw metadata/hashes, old
values and exact payload. Validate that preview once without another Agent
interpretation. Execution refreshes those facts before one update/readback;
native fallback retains any collected custom metadata fingerprint.

Execution also carries the existing consolidated confirmation and
`prerequisites`: `git=VERIFIED`,
`deployment=BUILD_SUBMITTED|DEPLOYED|RELEASED|SKIPPED_BY_INTENT`,
plus the helper's full `deploymentReceipt` for `BUILD_SUBMITTED` (state,
completionMode, Job/queue URL/ID, source repository/SHA, submitted params, writes=1),
or its original `RELEASED` package receipt (`BUILD_TERMINAL`, verified source,
positive queue/build identities, Job/build URL, original writes=1) plus matching
current test-target Git delivery. The whole-plan/lead checks still require the
same Job/environment/channel/parameters and actual package/version/content
availability; this receipt only satisfies its own tooling row. Reuse completed
operations under [delivery reuse](execution-checklist.md#已完成交付的复用), never
fabricate another trigger or treat a package as a consumer deployment.
`profile=STANDARD|NO_WIKI`, with `wiki=VERIFIED|SKIPPED_NON_FUNCTIONAL` for
STANDARD or `SKIPPED_NO_WIKI` for NO_WIKI. This helper never calls Wiki tools.
Continue already waiting skips status, owner and version writes; a completely matching final
state is read-only. Unknown writes are never repeated. Partial readback
reports actual status/owner/version effects and blocks the submission result.

## Batched local closeout

`scripts/check-local-closeout.mjs` accepts the verified default delivery,
repository/origin, current task path and exact related branches. The delivery
needs `state=MERGED`, merged readback, containment, actual default verification,
original source branch and actual `master|main` target. The merge helper
returns `defaultBranch`/`defaultTargetVerified` for this handoff. Temporary
branches need their own explicit merged-MR source/target association.

By default `collect-local-occupancy.mjs` collects one scoped snapshot. It
queries related Codex SQLite task metadata with read-only SQLite and checks
process cwd/open-file paths through ps/lsof. It reads no chat/body, process
arguments/environment or file content. Nonarchived associated tasks remain
needed; no task is archived. Symlink aliases and files opened from an outside
cwd are considered. Unobservable processes, unsupported schemas/tools/platforms
and capped inventories remain unknown. Native support is Codex on macOS/Linux;
other tools can provide an explicit supported collector snapshot.

If such a fresh snapshot already exists, pass it without collecting twice.
Each resource has branch, exact path,
task/process state, whether later work needs it, evidence source, completeness
and checkedAt. Unknown, incomplete or older-than-60-second evidence does not
prove idle. Disposable ignored directories must come from explicit project or
human evidence; their names are listed compactly without reading content.

The helper reads worktrees once, batches fetch and exact ref snapshots,
checks full local-tip ancestry and inspects status/ignored data in parallel.
It returns `CHECKED|PARTIAL|UNAVAILABLE|NOT_TRIGGERED` with separate
`CANDIDATE|RETAIN|VERIFY|ABSENT` rows. Candidate means a proposal, not deletion
authority. `--execute` is rejected; no deletion/switch/prune/process-stop code
exists. Keep merge/Wiki outcomes separate, and recheck before any later exact
confirmed cleanup under the existing rules.

API references: [GitLab merge requests](https://docs.gitlab.com/api/merge_requests/)
and [Jenkins remote API](https://www.jenkins.io/doc/book/using/remote-access-api/).

## Shared test Wiki ownership

Follow [shared-test-wiki.md](shared-test-wiki.md). `action=wiki` / `mode=ensure`
resolves a Task's parent Story as `wikiOwner`; Story/Bug owns itself. A new
Task submission uses its parent's title, never a project-prefixed Task title.
When the Story has no anchor, exact sibling Tasks/comments are checked for an
older linked page. Different linked page IDs block.

PLAN returns `wikiOwner`, `ownershipEvidence`, `commentOperations`,
`entryOperation=NEW_PAGE|APPEND_ENTRY|REUSE_ENTRY` and the exact body/hash.
For APPEND_ENTRY, no body is needed for discovery, but execution needs the
approved complete resulting body. Pass `entryRepoUrl` (`--entry-repo-url`) to
select a repository/branch entry, allowing the same branch name across repos.
For Task ensure EXECUTE copy `wikiOwner.entryType/entryId` into
`expectedOwnerType/expectedOwnerId` (`--expected-owner-type/--expected-owner-id`).
Include both owner anchor and current Task comment targets in confirmation;
helper writes/readbacks the owner first. `mode=link` remains current-item only;
`mode=update` remains exact-page/body only. Neither mode creates Wiki pages.

For one multi-project batch, carry one combined body/target in sharedWikiPlan,
complete all included Git/deployment gates before writing it once, then link
all delivered items to that page and finish registration. Same-owner Wiki
writes are serial; later plans use the actual resulting body hash. Repeated
calls do not duplicate the page/comments. An old CREATE_CHILD plan cannot be
executed after the common owner already links a page.

For a canonical REUSE_ENTRY update, `entryRepoUrl` is required. The helper
allows corrections inside the selected existing entry and rejects changes to
other entries or surrounding text. A confirmed multi-project update may pass
`entryUpdates` (`--entry-updates` JSON array), listing each existing entry's
`entryRepoUrl`, `sourceBranch` and optional `entryHeading`, including the primary
entry. Complete every included project's delivery gates before the one write.
The full body hash still guards write/readback; `wiki-entry.mjs`'s
`wikiReviewHash` is only for scoped review freshness, not write authorization.

Managed MR review calls `review-policy.mjs evaluate-merge` with `changeReview`
and freshly collected `currentChange` under [change consistency](change-consistency.md).
It also requires `mergePermission=allowed` from the current execution account's
verified capability on the exact MR/protected target; missing, denied or unknown
permission blocks readiness. See the [MR contracts](../skills/merge-request-review/references/contracts.md).
Readiness does not grant approval/merge authorization.
Omitting these new inputs fails closed; migrate callers instead of treating an
old code-only pass as a complete review. No new local evidence files are needed.
