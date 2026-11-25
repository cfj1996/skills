# Zan Workflows

| 工作入口 | 第一次会话 | 新会话 |
| --- | --- | --- |
| [需求开发](skills/developing-requirement/SKILL.md) | 收集 Story，确认各项目的功能、交互、接口和验收 | 执行该 Story 的 TAPD Plan |
| [Bug 修复](skills/fixing-bug/SKILL.md) | 收集复现、原因、受影响项目和回归用例。批量时每个 Bug 一页 | 执行该 Bug 的 TAPD Plan，沿用一条修复记录 |

[需求收集](skills/collecting-requirements/SKILL.md)有两个输出模式。「只在会话看」直接展示评审稿。普通需求开发和 Bug 修复默认生成 TAPD Plan，在用户确认当前版本后保存到执行 Wiki，读回并把链接关联至原条目，默认手动执行，到此结束。「确认并立即执行」则在同一会话直接开工。同一个工作项的所有项目、外部数据、模块、功能、交互和测试使用页内编号。

在新会话发送「执行 TAPD Plan <Wiki 链接>」进入[执行技能](skills/executing-tapd-plan/SKILL.md)。它读取确认版本和实际进度，从符合条件的步骤继续。单独打开链接时只读查看。立即与手动开工共享[执行上下文](skills/executing-tapd-plan/references/execution-context.md)，自动完成其中已确认的分支操作、测试交付及构建。历史 Task 和本地 Plan 可以只读提供范围证据。

## 实施与直接提测流程

**先实现后人工检查：** 确定清单明确“直接提测：否” → 实现、验证、独立评审
及适用记录 → 返回结果并结束 → 开发者自行检查代码。

**直接提测：** 开发者发起 `$submitting-for-test` → 复用原范围/分支及当前成果 →
核实人工改动，补受影响验证/独立评审 → 展示合并与测试环境及完整 Wiki 正文/补丁 →
一次确认 → 提交/推送、MR/合并 → 提交所选构建任务 → Wiki/回链及 TAPD 登记。
已完成的提交、推送或 MR 准确核实后复用，不重复开发、建分支或建 Task/Plan。
“直接提测”不等于跳过构建；明确“不构建/跳过发布”才关闭构建。

## 六列确定清单与执行清单的续接

继续已确认的六列清单，或独立交付流程要求该格式时，使用[统一清单](references/execution-checklist.md)。
先完成其中的[确认前准备](references/execution-checklist.md#确认前准备)，
再按[完整展示模板](references/execution-checklist.md#完整展示模板)生成整份清单。
范围摘要和分支预检不是执行确认点；所选测试交付的准确目标及 Wiki 预览
应在首次确认前查清，正式提交计划仍在实现评审完成后生成。

确认前叫“确定清单”，确认后同一内容转为“执行清单”；实质调整后返回
确定阶段并重印完整清单，确认后继续。顶部概览列执行项目名称（可多个）、
关联缺陷/需求及本轮交付，不重复关联记录已有标题。合并和部署按项目分别说明；同一 Bug/Story
共用一个 Wiki 选择及包含各项目条目的模板，不按项目另建页面。

| 项目 | 分支 | 交付范围 | 实施方案 | 验收标准 | 需求待确认 |
| --- | --- | --- | --- | --- | --- |

已存在且选定的 Task 只读用于限定原需求范围。

长内容通过 `#01`、`#02` 关联数字备注；有 Plan 时链接准确详情，无 Plan
直接展开，不为链接生成额外文档。对外只说明本轮目标、实际风险和具体动作，
不输出内部路由码、原始 payload 或完整 SHA。

“需求待确认”只记录业务范围、字段业务含义、规则、角色行为、流程闭环和
可观察验收的决定。接口、传输字段、凭据配置、环境和外部服务单列
[外部数据与依赖](references/external-data-dependencies.md)，同时保存已知事实、
来源、环境、缺口、补齐条件和受影响步骤；内部代码落点仍放实施依据。
需求确认、当前步骤就绪和执行授权独立判断，不因接口未出重复确认已定业务。

[跨项目 Mock 规范](references/mock-development.md)区分已接通 Query Contract Mock、
仅使用 Query 和未接入 Query 的项目，复用各自既有数据链路。默认只提供正常业务
数据；异常模拟须有明确用户/需求/验收依据。Mock 数据、启停和必要重置在数据或
配置层，默认不增加页面标识、调试模块/按钮或 Mock 分支后缀。业务层沿用稳定
数据接口，业务 hook/store 和规则不依赖 Mock 实现或参数；独立数据文件和配置
可快速拆除，退出不要求改写业务调用或流程。所有 Mock 有稳定
MOCK-* / MOCK_ONLY 代码/配置标识、路径、实际场景、真实调用边界与退出条件；
接口未知时只做功能数据场景，不猜
HTTP契约。Mock默认仅本地，普通开发/直接提测不自动授权含Mock测试交付；完整
清单必须明确展示准确范围/源码内容/测试目标/用途/操作并获人类确认。生产禁止
Mock模块、数据、handler、runtime及启用入口，源码退出、制品排除和项目发布
脚本先检后发都须有证据，关闭开关或release-check通过不能替代。正式发布不要求
读取Jenkins XML：受审项目脚本实际执行源码和发布前制品检查，失败停止发包/部署，
结果绑定准确源码、Job/构建和脚本/配置/制品指纹。可复制
[项目检查模板](assets/project-mock-check/check-mock.mjs)接入已有发布入口；
本插件更新不会自动给业务项目安装检查或修改Jenkins配置，缺接入须准确说明。

正式需求/缺陷 Plan 使用一份 Wiki Markdown。面板的旧模型仅用于还原历史评审事实。

Bug 的 TAPD 更新与单条最终修复记录规则合并展示；“合并与测试环境”明确合并、是否需要
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

## 阶段职责

| 能力 | 负责什么 | 按需加载 |
| --- | --- | --- |
| [preparing-work](skills/preparing-work/SKILL.md) | 只读条目、项目、范围与固定分支核验 | 开始及写前事实刷新 |
| [collecting-requirements](skills/collecting-requirements/SKILL.md) | 项目范围、功能点与依赖确认 | 会话稿或已确认的执行 Wiki |
| [executing-tapd-plan](skills/executing-tapd-plan/SKILL.md) | 从链接恢复已确认的 Story / Bug | 在获准分支实施、验证、回填 |
| [writing-plans](skills/writing-plans/SKILL.md) | 只读原型评审与范围证据 | 需要在原型上收集意见时 |
| [implementing-work](skills/implementing-work/SKILL.md) | 固定分支实现、验证、独立评审及 Bug 记录 | 已确认实施时 |
| [submitting-for-test](skills/submitting-for-test/SKILL.md) | dev/develop 交付、所选测试部署、Wiki 和适用 TAPD 登记 | 默认测试交付，或明确要求提测/合并构建时 |
| [going-live](skills/going-live/SKILL.md) | 原分支主线交付、适用包发布/升级、Wiki 与清理计划 | 明确要求上线时 |

交付脚本负责执行与读回，参数只在[脚本化交付说明](references/scripted-delivery.md)
和所属技能维护。未知写入结果先核查，不能盲目重试。等待人工合并时保留同一
MR 和已完成效果；清理按准确资源清单单独确认，不在主入口复制实现细则。

辅助能力仍可单独使用：[项目知识](skills/workspace-project-knowledge/SKILL.md)、
[Wiki 起草](skills/drafting-wiki/SKILL.md)、[补 Wiki 链接](skills/linking-tapd-wiki/SKILL.md)、
[构建发布](skills/running-release/SKILL.md)、[合并请求 Review](skills/merge-request-review/SKILL.md)、
[登录令牌](skills/login-token-workflow/SKILL.md)、[人员映射](skills/team-identity-map/SKILL.md)、
[历史记忆](skills/project-memory-context/SKILL.md)、
[mp_log 查询](skills/searching-mp-logs/SKILL.md)。不要在开始时一并加载全部能力。

合并请求 Review 使用 `$merge-request-review`，面向具有合并权限的人员。可处理指定 GitLab MR、
明确项目或经核实的当前用户待处理列表；合并权限和本人处理关系分别核实。
覆盖 B/C 端、小程序、后端、工具包和工程配置；
通用检查包含修改依据、正确性、工程设计、兼容影响与验证，专项按实际改动加载。
项目知识、TAPD/Wiki 与 Zan 按实际适用要求使用。旧管辖配置不再决定审核资格，
未登记项目可直接基于 GitLab 和仓库证据审核；原有分支及合并授权门禁继续适用。
发现、审核、合并可独立执行；批准和合并按准确授权分别执行，写前刷新当前账号对目标的
有效权限及统一门禁。数据交接、合并细则和报告模板分别维护在该技能的 references 下。
技能已更名，旧调用名称需更新；仓库历史文档中的旧名称仅记录当时状态。

## 插件执行反馈

工作流在本地记录版本、阶段、确认事项、人工纠正和结果；公共交付会话自动关联
请求事件，其他步骤明确区分摘要与覆盖缺口。记录失败不影响开发/交付，不保存
原始 Plan、工具参数、凭据或完整聊天。详见[执行反馈说明](references/execution-feedback.md)。

同事可说“提交本次插件执行反馈，主要问题是：中途重复确认了三次”，由
[report-execution](skills/report-execution/SKILL.md) 导出脱敏摘要与 ZIP，上传附件并
创建 GitLab Issue，读回后返回链接。“仅导出/先预览”不上传；未要求反馈时不上传。
接收项目固定为 [chenfangjie/skills](http://git.jubaozan.cn/chenfangjie/skills)（ID 374），
无需首次设置或选择项目，沿用现有 GitLab MCP 账号。相同报告修订复用 Issue，
结果未知保留回执先核实，不自动重试写入。设置
ZAN_WORKFLOWS_RECORDING=off 可关闭自动记录；旧运行没有日志时如实报告缺口。

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
| 火山 TLS | `volcengineTls` 中的 AK/SK、地域、Endpoint 和 Topic ID，临时凭证填写 Token |
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
使用 $fixing-bug 修复 <TAPD Bug URL>。先让我确认各项目的修复点、回归用例和执行文档。
使用 $collecting-requirements 只在会话中评审 <需求或 Bug URL> 的项目、功能点与数据缺口。
使用 $executing-tapd-plan 执行 <执行 Wiki URL>。
使用 $developing-requirement 开发这个需求：<TAPD URL>。本次只完成开发和验证。
使用 $developing-requirement 开发这个 Task：<TAPD URL>。仅处理所选任务。
修复完成后合并到 dev，并构建项目测试环境。
```

插件问题提交到[本仓库 Issues](https://github.com/cfj1996/skills/issues)，项目映射与
知识问题提交到[project-knowledge](http://git.jubaozan.cn/chenfangjie/project-knowledge/issues)。
提供最小复现和脱敏错误，不附 token、密码或客户数据。

## Jenkins 参数维护与部署

已接入项目的完整构建参数、默认值、choices和环境profile固定在project-knowledge的
`data/workspace/jenkins-build-contracts.json`，人工策略在`sources/jenkins-build-policies.json`。
独立运行`npm run jenkins:sync-build-contracts -- --instance ops`维护；采集只读Jenkins。
部署不再查询Jenkins参数配置，不做隐式在线刷新；使用
[离线解析与执行脚本](references/frozen-jenkins-parameters.md)校验实际参数、显式填充默认值，
固定环境/平台/发布类型不可被覆盖。缺失Job或未核实profile在构建前阻断。
