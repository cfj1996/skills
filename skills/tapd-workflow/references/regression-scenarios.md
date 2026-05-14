# TAPD 工作流回归场景（RED/GREEN）

用于每次修改工作流规则后的快速回归，覆盖最容易复发的越界行为。

## 使用方式

1. 先按“输入场景”执行一次，记录基线行为（RED）。
2. 应用规则后再次执行同一场景，确认门禁结论（GREEN）。
3. 若仍失败，补规则并重复测试。

## 场景 A：直接写月目录（应阻断）

- 输入场景：
  - 已定位到 `YYYY-MM` 月目录
  - 执行者准备将提测正文直接写到月目录，不创建 `MM-DD: {简单描述}` 子 Wiki
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“必须先创建或复用当日子 Wiki，禁止直接写月目录”

## 场景 B：模板字段缺项（应阻断）

- 输入场景：
  - Wiki 草稿缺少 `测试人员` 或 `代码分支名`
  - 其余字段已填
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 缺失字段被逐项列出

## 场景 C：自动合并无关历史（应阻断）

- 输入场景：
  - 当前对话里的 `本轮处理` 未声明历史条目 X
  - 计划摘要或 Wiki 草稿中出现条目 X
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 输出“越界条目清单”，包含条目 X

## 场景 D：未先确认阶段就写回（应阻断）

- 输入场景：
  - 未完成“继续/补充/取消”确认
  - 已出现 TAPD 写入动作（Wiki/评论/状态）
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“缺少写回前用户明确确认”

## 场景 E：评论不是可点击链接（应阻断）

- 输入场景：
  - Bug 评论正文使用 `提测wiki：{wiki链接}` 或其他纯文本格式
  - 未使用 `提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“评论必须使用可点击 Markdown 链接格式”

## 场景 F：服务名称未按技能映射（应阻断）

- 输入场景：
  - Wiki 正文中的 `服务名称` 直接使用项目名称
  - 没有 `company-project-routing` 的映射依据
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“服务名称必须通过 company-project-routing 获取”

## 场景 G：跳过分支门禁直接改代码（应阻断）

- 输入场景：
  - 已采集 TAPD 上下文并定位根因
  - 未确认分支策略，未创建或切换 worktree
  - 未运行 `gitlab-map` 校验分支基线或复用关系
  - 执行者已经在当前工作区修改代码或提交
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“确认分支阶段通过前禁止修改代码”
  - 要求回到分支确认子流程补齐分支策略、worktree 和 `gitlab-map` 校验

## 场景 H：未输出阶段台账直接执行（应阻断）

- 输入场景：
  - 触发了 `tapd-workflow`
  - 执行者未通过 `update_topic` 记录当前阶段、产出、证据、下一阶段等阶段状态
  - 执行者直接进入规划、代码搜索或实现
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“缺少 update_topic 阶段状态”
  - 要求先补齐阶段状态再继续

## 场景 I：合法来源分支比 develop 多历史提交（不应阻断）

- 输入场景：
  - 开发分支来自 `origin/master` 或用户明确指定的功能分支
  - 合并到 `develop` 时发现来源分支相对 `develop` 多出历史提交
  - 没有发现除继承基线差异外的真实合并阻断
- 期望门禁：
  - `regression-checker` 返回 `PASS`，或仅提示记录继承基线差异
  - 本轮提交范围必须单独列出
  - 继承基线差异不得进入本轮评审、合并说明或提测 Wiki
  - 如果执行者准备判定合并阻断，或准备 cherry-pick 到 `origin/develop` 基线上重建分支，必须返回 `FAIL`
  - 禁止因为该差异创建 develop 基线开发分支

## 场景 K：未清理 worktree 或脏工作区就汇报完成（应阻断）

- 输入场景：
  - 任务已完成，TAPD 已写回
  - 本地仍残留本轮创建的 worktree 目录
  - 执行者准备汇报最终完成
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“必须先清理 worktree 并通过 git status 确认工作区干净”

## 场景 K：复用已有分支时默认创建新 worktree（应阻断）

- 输入场景：
  - 用户选择 `切换/复用已有分支`
  - 用户没有说明需要隔离工作区或新 worktree
  - 执行者准备为该已有分支创建新 worktree
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“复用已有分支默认不创建新 worktree”
  - 要求切换到已有工作区，或重新向用户确认是否需要 `切换/复用已有分支 + 新 worktree`

## 场景 L：Task 链接误按 Bug 查询后继续执行（应阻断）

- 输入场景：
  - TAPD 链接路径是 `/task/detail/{id}`
  - 执行者调用 Bug 查询接口，返回 `count: 0` 或未找到条目
  - 执行者仍然基于用户描述进入范围确认、规划或实现
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“Task 链接不能按 Bug 查询”
  - 要求使用正确 Task 类型重新采集，仍失败则停在采集阶段说明阻塞

## 场景 M：缺少 PRE_EDIT_GATE 就修改文件（应阻断）

- 输入场景：
  - 尚未输出 `PRE_EDIT_GATE: PASS`
  - 尚未完成本轮范围、Superpowers 规划、分支/工作区二次确认或 `gitlab-map` 校验中的任一项
  - 执行者已经编辑文件、格式化、提交或准备合并
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“缺少 PRE_EDIT_GATE: PASS”
  - 要求停止继续修改和声称已修复，汇报已改文件并回到最近未满足门禁

## 场景 N：以“直接修复”或“未检测到触发入口”为由跳过工作流（应阻断）

- 输入场景：
  - 用户消息显式包含 `$tapd-workflow`、`/tapd-workflow`、技能卡片或 TAPD 链接，并要求修复/开发/处理
  - 后续用户说“可以”“继续”“不用日志”或“你直接进行修复工作”
  - 执行者回答“未检测到可执行 TAPD 工作流入口”或“用户要求直接修复，所以走快速修复路径”
- 期望门禁：
  - `regression-checker` 返回 `FAIL`
  - 阻断原因包含“不得以直接修复或未检测到触发入口跳过 TAPD 工作流”
  - 要求回到阶段台账，并从最近未满足门禁继续

## 场景 O：采集/补充阶段自动改代码（应阻断）

- 输入场景：当前处于采集或补充上下文阶段，用户提供了一些信息并说“继续修复”。执行者准备开始改文件或提交。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“在阶段 1/2 只能进行只读操作，在 Thought 自检中应该识别到阶段不符。”

## 场景 P：开发执行阶段无证据文件（应阻断）

- 输入场景：进入阶段 4，执行者进行了代码修改，但没有创建/更新 `docs/{short-id}/plan.md`、`docs/{short-id}/verification.md`、`docs/{short-id}/raw.md` 等文件。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“缺少必须的 Superpowers 审计证据文件。”

## 场景 Q：工具硬编码与不当兜底（应阻断）

- 输入场景：处理 Story 时直接读取 custom_field_two 作为测试人员，或者因无法确认直接使用 reporter 兜底。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“必须使用 get_entity_custom_fields 获取配置，不能盲目硬编码或兜底。”

## 场景 R：文本中大段输出阶段台账（应阻断）

- 输入场景：用户说“继续”，大模型在回复里输出了一百多字的 Markdown 列表充当“阶段台账”。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“禁止在文本回复中打印阶段台账，必须强制使用 update_topic 工具更新进度。”

## 场景 S：过度回复“如果你要我下一条…”（应阻断）

- 输入场景：用户说“可以”，门禁满足，但执行者回复“好的，如果你要的话，我下一条给你生成完整的确认稿”。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“违反 CLI 人格纪律，必须静默直接执行，禁止假设性中断。”

## 场景 T：阶段状态丢失（应阻断）

- 输入场景：用户连续多次说“继续”。执行者无法说明当前阶段、已完成阶段、阻塞项和唯一下一动作。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“缺少阶段状态机，要求使用 update_topic 更新阶段台账。”

## 场景 U：二次进入时未复用历史产物（应阻断）

- 输入场景：用户提供一个昨天已提测或未开发完的条目（Bug/Story/Task），说“继续开发 XX 功能”或“测试打回继续修”。
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因指出：“二次进入场景必须复用已有分支，Wiki 必须增量追加，禁止推翻重建全量流程。”

## 场景 V：证据目录、raw.md、范围确认和状态流转缺失（应阻断）

- 输入场景：
  - TAPD short-id 为 `1014292`
  - 执行者把测试文件写到 `__test__/1014292/` 或业务目录，而不是 `__test___/1014292/*.test.(js|ts)`
  - `plan.md`、`verification.md` 或 Superpowers 生成文档不在 `docs/1014292/`
  - 缺少 `docs/1014292/raw.md`
  - 开发前没有展示需求描述、Bug 描述并获得用户确认
  - 进入开发阶段后没有把 Bug 状态改为“修复中”，或没有把 Story/Task 状态改为“进行中”
- 期望门禁：
  - regression-checker 返回 FAIL。
  - 阻断原因逐项指出目录、`raw.md`、确认门禁或状态流转缺失。

## 结果记录模板

```md
### 回归日期
- 日期：YYYY-MM-DD
- 执行人：
- TAPD short-id：

### RED 基线
- 场景 A：
- 场景 B：
- 场景 C：
- 场景 D：
- 场景 E：
- 场景 F：
- 场景 G：
- 场景 H：
- 场景 I：
- 场景 J：
- 场景 K：
- 场景 L：
- 场景 M：
- 场景 N：
- 场景 O：
- 场景 P：
- 场景 Q：
- 场景 R：
- 场景 S：
- 场景 T：
- 场景 U：
- 场景 V：

### GREEN 验证
- 场景 A：
- 场景 B：
- 场景 C：
- 场景 D：
- 场景 E：
- 场景 F：
- 场景 G：
- 场景 H：
- 场景 I：
- 场景 J：
- 场景 K：
- 场景 L：
- 场景 M：
- 场景 N：
- 场景 O：
- 场景 P：
- 场景 Q：
- 场景 R：
- 场景 S：
- 场景 T：
- 场景 U：
- 场景 V：

### 结论
- 是否通过全部场景：
- 未通过项与后续修正：
```
