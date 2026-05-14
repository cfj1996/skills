# Projects Workspace

# 系统定位

`${workspace_root}` 是本机公司项目和工具项目的工作区入口。这里不是单个代码仓库，而是多个业务系统、基础库、工具链、AI 技能和参考项目的集合。

`${workspace_root}` 是可替换占位符，不是固定目录名。cfj 本机默认是 `/Users/cfj/projects`；其他使用者需要按自己的本地项目根目录替换后再读取项目文件。

本文件用于给 AI 建立 workspace 级上下文：先理解项目版图，再进入具体项目的 `AI_CONTEXT.md` 和 `graphify-out/GRAPH_REPORT.md`，最后才读源码。

# 核心职责

- 作为所有本地项目的全局入口。
- 维护项目分类、业务域、项目路径和知识入口。
- 配合 `project-relations.yaml` 进行业务词、项目别名、服务名、Jenkins Job 和私有包路由。
- 为 `workspace-project-knowledge` 技能提供固定读取入口。

# 非职责范围

- 不承载具体业务实现。
- 不替代各项目自己的 `AI_CONTEXT.md`。
- 不替代各项目自己的 `graphify-out/GRAPH_REPORT.md`。
- 不直接回答代码细节；代码细节必须进入命中项目后再分析。

# 项目分类

## 公司业务项目

### 管理后台

- `admin_menu`
- `fronted`
- `jbz_admin`
- `kp_admin`
- `ledger_admin`
- `order-admin`
- `poster_admin`
- `report-ui`
- `statistics_admin`
- `store_admin`
- `supplier-admin-web`
- `weixin-live`
- `zan-projects`

### 商城类 / C 端

- `Ucenter`
- `instant-apps`
- `jbz_login`
- `jbz_shop`
- `mshop`
- `shop_mp`
- `zan-mini`

### 服务商体系

- `zan-projects/admin/facilitator`
- `provider-mobile`

### Node 服务端

- `zan-nova-app`

## 公司内部库和平台工具

### Atlas 跨平台基座

- `zan-atlas`

### 组件库和 UI 库

- `sim-ui`
- `von-ui`
- `zan-apps`
- `zan-atlas-modules`
- `zan-poster`

### 基础库

- `common`
- `zan-lib`

### 构建发布和 DevOps

- `jenkinsfile`
- `zan-cli`
- `zan-devops`

### 文档和技能库

- `zan-docs`
- `zan-skills`

## AI 自动化工作流工具

- `skills`
- `yapi-mcp`
- `post-robot`
- `ai-codereview`
- `pr-agent`
- `ai-session-memory`
- `codex-transcripts`
- `euphony`
- `symphony`

# 公司主系统运行关系

公司的主要业务系统围绕“商家”提供服务。理解项目归属时，先按运行关系判断系统位置，再进入具体项目。

## 核心链路

1. 零售批发代理综合信息系统（大后台）
   - 项目：`admin_menu`
   - 访问形态：`xxx/admin_menu`
   - 使用方：公司内部
   - 职责：管理商家、供应商、财务等公司内部运营信息。
   - 技术体系：老管理后台体系，主要是 Vue2。

2. 运营商管理系统（中台）
   - 项目：`supplier-admin-web`
   - 访问形态：`xxx/middleManage/#/login`
   - 使用方：商家管理方/平台运营方
   - 职责：商家的管理平台，用于围绕商家做中台管理。
   - 技术体系：老管理后台体系，主要是 Vue2。

3. 供应商系统
   - 项目：`supplier-admin-web`
   - 访问形态：`xxx/suppliers/#/login`
   - 使用方：供应商
   - 职责：供应商给商家供货相关能力。
   - 注意：与中台共用 `supplier-admin-web`，通过访问前缀和业务模块区分。

4. 商家平台
   - 项目名称：`main_menu`
   - 本地文件夹：`jbz_admin`
   - 宿主访问形态：`xxx/main_menu?siteId={商家id}`
   - 子项目访问形态：`xxx/{storeAdmin|kpadmin|factory|...}/xxx?siteId={商家id}`
   - 职责：商家侧主后台，通过 iframe 引入多个老后台子系统。
   - 注意：`factory` 不只服务商家平台，也服务老系统里的多个管理系统，是老系统重构页面的重要承载项目。

5. 商城系统
   - 范围：除 `provider-mobile` 外的大部分 C 端/商城项目。
   - Web/H5：`jbz_shop`、`Ucenter`、`instant-apps/web/live-app`
   - Web/H5 访问形态：`xxx/{mall|ucenter|plain-app}/xxx?siteId={商家id}`
   - 小程序：`shop_mp`、`zan-mini/plugins/live/miniprogram`
   - 注意：`zan-mini/plugins/live/miniprogram` 是独立的小程序直播包；移动端不是用户当前主要负责范围，但关系存在。

6. 服务商体系
   - 管理系统：`zan-projects/admin/facilitator`
   - 管理系统访问形态：`xxx/facilitator/login`
   - 移动端：`provider-mobile`
   - 移动端访问形态：`xxx/provider-mobile/login?tenantId={租户id}`
   - 职责：服务商后台和服务商移动端，一个管理系统，一个移动端。

## 技术演进关系

- 大后台、中台、供应商系统、商家平台大多仍属于老技术体系，主要是 Vue2。
- 老体系中部分页面已经开始使用 `factory` 重构并通过 iframe 嵌入。
- 由于 iframe 嵌入体验不够好，`zan-atlas` 平台诞生，用于跨平台/跨宿主的模块化接入；当前尚未上生产。
- 直播审核平台、客服平台等系统相对独立，不应默认混入商家主链路，除非用户明确提到。

## 路由判断规则

- 用户提到“大后台”“零售批发代理综合信息系统”“公司内部管理商家/供应商/财务”，优先路由到 `admin_menu`。
- 用户提到“中台”“运营商管理系统”“middleManage”，优先路由到 `supplier-admin-web` 的中台模块。
- 用户提到“供应商系统”“suppliers”“供应商供货”，优先路由到 `supplier-admin-web` 的供应商模块。
- 用户提到“商家平台”“main_menu”“商家后台宿主”，优先路由到 `jbz_admin`。
- 用户提到 `storeAdmin`、`kpadmin` 等 iframe 子系统时，按子系统名路由到 `store_admin`、`kp_admin` 等具体项目。
- 用户提到 `factory` 时，不要只归到商家平台；它也服务老系统多个管理后台，需要结合页面路径、访问前缀和业务词继续判断。
- 用户提到商城 H5/Web，优先在 `jbz_shop`、`Ucenter`、`instant-apps` 中判定。
- 用户提到商城小程序，优先在 `shop_mp`、`zan-mini` 中判定。
- 用户提到服务商后台，优先路由到 `zan-projects/admin/facilitator`；提到服务商移动端或 `tenantId`，路由到 `provider-mobile`。

# 全局知识入口

结构化索引：

- `${workspace_root}/project-relations.yaml`

每个项目的标准入口：

- `${workspace_root}/<repo>/AI_CONTEXT.md`
- `${workspace_root}/<repo>/graphify-out/GRAPH_REPORT.md`

特殊 Monorepo：

- `zan-projects` 的根入口是 `${workspace_root}/zan-projects/AI_CONTEXT.md`
- `zan-projects` 的子项目入口包括：
  - `${workspace_root}/zan-projects/admin/facilitator/AI_CONTEXT.md`
  - `${workspace_root}/zan-projects/admin/factory/AI_CONTEXT.md`
  - `${workspace_root}/zan-projects/admin/insight/AI_CONTEXT.md`
  - `${workspace_root}/zan-projects/admin/live-monitor/AI_CONTEXT.md`
  - `${workspace_root}/zan-projects/admin/siqian/AI_CONTEXT.md`
  - `${workspace_root}/zan-projects/example/school/AI_CONTEXT.md`

# AI 使用规则

当用户的问题涉及项目、业务、功能、服务名、Jenkins Job、私有包、代码入口或跨项目影响范围时，必须按这个顺序工作：

1. 读取本文件。
2. 读取 `${workspace_root}/project-relations.yaml`。
3. 通过 `routes`、`domains`、`projects`、`packages`、`jenkins_jobs` 定位候选项目。
4. 读取命中项目的 `AI_CONTEXT.md`。
5. 读取命中项目的 `graphify-out/GRAPH_REPORT.md`。
6. 需要跨模块关系时优先使用 `graphify query/path/explain`。
7. 最后才读取源码或执行搜索。

# 修改代码前约束

- 先确认项目和模块归属，不要凭通用业务词直接改源码。
- 公共库变更要检查消费者。
- 管理后台变更要检查路由、权限、请求层和状态层。
- `zan-projects` 变更还要读取它的 `contexts/` 项目规范。
- 修改后如需要保持图谱同步，在具体项目目录执行 `graphify update .`。

# 与技能的关系

`workspace-project-knowledge` 是本 workspace 的推荐入口技能。它取代旧的 `company-project-routing` 和 `grouped-project-graph` 的组合使用方式：

- 先做全局路由。
- 再读项目关系索引。
- 再进入项目上下文。
- 再使用 Graphify。
