# 提交前环境检查

仅在本轮确实需要新建 commit 时，在准确提交说明确定后执行一次
[check-commit-readiness.mjs](../scripts/check-commit-readiness.mjs)。已提交内容的
推送/MR不重复检查；说明、Hook、依赖或执行环境变化才重验受影响项。

```bash
node "$PLUGIN_ROOT/scripts/check-commit-readiness.mjs" --json <<'JSON'
{"repositoryPath":"/absolute/repository","message":"fix: 修复订单备注上限\n\n--bug=1018520"}
JSON
```

- 沿用项目已核实的提交运行时，在后续 `git commit` 相同的 cwd/PATH/Node
  环境下检查；工具自身的 Node 不证明 Hook 使用的 Node 正确。
- 脚本只读有效 `commit-msg` Hook，识别旧 Husky 初始化文件和新版转发，
  通过项目本地 `@commitlint/cli` 检查完整多行说明；不运行 Hook、提交或下载依赖。
  校验遵守项目实际规则，包括正文行长，不用自己复制一套 commitlint 规则。
- 初始化路径按真正引用它的 Hook 所在目录解析；Husky 9 dispatcher 与项目
  Hook 分开处理。Git 有效 Hook 缺失/不可执行时报告 `MISSING|INACTIVE`、
  `messageValidation=NOT_CONFIGURED`，不运行 linter 或自动安装/维修 Husky。
  项目 Hook 由新版 dispatcher 调用时，不要求它自己有执行位。项目明确要求
  Hook/commitlint 仍是调用方的硬性门禁，不能凭 `READY` 略过。
- `BLOCKED` 时先修复具体环境/说明问题：恢复项目既有 Husky/锁定依赖，或选择
  已验证且兼容的运行时。不得跳过 Hook、用 `npx` 临时下载最新 commitlint，
  或不断重试 `git commit` 探测环境。不为本次提交顺带升级项目构建体系。
- `READY` 只说明已执行的预检通过。`messageValidation=NOT_CONFIGURED`
  表示没有生效的 commitlint 检查，不是说明验证通过。自定义 Hook 和实际
  Git 提交仍以真实执行结果为准，预检不代替分支、差异、授权或提交读回。
- Node/commitlint 通过有时限、内存和进程组清理的执行器运行，保留失败日志；
  无法核验则停止当前提交，不声称已提交，不安装或修改项目配置。
