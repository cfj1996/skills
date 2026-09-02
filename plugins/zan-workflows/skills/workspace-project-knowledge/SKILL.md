---
name: workspace-project-knowledge
description: Use when a request mentions company projects, business domains, service names, Jenkins jobs, private packages, code entrypoints, cross-project relationships, or ambiguous local workspace paths.
---

# Workspace Project Knowledge

Default model profile: `BALANCED`. Read the shared
[model-routing policy](../../references/model-routing.md) and escalate only for
tied project candidates, conflicting evidence, or cross-project impact.

## Overview

This is the workspace-level knowledge entrypoint for a local company projects workspace.

Use it before source search when the user asks where a feature lives, which project owns a business term, what service or Jenkins job maps to a project, which private package is involved, or how multiple local projects relate.

This skill is the company multi-project gateway that sits in front of the centralized `project-knowledge` repository and the per-project Graphify outputs collected inside it.

This skill is the successor to `company-project-routing`. It must cover project routing plus knowledge-base entry. Do not depend on `company-project-routing` being available.

## What You Must Do When Invoked

Use this skill as the first step for company multi-project questions. Do not start with broad source search.

Requests that must invoke this workflow first:

- project routing or repository ownership
- business term to project mapping
- service name lookup
- Jenkins job lookup
- private package or shared library ownership
- code entrypoint location
- cross-project relationship or impact analysis
- any company workspace question where the target repository is not already explicit

You may skip the routing stage only when the user already gave the exact target repository or exact target file and the task is a local implementation change inside that already-identified repository.

Follow this protocol:

1. Resolve the workspace root.
2. Resolve the centralized project knowledge root.
3. Route the target project from centralized workspace knowledge.
4. Read the matched centralized project `AI_CONTEXT.md`.
5. If the answer needs code structure, module relationships, call chains, or entrypoint reasoning, query the matched centralized Graphify graph with `--graph`.
6. Only then read live source files or run source search inside the narrowed project.

Fast path:

- If the user already gave an exact repository path or an exact repository name with strong certainty, skip broad routing and jump straight to that repository's centralized knowledge.
- If the user already gave an exact file path, treat the repository as resolved and use this skill only to gather surrounding project context if needed.

Graphify usage rule:

- The centralized repository already contains per-project `graphify-out/graph.json`.
- Do not run plain `graphify query "<question>"` from an arbitrary directory.
- After the target project is known, always query the matched centralized graph explicitly:
  - `graphify query "<question>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`
  - `graphify path "<A>" "<B>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`
  - `graphify explain "<concept>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`

Decision rule:

- `project-relations.yaml` is the routing index.
- Centralized `AI_CONTEXT.md` is the project boundary and modification guide.
- Centralized Graphify output is the code-structure and relationship layer.
- Live source search is the last step, not the first step.

## Workspace Root Resolution

The bundled fallback `references/project-relations.yaml` may use `${workspace_root}` as a placeholder. Never treat it as a literal directory name.

Resolve `${workspace_root}` before reporting paths or reading project-local files:

1. If the user explicitly provides a workspace path, use that.
2. Read the current tool entry file (`AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`) and use its `WORKSPACE_ROOT` value.
3. If `WORKSPACE_ROOT`, `PROJECTS_ROOT`, or a similar environment variable is set, use it.
4. If the current working directory is inside a workspace that has a current-tool entry file with a `workspace-ai-rules` section, use that entry file's `WORKSPACE_ROOT`.
5. If a local mirror exists, use the directory containing `project-knowledge/data/workspace/project-relations.yaml`.

When returning paths, substitute `${workspace_root}` with the resolved real path. If no workspace root can be resolved, return the project name and ask the user for their local workspace root instead of guessing.

## Project Knowledge Root Resolution

The generated project knowledge has been centralized. Do not assume each business repository still contains its own `AI_CONTEXT.md` or `graphify-out`.

Resolve the project knowledge root before reading generated knowledge:

1. Read the current tool entry file and use its `PROJECT_KNOWLEDGE_ROOT` value when present.
2. If `PROJECT_KNOWLEDGE_ROOT` is set in the environment, use it.
3. If `${workspace_root}/project-knowledge` exists, use it.
4. If no project knowledge root exists, fall back to this skill's bundled `references/` files and then to live source search.

When returning generated knowledge paths, prefer the centralized path under `${project_knowledge_root}`. Return live source paths under `${workspace_root}` only when pointing to actual source code.

The default centralized layout is:

- workspace routing index: `${project_knowledge_root}/data/workspace/project-relations.yaml`
- workspace context: `${project_knowledge_root}/data/workspace/AI_CONTEXT.md`
- project context: `${project_knowledge_root}/data/projects/<project-relative-path>/AI_CONTEXT.md`
- project graph report: `${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/GRAPH_REPORT.md`
- project graph json: `${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`

## Company Runtime Relationship Map

The company's main systems are organized around serving merchants. Use this runtime map before falling back to broad category routing.

Core systems:

| System | Project | Runtime URL Pattern | Users | Responsibility |
|---|---|---|---|---|
| 零售批发代理综合信息系统（大后台） | `admin_menu` | `xxx/admin_menu` | 公司内部 | 管理商家、供应商、财务等内部运营信息 |
| 运营商管理系统（中台） | `supplier-admin-web` | `xxx/middleManage/#/login` | 商家管理方/平台运营方 | 商家的管理平台 |
| 供应商系统 | `supplier-admin-web` | `xxx/suppliers/#/login` | 供应商 | 给商家供货相关能力 |
| 商家平台宿主 | `jbz_admin` (`main_menu`) | `xxx/main_menu?siteId={商家id}` | 商家 | 通过 iframe 引入多个后台子系统 |
| 商家平台子系统 | `store_admin`, `kp_admin`, `order-admin`, `factory`, etc. | `xxx/{storeAdmin|kpadmin|factory|...}/xxx?siteId={商家id}` | 商家 | 具体后台业务页面 |
| 商城 Web/H5 | `jbz_shop`, `Ucenter`, `instant-apps/web/live-app` | `xxx/{mall|ucenter|plain-app}/xxx?siteId={商家id}` | C 端用户/商家上下文 | 商城、用户中心、C 端直播 |
| 商城小程序 | `shop_mp`, `zan-mini/plugins/live/miniprogram` | 小程序运行时 | C 端用户 | 商城小程序与独立直播小程序包 |
| 服务商体系 | `zan-projects/admin/facilitator`, `provider-mobile` | `xxx/facilitator/login`, `xxx/provider-mobile/login?tenantId={租户id}` | 服务商 | 服务商管理后台和移动端 |

Important runtime rules:

- 大后台、中台、供应商系统、商家平台多数仍是老 Vue2 技术体系.
- 老系统部分页面使用 `zan-projects/admin/factory` 重构并 iframe 嵌入.
- `factory` does **not** only serve 商家平台; it also serves multiple old management systems. When `factory` is mentioned, use URL, page route, business term, and project context to decide the exact scope.
- `zan-atlas` exists because iframe embedding experience is not good enough. It is the next cross-platform/module platform, but it is not in production yet.
- 直播审核平台 (`zan-projects/admin/live-monitor`) and 客服平台 (`fronted`) are relatively independent. Do not merge them into the merchant main chain unless the user explicitly mentions them.

Runtime routing shortcuts:

| User Signal | Route To |
|---|---|
| 大后台, 零售批发代理综合信息系统, 公司内部管理商家/供应商/财务 | `admin_menu` |
| 中台, 运营商管理系统, `middleManage` | `supplier-admin-web` middleManage module |
| 供应商系统, `suppliers`, 供货 | `supplier-admin-web` suppliers module |
| 商家平台, `main_menu`, `siteId`, iframe 宿主 | `jbz_admin` |
| `storeAdmin`, `kpadmin`, 子系统 URL | route to the exact child project such as `store_admin`, `kp_admin` |
| `factory` | `zan-projects/admin/factory`, but check whether it is serving 商家平台 or another old management system |
| 商城 H5, `mall`, `ucenter`, `plain-app` | `jbz_shop`, `Ucenter`, `instant-apps` |
| 商城小程序, 小程序直播包 | `shop_mp`, `zan-mini/plugins/live/miniprogram` |
| 服务商后台, `facilitator` | `zan-projects/admin/facilitator` |
| 服务商移动端, `provider-mobile`, `tenantId` | `provider-mobile` |

## Centralized Knowledge Files

Always start from the centralized project-knowledge repository when it exists:

1. `${project_knowledge_root}/data/workspace/AI_CONTEXT.md`
2. `${project_knowledge_root}/data/workspace/project-relations.yaml`
3. `${project_knowledge_root}/manifests/latest.tsv`

Project-level generated knowledge lives under:

- `${project_knowledge_root}/data/projects/<project-relative-path>/AI_CONTEXT.md`
- `${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/GRAPH_REPORT.md`
- `${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`

Compatibility fallback order:

1. Centralized project-knowledge files.
2. This skill's bundled `references/AI_CONTEXT.md` and `references/project-relations.yaml`.
3. Legacy workspace mirrors: `${workspace_root}/AI_CONTEXT.md` and `${workspace_root}/project-relations.yaml`.
4. Live source search in the target project.

Do not treat project-local generated files as the primary source. They may have been migrated out of business repositories.

## Source of Truth

Use these `project-relations.yaml` sections as the routing index:

| Section | Purpose |
|---|---|
| `projects` | Project path, category, business domain, service name, AI context, graph report |
| `projects.*.subprojects` | Monorepo subproject routing, especially `zan-projects` |
| `runtime_relationships` | Company runtime relationship map around merchant systems |
| `routes` | Business words and aliases to project candidates |
| `domains` | Workspace groupings such as 管理后台, 商城类, 基础库 |
| `dependencies` | Cross-project dependency relationships |
| `packages` | Private package owner and consumer mapping |
| `jenkins_jobs` | Jenkins test job lookup |
| `excluded_or_secondary` | Projects that are not primary business routing targets |

After a project is matched, read centralized generated knowledge first:

1. `${project_knowledge_root}/data/projects/<project-relative-path>/AI_CONTEXT.md`
2. `${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/GRAPH_REPORT.md` when the answer needs code structure, module relationship, or entrypoint location
3. The live source project under `${workspace_root}` only after the generated knowledge has narrowed the search

For `zan-projects`, do not stop at the repository root if a subproject can be inferred. Prefer the matched subproject context:

- `${project_knowledge_root}/data/projects/zan-projects/admin/facilitator/AI_CONTEXT.md`
- `${project_knowledge_root}/data/projects/zan-projects/admin/factory/AI_CONTEXT.md`
- `${project_knowledge_root}/data/projects/zan-projects/admin/insight/AI_CONTEXT.md`
- `${project_knowledge_root}/data/projects/zan-projects/admin/live-monitor/AI_CONTEXT.md`
- `${project_knowledge_root}/data/projects/zan-projects/admin/siqian/AI_CONTEXT.md`

## Function Map

| Function | Trigger | Primary Data | Output |
|---|---|---|---|
| Project routing | Business term, path, project alias, vague workspace question | `routes`, `domains`, `projects` | Candidate project path and confidence |
| Service name resolution | User asks for service name, deployment name, backend/service mapping | `projects.*.service_name`, `service_aliases` | Service name and alias notes |
| Jenkins job lookup | User asks to build, deploy, test env, or Jenkins job | `jenkins_jobs` | Exact Jenkins job name |
| Package ownership | `@zan/*`, `@jbz/*`, shared library, component package | `packages`, `dependencies` | Owner project, package path, consumers |
| Knowledge entry | User asks where code lives or how modules relate | Project `AI_CONTEXT.md`, `GRAPH_REPORT.md` | Code map and next files to inspect |
| Cross-project impact | User asks impact, relation, consumers, upstream/downstream | `dependencies`, `packages`, `domains` | Relationship chain and affected projects |
| Code entrypoint location | Business term plus code keyword, route, page, API, pay/live/order/etc. | Global index, project context, Graphify | Narrowed module/files and search plan |
| Modification preflight | User asks to change code after routing | Project context and local rules | Scope, constraints, verification hints |

## Standard Execution Sequence

Use this sequence unless a narrower function below says otherwise:

1. Read centralized workspace `AI_CONTEXT.md`.
2. Read centralized workspace `project-relations.yaml`.
3. Route to the target project or subproject.
4. Read centralized target project `AI_CONTEXT.md`.
5. If the question is about code structure, call chain, module boundaries, or feature entrypoints, query centralized Graphify with `--graph`.
6. Only then search live source code inside the narrowed project.

When reporting results, distinguish:

- routing evidence from workspace knowledge
- project guidance from centralized `AI_CONTEXT.md`
- code-relationship evidence from centralized Graphify
- raw-source evidence from live source search

## Function 1 - Project Routing

Use this when the user gives a business term, project name, path fragment, service name, or vague workspace question.

Workflow:

1. Resolve `${project_knowledge_root}`.
2. Read `${project_knowledge_root}/data/workspace/AI_CONTEXT.md`, falling back to `references/AI_CONTEXT.md`.
3. Read `${project_knowledge_root}/data/workspace/project-relations.yaml`, falling back to `references/project-relations.yaml`.
4. Match the user input against `routes`, `domains`, `projects`, `projects.*.subprojects`, `service_name`, `service_aliases`, package names, and Jenkins job names.
5. Prefer exact project names, exact paths, package names, service names, route names, Jenkins jobs, and unique business terms.
6. If one project has one unique strong signal, route to it.
7. If one project has two or more strong signals, route to it even if weak words also match other projects.
8. If candidates are tied, return the candidates and ask for one discriminator: exact path, page route, package name, service name, error text, screenshot, or repository name.

After routing:

9. Return the centralized project knowledge paths that should be read next.
10. If the routed target is a `zan-projects` subproject, return the subproject path rather than stopping at the monorepo root.
11. When the consumer is a TAPD Wiki workflow, normalize the routed project to
    exactly one Wiki service type using the table below and return the
    corresponding initial merge status. An unmapped category blocks instead of
    being guessed.

Signal ranking:

| Strength | Examples | Rule |
|---|---|---|
| Strong | Exact repo name, exact path, package name, Jenkins job, route path, service name, unique business term | Can route directly |
| Medium | Module name, page folder, framework config, known dependency, category | Use to break ties |
| Weak | 后台, 管理, 登录, 权限, 报错, 支付, 直播, 订单 | Never decide alone |

Fast category hints:

| Category | Common Projects |
|---|---|
| 管理后台 | `admin_menu`, `fronted`, `jbz_admin`, `kp_admin`, `ledger_admin`, `order-admin`, `poster_admin`, `report-ui`, `statistics_admin`, `store_admin`, `supplier-admin-web`, `weixin-live`, `zan-projects` |
| `zan-projects` 子系统 | `admin/facilitator`, `admin/factory`, `admin/insight`, `admin/live-monitor`, `admin/siqian` |
| 商城类 / C 端 | `Ucenter`, `jbz_shop`, `shop_mp`, `zan-mini`, `instant-apps` |
| 服务商体系 | `zan-projects/admin/facilitator`, `provider-mobile` |
| 基础库 / 组件库 | `common`, `zan-lib`, `sim-ui`, `von-ui`, `zan-apps`, `zan-atlas`, `zan-atlas-modules`, `zan-poster` |
| AI / 工具 / DevOps | `skills`, `zan-skills`, `yapi-mcp`, `jenkinsfile`, `zan-cli` |

Wiki service-type normalization:

| Knowledge category | Normalized type | Red marker | Test-submission status |
|---|---|---|---|
| `管理后台`, `管理后台Monorepo`, `商城类`, `服务商`, `仓配系统前端`, `仓配管理系统`, `仓配作业系统`, `仓配移动端` | `BUSINESS` | `更新服务` | `未合并` |
| `基础库`, `组件库`, `平台库`, `Atlas跨平台基座`, `Atlas模块`, `文档`, `技能库`, `AI技能`, `MCP服务`, `DevOps`, `CLI工具`, `本地CLI工具` | `TOOLING` | `工具服务-无需上线` | `无需上线` |

For a monorepo, classify the matched package/app rather than the repository
root. `zan-projects/admin/*` applications are `BUSINESS`; packages under
`zan-lib`, `zan-apps`, and other library/tooling monorepos are `TOOLING`.
Return `BLOCKED_UNMAPPED_WIKI_SERVICE_TYPE` for any category not listed above.

Important routing examples:

| User Signal | Route To |
|---|---|
| 大后台, 零售批发代理综合信息系统 | `${workspace_root}/admin_menu` |
| 中台, 运营商管理系统, middleManage | `${workspace_root}/supplier-admin-web` |
| 供应商系统, suppliers | `${workspace_root}/supplier-admin-web` |
| 商家平台, main_menu | `${workspace_root}/jbz_admin` |
| 服务商后台, facilitator | `${workspace_root}/zan-projects/admin/facilitator` |
| 服务商移动端, provider-mobile, supplier-mobile | `${workspace_root}/provider-mobile` |
| 供应商后台, suppliers | `${workspace_root}/supplier-admin-web` |
| 中台运营管理, middleManage | `${workspace_root}/supplier-admin-web` |
| 工厂系统, factory, 中台支付 | `${workspace_root}/zan-projects/admin/factory` |
| 直播后台, live2, 微信直播后台 | `${workspace_root}/weixin-live` |
| 直播监控, live-monitor | `${workspace_root}/zan-projects/admin/live-monitor` |
| 商城小程序 | `${workspace_root}/shop_mp` or `${workspace_root}/zan-mini`; require discriminator if both match |
| C 端直播, instant apps | `${workspace_root}/instant-apps` |
| 主后台, 商家后台登录/权限 | `${workspace_root}/jbz_admin` unless a more exact project signal exists |

## Function 2 - Service Name Resolution

Use this when the user asks for a service name, deployment identifier, Jenkins service field, or project-to-service mapping.

Rules:

1. First route the project with Function 1.
2. Read `projects.*.service_name` or subproject `service_name`.
3. If `service_aliases` exists, use the alias that matches the user's wording.
4. If no `service_name` is listed, use the default rule from `defaults.service_name_rule`: default to the project name.
5. Do not invent a service name from a Jenkins job or package name.

Common exceptions that must be preserved:

| Project/Path | Service Name |
|---|---|
| `jbz_admin` | `main_menu` |
| `weixin-live` | `live2` |
| `supplier-admin-web` suppliers module | `suppliers` |
| `supplier-admin-web` middleManage module | `middleManage` |
| `provider-mobile` | `supplier-mobile` |
| `zan-projects/admin/facilitator` | `facilitator` |
| `zan-projects/admin/factory` | `factory` |
| `zan-projects/admin/live-monitor` | `live-monitor` |

## Function 3 - Jenkins Job Lookup

Use this when the user asks to run, trigger, deploy, package, test environment, or find a Jenkins job.

Workflow:

1. Route the project with Function 1.
2. Read `jenkins_jobs` from the centralized `${project_knowledge_root}/data/workspace/project-relations.yaml`, falling back to `references/project-relations.yaml`.
3. Return the exact Job name, the exact Job URL when indexed or read back from
   Jenkins, and the routing evidence. A consumer that needs a clickable Job
   link must block when the URL cannot be evidenced; it must not derive one.
4. If a project is not listed in `jenkins_jobs`, say it is not listed in the workspace index; do not guess a `front-*-test` name.
5. For public libraries and tooling packages, check whether they map to the shared `npm-tools-test` job.

Output:

- `项目`
- `路径`
- `Jenkins Job 名称`
- `Jenkins Job 地址`（必须来自知识库或 Jenkins 读回，无法解析时不得猜测）
- `命中依据`

## Function 4 - Private Package And Library Ownership

Use this when the user mentions a private package, shared library, component library, UI kit, SDK, or asks what projects may be affected by a package change.

Workflow:

1. Match package names against `packages`.
2. Return owner project and package path.
3. Return listed consumers from `packages.*.consumers`.
4. Check `dependencies` for broader cross-project relations.
5. Resolve the package visibility from explicit package metadata or project
   knowledge; an `@scope` name alone does not prove that a package is private.
6. Only search `package.json` files after the workspace index is read and the
   package is not listed or its visibility needs confirmation.

Output:

- `包名`
- `归属项目`
- `包路径`
- `是否私有包`及其依据
- `消费者项目`
- `影响范围`
- `下一步应读取`

## Function 5 - Project Knowledge Entry And Graphify

Use this when the target project is known and the answer needs code/module structure.

Rules:

1. Read centralized project `AI_CONTEXT.md` before source files.
2. Read centralized `graphify-out/GRAPH_REPORT.md` before raw search if it exists.
3. If centralized `graphify-out/wiki/index.md` exists, prefer it for conceptual navigation.
4. Use centralized Graphify commands with explicit `--graph` for relationship questions:
   - `graphify query "<question>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`
   - `graphify path "<A>" "<B>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`
   - `graphify explain "<concept>" --graph ${project_knowledge_root}/data/projects/<project-relative-path>/graphify-out/graph.json`
5. Do not query an arbitrary local `graphify-out/graph.json` when the centralized project graph is available.
6. Use raw source search only after project and module scope are narrowed.

Graphify is a code-structure graph, not a business ontology. Business routing comes from centralized `project-relations.yaml`; code relationships come from centralized Graphify output and project context.

For `zan-projects`, select the subproject first whenever possible, then read that subproject's centralized `AI_CONTEXT.md` and `graphify-out/GRAPH_REPORT.md`.

When the answer depends on Graphify, report which centralized graph path was queried.

## Function 6 - Cross-Project Relationship And Impact Analysis

Use this when the user asks how projects relate, what a change may affect, or which projects consume a package/module.

Workflow:

1. Route all mentioned projects, packages, service names, or domains.
2. Read `dependencies` and `packages`.
3. If a shared package is involved, start from Function 4.
4. If a business flow spans projects, combine `routes`, `domains`, and centralized project `AI_CONTEXT.md` files.
5. Read Graphify reports only for the narrowed projects; do not scan every repository by default.

Output:

- `涉及项目`
- `关系类型` such as dependency, package consumer, same business domain, deployment relation
- `依据`
- `可能影响`
- `需要继续确认的代码入口`

## Function 7 - Code Entrypoint Location

Use this when the user asks where a feature or module is implemented.

Workflow:

1. Convert business words to candidate projects with Function 1.
2. Resolve service name and subproject if relevant.
3. Read centralized candidate `AI_CONTEXT.md`.
4. Read centralized candidate `graphify-out/GRAPH_REPORT.md`.
5. Try centralized `graphify query --graph ...` for relationship or module questions.
6. Search source only inside the narrowed project or subproject.
7. If the result comes from raw search, report that it is source-search evidence, not graph evidence.

Example sequence for "移动端直播项目的微信支付模块":

1. "移动端直播项目" may match `zan-mini` or `instant-apps`; route by additional signal. `provider-mobile` is 服务商移动端, not 商城直播.
2. "微信支付" is a weak business/code word by itself and cannot choose a project alone.
3. After project selection, read centralized project `AI_CONTEXT.md` and `GRAPH_REPORT.md`.
4. Search only inside the selected project for pay-related entrypoints if Graphify does not answer.

## Function 8 - Modification Preflight

Use this before modifying code after a routing or knowledge answer.

Rules:

1. Confirm the target project and subproject are identified with strong enough signals.
2. Read the centralized target project `AI_CONTEXT.md`.
3. Read project-specific development constraints before editing.
4. For `zan-projects`, read the root context and the matched subproject context.
5. Check git status in the target repository and do not revert unrelated user changes.
6. If source code changes affect an existing graph, run `graphify update .` only when the project workflow expects the graph to stay current.
7. Use the target project's own test/build/lint commands from its context; do not assume one workspace-wide command.

If the user only asks for routing or explanation, do not modify files.

For this workspace, do not modify centralized `project-knowledge` snapshots as part of ordinary business-project edits unless the task explicitly targets the knowledge repository itself.

## Output Formats

Project routing:

- `项目`
- `路径`
- `分类`
- `Wiki 服务类型`：`BUSINESS|TOOLING` when requested by a Wiki workflow
- `Wiki 服务标识`：`更新服务|工具服务-无需上线` when requested by a Wiki workflow
- `提测合并状态`：`未合并|无需上线` when requested by a Wiki workflow
- `命中依据`
- `置信度`
- `Jenkins Job 名称` when relevant
- `Jenkins Job 地址` when relevant
- `下一步应读取`

Jenkins lookup:

- `项目`
- `Jenkins Job 名称`
- `Jenkins Job 地址`
- `依据`

Package impact:

- `包名`
- `归属项目`
- `是否私有包`及其依据
- `消费者项目`
- `影响范围`
- `下一步应读取`

Code entrypoint:

- `项目/子项目`
- `依据`
- `已读取知识库`
- `候选入口`
- `还需要搜索/验证的点`

Ambiguous routing:

- `候选项目`
- `各自命中依据`
- `缺少的判别信息`
- Ask for one concrete discriminator only.

## Common Mistakes

- Calling `company-project-routing` after this skill has enough information.
- Guessing a project from weak words like `支付`, `直播`, `后台`, or `登录`.
- Treating Graphify as a business-term router.
- Running broad `rg` or source-file reads before routing the project.
- Querying Graphify without pinning `--graph` to the matched centralized project graph.
- Reading all repositories when `project-relations.yaml` can narrow the scope.
- Reading generated knowledge from business repositories after it has been migrated into `project-knowledge`.
- Stopping at `zan-projects` root instead of selecting a subproject.
- Returning a Jenkins job without checking `jenkins_jobs`.
- Ignoring `service_name` exceptions such as `jbz_admin -> main_menu` and `weixin-live -> live2`.
- Ignoring private package ownership when a request mentions `@zan/*`, `@jbz/*`, UI libraries, or shared SDKs.
