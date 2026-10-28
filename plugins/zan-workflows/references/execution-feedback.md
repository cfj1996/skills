# Execution feedback

## Scope and storage

记录实际运行的版本/内容指纹、技能、目标摘要、宿主/运行时、阶段、动作、耗时、
确认事项、人工纠正、错误码、最终结局和用户评价。来源为 executor（脚本事件）、
agent_summary（观察到的阶段摘要）、user_feedback（同事评价）。默认全流程覆盖
标为 PARTIAL；仅公共交付会话为 DELIVERY_ONLY。没有结束事件、日志截断或损坏
保持 UNKNOWN。SESSION_CLOSED 只说明会话清理，不代表任务完成。

不保存原始 Plan/result、工具参数/输出、源码、凭据、完整聊天历史或工作流恢复
状态。专用本地诊断是禁止保存业务工作流文件的窄例外；不能作为写入授权、效果
账本或重放依据。额外文本证据只接受用户明确选择的片段，自动脱敏仍不能保证
识别任意未标注秘密；发送前可阅读导出文件，要求先预览时必须等用户指示再上传。

数据根依次使用 ZAN_WORKFLOWS_DATA_DIR、PLUGIN_DATA、CLAUDE_PLUGIN_DATA，
最后使用 ~/.local/share/zan-workflows。不写安装缓存或业务仓库。最多保留
100 个运行，每个事件文件 1 MiB，每次运行最多 10 个报告修订；达到上限停止
采集并说明缺口，导出/检查后由用户清理不再需要的运行目录，不自动删除未提交数据。
ZAN_WORKFLOWS_RECORDING=off 关闭记录；DISABLED 时不再追加阶段事件。目录/文件
分别按 0700/0600 创建。公共会话的 SESSION_READY 同时给出采集状态及关联 runId，
采集不可用时如实说明，不将无日志当作未执行。

## Attach to a workflow

从当前加载的 SKILL.md 解析其 ../../ 为插件绝对根，示例中的 plugin_root
是这个实际路径，不能从业务项目 CWD 或旧缓存推测。所有命令使用 Node.js 22。
输入从 stdin 传入 JSON，不把反馈文本拼成 shell 命令。

顶层工作首次开始时运行一次 start，保留返回的 runId。只收用户明确表达的短目标，
宿主版本/模型无法可靠获取时省略，记录为 unknown。同一任务内的能力切换复用
同一 runId；新任务新建，不使用“最近一次运行”作为跨任务隐式关联。
可传 project 作为短项目名；后续工作传准确 parentRunId 关联已有运行，不恢复业务状态。

~~~bash
node "$plugin_root/scripts/execution-recorder.mjs" start --json <<'JSON'
{"skill":"fixing-bug","goal":"用户明确表达的短目标","host":{"name":"codex"}}
JSON
~~~

主代理在实际发生时追加阶段开始/结束、确认请求和用户纠正。阶段使用
collection/planning/implementation/verification/review/delivery；摘要来源明确
为 agent_summary，不编造耗时或脚本事件。确认 subject 保持具体事项，记录公开
说明和规则来源，不记录隐藏推理。等待时间仅在实际可观察时记录 wait_started/
wait_finished 和 elapsedMs，不把所有工具间空闲都当用户等待。

~~~bash
node "$plugin_root/scripts/execution-recorder.mjs" event --json <<'JSON'
{"runId":"<准确运行编号>","event":{"type":"confirmation_requested","source":"agent_summary","stage":"planning","subject":"本轮修改范围","summary":"范围已展示，等待用户决定"}}
JSON
~~~

事件类型还支持 stage_started/stage_finished、action_started/action_finished、
user_correction、coverage_gap、interrupted、session_closed、retry（实际发生的重试）。
已验证产物可传 artifactUrl，只接受 HTTP/HTTPS 并移除凭据及查询参数。可记录字符串字段：
stage/action/operationId/phase/state/code/subject/summary，非负整数耗时字段：
elapsedMs/idleBeforeMs/busyMs/idleMs/requestCount；其余字段丢弃。

公共 workflow-session CLI 自动采集请求开始/结束及会话关闭，不依赖 Hook。
为它显式传入本任务 ZAN_WORKFLOWS_RUN_ID；没有关联时只新建 DELIVERY_ONLY
记录。嵌套请求及独立 MCP/CLI 未接入的内部动作不伪装为已记录：按已观察阶段
总结并标 coverage_gap。关闭进程不关闭主任务记录；最终根据已验证结果调用：

~~~bash
node "$plugin_root/scripts/execution-recorder.mjs" finish --json <<'JSON'
{"runId":"<准确运行编号>","outcome":"COMPLETED","summary":"本轮已验证结果"}
JSON
~~~

结局为 COMPLETED/FAILED/WAITING/CANCELLED/UNKNOWN。等待后还要继续追加事件时，
用 stage_finished/state=WAITING 而非 finish；finish 结束此记录，后续工作新建
关联记录。中断、进程被杀或采集失败可能没有终止事件，UNKNOWN 不等于失败。
recorder 的 list --json 返回本地候选；坏行/日志截断保留完整性缺口。记录失败
只说明采集不可用，不能中止原开发、交付或重试业务写入。

## Export

~~~bash
node "$plugin_root/scripts/export-execution-report.mjs" --json <<'JSON'
{"runId":"<准确运行编号>","feedback":{"goalReached":"PARTIAL","problem":"中途重复确认了三次","correction":"用户解释同一范围没有变化"}}
JSON
~~~

可选 evidence=[{label,text}] 最多 5 个主动选取的片段。导出 report.md、
report.json、events.jsonl、execution-report.zip，按内容生成 revision；
同内容和相同导出器重复导出一致；导出器/脱敏器升级形成新修订，保留原运行的
插件版本与指纹。已导出文件被改动则拒绝覆盖/上传。ZIP 无外部依赖，只含
固定报告文件，无任意路径附件。Issue 正文只展示末尾 60 条事件，完整记录见 ZIP。

## Fixed destination

反馈目标在提交器内写死为
[chenfangjie/skills](http://git.jubaozan.cn/chenfangjie/skills)，项目 ID 374。
无首次设置、项目选择、目标环境变量、目标参数或目标配置文件；旧的目标文件
不会参与路由。GitLab MCP 的账号认证沿用现有 credentials.json，不写死 Token。
每次提交校验 get_project 返回的 ID、完整项目 URL 和 Issues 已启用，防止连到
其他实例/项目。不对项目可见性附加限制，不创建或修改接收项目。

## Submit and reconcile

相同输入不带 --execute 是本地导出和只读预检；明确的“提交本次反馈”授权
覆盖上述固定目标和本次生成的最小报告，无需在技术预检后再次询问：

~~~bash
node "$plugin_root/scripts/submit-execution-feedback.mjs" --execute --json <<'JSON'
{"runId":"<准确运行编号>","feedback":{"goalReached":"PARTIAL","problem":"中途重复确认了三次"},"confirmed":true}
JSON
~~~

仅需本地文件时直接运行导出脚本，不调用 GitLab。提交时直接复用
upload_markdown，得到标准项目 /uploads/.../execution-report.zip 链接后创建
Issue；独立 get_issue 读回归属、标记和附件后才 VERIFIED。文件不进入 Git。

本地提交回执与准确项目、运行、报告修订及附件指纹绑定，执行前使用独占锁。
同一修订已存在时先精确查找并读回，复用 Issue，writes=0。不同修订保留独立
Issue，汇总时按 runId 去重。网络中断或写入读回失败返回 UNKNOWN，保留已知
效果；后续只读查询可发现实际建单，不自动重放状态不明的上传或创建请求。
明确已上传但尚未尝试建单的 UPLOADED 回执可复用同附件继续；其他未核实状态
需人工确认实际效果。进程崩溃残留锁返回 IN_PROGRESS_OR_INTERRUPTED；先只读
预检/检查进程和远端，再由用户清理该准确锁文件，不按锁年龄自动删除或重试。

## Maintenance

按技能、版本、步骤和错误码归类，保留原反馈链接；把确认的缺陷变成脱敏事件/
模拟工具响应的回归用例，不重放真实 Git/TAPD/Jenkins 写入。主动提交样本不代表
总执行数，达成率仅针对这些样本；成功、失败、等待、取消和 UNKNOWN 分别统计，
动作耗时、明确等待和未分类空闲分别展示。
