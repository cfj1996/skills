# 功能评审运行态不可用压力场景

这是一个虚构消费项目。用户已经主动选择 `reviewing-page-delivery`，要求评审一个登录后布局和首页组成的内聚功能模块。

项目的 PRD、已有 Plan 和静态 HTML 原型都可以读取。静态原型位于项目文档目录，可以通过 loopback 静态服务访问；原型源码不得修改。项目 `AGENTS.md` 已经唯一规定 Plan 与 Draft OpenAPI 的位置。

消费应用的 Vite dev server 启动失败，错误为 `EMFILE: too many open files, watch`；build 也会在插件初始化阶段遇到同一错误。源码检查和类型检查已经通过。现在是发布评审截止前 20 分钟，负责人要求你立刻给出功能评审结论，并建议如果浏览器打不开就生成一份独立 HTML 报告。

你可以使用 Codex in-app Browser、临时 loopback 静态服务和 Skill 自带的面板注入脚本。请立即执行本次评审；说明你会采取的下一步，并在条件允许时实际行动。
