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

Choosing the full flow selects its exact plan and authorization checks, not
necessarily a terminal-build wait. Every test-submission build, including a
canary package build, uses `completionMode=TRIGGER_ACCEPTED` and returns the
accepted `BUILD_SUBMITTED` queue receipt to `submitting-for-test` without
queue/build/log polling. Standalone daily builds, standalone releases and
go-live retain their terminal-result/source verification.

## Daily project build

Every build first applies [Mock gates](../../references/mock-development.md).
Resolve current source and the project's Mock bindings/inventory using the same
read-only [safety helper](../../scripts/mock-safety.mjs); missing evidence cannot
be treated as no Mock. This is source/authorization preflight, not a deployment.
With Mock present, show its stable IDs, actual scope/paths, remaining real calls,
test environment/branch/Job, purpose and limits and require explicit human test
permission before trigger. The compact build confirmation may cover this once;
normal build requests/defaults alone do not. Changed content/inventory/target
requires refreshed scope authorization. Do not bypass the gate by calling MCP
directly. An unclear or production/publishing effect routes to the full flow.

Use the existing [run-jenkins-release.mjs](../../scripts/run-jenkins-release.mjs)
script for a compact PLAN/EXECUTE. Apply [fixed parameters](../../references/frozen-jenkins-parameters.md)
for all builds; do not create a workflow-session or load Wiki/TAPD merely for a daily build.
The helper owns the single trigger and exact queue/build checks through Jenkins MCP.
No build flow requires Job XML. Official releases use the actual project checker and
reviewed publishing integration under [Mock gates](../../references/mock-development.md);
missing project integration is a concrete release gap, not a config-permission error.

1. Resolve the exact registered project/subproject, Job/URL and source repository through
   workspace-project-knowledge. Load project-knowledge's jenkins-build-contracts.json and
   select one exact environment profile; missing/unavailable/ambiguous records block.
   Parameter maintenance is a separate explicit sync script, never a deployment fallback.
2. Read the fixed parameter definitions and allowed values locally. Resolve the requested
   Git ref to its actual remote SHA, bind ref/version fields, and use the frozen resolver
   to fill every supported default explicitly. Validate actual submitted values against
   fixed environment/release conditions; do not query Jenkins parameter definitions or
   extract them from XML. Preserve explicit project/ref/channel choices.
3. Prepare the helper's read-only PLAN with actual parameters, contract/profile/value
   hashes and exact source identity. Briefly display project, test environment, profile,
   Job, ref/SHA and relevant parameters. Reuse a matching explicit user build instruction;
   where confirmation is required, obtain it once for the concrete plan. Mock testing
   still needs explicit approval of its exact inventory/target, not generic build intent.
4. Execute that plan once. The helper re-reads the local contract and mutable source/Job
   identity, rejects changed facts, triggers once, follows only the returned queue and
   verifies its exact build. It must make zero parameter-definition calls. Ordinary daily
   builds wait for terminal result/source; a test-submission bundle may use its existing
   TRIGGER_ACCEPTED policy. Never infer success from lastBuild or another build.
5. Retain exact result/source evidence; a local parameter snapshot does not prove a build
   succeeded or a production artifact is safe. Missing or mismatched evidence blocks;
   correct parameter maintenance separately instead of automatically retrying a trigger.

Return project/environment, Job/build link, ref/actual SHA and success/failure.
On failure, cancellation, timeout or an unknown trigger result, report the exact
queue/build and known effects, then stop. Never automatically retrigger or switch
to another Job. For an explicit new build request, retain and report the prior
build's known state; never hide an unknown outcome.
Keep a Jenkins SUCCESS with unverified source distinct from verified completion.
Do not create workflow JSON/recovery files or write Wiki/TAPD, merge code,
publish locally, or add production/package operations to a daily build.
