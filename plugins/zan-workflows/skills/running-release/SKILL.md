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

每次构建先应用 [Mock 门禁](../../references/mock-development.md)，通过同一只读
[安全检查](../../scripts/mock-safety.mjs)核实当前源码及项目 Mock 绑定、清单；
缺少证据不能视为没有 Mock。这是源码与授权预检，不执行部署。
存在 Mock（模拟数据或服务）时，展示稳定编号、实际范围与路径、仍会发生的
真实调用、测试环境/分支/Job、目的及验证局限，触发前须取得明确的人类测试
授权。简短构建方案的一次确认可以覆盖这些内容；普通构建请求或默认项不能
代替该许可。内容、清单或目标变化须刷新对应范围授权，不得直接调用 MCP
绕过。效果不明确或涉及生产、包发布时，转入完整流程。

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
3. 使用实际参数、约定/环境配置/参数值指纹和准确源码身份准备辅助脚本的只读
   `PLAN`，简要展示项目、测试环境、环境配置、Job、ref/SHA 及相关参数。
   复用匹配的明确构建指令；仍需确认时，对这份具体方案取得一次确认。
   Mock 测试仍须明确批准准确清单与目标，泛称构建不能代替该授权。
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

## Execution feedback

按 [执行反馈记录](../../references/execution-feedback.md#attach-to-a-workflow) 在顶层
任务开始时创建本地诊断 runId，能力切换复用同一编号；实际发生时记录阶段、确认
事项、人工纠正及最终结局。传给公共交付会话以关联脚本事件，未接入步骤标明缺口。
诊断不保存业务 Plan/result、不作为授权或恢复依据；失败不阻断原工作。只在用户
明确要求提交/导出时调用 report-execution，不在任务结束时自动上传。
