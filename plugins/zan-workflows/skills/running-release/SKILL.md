---
name: running-release
description: Run daily Jenkins project builds with a short flow; use the complete release flow for production deployments and every tooling/package publication. Track the exact build and verify its source. Excludes local build/test commands.
---

# Run Jenkins Builds and Releases

Follow workspace release-safety rules and [tool routing](../../references/tool-routing.md).
Preferred model profile: `CRITICAL`; consult [model routing](../../references/model-routing.md)
only when model selection is available. No TAPD item is required for a standalone build.

## Choose the flow first

- **Daily build (default):** a standalone application/project build for a verified
  dev/test Job, including its normal dev/test deployment. “构建项目”, “构建测试环境”
  and “重新构建” are candidates for this short flow; they never imply production
  intent or an automatic retry of a failed/unknown trigger.
- **Full release:** production/official deployment, any package/tooling publication
  (including canary/test packages), or a build within a submission/go-live bundle
  that requires a complete confirmed delivery plan. Read only
  [full-release.md](references/full-release.md) for that flow; preserve all its gates.
- Local build/test verification belongs to the project's development commands.
  An unclear environment, conflicting Job mapping or unknown publication effects
  needs one focused clarification; a Job name containing `test` alone does not
  prove that it cannot publish packages or affect production.

## Daily project build

Use the connected Jenkins MCP directly. Do not start `workflow-session.mjs`,
create a release `PLAN`/fingerprints, or invoke `run-jenkins-release.mjs` for this
flow. Do not load full-release/scripted-delivery guidance just to run a daily build.

1. Resolve the project, exact Jenkins instance, Job/URL and source repository once
   through `workspace-project-knowledge`; reuse valid current context. Query only
   a missing mapping or URL. For an exact project/Job lookup, skip source scans,
   Graphify queries and unrelated project contexts. Use an evidenced dev/test
   default only when it selects one unambiguous target; never guess `develop`/`dev`
   or derive a Job URL from a naming pattern.
2. Read live Job parameter definitions once and resolve the exact requested ref
   to its current remote SHA once. These independent reads may run together.
   Bind the real ref parameter and allowed values; use other defaults only within
   the authorized build scope. Honour an explicit commit/tag and do not substitute
   the local branch, another ref, an official channel or a package publication.
   Refresh source evidence if it changed or a confirmation delay made it stale.
   When there is no version parameter, the SHA is the build identity; do not ask
   the user to invent a version or a package channel for an ordinary project build.
3. Briefly state the project, dev/test environment, Job, ref/SHA and relevant
   parameters. Reuse the user's current build instruction or unchanged prior
   confirmation when it satisfies workspace authorization requirements. Defaults
   and readbacks are evidence, not permission: if the rules require confirmation
   of resolved fields, ask once using this compact summary. Do not demand a second
   confirmation or a full release checklist for an unchanged authorized build.
4. Call `jenkins_trigger_build` exactly once with the selected instance, exact Job
   and resolved parameters. Keep the returned queue ID/URL and follow that queue
   to its exact build number. Track that build with bounded backoff (at most 30
   seconds per wait, default total deadline 30 minutes), reporting state changes
   only. Do not infer the build from `lastBuild`, the largest/recent build number,
   the queue disappearing, or a different successful build.
5. Verify the exact build's terminal result, queue/Job identity, submitted parameters
   and target repository's actual SCM SHA against the resolved SHA. Use supported
   MCP fields first. If queue executable, queueId, parameters or SCM actions are
   omitted, use the existing GET-only `configuredJenkinsReader` in
   [jenkins-readonly.mjs](../../scripts/jenkins-readonly.mjs), restricted to the same
   instance, returned queue and exact Job/build. Compare the reader's `instanceUrl`
   with the selected MCP instance before reading; a default-instance mismatch
   must stop rather than silently query another server. A bounded read-only wait can use
   `pollState` from [workflow-runtime.mjs](../../scripts/workflow-runtime.mjs);
   it must not trigger or restart a workflow session. Do not read helper source
   routinely or repeatedly fetch rules, Job definitions, refs or full logs while
   waiting. Missing or mismatched evidence is `UNKNOWN`/`BLOCKED`, never verified
   success. Build changes lists and other repositories' SHAs are not SCM proof.

Return project/environment, Job/build link, ref/actual SHA and success/failure.
On failure, cancellation, timeout or an unknown trigger result, report the exact
queue/build and known effects, then stop. Never automatically retrigger or switch
to another Job. For an explicit new build request, retain and report the prior
build's known state; never hide an unknown outcome.
Keep a Jenkins SUCCESS with unverified source distinct from verified completion.
Do not create workflow JSON/recovery files or write Wiki/TAPD, merge code,
publish locally, or add production/package operations to a daily build.
