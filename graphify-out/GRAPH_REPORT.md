# Graph Report - skills  (2026-05-13)

## Corpus Check
- 20 files · ~7,300 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 217 nodes · 197 edges · 22 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `TAPD 工作流回归场景（RED/GREEN）` - 24 edges
2. `TAPD 工作流` - 17 edges
3. `项目地图` - 14 edges
4. `阶段流程` - 9 edges
5. `阶段补充` - 9 edges
6. `阶段四：代码评审` - 8 edges
7. `管辖项目 MR 审核` - 8 edges
8. `Repository Guidelines` - 7 edges
9. `提测 Wiki 模板` - 7 edges
10. `分支与 Worktree 策略` - 7 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (22 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (25): code:md (### 回归日期), TAPD 工作流回归场景（RED/GREEN）, 使用方式, 场景 A：直接写月目录（应阻断）, 场景 B：模板字段缺项（应阻断）, 场景 C：自动合并无关历史（应阻断）, 场景 D：未先确认阶段就写回（应阻断）, 场景 E：评论不是可点击链接（应阻断） (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (16): PRE_EDIT_GATE 硬阻断（肌肉记忆级）, TAPD 工作流, 二次进入与增量开发（打回重修/隔天继续/需求补充）, 入口, 全局变量/占位符定义, 分支基线原则, 参考文件加载, 启动协议 (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (15): Common Mistakes, Core Pattern, Fast Triage, Overview, Quick Rule, Red Flags, Signal Ranking, When to Use (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (14): code:markdown (| MR（项目名称+id） | 标题 | 作者 | 目标分支 | 状态 | 需要我处理的依据 |), code:markdown (| MR（项目名称+id） | 结论（是否通过） | 主要问题 |), code:markdown (#### <项目名>!<iid> 打回理由), code:markdown (| MR（项目名称+id） | 合并结果 | 证据/原因 |), 不通过 / 暂缓详情, 仓库范围, 定位, 工具优先级 (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): code:mermaid (flowchart LR), TAPD 工作流参考, 写回 TAPD, 准备提测 Wiki, 合并到 develop, 开发执行阶段（阶段 4）, 流程图, 清理 (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (11): code:bash (graphify query "<问题>" --graph "<分组目录>/graphify-out/graph.jso), code:text (company-project-routing -> zan-projects/admin/facilitator), code:text (company-project-routing -> provider-mobile), code:text (company-project-routing -> weixin-live / zan-projects/admin/), 使用流程, 例子, 分组项目知识图谱, 和 company-project-routing 的区别 (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (10): 主 Agent 收到子 Agent 结果后的核验, 判定规则, 子 Agent 调用前置规则（主 Agent 侧必须遵守）, 独立 Agent 评审机制, 目标, 评审 Checkpoint 模板（调用时强制携带）, 评审子 Agent 只读硬约束（防越权）, 评审维度 (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (10): code:md (# 前端), code:md (# 前端), code:md ({序号}. [服务名称](git地址) **!!#ff0000 更新服务!!**), TAPD Bug 字段说明, 写入前校验, 写入校验, 创建位置, 提测 Wiki 模板 (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (8): Build, Test, and Development Commands, code:bash (npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> ), Coding Style & Naming Conventions, Commit & Pull Request Guidelines, Project Structure & Module Organization, Repository Guidelines, Security & Configuration Tips, Testing Guidelines

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (9): 1. 采集上下文, 2. 补充上下文, 3. 确认本轮范围, 4. 开发执行阶段（核心防伪装区）, 5. 合并到 develop, 6. 准备提测 Wiki, 7. 写回 TAPD, 8. 清理 (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (7): 二次确认动作, 分支与 Worktree 策略, 合规校验, 命名与路径, 目标, 策略建议口径, 记录字段（必填）

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (7): TAPD Bug 字段说明, 动态字段口径与解析规则, 目标, 结束条件, 输出要求, 采集规则, 阶段一：信息收集

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (5): code:bash (npx --package=@zan/tapd-cli@canary zan-tapd-cli <type> <id> ), Current Skills, Project Overview, tapd-workflow, yapi-workflow

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (6): 1. 分支确认（前置环节）, 2. 规划（Superpowers 路由）, 3. 实现与验证, 4. 退出条件（Gate 4）, 开发执行子流程（内部阶段 4）, 目标

### Community 14 - "Community 14"
Cohesion: 0.29
Nodes (6): 回归检查代理, 检查范围, 职责, 规则, 输入, 输出

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (7): C端用户相关, 中台 / 供应商 / 服务商, 公共库 / 数据大屏, 公司项目分布, 商家平台相关, 直播相关, 通用词（弱信号）

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (5): code:markdown (MR: <project>!<iid>), MR Code Reviewer, Output, Review Priorities, Scope

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (5): 原型处理规范, 处理步骤, 识别目标, 识别范围, 输出内容

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (5): Login Token Workflow, Overview, Reference, Token Types, Workflow

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (5): Maintenance, Output Rules, Team Identity Map, Use This Skill, Workflow

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (4): gitlab-map 使用约定, 不通过处理, 使用要求, 适用时机

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (3): Canonical Members, Notes, Team Roster

## Knowledge Gaps
- **157 isolated node(s):** `Project Structure & Module Organization`, `code:bash (npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> )`, `Coding Style & Naming Conventions`, `Testing Guidelines`, `Commit & Pull Request Guidelines` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TAPD 工作流` connect `Community 1` to `Community 9`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `项目地图` connect `Community 2` to `Community 15`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Project Structure & Module Organization`, `code:bash (npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> )`, `Coding Style & Naming Conventions` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._