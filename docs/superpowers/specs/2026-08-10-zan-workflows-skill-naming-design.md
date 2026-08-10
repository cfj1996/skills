# Zan Workflows TAPD 技能命名优化设计

## 目标

将六个函数式 TAPD 技能改成简短、面向业务阶段的名称。调用者通过
`zan-workflows` 插件命名空间识别能力归属，技能名称不再重复携带
`tapd-work`，具体平台、输入、输出和副作用继续由各技能契约定义。

## 最终名称

| 旧名称 | 新名称 | 业务含义 |
| --- | --- | --- |
| `resolving-tapd-work` | `preparing-work` | 提取 TAPD 信息，确定项目、仓库、分支、范围和可信度 |
| `repairing-tapd-work` | `implementing-work` | 修改代码、执行测试并完成代码评审 |
| `drafting-tapd-wiki` | `drafting-wiki` | 生成并验证可直接使用的 Wiki 草稿 |
| `submitting-tapd-for-test` | `submitting-for-test` | 完成提测阶段的合并、TAPD、Wiki 和测试版本操作 |
| `merging-tapd-work-to-master` | `going-live` | 将原修复分支合并到 `master`，并按需更新已有 Wiki 标记 |
| `fixing-tapd-bug` | `fixing-bug` | 编排完整 Bug 修复、提测和可选上线流程 |

调用链为：

```text
preparing-work
  -> implementing-work
  -> submitting-for-test
       -> drafting-wiki (STANDARD only)
  -> going-live (explicit request only)
```

完整编排入口：

```text
$zan-workflows:fixing-bug <TAPD Bug URL>
```

## 语义边界

- `preparing-work` 只形成可信、可交接的工作定义，不修改代码。
- `implementing-work` 只负责实现、验证和代码评审，不提测或上线。
- `drafting-wiki` 既可单独调用，也由 `submitting-for-test` 在
  `STANDARD` 模式下作为嵌套技能调用。
- `submitting-for-test` 表示“提测”，不是执行测试用例本身。
- `going-live` 表示团队当前定义的“上线”：原修复分支合并到
  `master`，并按需更新已有 Wiki；不自动增加部署、生产发布、冒烟测试、
  TAPD 写回或测试版本发布。
- `fixing-bug` 只编排上述能力，并继续负责 `run_id` 进度记录与恢复。

## 迁移范围

实施时必须原子地完成以下变更：

1. 重命名六个技能目录及各自 `SKILL.md` 的 frontmatter `name`。
2. 更新插件技能、agent prompt、references、设计文档和实施文档中的全部
   活跃调用名。
3. 更新 `fixing-bug` 的能力清单、输入枚举、路由表、恢复契约和验收场景。
4. 更新运行时测试中的 `skill`、`current_skill`、父子 invocation 和
   standalone workflow 标识。
5. 更新插件 manifest 的描述、默认提示和 cachebuster；marketplace 中插件名
   `zan-workflows` 不变。
6. 使用精确扫描证明插件、功能设计和原实施文档中不存在六个旧技能名，并重新
   运行运行时测试、六个 TAPD 技能校验、全部插件技能校验和插件校验。命名迁移
   设计及其实施计划因需要保留旧到新映射，不纳入旧名称清零扫描。

## 兼容策略

这是插件正式安装使用前的命名收口，不保留六个旧技能目录或别名，避免同一能力
出现两套可调用名称。旧名称只存在于 Git 历史及本次命名迁移设计/计划的映射表；
插件包、运行时测试、功能设计和原实施文档不再引用它们。

V1 的真实运行记录如果保存了旧 `current_skill` 或旧 invocation skill 名称，不做
隐式字符串迁移，也不得静默路由到其他能力。由于本插件尚未从配置的远端
marketplace 安装，当前没有需要保留的已发布运行记录。实施后新建的运行统一写入
新名称。

## 验收标准

- 六个新名称对应且只对应原来的六项能力，业务输入、输出和副作用契约不变。
- `$zan-workflows:fixing-bug` 能按新名称完成准备、实现、提测和可选上线编排。
- `STANDARD` 仍以父 invocation 方式嵌套 `drafting-wiki`；`NO_WIKI` 不调用它。
- 恢复路由、后缀失效和外部 effect 对账继续使用新技能标识并通过全部回归测试。
- `going-live` 的名称变化不会扩大其行为范围。
- 根目录下的旧独立技能目录和其他插件保持不变。
