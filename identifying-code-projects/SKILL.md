---
name: identifying-code-projects
description: Use when file paths, stack traces, config names, package names, or keywords must be matched to the correct repo, project, or module across multiple codebases.
---

# Identifying Code Projects

## Overview

Use the strongest code signals first, then business grouping. The goal is to pick the right repo or module quickly without over-weighting vague labels like "customer portal" or "auth issue."

## When to Use

Use this when:
- A bug report or chat snippet only gives partial clues
- Multiple repos share the same framework or stack
- You need to map keywords to a codebase, not debug the bug yet
- Business grouping exists, but the real signal is in code paths, filenames, or unique strings

Do not use this to solve the bug itself. This is only for identification and routing.

## Quick Rule

If a candidate has:
- 1 unique strong signal, or
- 2+ strong signals that point to the same repo

pick it.

If candidates are tied, ask for one more discriminating signal from the strongest source available.

## Signal Ranking

| Strength | Examples | Weight |
|---|---|---|
| Strong | Exact file paths, package names, import roots, service names, unique log strings, test file names, route names, **精确中文业务词** | Highest |
| Medium | Framework config, build files, stack trace frames, folder names, shared component names, **通用中文业务词** | Use as support |
| Weak | Generic keywords, "portal", "auth", "login", "vite", **模糊业务描述** | Do not decide on these alone |

## 中文关键字映射

这是主要的匹配依据。按业务领域分类，**精确词优先**：

### 商家平台相关
| 关键字 | 项目 | 备注 |
|---|---|---|
| 订单管理 / 订单后台 | `order-admin` | 精确匹配 |
| 商家后台 / 商家管理 | `jbz_admin`, `kp_admin` | 需结合其他信号区分 |
| 门店管理 | `store_admin` | 精确匹配 |
| 数据统计 / 统计后台 | `statistics_admin` | 精确匹配 |
| 海报管理 / 海报后台 | `poster_admin` | 精确匹配 |
| 微信直播 / 直播后台 | `weixin-live` | 精确匹配 |
| 大后台 / 菜单管理 / admin_menu | `admin_menu` | 精确匹配 |

### 中台 / 供应商 / 服务商
| 关键字 | 项目 | 备注 |
|---|---|---|
| 供应商后台 / 供应商管理 | `supplier-admin-web` | 精确匹配 |
| 服务商后台 / 服务商管理 | `zan-projects/admin/facilitator` | 精确匹配 |
| 供应商移动端 / 服务商移动端 | `provider-mobile` | 精确匹配 |
| 中台管理 | `zan-projects/admin/factory` | 需结合 env/command 区分 |

### 直播相关
| 关键字 | 项目 | 备注 |
|---|---|---|
| 直播监控 / 直播监控平台 | `zan-projects/admin/live-monitor` | 精确匹配 |
| 商城直播小程序 | `zan-mini` | 精确匹配 |

### C端用户相关
| 关键字 | 项目 | 备注 |
|---|---|---|
| 用户中心 / C端用户中心 / Ucenter | `Ucenter` | 精确匹配 |
| 商城H5 / 商城前端 | `jbz_shop` | 精确匹配 |
| 商城小程序 | `shop_mp` | 精确匹配 |

### 公共库 / 数据大屏
| 关键字 | 项目 | 备注 |
|---|---|---|
| 数据大屏 / 大屏展示 | `report-ui` | 精确匹配 |
| 小程序UI库 / von-ui | `von-ui` | 精确匹配 |
| 公共方法库 / common | `common` | 精确匹配 |
| 新版公共库 / zan-lib | `zan-lib` | 精确匹配 |

### 通用词（弱信号）
| 关键字 | 问题 | 建议 |
|---|---|---|
| 后台 / 管理后台 | 太通用 | 需结合具体业务词 |
| 登录 / 权限 | 多项目都有 | 需结合项目名或路径 |
| 报错 / 错误 | 无指向性 | 需更多上下文 |
| 直播 | 可能多个项目 | 需区分"直播监控"还是"商城直播" |

**匹配优先级：精确中文词 > 英文代码路径 > 通用中文词 > 模糊描述**

## Business Groups

Use these as the first routing layer when the prompt is about a known product area:

| Group | Repos / areas                                                                                                                                         |
|---|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| 商家平台 | `admin_menu`, `jbz_admin`, `kp_admin`, `order-admin`, `poster_admin`, `statistics_admin`, `store_admin`, `weixin-live`, `zan-projects/admin/factory` |
| 中台 | `supplier-admin-web`, `zan-projects/admin/factory`, maybe `kp_admin` depending on command and env                                                     |
| 供应商 | `supplier-admin-web`, `zan-projects/admin/factory`, maybe `kp_admin` depending on command and env                                                     |
| 服务商 | `zan-projects/admin/facilitator`, `provider-mobile`                                                                                                   |
| 直播监控平台 | `zan-projects/admin/live-monitor`                                                                                                                     |
| C端用户中心 | `Ucenter`                                                                                                                                             |
| 商城H5 | `jbz_shop`                                                                                                                                            |
| 商城小程序 | `shop_mp`                                                                                                                                             |
| 数据大屏 | `report-ui`                                                                                                                                           |
| 小程序UI库 | `von-ui`                                                                                                                                              |
| 公共方法库 | `common`                                                                                                                                              |
| 新版公共库 | `zan-lib`                                                                                                                                             |
| 商城直播小程序 | `zan-mini`                                                                                                                                            |

If a repo name appears in more than one group or serves multiple business lines, do not treat the group as proof. Use code signals to decide.

## Core Pattern

1. List the candidate projects or modules.
2. Extract exact code clues from the prompt.
3. Mark which clues are unique vs common.
4. Match strong signals first.
5. Use medium signals only to break ties.
6. Treat business grouping as a filter, not proof.
7. If still tied, ask for the next-best signal:
   - exact file path
   - package name
   - error string
   - import path
   - test name

## Fast Triage（中文场景）

| 输入 | 处理方式 |
|---|---|
| "订单管理报错" | 精确匹配 → `order-admin` |
| "商家后台登录失败" | 通用词"后台" + "商家" → 需区分 `jbz_admin` vs `kp_admin`，问具体页面或路径 |
| "供应商后台页面白屏" | 精确匹配 → `supplier-admin-web` |
| "直播监控平台数据延迟" | 精确匹配 → `zan-projects/admin/live-monitor` |
| "大后台菜单配置" | 精确匹配 → `admin_menu` |
| "用户中心改密码" | 精确匹配 → `Ucenter` |
| "商城小程序支付问题" | 精确匹配 → `shop_mp` |
| "数据大屏图表不显示" | 精确匹配 → `report-ui` |
| "后台报错" | 太通用，问具体是哪个后台 |
| "登录有问题" | 多项目都有登录，问项目名或具体页面 |
| `src/router/auth.ts` | 英文路径，搜索精确匹配或结合业务词判断 |
| `vite.config.ts` | 通用配置，不单独判断 |

## Example（中文场景）

**场景 1：精确匹配**
输入："订单管理页面有个按钮点击没反应"

处理：
- "订单管理" → 精确匹配 `order-admin`
- 不需要更多信息，直接定位

结果：`order-admin`

---

**场景 2：需区分**
输入："商家后台登录页面报错"

处理：
- "商家后台" → 可能 `jbz_admin` 或 `kp_admin`
- "登录" → 通用词，不帮助区分
- 问：具体是哪个商家后台页面？有 URL 或截图吗？

结果：需额外信息，倾向 `jbz_admin` 或 `kp_admin`

---

**场景 3：混合信号**
输入："`supplier-admin-web` 的订单列表页 `/order/list` 报错"

处理：
- `supplier-admin-web` → 精确匹配（英文项目名）
- `/order/list` → 精确路径，确认存在

结果：`supplier-admin-web`

---

**场景 4：模糊输入**
输入："后台有个页面打不开"

处理：
- "后台" → 太通用，多个项目都是后台
- 无其他信号

问：具体是哪个后台？订单管理？商家后台？供应商后台？

结果：需明确业务词才能判断

## Common Mistakes

- Choosing the repo with the closest business name instead of the strongest code signal
- Treating common framework files as proof
- Asking for more context too early when there is already a unique clue
- Ignoring ambiguity between repo-level and module-level identification

## Red Flags

Stop and ask for one more signal if:
- Every clue is generic
- Two candidates share the same strong signals
- The only evidence is business wording
- You cannot name a unique file, string, or package that separates the candidates

