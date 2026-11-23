# 按已确认的执行 Wiki 开发

原会话确认并立即执行，或新会话按正式 Wiki 手动执行时，按[同一执行上下文](execution-context.md)恢复范围。仅保存结束在 Wiki。明确开工的当前指令引用已确认版本及其中具体的 Git/MR、提测和构建操作，按已选终点连续推进。

## 从链接还原范围

1. 从 Wiki URL 取空间与页面 ID，通过 TAPD 读取正式标题中的工作项类型及完整 ID、页面和父目录。若给的是工作项链接，则用“需求开发执行文档”定位 Story 执行页，用“Bug 修复执行文档”定位 Bug 执行页。按本技能的目录配置核对实际父目录和归属。即使 Bug 关联同名 Story，仍以 Bug 自己的页面和回链为准。
2. 按 [Wiki 存取契约](../../collecting-requirements/references/wiki-storage.md) 用正式 Wiki 链接调用 `READ`，也可用准确空间、`storyId` 或 `bugId`、目录读回。要求返回 `CONFIRMED`，核对原链接、实际工作项、唯一回链、正式页 ID，以及工作项确认评论 `approvalCommentId` 绑定的版本和 `approvalFingerprint`。首次保存时同一条工作项评论可同时承载回链和版本确认，修订后读取最新版本的确认评论。归档页、复制的 Markdown、其他工作项同名页或提测 Wiki 都不能作为开工入口。`READ` 已用 [Markdown 校验器](../../collecting-requirements/scripts/validate-plan.mjs) 检查索引、父子关系与引用。执行记录中的文字不参与决定范围。
3. 从正式正文选择本轮授权的 P/M/F、关联的项目级 D、UI/TC、实施顺序、依赖和跨项目验收。用户限定某个 F 时，只核验前置产物，额外需要开发的前置 F 必须已有授权。用户仅要求评审、展示或重新确认时，返回只读结果。
4. 用各 P 固定的仓库地址、分支动作、基线 ref/SHA、入口文件或符号及规范来源，读回当前 Git 根目录、origin、HEAD、refs、工作区差异与项目规则。对照 D 的依据核实当期接口契约、配置名、注入位置和可用环境。记录写入前基线；历史进度需同当前源码、测试、独立评审及所选终点的真实回执核对。全部选定工作已完成且证据仍有效时直接返回现况。部分完成则从首个未完成且已就绪的动作继续。
5. 源码、接口或规范变化时，判断其对确认实现和验收的影响。能保持原约定时更新相应技术依据并补查。需要改变业务行为、选定仓库或分支、契约、验收或交付范围时，将准确变更带回需求确认和同页修订。列出受到阻塞的 F/TC、已知事实和解除条件。

## 按工作项进入实施

**Story。** 本技能按下面的 P/M/F/UI/TC 主持实施，项目级 D 给出外部数据契约。新 Wiki 入口不创建 TAPD Task，不要求项目仓库另存计划。已有 Task 仅限定用户选中的功能范围，按既有工作项只读核对。

**Bug。** 将已核实的 Bug、执行 Wiki 确认版本、复现/预期、原因及定位依据、全量 P 与 F/TC、各项目固定分支和本轮授权，交给 [implementing-work](../../implementing-work/SKILL.md)。根据真实的仓库、分支及 Bug 事实恢复或补齐 [TapdWorkDefinition](../../preparing-work/SKILL.md)。同一 Bug 多仓一次传入全部 `work_definitions`。从本节进入原实施流程一次，由它负责各项目的源码、验证、独立评审和一个完整 Bug 记录。下文的实现、验收与回填写入同一轮结果。

若 P 声明了共用分支的前置 Bug，先从前置工作项的回链读取正式页，核实它在同一仓库、同一分支的创建或复用回执，以及已选 IMPLEMENT/SUBMIT 终点要求的评审或交付结果。证据齐全的后项按 USE_EXISTING 复用实际 ref。前项仍在开发时列出缺少的终点回执，在当前 Bug 的分支操作、状态/处理人更新和源码写入前等待。

1. 首次修改任何仓库的源码前，按[修复状态与处理人](../../implementing-work/references/bug-repair-owner.md)刷新 Bug 状态、处理人、工作流、修复账号及空间成员证据。`WRITE_ACTIVE` 需有精确的本轮授权，一次 `update_bug` 同时写入状态和 `current_owner`，准确读回两项后所有仓库共用同一回执。`NO_CHANGE` 核实状态和处理人均已匹配。待测试的 `CONTINUE` 使用 `SKIPPED_ALREADY_WAITING_TEST`，沿用当前处理人。读回不全则停止，保留实际效果。Story 跳过本步骤。
2. 在本轮开工前核对选定终点、执行 Wiki 中展示的 Bug 操作与实际用户授权。仅有保存确认、旧页面中的同意文字或开工前置条件漂移时，先解决缺少的精确授权。多仓复用同一个状态回执；如仅调查、仅改一个 F 或缺前置依赖，可以记录实际进展，发布与交付仍要求完整修复范围。
3. 每仓及跨仓都验收后，按[单条修复记录](../../implementing-work/references/bug-repair-record.md)汇总一份已独立评审的完整草稿，绑定该 Bug、账号、当前差异和验收。仅实施终点 `IMPLEMENT` 由原流程在最终评审通过后发表或复用一条记录，核对评论 ID、作者、准确 Bug 和实际 HTML 指纹。提测终点 `SUBMIT` 先交接这份草稿，由提测端在 Git、所选构建和适用提测 Wiki/回链完成后发表或复用，且在待测试登记前准确读回。执行文档回链、确认记录、进度事件、提测 Wiki 回链及 Bug 修复记录分别核验。

## 逐项实现和验证

- 在写入边界核对实际分支、基线和本轮开工授权。创建或切换分支遵守项目 Git 规则，并读回真实分支。保护既有未提交改动；遇到与选中 F 重叠且无法区分归属的修改时，暂停该范围。
- 按计划顺序执行每个就绪 F。在指定文件/符号复用 P 所列的组件、API 封装和项目规范，对应 UI 输入、触发动作、展示结果以及 D 字段映射。接口鉴权使用约定的配置引用，Wiki、测试输出和执行记录只保留引用和验证结果。
- 在开始依赖步骤前核实提供方的实际输出。契约已对齐、环境可用和真实联调通过是三个独立事实。按 [外部数据](../../../references/external-data-dependencies.md) 和 [Mock 规则](../../../references/mock-development.md) 处理阻塞；只有已确认的模拟范围可先开发，模拟结果只覆盖相应 TC。跨项目等待的功能保留在原索引下。
- “开启子智能体开发模式”为否时由主代理依序实现。为是时按 [多任务实施](../../implementing-work/references/parallel-execution.md) 派发已就绪且文件不冲突的 F，主代理持有分支和共享资源，核实前置产物。关闭开发代理不影响独立只读评审；如用户明确禁止全部代理，也须保留缺失的独立评审状态。
- 逐一执行 F 的 TC，记录实际命令/复现动作、所用数据或环境、可观察结果及未验项；跨仓 TC 对照各方在同一场景下的实际表现。参照 [本地验证](../../../references/local-verification.md) 选择项目自带的命令和预算。失败、未执行、超时、仅模拟的场景各自保留实际结论。

## 独立评审与开发回执

停止相关写入后，每个实际仓库独立核对基线到当前的完整待交付差异，保留未提交文件的内容指纹。按 [变更一致性](../../../references/change-consistency.md) 将每个 F 的决策依据、代码差异及路径、影响范围、TC 结果和跨项目验收交给 [只读评审者](../../implementing-work/agents/change-reviewer.md) 执行 `POST_CHANGE_REVIEW`。提供正式 Wiki 标识及其确认正文作为 Plan。范围、实现设计和测试须同时通过。后续人工或自动修改触及这些事实时，仅刷新受影响的验证及评审。

用现有 [ReviewedChange 字段](../../implementing-work/references/contracts.md) 表达结果。以真实仓库根目录、origin、固定分支配对，保留每个项目及 F/UI/TC 的归属、基线、当前源码/差异、测试与独立评审依据。同仓多个 P 共用一份仓库 diff，分别保留各自验收。所选仓库和跨项目验收全部通过后才可返回 `REVIEWED`；仅部分完成时列出已核实结果和具体缺口。首次仅开发的请求到此结束，需求执行状态为“开发中”。

正式执行页绑定范围，实施回执绑定实际代码、测试及评审。Bug 的所有仓库还须共享同一份已审草稿或所选终点要求的真实记录回执。部分仓库通过时记录已完成范围；全 Bug 的结论等待所有必需项目和跨仓验收。

## 将进度写回同页

开工授权涵盖进度回填时，按 [Wiki 存取契约](../../collecting-requirements/references/wiki-storage.md) 的 `PROGRESS` 追加到最终的 `## 执行记录`。使用最新 `READ` 的 `approvalFingerprint` 与 `pageSha256` 分别作为 `expectedApprovalFingerprint` 与 `expectedPageSha256`，连同准确目标、稳定 `receiptId`、单行 `entry`、单行可核实依据 `evidence` 及据实映射的 `progressAuthorized` 传入。需要同步顶部“执行状态”时，按实际事件提供 `executionStatus`。每条记录写明适用索引、当前结果和能重新核验的证据，例如 F 与 TC 对应的分支、代码版本/差异指纹、检查名称及结论。不要把凭据、测试用户数据或完整日志放进 Wiki。

同一实际事件沿用同一回执键。并发编辑、超时或返回不明时先只读核对该键与实际内容、最新版本和执行依据；已经存在则复用，仍不明确则报告缺口。读回成功后才说“已写回”。进度写入的边界是执行记录和顶部执行状态单元格。技术步骤、数据契约、分支或验收的实质修改走计划修订。

## 交给提测

本轮执行上下文覆盖提测时，自动向 [submitting-for-test](../../submitting-for-test/SKILL.md) 提供已核实的工作项和已评审仓库集合。新会话先读正式页、独立确认记录和开发回执，再核对当前源码、测试与独立评审，补取失效或缺失的证据。先看 START 返回的 workflow。CONTINUOUS_SUBMIT 将 tapdPlan 原样传给连续提测 PLAN；DELIVERY_STEPS 按 gitProjects 逐仓交付、按 buildProjects 逐 Job 构建，再办理整项 Wiki/登记；RELEASE_ONLY 只跑所选构建。历史清单或当期缺项走 MATCH_CHECKLIST，只核实当前所需字段。整体评审通过后，复用同一开工指令直接 EXECUTE。已确认的测试构建和合并不另行向用户询问。

- 按仓库交接所选 P/F/TC、原始分支/源码 SHA、完整差异、独立评审和跨仓验收。Story 使用真实需求身份，`registration.entryType=stories`、`statusAction=NONE`、`linkTaskIds=[]`。Bug 使用真实缺陷身份，`registration.entryType=bug`、`statusAction=WAITING_TEST`、`linkTaskIds=[]`，携带完整已审 `repairRecord`；已有记录以 `previousRecord` 钉住原评论 ID、作者和实际 HTML 指纹复用。登记前按原政策核对 `te`，缺省时使用 `reporter`。同一 Bug 只登记一次。
- STANDARD 提测单独生成或复用该工作项的提测 Wiki。按所选项目核实测试目标、构建选择及 Mock 的单独授权。提交操作由原提测流程预览、验证并读回。
- 根据真实交付回执分别记录提测、构建和上线事实。Jenkins 队列已接受只表示构建已提交。待另行授权的[上线流程](../../going-live/SKILL.md)实际完成，核对所需各项目的正式上线回执后，才能写“已上线”。其余进度保留“开发中”或尚未开工的“待执行”。
