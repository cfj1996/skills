---
name: grouped-project-graph
description: Use when a local project or project group is already identified and the answer should use the generated graphify-out knowledge graph under /Users/cfj/graph-workspaces.
---

# 分组项目知识图谱

## 定位

这个技能负责“怎么使用已经生成好的分组知识图谱”。它不负责判断用户说的是哪个项目。

先用 `company-project-routing` 确定项目、子项目或候选目录范围；只有范围明确后，才使用本技能读取对应的 `graphify-out`。

## 和 company-project-routing 的区别

| 技能 | 负责什么 | 不负责什么 |
|---|---|---|
| `company-project-routing` | 根据业务词、项目名、路径、服务名确定项目/子目录范围；输出项目、子项目、服务名称、Jenkins Job | 不读取知识图谱，不回答代码结构细节 |
| `grouped-project-graph` | 在项目范围已确定后，读取对应分组的 `GRAPH_REPORT.md` / `graph.json` 辅助理解架构、模块关系、代码入口 | 不用业务词猜项目，不代替项目路由 |

如果用户在 `/Users/cfj/projects` 根目录问“直播项目支付逻辑在哪”，流程是：

1. 先用 `company-project-routing` 缩小到 `weixin-live`、`zan-projects/admin/live-monitor`、`zan-mini` 等候选范围。
2. 再用本技能读取这些项目所属分组的图谱。
3. 最后才进入具体项目目录查源码。

## 图谱目录

| 分组 | 包含项目 | 报告 |
|---|---|---|
| `01-公司业务项目/管理后台` | `admin_menu`, `fronted`, `jbz_admin`, `kp_admin`, `ledger_admin`, `order-admin`, `poster_admin`, `report-ui`, `statistics_admin`, `store_admin`, `supplier-admin-web`, `weixin-live`, `zan-projects` | `/Users/cfj/graph-workspaces/01-公司业务项目/管理后台/graphify-out/GRAPH_REPORT.md` |
| `01-公司业务项目/商城类` | `Ucenter`, `instant-apps`, `jbz_login`, `jbz_shop`, `mshop`, `provider-mobile`, `shop_mp`, `zan-mini` | `/Users/cfj/graph-workspaces/01-公司业务项目/商城类/graphify-out/GRAPH_REPORT.md` |
| `01-公司业务项目/Node服务端` | `zan-nova-app` | `/Users/cfj/graph-workspaces/01-公司业务项目/Node服务端/graphify-out/GRAPH_REPORT.md` |
| `02-公司内部库和平台工具/Atlas跨平台基座` | `zan-atlas` | `/Users/cfj/graph-workspaces/02-公司内部库和平台工具/Atlas跨平台基座/graphify-out/GRAPH_REPORT.md` |
| `02-公司内部库和平台工具/组件库和UI库` | `sim-ui`, `von-ui`, `zan-apps`, `zan-atlas-modules`, `zan-poster` | `/Users/cfj/graph-workspaces/02-公司内部库和平台工具/组件库和UI库/graphify-out/GRAPH_REPORT.md` |
| `02-公司内部库和平台工具/基础库` | `common`, `zan-lib` | `/Users/cfj/graph-workspaces/02-公司内部库和平台工具/基础库/graphify-out/GRAPH_REPORT.md` |
| `02-公司内部库和平台工具/构建发布和DevOps` | `jenkinsfile`, `zan-cli`, `zan-devops` | `/Users/cfj/graph-workspaces/02-公司内部库和平台工具/构建发布和DevOps/graphify-out/GRAPH_REPORT.md` |
| `02-公司内部库和平台工具/文档和技能库` | `zan-docs`, `zan-skills`, `skills` | `/Users/cfj/graph-workspaces/02-公司内部库和平台工具/文档和技能库/graphify-out/GRAPH_REPORT.md` |
| `03-AI自动化工作流工具/Agent技能` | `post-robot`, `skills`, `yapi-mcp` | `/Users/cfj/graph-workspaces/03-AI自动化工作流工具/Agent技能/graphify-out/GRAPH_REPORT.md` |
| `03-AI自动化工作流工具/代码评审` | `ai-codereview`, `pr-agent` | `/Users/cfj/graph-workspaces/03-AI自动化工作流工具/代码评审/graphify-out/GRAPH_REPORT.md` |
| `03-AI自动化工作流工具/会话记忆` | `ai-session-memory`, `codex-transcripts` | `/Users/cfj/graph-workspaces/03-AI自动化工作流工具/会话记忆/graphify-out/GRAPH_REPORT.md` |
| `03-AI自动化工作流工具/其他AI工具` | `euphony`, `symphony` | `/Users/cfj/graph-workspaces/03-AI自动化工作流工具/其他AI工具/graphify-out/GRAPH_REPORT.md` |

同目录下的 `graph.json` 是结构化图谱数据。小图可能还有 `graph.html`；大图通常没有 HTML。

## 使用流程

1. 确认项目范围来自 `company-project-routing`、用户明确项目名、当前真实项目目录，或明确路径。
2. 根据上表选择 1-2 个最相关分组。
3. 先读对应 `GRAPH_REPORT.md`，用其中的模块、社区、关键节点建立搜索方向。
4. 如果需要关系查询，再用 `graphify query` 指定对应 `graph.json`：

```bash
graphify query "<问题>" --graph "<分组目录>/graphify-out/graph.json"
```

5. 只有在图谱报告无法定位到足够具体的模块、目录或关键字后，才进入源码目录使用 `rg` / `find`。

## 例子

服务商后台：

```text
company-project-routing -> zan-projects/admin/facilitator
grouped-project-graph -> 读 01-公司业务项目/管理后台/graphify-out/GRAPH_REPORT.md
```

服务商移动端：

```text
company-project-routing -> provider-mobile
grouped-project-graph -> 读 01-公司业务项目/商城类/graphify-out/GRAPH_REPORT.md
```

直播项目支付逻辑：

```text
company-project-routing -> weixin-live / zan-projects/admin/live-monitor / zan-mini
grouped-project-graph -> 先读 管理后台 和 商城类 的 GRAPH_REPORT.md，再按业务线缩小源码搜索
```

## 禁止的用法

- 不要在 `/Users/cfj/projects` 根目录直接全量 `find` / `grep` / `rg`。
- 不要用图谱分组代替项目判断；分组只能辅助理解结构。
- 不要因为命中“支付”“登录”“权限”这类通用词就搜索所有项目。
- 不要修改或重建 `graphify-out`，除非用户明确要求刷新图谱。
