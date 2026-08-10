# Zan Workflows 插件设计

## 目标

在当前技能仓库中新增 Codex 插件 `zan-workflows`，将仓库最外层 `skills/` 下现有的六个独立技能纳入同一个插件，使它们能够通过仓库 marketplace 作为一组安装和使用。

## 范围

迁入以下技能：

- `login-token-workflow`
- `managed-mr-review`
- `project-memory-context`
- `tapd-workflow`
- `team-identity-map`
- `workspace-project-knowledge`

本次不迁移 `plugins/page-delivery-workflow/skills/reviewing-page-delivery`，也不修改或删除 `page-delivery-workflow` 插件。

## 目录结构

新增目录：

```text
plugins/zan-workflows/
├── .codex-plugin/
│   └── plugin.json
└── skills/
    ├── login-token-workflow/
    ├── managed-mr-review/
    ├── project-memory-context/
    ├── tapd-workflow/
    ├── team-identity-map/
    └── workspace-project-knowledge/
```

每个技能目录完整复制其 `SKILL.md`、`agents/`、`references/`、`scripts/` 等已有内容，不改写技能行为。

## 插件清单

`plugins/zan-workflows/.codex-plugin/plugin.json` 使用以下约定：

- 插件名称：`zan-workflows`
- 初始版本：`0.1.0`
- 技能入口：`./skills/`
- 展示名称：`Zan Workflows`
- 分类：`Productivity`
- 能力描述覆盖公司项目上下文、TAPD、GitLab MR、调试令牌、团队身份映射和项目记忆等工作流

清单只声明实际存在的插件能力，不增加 MCP、App、Hook 或其他可选组件。

## Marketplace

在 `.agents/plugins/marketplace.json` 的 `plugins` 数组末尾追加 `zan-workflows`，保持现有 marketplace 名称和展示名称不变。新条目使用仓库本地路径 `./plugins/zan-workflows`，安装策略为 `AVAILABLE`，认证策略为 `ON_INSTALL`，分类为 `Productivity`。

## 兼容策略

外层 `skills/` 下的六个独立技能目录暂时全部保留，以兼容现有安装和引用方式。迁移完成后，插件内 `plugins/zan-workflows/skills/` 作为后续维护源；外层目录属于暂时保留的兼容副本。

本次不增加同步脚本、符号链接、一致性测试或自动校验机制。后续修改技能时，需要由维护者主动决定是否同步兼容副本。

## 错误处理

- 若插件清单未通过官方校验，修正清单字段后重新验证。
- 若任一复制后的技能未通过 Skill 校验，先确认问题是否已存在于原技能；迁移任务不借机改写无关技能行为。
- 若 marketplace 已存在同名条目，停止追加并核对已有插件来源，避免产生重复条目。

## 验证

完成迁移后执行：

1. 对插件内六个技能分别运行 Skill 官方校验器。
2. 对 `plugins/zan-workflows` 运行 Plugin 官方校验器。
3. 检查 marketplace JSON 可解析，且新条目指向正确目录。
4. 检查外层六个独立技能目录和现有 `page-delivery-workflow` 均未被修改。

不新增测试、同步脚本或副本一致性检查。

## 完成标准

- `zan-workflows` 具有合法插件清单并包含六个完整技能。
- 仓库 marketplace 能发现 `zan-workflows`。
- 官方 Skill 与 Plugin 校验全部通过。
- 外层独立技能和现有插件保持原状。
