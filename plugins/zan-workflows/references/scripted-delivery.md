# Scripted delivery

Use one confirmed in-memory plan per operation bundle. Scripts receive JSON
through stdin and return JSON on stdout; do not save workflow plan/result
files. `--execute` is an execution switch, not evidence of human authorization.
The caller must bind the current displayed plan and actual confirmation first.

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
EOF, signals or 30 minutes idle close the process/connections. Standalone
helper CLIs remain available for isolated calls or after a session ended.

Wait for the single `SESSION_READY` event before sending input. On a PTY the
session switches only its own stdin to raw mode, preventing canonical-line
truncation and input echo. Long Chinese JSON is accepted up to 256 KiB;
oversized/malformed requests stop before helper calls. Ctrl-C terminates the
session; Ctrl-D ends its input. EOF/signals/idle shutdown restore its original
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
confirmation (`confirmed=true`). Targets are `develop|dev|master` or `main`
only after it is verified as the actual default. Source remains the original
`feature/*|fixbug/*`; conflict branches need their separate authorized flow.

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

## Jenkins deployment and package release

`resolve-jenkins-job.mjs` (or session `job` PLAN) resolves an already routed
exact Job name into an evidenced URL. It reads selected instance metadata and
searches only the root/known folder without recursion, rejects similar or
duplicate names and cross-instance/mismatched URLs, and returns writes=0.
Missing static `jenkins_job_urls` is not a blocker until this precise lookup
actually fails. STANDARD+SKIP may use it solely for the required Wiki link;
parameter/build/queue/log queries and triggers stay forbidden under SKIP.

`scripts/run-jenkins-release.mjs` owns one trigger, queue/build waiting and
source/parameter verification. Job lookup and release intent stay with the
producer; scripts do not guess a Job from cwd or repository name.

Required facts: `targetProject`, `releaseTarget` (package name for a package),
`targetEnvironment`, `jobName`, evidenced `jobUrl`, `releaseRef`, `expectedSha`,
`sourceRepository`, `version`, `releaseChannel=canary|official`,
`releaseKind=deployment|package`, `purpose`, exact `params`, `refParameter` and
any `versionParameter`/`channelParameter`. An adapter may resolve these during
preview. No version parameter means a deployment source identity equal to
the confirmed SHA. Package canary binds a non-official channel; official
versions are stable, explicitly bound or read back through the computed
adapter below. Review the actual Job/channel semantics before confirmation.

Call without `--execute` to obtain `instance`, `jobBindingMode`,
`jobBindingHash`, applicable `jobConfigHash`, `adapterHash` and
`parameterDefinitionsHash`; copy them and the exact confirmation into the one
execution call. The caller's existing consolidated submission authorization
is sufficient when it already displayed these exact fields/actions.

### Common Job adapters

`branch-deployment-v1` resolves the real `branch` parameter and its live
choices. `explicit-v1` preserves explicit bindings for other Jobs. The default
`READABLE_METADATA` mode reads/fingerprints the exact Job URL/fullName/type/
buildable state and live parameter definitions without calling
`jenkins_get_job_config` or requiring that MCP tool. Include the mode in the
release plan; known missing XML permission needs no repeated warning or
separate confirmation. Report binding changes, insufficient evidence and
verification failures. Metadata does not fingerprint hidden configuration.
Set `jobBindingMode=CONFIG_XML` when full configuration verification is
needed and readable; legacy plans with `jobConfigHash` retain XML verification.
Only XML HTTP 403 permits a metadata preview in that mode. Reuse its returned
mode for execution without retrying XML. Other XML errors stop. A binding
mode/identity or parameter change blocks execution. Queue/build/parameters
and actual target repository SHA remain mandatory.

`npm-tools-v1` recognizes `PROJECT_NAME` and `RELEASE_TYPE`. It requires
`pipelineSource` with verified `repositoryPath`, `repositoryUrl`, `ref`, full
`expectedSha` and `scriptPath`. Read that exact Git object without checking
out/editing it; parse the maintained Jenkinsfile's literal project map,
canary/official branch rule and publication-summary contract. Unfamiliar
scripts stop. Bind its body hash, repository and release-type selection;
verify both refs before trigger and both actual SCM SHAs afterwards.

This pipeline publishes the whole selected project and computes versions.
Require displayed `releaseScope=PROJECT`, `releaseTarget=targetProject` and
`versionStrategy=PIPELINE_COMPUTED`; never widen a single-package request
silently. Plan `version` is the confirmed source SHA as an identity, not a
predicted npm version. After SUCCESS parse the exact build's bounded
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

Prefer a fixed SHA ref when the Job supports it. Branch-only Jobs still need
the confirmed expected revision and actual checkout evidence; a changed
checkout yields `UNKNOWN`, never a false successful release. Other package
Jobs without explicit versions or a recognized computed-version contract,
or Jobs without target-SCM BuildData, still need a specific evidence
improvement. Do not match any SHA in changes or logs as a substitute.
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

`DEPLOYED|RELEASED` requires the exact build's `SUCCESS`, planned parameters
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
applicable version uses the exact native `test_version` (Bug), `version`
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

Version mapping uses native fields or enabled writable text/textarea custom
fields with exact `测试版本|提测版本` labels, or an explicit actual label.
Custom codes support numeric and word suffixes (`custom_field_one`);
configuration precedes custom-field use. Caller flags/codes cannot bypass
semantic checks. Preview returns resolved mapping, raw metadata/hashes, old
values and exact payload. Validate that preview once without another Agent
interpretation. Execution refreshes those facts before one update/readback;
native fallback retains any collected custom metadata fingerprint.

Execution also carries the existing consolidated confirmation and
`prerequisites`: `git=VERIFIED`, `deployment=DEPLOYED|SKIPPED_BY_INTENT`,
`profile=STANDARD|NO_WIKI`, with `wiki=VERIFIED|SKIPPED_NON_FUNCTIONAL` for
STANDARD or `SKIPPED_NO_WIKI` for NO_WIKI. This helper never calls Wiki tools.
Continue already waiting skips both fields; a completely matching final
state is read-only. Unknown writes are never repeated. Partial readback
reports actual status/version effects and blocks the submission result.

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
