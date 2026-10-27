# Jenkins 固定构建参数

参数发现属于维护阶段，部署使用已维护的固定合同；不得在部署 PLAN/EXECUTE
中调用 `jenkins_get_job_parameters`、查询参数定义接口或从 Job XML 提取参数。
也不得在缺合同、未知参数或失败后隐式刷新、换 Job、重新触发。

## 权威来源与维护

- 项目到 Job：`${PROJECT_KNOWLEDGE_ROOT}/data/workspace/project-relations.yaml#jenkins_jobs`。
- 完整参数、默认值、choices、实例/URL及环境 profiles：同目录 `jenkins-build-contracts.json`。
- 人工固定策略：`${PROJECT_KNOWLEDGE_ROOT}/sources/jenkins-build-policies.json`。
- 独立刷新：在 project-knowledge 运行
  `npm run jenkins:sync-build-contracts -- --instance ops`；具体选项见其
  `sources/jenkins-build-contracts.md`。刷新只读 Jenkins，不构建、不改 Job。

刷新按已登记项目去重采集完整参数，敏感默认值不得持久化。读取失败/不存在的
Job 必须显式保留 unavailable，不能变成空参数或旧数据已验证。部分失败不报
全部成功；策略与采集结果分开维护，刷新不能覆盖人工的环境和发布边界。
这是固定配置，不设置自动过期联网策略；项目/参数变化时单独维护并重新确认
受影响计划。未登记、缺数据、未知类型或策略歧义均在构建前阻断。

## 离线准备与实际参数检查

`scripts/frozen-jenkins-contracts.mjs` 接收一个 stdin JSON 请求，只读本地合同，
返回 `PREPARED`、解析后的公开参数、绑定字段、环境/profile及内容指纹，writes=0。
默认按当前工作区定位 project-knowledge；可明确给 `projectKnowledgeRoot` 或
`jenkinsContractsPath`。不要把任意内存 definitions 当成权威数据。

请求至少给出准确项目标识、Job 名称/URL、目标环境、通道及已核实 releaseRef。
monorepo/共享 Job 使用 `jenkinsProjectKey` 指明登记身份，需要时明确
`jenkinsProfile`。同一供应商 Job 的供应商端和中台用不同 profile，不凭父项目
名称自动选择。

- 先匹配精确项目/Job/profile，再校验实际提交参数。固定的 env、service、
  platform、RELEASE_TYPE 等不能被覆盖；不只比较标签或参数定义指纹。
- 对支持的参数显式填入冻结默认值并提交，禁止依赖 Jenkins 当前隐式默认。
  未知参数、非法 choices/类型、缺少必要值或未显式注入的敏感参数均阻断。
- 工具包 PROJECT_NAME 绑定本次真实 targetProject，不能沿用默认 sim-ui。
  canary/official 分别绑定 release:canary/release:prod，测试不能变更正式通道。
- 小程序保留实际参数名 `vesion`，其默认值来自快照并作为版本参数，不用源码
  SHA 冒充。源码 expectedSha 始终独立保留。
- PLAN/EXECUTE 绑定并重读当前 Job/profile合同及实际参数值指纹；无关 Job 刷新
  不应制造新的业务决定。目标、参数或相关合同变化后刷新受影响计划与授权。

## 执行脚本

日常构建与完整发布均使用 `scripts/run-jenkins-release.mjs` 的 PLAN/EXECUTE，
由同一离线解析器准备参数。日常构建不必创建 workflow session或准备Wiki/TAPD；
完整提测/上线可以沿用原 workflow-session。两条入口均不得直接绕过本地校验
调用 Jenkins trigger。

测试提测仍使用 TRIGGER_ACCEPTED，仅报告准确构建队列已接受；独立构建/正式
发布继续核实准确构建及源码。固定参数不代替真实来源 ref/SHA、Job 身份、
权限、Mock测试授权、项目源码/制品检查和写后读回。正式发布使用受审项目
脚本及实际发布入口的版本绑定证据，检查失败必须停止发布；不要求读取
Jenkins XML。Job 身份通过可读元数据核实，不能用它代替项目检查结果，
也不得在执行中重新发现参数。
