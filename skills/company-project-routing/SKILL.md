---
name: company-project-routing
description: Use when a vague request, keyword, or partial clue needs to be mapped to the right company project, module, or owner based on the company project distribution.
---

# 项目地图

## Overview

Use the clearest project clues first, then the company project distribution. The goal is to map an ambiguous request to the most likely project, module, or ownership area without over-weighting vague labels.

## When to Use

Use this when:
- A request only gives partial clues
- Multiple projects share similar names, features, or wording
- You need to locate the most likely project or module before deeper analysis
- The company project distribution is known, but the signal is buried in project names, business terms, paths, or other hints

Do not use this to solve the issue itself. This is only for locating and routing.

## Quick Rule

If a candidate has:
- 1 unique strong signal, or
- 2+ strong signals that point to the same repo

pick it.

If candidates are tied, ask for one more discriminating signal from the strongest source available.

## Signal Ranking

| Strength | Examples | Weight |
|---|---|---|
| Strong | Exact project names, module names, product-specific terms, unique business terms, exact paths, package names | Highest |
| Medium | Shared folder names, framework config, build files, route names, stack trace frames | Use as support |
| Weak | Generic keywords, common features, vague business wording, "portal", "auth", "login", "vite" | Do not decide on these alone |

## 公司项目分布

这是主要的匹配依据。按项目领域分类，精确词优先：

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

**匹配优先级：精确中文词 > 英文路径 > 通用中文词 > 模糊描述**

## 项目分布判断

Use these as the first routing layer when the prompt is about a known project area:

| Group | Repos / areas |
|---|---|
| 商家平台 | `admin_menu`, `jbz_admin`, `kp_admin`, `order-admin`, `poster_admin`, `statistics_admin`, `store_admin`, `weixin-live`, `zan-projects/admin/*` |
| 中台 | `supplier-admin-web`, `zan-projects/admin/factory`, maybe `kp_admin` depending on command and env |
| 供应商 | `supplier-admin-web`, `zan-projects/admin/factory`, maybe `kp_admin` depending on command and env |
| 服务商 | `zan-projects/admin/facilitator`, `provider-mobile` |
| 直播监控平台 | `zan-projects/admin/live-monitor` |
| C端用户中心 | `Ucenter` |
| 商城H5 | `jbz_shop` |
| 商城小程序 | `shop_mp` |
| 数据大屏 | `report-ui` |
| 小程序UI库 | `von-ui` |
| 公共方法库 | `common` |
| 新版公共库 | `zan-lib` |
| 商城直播小程序 | `zan-mini` |

If a project name appears in more than one group or serves multiple business lines, do not treat the group as proof. Use project signals to decide.

## Core Pattern

1. List the candidate projects or modules.
2. Extract exact project clues from the prompt.
3. Mark which clues are unique vs common.
4. Match strong signals first.
5. Use medium signals only to break ties.
6. Treat company project distribution as a filter, not proof.
7. If still tied, ask for the next-best signal:
   - exact file path
   - package name
   - error string
   - import path
   - test name

## Fast Triage

| Clue | What to do |
|---|---|
| `订单管理` | 优先匹配 `order-admin` |
| `商家后台` | 先看是 `jbz_admin` 还是 `kp_admin`，再结合具体页面或功能词 |
| `供应商后台` | 优先匹配 `supplier-admin-web` |
| `服务商后台` | 优先匹配 `zan-projects/admin/facilitator` |
| `直播监控` | 优先匹配 `zan-projects/admin/live-monitor` |
| `商城小程序` | 优先匹配 `shop_mp` |
| `大屏展示` | 优先匹配 `report-ui` |
| `UI库` | 优先匹配 `von-ui` |

## Common Mistakes

- Choosing the nearest-looking project name instead of the strongest signal
- Treating common terms as proof
- Asking for more context too early when there is already a unique clue
- Ignoring ambiguity between project-level and module-level identification

## Red Flags

Stop and ask for one more signal if:
- Every clue is generic
- Two candidates share the same strong signals
- The only evidence is project wording
- You cannot name a unique project, module, term, or path that separates the candidates
