# Zan Workflows

日常研发从两个入口开始，其他技能由当前阶段按需调用。

| 入口 | 适用工作 | 默认终点 |
| --- | --- | --- |
| `$fixing-bug` | 一条或一组 TAPD Bug | 修复、验证、独立评审、记录及测试交付 |
| `$developing-requirement` | 一条 TAPD Story 或选定 Task | 开发、验证、独立评审及测试交付 |

## 两条主流程

**Bug：** 读取与定位 → 六列清单确认 → 固定分支与修复状态/开始记录 →
修复验证 → 独立评审 → 完成记录 → 核对执行清单后交付。

**需求：** 读取需求/所选任务与缺口 → 准备必要的任务和方案 → 六列清单确认 →
执行已批准的 Task/分支/Plan 写入 → 实施验证 → 独立评审 → 按任务返回结果 →
核对执行清单后交付。

- 小改动使用简短执行说明；确需正式 Plan、任务创建/更新、多人协作或已有
  正式计划时，才进入对应 Task/Plan 能力。见[准备与验证规则](references/adaptive-workflow.md)。
- 任务创建统一交 `breaking-down-requirement`，确认后调用 TAPD MCP 的
  `create_task`（单个）或 `create_tasks`（同需求批量）；开发清单与 Plan 复用
  同一任务结果。参数与能力检查见[任务创建路由](references/tool-routing.md#tapd-任务创建)。
- 先查证、后提问，复用同一份事实；进入写阶段只刷新会变化的事实。
- 确认后由 `implementing-work` 统一开发：小任务直接执行，独立步骤按
  [多任务实施](skills/implementing-work/references/parallel-execution.md) 分批并行，
  通常同时 2 个开发子代理、最多 3 个。主代理统一控制共享操作、集成与评审。
- 初始清单统一确认已展示的范围、分支及本轮写入。继续同一工作时使用原始
  分支，已有有效确认不重复问；实质变化只重开受影响内容。
- 普通修复/开发默认合并实际 dev/develop、构建测试环境和提测 Wiki，先展示
  完整确定清单和模板，一次确认后下游按准确计划核对并消费执行清单，不按阶段
  重复询问；独立调用技能仍先确认自身具体计划。明确只开发/计划/分支或关闭某项
  时覆盖默认；上线仍须明确要求。“合并并构建”指实际测试分支和项目测试环境。
  “只开发 B 端相关功能”“仅改前端”“只做所选 Task”只限定业务范围，
  不表示不提测，不关闭默认交付。

提测阶段只确认 Jenkins 已接受构建任务：记录准确队列链接后继续 Wiki 和 TAPD，
不等待排队、构建启动或完成。结果显示“构建任务已提交”；包构建尚无发布证据时，
Wiki 保留已验证的当前版本，无历史证据则显示“待发布”。正式发布仍等待并验证结果。

## 确定清单与执行清单

使用[统一清单](references/execution-checklist.md)，始终保留六列：
先完成其中的[确认前准备](references/execution-checklist.md#确认前准备)，
再按[完整展示模板](references/execution-checklist.md#完整展示模板)生成整份清单。
范围摘要和分支预检不是执行确认点；所选测试交付的准确目标及 Wiki 预览
应在首次确认前查清，正式提交计划仍在实现评审完成后生成。

确认前叫“确定清单”，确认后同一内容转为“执行清单”；实质调整后返回
确定阶段并重印完整清单，确认后继续。顶部概览列执行项目名称（可多个）、
关联缺陷/需求及本轮交付，不重复关联记录已有标题。合并和部署按项目分别说明；同一 Bug/Story
共用一个 Wiki 选择及包含各项目条目的模板，不按项目另建页面。

| 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 待决事项 |
| --- | --- | --- | --- | --- | --- |

有 TAPD Task 时，在“执行内容”前先列“序号、标题、工时”三列表，标题保留
真实 Task 链接。后面的六列清单按 `#F01`、`#F02` 引用，详情备注另用 `#01`；
不把任务明细藏在表后，不为阅读索引改写 Task 身份或强制补估时。
标题前用【新建】【复用】【调整】说明本轮任务操作。工时格区分任务原预估/
拟预估与本轮剩余，只展示任务列表，不追加工时汇总；局部/续修不把整个任务预估当作剩余量，
未知不按零算，同一任务跨项目只计一次。剩余预测不默认写回 TAPD 或触发日期排期。

长内容通过 `#01`、`#02` 关联数字备注；有 Plan 时链接准确详情，无 Plan
直接展开，不为链接生成额外文档。对外只说明本轮目标、实际风险和具体动作，
不输出内部路由码、原始 payload 或完整 SHA。

“待决事项”只记录需求不完整、流程不闭环、接口/字段或外部环境/权限等缺口。
每项说明影响、责任方、补齐条件和阻塞范围。等待执行确认、未开始编码或
计划测试尚未运行不计入；未查到不能直接当成不存在，密钥值不进入记录。

Bug 的 TAPD 更新与开始评论合并展示；“合并与测试环境”明确合并、是否需要
提测 Wiki、构建三项，普通修复/开发默认都需要。需要 Wiki 时，确认前先
展示本次模板预览。用户调整范围/方案或交付选项后重新展示完整清单，不能
只说沿用上次清单或把单个选项回答当成执行确认；方案就绪后只问一次
“是否按以上确定清单执行？”。正式 Wiki 正文按已确认模板和实际结果生成、
验证后沿用执行清单写入；独立提测仍确认具体正文/计划。提交号、构建号等
确定性补全不触发新确认，实质新增范围或操作才补充授权。

选定合并的冲突按已确认 A → C → B 条件自动解决、验证和评审后继续；不擅自
扩大业务或删除资源。主流程收尾给执行结果和下一步建议，不例行询问是否
继续提交、提测或清理；真实业务决定/权限缺口才暂停。见[确认复用](references/execution-checklist.md#执行清单的确认复用)。

Bug 在“合并与测试环境”末尾补“TAPD 状态：待测试（提测交付完成后流转）”。
常规完整修复先到修复中，全部提测交付条件通过后再到待测试；只修复验证则
保留修复中。预览是交付目标，执行结果以实际读回为准，续接沿用原幂等策略。

## Bug 与 Task 的区别

Bug 使用[修复人员规则](skills/implementing-work/references/bug-repair-owner.md)和
[溯源记录](skills/implementing-work/references/bug-repair-record.md)：状态与准确
处理人联合写入并读回，修复前后分别记录原因、引入证据和实际修复结果。
历史责任未知如实标明；已经待测试的续修不重置状态或处理人。
同一 Bug 涉及多个仓库时，先确认全部项目范围，各仓库分别实现与评审；
全部通过后才统一写完成记录，提测登记也等待全部必要交付完成。

需求使用[任务关联](skills/developing-requirement/references/task-linked-delivery.md)：
父需求 → 本轮所选 Task → 项目/分支 → Plan 步骤/接口与缺口 → 验收和评审 →
实际交付链接。代码进度与 TAPD 状态分别说明；只开发所选任务，不扩为全部
兄弟任务，不因代码已完成就自动改 Task 状态。人员和最终工时按实际任务核实，
只有用户要求排期时才提供日期建议。

## 阶段职责

| 能力 | 负责什么 | 按需加载 |
| --- | --- | --- |
| [preparing-work](skills/preparing-work/SKILL.md) | 只读条目、项目、范围与固定分支核验 | 开始及写前事实刷新 |
| [writing-plans](skills/writing-plans/SKILL.md) | 需求范围/验收、必要的正式 Plan | 需求分析；确需计划时 |
| [breaking-down-requirement](skills/breaking-down-requirement/SKILL.md) | Task 提案、获准创建/更新和精确读回 | 实际需要任务管理时 |
| [implementing-work](skills/implementing-work/SKILL.md) | 固定分支实现、验证、独立评审及 Bug 记录 | 已确认实施时 |
| [submitting-for-test](skills/submitting-for-test/SKILL.md) | dev/develop 交付、所选测试部署、Wiki 和适用 TAPD 登记 | 默认测试交付，或明确要求提测/合并构建时 |
| [going-live](skills/going-live/SKILL.md) | 原分支主线交付、适用包发布/升级、Wiki 与清理计划 | 明确要求上线时 |

交付脚本负责执行与读回，参数只在[脚本化交付说明](references/scripted-delivery.md)
和所属技能维护。未知写入结果先核查，不能盲目重试。等待人工合并时保留同一
MR 和已完成效果；清理按准确资源清单单独确认，不在主入口复制实现细则。

辅助能力仍可单独使用：[项目知识](skills/workspace-project-knowledge/SKILL.md)、
[Wiki 起草](skills/drafting-wiki/SKILL.md)、[补 Wiki 链接](skills/linking-tapd-wiki/SKILL.md)、
[构建发布](skills/running-release/SKILL.md)、[MR 审核](skills/managed-mr-review/SKILL.md)、
[登录令牌](skills/login-token-workflow/SKILL.md)、[人员映射](skills/team-identity-map/SKILL.md)、
[历史记忆](skills/project-memory-context/SKILL.md)。不要在开始时一并加载全部能力。

## 当前数据格式

评审面板只使用 ReviewSession v2，正式 Plan 只使用 PagePlan v3。旧版面板/Plan
输入和临时目录确认状态不再受支持；不静默转换旧内容。TaskBreakdown v1 是
独立且仍在使用的任务契约。TAPD、GitLab、Jenkins 的真实服务响应适配继续保留。

## 本机准备

- 安装 Node.js 22、Volta（固定 MCP 使用 Node.js 22.20.0）和 uv/uvx。
- 按工作区规则准备 `project-knowledge`；首次初始化在该仓库运行 `npm run init`。
  项目归属、Jenkins 映射和标准以知识库及实际读回为准。
- 从[凭据示例](references/credentials.example.json)配置个人凭据，不提交到仓库。

| 系统 | 需要的配置 |
| --- | --- |
| TAPD | TAPD_ACCESS_TOKEN、TAPD_API_BASE_URL、TAPD_BASE_URL |
| GitLab | GITLAB_API_URL、GITLAB_PERSONAL_ACCESS_TOKEN |
| Jenkins | MCP_JENKINS_URL、MCP_JENKINS_USER、MCP_JENKINS_API_TOKEN |
| YApi | YAPI_BASE_URL，及项目 token 或用户名/密码 |
| Graphify Hub | 可访问配置中的公司内网服务；缺少能力时由知识入口按证据回退 |

默认凭据文件为 `~/.config/zan-workflows/credentials.json`，Windows 对应
`%USERPROFILE%\.config\zan-workflows\credentials.json`；也可通过
`ZAN_WORKFLOWS_CONFIG` 指定绝对路径。详细配置见[MCP 设置](references/mcp-setup.md)。

在插件目录按需检查对应服务：

```bash
node scripts/start-mcp.mjs tapd-mcp --check
```

`--check` 只检查本机配置，不启动服务或证明远端权限有效。外部系统优先使用
专用 MCP；连接、认证失败时报告实际原因，不静默改用浏览器写入。

## 安装与更新

团队 Git 来源：

```bash
codex plugin marketplace add cfj1996/skills --sparse .agents/plugins
codex plugin add zan-workflows@cfj-skills
```

更新已配置 Git 来源：

```bash
codex plugin marketplace upgrade cfj-skills
codex plugin add zan-workflows@cfj-skills
```

测试未提交的本地内容：先将 marketplace 注册到本地仓库根目录，再安装。
同名来源已经存在且不同，先移除该来源注册再添加；不要直接覆盖缓存。

```bash
codex plugin marketplace add /absolute/path/to/skills
codex plugin add zan-workflows@cfj-skills --json
```

安装后核对来源与文件，重启 Codex 并新建聊天。Hook 需在客户端审阅信任；
个人 MCP 凭据独立于插件缓存。可用 `codex plugin list --marketplace cfj-skills --json`
核对启用状态。

## 调用示例

```text
使用 $fixing-bug 修复这个 Bug：<TAPD URL>。先展示确定清单。
使用 $developing-requirement 开发这个需求：<TAPD URL>。本次只完成开发和验证。
使用 $developing-requirement 开发这个 Task：<TAPD URL>。仅处理所选任务。
修复完成后合并到 dev，并构建项目测试环境。
```

插件问题提交到[本仓库 Issues](https://github.com/cfj1996/skills/issues)，项目映射与
知识问题提交到[project-knowledge](http://git.jubaozan.cn/chenfangjie/project-knowledge/issues)。
提供最小复现和脱敏错误，不附 token、密码或客户数据。
