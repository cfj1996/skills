---
name: workspace-project-knowledge
description: Use when a company project needs feature ownership, business knowledge, code graph or cross-project impact from Graphify Hub, or exact service, package and Jenkins routing.
---

# Workspace Project Knowledge

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) when selecting a model;
do not create an agent solely to emulate a model profile.

## Knowledge Boundary

Graphify Hub is the only provider for code graphs, business knowledge, feature
ownership, candidate code entrypoints and cross-project relationships. Use this
skill before broad source search. Do not query local knowledge repositories,
generated `AI_CONTEXT.md`, graph reports/data, bundled knowledge snapshots or
local Graphify CLI for these purposes, including when Hub is unavailable.

Exact workspace/project rules, governance and deployment configuration, live
Git/MR/Jenkins state and current source retain their own checks. Reading those
for their original purpose is separate from knowledge retrieval; do not use
configuration files or source scans to silently replace a failed Hub query.

## Unified Query Contract

Accept `project` (canonical repository/subproject, or unknown), `question`, and
`purpose` (routing, explanation, planning, implementation or review). Infer
omitted values from the request. Return one `KnowledgeContext` using
[knowledge-query.md](references/knowledge-query.md), which defines tool choice,
identity/scope verification, provenance and unavailable/partial results.

1. Load applicable workspace rules; reuse valid task context.
2. Discover the host's `graphify-hub` tools. For an unknown project, start with
   cross-project `feature_lookup`; for a known one, verify the actual Hub slug
   with `list_projects`. An exact repository/file input avoids broad routing.
3. Query only the needed Hub evidence. Preserve original source references,
   repository/subproject scope and supplied revision/time; missing versions
   remain `unknown`.
4. On disabled/missing tools, connection failure, uncovered projects or
   insufficient results, report the concrete gap. Return `unavailable` or
   `partial`; there is no local knowledge fallback. Never infer that a feature
   is absent merely because the query did not find it.
5. A sourced overview may stop here. For implementation, modification or
   review, read the target's applicable rules and verify the needed evidence
   against its actual source/HEAD before making current-behavior claims.

Callers and reviewers reuse this context; they do not select another knowledge
provider or repeat successful queries. A context packet never caches user
permission, live branch state or merge/release gates.

## Identity And Local Workspace Paths

Resolve the workspace root from the user's explicit path, the current tool's
workspace entry, or the current task's verified repository. Do not infer a
local path from a Hub slug by replacing hyphens, underscores or case.

Verify canonical repository identity and subproject scope using Hub source
references and an exact existing project mapping when available. Local Git
remote/path metadata can confirm the explicitly targeted checkout. Configuration
lookups may verify an exact identity; they must not expand into local business,
feature, dependency or code-graph searches.

Prefer an explicit subproject mapping over a monorepo root. Do not assume the
parent Hub slug also establishes a subdirectory's scope. If a project or path
remains ambiguous, retain the candidates and ask for one useful discriminator
only when the requested action needs a single target.

## Query Capabilities

| Need | Hub capability |
| --- | --- |
| Project coverage and real slugs | `list_projects` |
| Feature owner, module/API anchors and candidate files | `feature_lookup` |
| Module relationships and call paths | `query_graph`, then `get_node`, `get_neighbors` or `shortest_path` as needed |
| Business rules, design context and historical issues | `wiki_search` |
| Cross-project synthesis and requirement context | `expert_answer`, `requirement_analysis` |
| Recent indexed module changes | `module_changes` |

Use only tools exposed by the host and their actual schemas. Query tools do
not authorize knowledge writeback, learning, refresh or graph rebuilds. Do not
invoke `save_solution`, `feedback`, `submit_knowledge`, `rescan_projects` or
similar write tools as a prerequisite to answering a knowledge question.

## Exact Configuration Lookups

These checks retain their maintained configuration and live-system sources;
they are not fallback knowledge providers. Resolve the configured root/path
from the current tool's workspace entry or explicit environment configuration.
Read only relevant entries; do not scan mirrors or bundled snapshots.

- **Service/deployment identifiers:** use the exact project/subproject's
  `service_name` and `service_aliases` in the declared project registry. Apply
  a project-name default only if that registry explicitly declares the rule.
  Do not invent service names from Hub labels or Jenkins names.
- **Jenkins:** use the verified project's `jenkins_jobs` and any
  `jenkins_job_urls`. When a URL is absent, use the read-only
  [Job resolver](../../scripts/resolve-jenkins-job.mjs) or session `job` PLAN
  action to query the selected instance and exact Job/folder without recursive
  traversal. Return the exact Job name and read-back URL; never derive or guess
  a URL. For tooling packages, verify any shared Job mapping explicitly.
- **MR scope/team and Zan adoption:** retain the exact maintained configuration,
  project rules and declared standards. A Hub summary cannot grant scope,
  establish permissions or stand in for a required rule's original text.

If required configuration is missing, report the missing configuration and stop
only the dependent operation. Do not substitute old snapshots, remembered
whitelists or Hub-generated guesses. Knowledge queries themselves do not
require a local knowledge checkout.

## Package Ownership And Cross-Project Impact

Ask Hub for package ownership, consumers, dependencies and relationship chains.
Preserve each result's project/scope and sources; do not confirm the answer by
searching a local routing index or graph. An `@scope` name alone does not prove
that a package is private. Where the user requests a current implementation or
change, verify the needed package metadata and code in the selected checkout.

Return only supported owners, package paths, consumers and likely affected
projects. Distinguish candidate relationships from current-source findings.

## Wiki Service-Type Normalization

For a TAPD Wiki consumer, return one service type, marker and status field from
the routed project's evidenced metadata. Category normalization is a workflow
rule, not a bundled project catalog.

Wiki service-type normalization:

| Knowledge category | Normalized type | Red marker | Wiki status field |
|---|---|---|---|
| `Atlas业务模块` | `BUSINESS` | `更新服务` | `是否上线：未合并` |
| `管理后台`, `管理后台Monorepo`, `商城类`, `服务商`, `仓配系统前端`, `仓配管理系统`, `仓配作业系统`, `仓配移动端` | `BUSINESS` | `更新服务` | `是否上线：未合并` |
| `基础库`, `组件库`, `平台库`, `Atlas跨平台基座`, `文档`, `技能库`, `AI技能`, `MCP服务`, `DevOps`, `CLI工具`, `本地CLI工具` | `TOOLING` | `工具服务-无需上线` | `当前版本：canary` 或 `当前版本：latest`，由发布证据决定 |

Tooling category alone does not determine the latest release channel. Follow
[wiki-template.md](../drafting-wiki/references/wiki-template.md): `canary` means `canary`,
`official` means `latest`; a master merge does not prove publication.

For a monorepo, classify the matched package/app rather than the repository
root. Use Hub-attributed metadata for the selected scope. Explicit
`project_type`, `wiki_service_type` or `wiki_service_marker` evidence takes
precedence over a broad category label; do not keep a local project/type list.
Return `BLOCKED_UNMAPPED_WIKI_SERVICE_TYPE` for any category not listed above.

## Modification Preflight

Before changing code after a Hub lookup:

1. Confirm the target repository/subproject and the required working location.
2. Read applicable workspace/project/path rules and declared engineering
   standards from their maintained sources, not generated knowledge summaries.
3. Check the actual branch, Git status and necessary current source. Preserve
   unrelated changes and verify Hub implementation clues at that revision.
4. Use the project's declared test/build/lint commands. Do not rebuild or query
   local graphs as part of knowledge lookup or ordinary business-code work.

When Hub is unavailable, an explicitly identified target may still be developed
or reviewed using its rules and current source where sufficient. Report the
missing Hub context separately. Do not broaden a knowledge-only request into
local source investigation or claim that source inspection is a Hub result.

## Output

Return `KnowledgeContext`, rendering only fields useful to the request:

- Project/subproject, verified local path and repository URL when available.
- Answer, scope, candidate files/symbols and original Hub source references.
- Supplied revision/time, confidence limits and concrete remaining gaps.
- Exact service/Job facts only when needed, attributed to configuration or live
  readback separately from Hub knowledge.
- For Wiki consumers: `BUSINESS|TOOLING`, service marker and release-evidenced
  status/version. Return `BLOCKED_UNMAPPED_WIKI_SERVICE_TYPE` if unsupported.
