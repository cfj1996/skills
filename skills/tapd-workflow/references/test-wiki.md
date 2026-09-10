# 提测 Wiki 模板

## 创建位置

- 父级固定为 `提测文档` 下的月目录
- `提测文档` 页面 ID：`1150372234001008260`
- 月目录格式：`YYYY-MM`
- wiki 名称格式：`MM-DD: {slug}`（其中 `{slug}` 必须使用任务标题的中文简述）
- **在准备提测 Wiki 前，必须先查询 TAPD 详情（包括描述和所有历史评论），检查是否已经存在该条目的提测 Wiki 链接：**
  - **如果已存在提测 Wiki 链接**：直接获取该 Wiki 页面，在其基础上进行增量补充，**绝对不得**创建新的 Wiki。
  - **如果不存在提测 Wiki 链接**：
    - 先确认目标月目录存在；不存在时，先在 `提测文档` 下创建对应月目录，再创建 Wiki
    - 检查当月目录是否已有当前 TAPD 项相关子 Wiki（按 `short-id`、分支名或既有条目关联信息判定）：
      - 若没有相关子 Wiki：先创建 `MM-DD: {slug}` 子 Wiki，再进行补充写入
      - 若已有相关子 Wiki：直接对该子 Wiki 执行后续补充流程，不得重复创建同一 TAPD 项子 Wiki
- 如果月目录下已经存在按模块分组的提测文档，必须插入到对应模块中，优先放到 `前端` 模块下
- 插入规则：
  - 如果已有 `前端` 模块且模块下已经有 1 个或多个 Wiki 条目，则按顺序追加到 `前端` 模块现有条目的末尾，保持编号连续
  - 如果已有 `前端` 模块但没有 Wiki 条目，则把当前 Wiki 作为 `前端` 模块的第 1 条
  - 如果没有 `前端` 模块，则创建 `前端` 模块并把当前 Wiki 作为第 1 条
- 当 `前端` 模块下插入时，最终结构应为：
  ```md
  # 前端
  1. xxx
  xxx

  2. xxx
  xxx

  3. {wiki模版}
  ```
- 如果 `前端` 模块不存在，则直接创建：
  ```md
  # 前端
  1. {wiki模版}
  ```

## 写入前校验

- 写入 TAPD 前，必须先把最终将要写入的 Wiki 正文完整展示给用户
- 正文必须完全符合下面的模板，禁止改成摘要版、风险摘要版、问题说明版或任意自定义格式
- 模板中的以下字段必须明确可填：
  - 序号
  - Jenkins Job 名称
  - Job 参数（本次选定的打包目标参数值；无此参数的 Job 除外）
  - Jenkins Job 地址
  - 项目名称
  - Git 仓库地址
  - 开发人员
  - 功能描述
  - 分支名
  - 影响范围
  - 测试人员
  - 是否上线
- 如果月目录、模块顺序、序号、测试人员、上线状态、Job 地址、分支名任一项无法确认，必须停止并向用户说明，不得自行猜测

## 模板

```md
{序号}. Job：[{Jenkins Job 名称}?{Job 参数}]({Jenkins Job 地址}) **!!#ff0000 {服务类型}!!**
- 项目名称：[{项目名称}]({Git 仓库地址})
- 负责人：{开发人员}
- 开发人员：
  - 前端：{开发人员}
- 内容：{功能描述}
- 代码分支名：{分支名}
- 影响范围：
  1. {影响的功能模块或页面}
- 测试人员：{测试人员}
- 是否上线：{上线状态}
```

## 约定
- `序号`: 第几个wiki
- `Jenkins Job 名称`：必须使用知识库 `jenkins_jobs` 中与当前项目/子包匹配的精确 Job 名称；不得使用仓库名称、服务别名或自行猜测的名称；仅在链接显示文字中隐藏 `test`、`master` 等环境标识及相邻分隔符，例如 `front-vantix-system-test` 显示为 `front-vantix-system`；只删除已确认的独立环境标识，不误删业务名称中的同名子串。查询和证据保留原始完整 Job 名称，Job 地址保持原样
- `Job 参数`：填写本次选定的打包/发布参数，按 `参数名=参数值` 展示，多项以 `&` 连接，保留真实名称、值及顺序，并与 Jenkins 参数定义核对。包含目标项目、平台、发布类型等选择，默认不展示 `branch` 等分支参数，原开发分支单独填入 `代码分支名`。例如 `front-suppliers?platform=--suppliers`；工具库示例为 `npm-tools?PROJECT_NAME=zan-lib&RELEASE_TYPE=release:canary`。不得从 Job 名称猜测选择或把默认值当作已确认选择；无可展示参数时省略 `?` 和参数后缀，必要选择无法确认时阻断最终正文。查询格式仅用于链接文字，实际 Job 地址保持不变。
- `Jenkins Job 地址`：必须使用知识库或 Jenkins 读回的精确 Job 地址；不得使用 Git 仓库地址，也不得根据 Job 名称自行拼接
- `项目名称`：使用当前项目名称；monorepo 项目使用 `项目名称/子包名称`
- `Git 仓库地址`：使用当前项目或 monorepo 的真实 Git 仓库地址，作为项目名称的 Markdown 链接目标
- `服务类型`：业务项目写 `更新服务`；工具库/工具包项目写 `工具服务-无需上线`
- 项目类型：必须由项目知识库或包元数据中的明确证据确认，不能仅根据 `@scope` 判断为工具项目
- `前端开发人员`：当前 TAPD 的登录人员 或 Bug 的 `de` 字段（开发人员）
- `功能描述`: 这个分支开发的功能描述
- `分支名`：统一使用真实 Git 分支名，不得使用 `short-id`
  - 生成 Wiki 前必须计算并记录 `effective_wiki_branch_name`，其值必须等于原开发源分支，也就是本轮承载业务修复/需求提交的 `feature/*` 或 `fixbug/*` 分支。
  - 走 `A -> C -> develop` 冲突中间分支流程时，`effective_wiki_branch_name` 必须是原开发源分支 `A`；禁止把 `merge/*` 中间分支 `C` 写入 Wiki 的 `代码分支名` 字段。
  - 同一个 Wiki 条目只能出现一个代码分支名；禁止同时写“中间分支”和“修复分支”，也禁止只写或重复写 `merge/*` 中间分支。
  - 若无法从合并记录、MR 或 GitLab 读回中确认原开发源分支，必须停止准备 Wiki，不得猜测。
- `影响范围`：从当前计划的风险评估、验证结果或实现总结中汇总，多条使用序号
- 同一个需求/功能多次修复时，必须先判断本轮修复是否影响功能行为：
  - 如果仅是重构、日志、测试、构建或其他对功能无影响的变更，可以不更新 Wiki。
  - 如果影响功能行为，复用对应项目的已有 Wiki 条目，在该条目的 `影响范围` 字段下按序追加本轮新增的功能模块或页面，不得新建重复条目；业务项目上一轮为 `已合并` 时，本轮同时重置为 `未合并`，工具项目保持 `无需上线`。
  - 无法确认是否影响功能时必须停止并补充证据，不得猜测或直接更新。
- `测试人员`：Bug 优先使用 `te` 字段；若 `te` 为空或为 Story，必须先通过 `get_entity_custom_fields` 动态解析出代表“测试人员”的自定义字段获取。解析不到时向用户确认并记录到 MEMORY.md，禁止盲目兜底 `reporter`。
- `上线状态`：普通业务项目提测时写 `未合并`，合入 `master` 后写 `已合并`；工具库/工具包项目写 `无需上线`
- 提测完成后，Bug 评论正文必须固定为 `提测wiki：[https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id}](https://www.tapd.cn/{workspace_id}/markdown_wikis/show/#{wiki_id})`（Markdown 可点击链接），不能写成说明段落、总结段落或多行说明
- 调用 `create_comments` 前必须通过 `TAPD_COMMENT_GATE`：评论正文只能由最终 Wiki 链接自动生成，且必须完全等于上述单行格式；禁止追加 MR、Jenkins、构建结果、实现说明或验证摘要

## TAPD Bug 字段说明

| 字段缩写 | 全称 | 含义 |
|----------|------|------|
| `te` | tester | 测试人员（提测时使用此字段） |
| `de` | developer | 开发人员 |
| `reporter` | reporter | 报告人（提交Bug的人） |
| `current_owner` | current_owner | 当前处理人 |
| `auditer` | auditer | 审核人员 |
| `confirmer` | confirmer | 验证人员 |

## 写入校验

- 先使用 `workspace-project-knowledge` 根据 `jenkins_jobs`、项目分类和包归属解析精确的 Jenkins Job 名称、Job 地址、项目名称及服务类型，并在本轮产物中保留映射依据；禁止把项目名称、仓库名称或别名直接当作 Job 名称。
- 必须先通过动态查询确认 `测试人员` 字段配置，再生成 Wiki 正文，禁止直接硬编码 `custom_field_two` 或盲目 fallback。
- 必须先确认原开发源分支，并将 `代码分支名` 填为 `effective_wiki_branch_name`；Wiki 正文中只能有一行 `- 代码分支名：...`，且该行只能包含一个 `feature/*` 或 `fixbug/*` 分支名。
- 必须确认项目类型，并据此计算唯一 `上线状态`：业务项目只能按 `未合并`/`已合并` 流转，工具项目固定为 `无需上线`。
- 复用现行模板条目继续提测时，业务项目有新增功能且状态为 `已合并`，必须重置为 `未合并`；缺失状态或非现行状态值直接阻断，不做旧模板迁移。
- 先读取父级月目录正文，确认是否存在 `# 前端` 模块以及已有条目顺序，再决定序号和插入位置。
- 先确认当月目录内当前 TAPD 项是否已有相关子 Wiki：没有则先创建，有则复用既有子 Wiki 并增量补充。
- 如果月目录正文为空，默认创建 `# 前端` 模块并把当前 Wiki 作为第 1 条。
- 如果正文中已经存在模块，必须采用增量追加，不得整页替换。
- **影子备份风险控制**：在执行任何 Wiki `update_wiki` 操作前，必须先将读取到的原正文（若存在）缓存到 thought 思考过程中。若写入后用户反馈内容异常或发现逻辑错误，必须能够根据缓存的原正文进行手动回滚。
- 当处理二次进入（测试打回、继续开发、需求补充）时，找到该条目现有的 Wiki 记录；如果本轮影响功能，只在对应条目的 `影响范围` 字段下增量追加新增模块或页面，严禁覆盖或删除历史内容；对已确认不影响功能的修复，按上面的策略跳过 Wiki 更新。

## WikiWriteGate

调用 `create_wiki` 或 `update_wiki` 前后必须记录并校验：

- `target_wiki_id`：将写入的 Wiki 页面；新建时先记录父级和预期标题，创建后记录实际 ID。
- `write_mode`：`create`、`update` 或 `append_existing`。
- `before_content_hash`：写入前正文 hash；新建页面时记录为 `NEW_PAGE`。
- `expected_patch`：本轮预期新增或变更的最小正文片段。
- `after_content_hash`：写入后重新读取目标 Wiki 得到的正文 hash。
- `readback_contains_expected_patch`：写入后读回正文是否包含 `expected_patch`。
- `write_result`：`PASS` 或 `FAIL`。

`readback_contains_expected_patch` 不是 `true` 时必须停止，不得写 TAPD 评论或更新状态。功能性增量开发时，`write_mode` 必须为 `append_existing`，并且 `before_content_hash` 不能等于 `NEW_PAGE`。

## TAPD_COMMENT_GATE

调用 `create_comments` 前必须记录并校验：

- `wiki_url`：最终 Wiki 完整 URL。
- `expected_comment_body`：由 `wiki_url` 生成的固定单行 Markdown。
- `actual_comment_body`：即将传给 `create_comments` 的真实字符串。
- `comment_format_result`：`PASS` 或 `FAIL`。

`actual_comment_body` 必须完全等于 `expected_comment_body`。如果不相等，或包含 MR、Jenkins、构建结果、实现说明、验证摘要、多行说明，必须停止写评论。
