# Full Jenkins release flow

## Fixed build parameters

Load [the fixed parameter contract](../../../references/frozen-jenkins-parameters.md)
from project-knowledge for both PLAN and EXECUTE. Full definitions/defaults/choices and
actual environment/profile constraints come from that file. Never call
jenkins_get_job_parameters, use an online parameter endpoint, extract definitions from
Job XML or auto-refresh during deployment. The independent project-knowledge sync script
is the maintenance entry. Missing/unavailable/ambiguous contracts block before trigger.
Explicitly submit frozen defaults and reject actual values conflicting with env/platform/
release selectors. Bind the relevant contract, profile and resolved-value hashes.

## Mock gate before triggering

Apply [Mock development and release gates](../../../references/mock-development.md)
and scripts/mock-safety.mjs before any trigger. Require current source/diff and complete
inventory for the exact ref/repository. Canary/test deployments containing Mock need
explicit current human permission for that inventory, test environment/Job, purpose and
operations; normal release approval/default test selections alone do not supply it.

Official releases prohibit Mock in the production scope/artifact/runtime. Use
[project-mock-gate.mjs](../../../scripts/project-mock-gate.mjs) with the exact
`projectMockGate` project-script and publishing-integration evidence. Before triggering,
verify source exit/build exclusion, run the reviewed project script's source check from
the exact Git snapshot, and inspect the content-bound real release entry proving that
artifact-check failure stops publish/deploy. This may be a project release script,
npm lifecycle or fixed Jenkinsfile; no Jenkins XML or specific pipeline shape is required.
The project checker must actually run against the final publish staging before any
external publication. Bind its actual artifact result to the exact build/SHA/Job and
checker/config/artifact fingerprints before release success. Missing project scripts or
publishing integration block with that specific gap. Never claim future artifacts
inspected. Disabled switches, retired labels or query-contract release-check alone
cannot satisfy the prohibition. The plugin's template does not automatically onboard
an existing project or change a Jenkins Job.

The release-entry review binds `filesFingerprint` to all reviewed path/content hashes
and proves that a failure stops every publish path and the inspected final staging is
published unchanged. Actual checker/config bytes must still match their exact Git
versions after the build. PLAN binds `projectMockGateHash`; official EXECUTE requires
that unchanged hash. The artifact receipt's `sourceFingerprint` must match the actual
pre-trigger `projectMockSourceReceipt`, so a changed build-time source cannot reuse
the earlier check.


Use for production/official releases, every tooling/package publication (including
canary), and deployments owned by a confirmed submission or go-live bundle.
Reuse that bundle's unchanged confirmation and exact source evidence.

Resolve the project/module or package owner and exact Job/URL through
`workspace-project-knowledge` once. Tooling packages use their declared Jenkins
release path; do not run package publish/deploy scripts locally. Reuse current
verified project, repository, source and Job evidence instead of restarting
routing. No TAPD item is required for a standalone release.

Start the workflow session with the pinned helper runtime and wait for its
`SESSION_READY` event. It manages its own TTY input; do not inspect or change
another terminal to deliver a long plan.

1. Prepare one release plan with project, release target/package, environment,
   Job/name/URL, exact release ref and expected target-repository SHA, version,
   `canary|official` channel, purpose and actual Job parameters. Bind ref and
   version parameter names; without a version parameter use the confirmed SHA
   as deployment identity. Let the Job adapter resolve actual parameter names.
   For a pipeline-computed package version, bind the verified Jenkinsfile
   repository/ref/SHA/path, source identity and explicit whole-project release
   scope. Test submission returns the source identity and accepted queue only;
   `BUILD_TERMINAL` reads actual package versions after the build. Never expand a request
   for one package to a whole project without displaying and confirming that scope.
   Package canary must bind a non-official channel
   parameter and cannot update `latest`/stable. Do not infer official intent.
2. Reuse a complete current preview with Job identity, frozen-parameter and applicable
   project-check fingerprints, or call
   the release action of [workflow-session.mjs](../../../scripts/workflow-session.mjs)
   in `PLAN`, or [run-jenkins-release.mjs](../../../scripts/run-jenkins-release.mjs)
   without `--execute` for a standalone call. By default it uses
   `READABLE_METADATA`: read and fingerprint the exact live Job identity without
   requesting config XML; parameter definitions are read only from the fixed local
   contract. Include the binding
   mode in the plan. Test and official release do not require configuration XML
   permissions. Metadata proves Job identity, not a Mock check or unchanged hidden
   configuration. Obtain Mock evidence from the reviewed project checker, publishing
   entry and exact build. Refresh legacy XML-bound plans with the project-check
   contract rather than retrying configuration reads. Report only binding changes,
   concrete missing project checks/integration or verification failures. Any binding
   change requires an updated plan before execution.
   It validates selections and returns fingerprints. Check Job
   ownership, channel/version semantics and complete source evidence once.
   Standalone execution displays this complete actual plan and obtains its
   own exact release confirmation. From a main entry, compare it to the
   approved complete execution checklist or confirmed submission/delivery
   plan; when all actions and parameter semantics are covered, reuse that
   authority without another question. Technical fingerprints and derived
   build/version receipts still require evidence and validation.
3. Send `EXECUTE` to the same live session, or invoke the standalone helper
   once with the unchanged plan and `--execute`. It
   revalidates the approved project checker/config/integration versions, runs the source
   check for an official release, then triggers through `jenkins-mcp` exactly once.
   The actual Jenkins-driven project entry executes artifact inspection before
   publish/deploy and stops on a nonzero result. For test submission only, bind
   `completionMode=TRIGGER_ACCEPTED` in PLAN/EXECUTE, retain the exact accepted
   Job/queue URL/ID and submitted params as `BUILD_SUBMITTED`, and return without
   queue/build/log polling or waiting; continue the submission's Wiki/TAPD steps.
   Do not report deployment/publication success or actual npm versions. Standalone
   releases and go-live use `BUILD_TERMINAL` and wait in the helper's process.
   In `BUILD_TERMINAL` only, the configured GET-only API supplies queue executable, build queueId,
   parameters and SCM fields missing from MCP. It is restricted to that same
   Jenkins instance and exact Job; record this read-only capability fallback.
4. In `BUILD_TERMINAL` only, let the script poll with bounded backoff and emit only state changes. Do
   not have an Agent reread rules, refetch source, download console logs or
   validate each poll. Require terminal `SUCCESS`, matching queue/build/params
   and the actual target repository SHA before `DEPLOYED|RELEASED`. A computed
   package release additionally verifies the actual pipeline SHA and parses
   the exact build's bounded publication summary. An official release also requires its
   unique `MOCK_PRODUCTION_GATE` receipt with matching source SHA, Job/build,
   checker/config and artifact hashes; queue identity comes from exact build readback,
   not an assumed `QUEUE_ID` environment variable. Missing or failed checks never
   become a successful release. Report `publishedPackages`
   as actual npm versions, never the source identity as a package version.
   For a later authorized tooling Wiki update, pass the verified actual channel,
   package versions, source SHA and build evidence: `canary` maps to
   `当前版本：canary`, `official` to `当前版本：latest`.
   The release capability itself still performs no Wiki write.
5. On `FAILED|UNKNOWN|BLOCKED`, report the exact phase, queue/build and known
   effects, and stop later actions. Never retry a trigger or use another build
   as success evidence. In `BUILD_TERMINAL`, a Job without verifiable SCM
   metadata requires a specific evidence/configuration fix, not repeated
   searches or a guessed SHA. Test submission does not require future SCM
   checkout metadata; its pre-trigger source check and exact accepted queue
   receipt are sufficient to continue Wiki/TAPD.

See [scripted delivery](../../../references/scripted-delivery.md) for the stdin
interface. Plans/results remain in memory or stdout; create no workflow JSON,
recovery ledger or artifact directory. This capability does not merge code,
change Wiki/TAPD or clean up branches/worktrees.
