---
name: running-release
description: Use when a project deployment or tooling package release must run through a verified Jenkins Job with one complete plan, exact queue/build tracking and source verification.
---

# Run Jenkins Release

Preferred lead model profile: `CRITICAL`. Read the shared
[model-routing policy](../../references/model-routing.md) when model selection
is available. Follow the workspace release-safety rules and
[tool routing](../../references/tool-routing.md).

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
   scope; read actual package versions after the build. Never expand a request
   for one package to a whole project without displaying and confirming that scope.
   Package canary must bind a non-official channel
   parameter and cannot update `latest`/stable. Do not infer official intent.
2. Reuse a complete current preview with Job/config fingerprints, or call
   the release action of [workflow-session.mjs](../../scripts/workflow-session.mjs)
   in `PLAN`, or [run-jenkins-release.mjs](../../scripts/run-jenkins-release.mjs)
   without `--execute` for a standalone call. It reads instance, exact Job
   definitions and config in parallel. Only XML HTTP 403 permits the explicitly
   displayed `READABLE_METADATA` binding of Job identity and parameters;
   this does not prove unchanged hidden configuration. Other failures stop.
   It validates selections and returns fingerprints. Check Job
   ownership, channel/version semantics and complete source evidence once.
   Display the complete actual plan and obtain one exact current-conversation
   release confirmation. An unchanged confirmed submission/delivery plan that already
   includes all these actions is reusable; do not ask again.
3. Send `EXECUTE` to the same live session, or invoke the standalone helper
   once with the unchanged plan and `--execute`. It
   triggers through `jenkins-mcp` exactly once and waits in its own process.
   The configured GET-only API supplies queue executable, build queueId,
   parameters and SCM fields missing from MCP. It is restricted to that same
   Jenkins instance and exact Job; record this read-only capability fallback.
4. Let the script poll with bounded backoff and emit only state changes. Do
   not have an Agent reread rules, refetch source, download console logs or
   validate each poll. Require terminal `SUCCESS`, matching queue/build/params
   and the actual target repository SHA before `DEPLOYED|RELEASED`. A computed
   package release additionally verifies the actual pipeline SHA and parses
   the exact build's bounded publication summary. Report `publishedPackages`
   as actual npm versions, never the source identity as a package version.
5. On `FAILED|UNKNOWN|BLOCKED`, report the exact phase, queue/build and known
   effects, and stop later actions. Never retry a trigger or use another build
   as success evidence. A Job without verifiable SCM metadata requires a
   specific evidence/configuration fix, not repeated searches or a guessed SHA.

See [scripted delivery](../../references/scripted-delivery.md) for the stdin
interface. Plans/results remain in memory or stdout; create no workflow JSON,
recovery ledger or artifact directory. This capability does not merge code,
change Wiki/TAPD or clean up branches/worktrees.
