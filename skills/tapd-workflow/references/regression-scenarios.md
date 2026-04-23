# TAPD Workflow 回归场景（RED/GREEN）

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
  - `change-request.md` 的 `本轮处理` 未声明历史条目 X
  - `task-plan.md` 或 Wiki 草稿中出现条目 X
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
  - 未使用 `提测wiki：[wiki链接]({wiki链接})`
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

### GREEN 验证
- 场景 A：
- 场景 B：
- 场景 C：
- 场景 D：
- 场景 E：
- 场景 F：

### 结论
- 是否通过全部场景：
- 未通过项与后续修正：
```
