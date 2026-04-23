---
name: company-project-routing
description: Use when a vague request, keyword, or partial clue needs to be mapped to the right company project, module, or owner based on the company project distribution.
---

# 项目地图

## Overview

Use the clearest project clues first, then the company project distribution. The goal is to map an ambiguous request to the most likely project, module, ownership area, and service name without over-weighting vague labels.

## When to Use

Use this when:
- A request only gives partial clues
- Multiple projects share similar names, features, or wording
- You need to locate the most likely project or module before deeper analysis
- The company project distribution is known, but the signal is buried in project names, business terms, paths, or other hints

Do not use this to solve the issue itself. This is only for locating and routing.

When the downstream workflow needs a `服务名称`, this skill must return the matched project together with the standardized service name from the mapping table below.

## Quick Rule

If a candidate has:
- 1 unique strong signal, or
- 2+ strong signals that point to the same repo

pick it.

If candidates are tied, ask for one more discriminating signal from the strongest source available.

Default rule: use the project name itself as `服务名称` unless the exception table explicitly overrides it.

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
| instant apps / C端项目 / Instant Apps | `instant-apps` | 精确匹配 |

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

## 项目 / 子项目服务名称对照表

默认直接使用项目名称作为 `服务名称`。只有命中特例时，才使用表中的覆盖值。

| 项目 | 子项目 / 模块 | 服务名称 |
|---|---|---|
| `order-admin` | - | `order-admin` |
| `jbz_admin` | - | `jbz_admin` |
| `kp_admin` | - | `kp_admin` |
| `store_admin` | - | `store_admin` |
| `statistics_admin` | - | `statistics_admin` |
| `poster_admin` | - | `poster_admin` |
| `weixin-live` | - | `live2` |
| `admin_menu` | - | `admin_menu` |
| `supplier-admin-web` | `suppliers` | `供应商` |
| `supplier-admin-web` | `middleManage` | `中台运营管理系统` |
| `provider-mobile` | `supplier-mobile` | `supplier-mobile` |
| `zan-projects` | `facilitator` | `facilitator` |
| `zan-projects` | `factory` | `factory` |
| `zan-projects` | `live-monitor` | `live-monitor` |
| `zan-mini` | - | `zan-mini` |
| `Ucenter` | - | `Ucenter` |
| `jbz_shop` | - | `jbz_shop` |
| `shop_mp` | - | `shop_mp` |
| `instant-apps` | - | `instant-apps` |
| `report-ui` | - | `report-ui` |
| `von-ui` | - | `von-ui` |
| `common` | - | `common` |
| `zan-lib` | - | `zan-lib` |

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
| Instant Apps C端 | `instant-apps` |
| 数据大屏 | `report-ui` |
| 小程序UI库 | `von-ui` |
| 公共方法库 | `common` |
| 新版公共库 | `zan-lib` |
| 商城直播小程序 | `zan-mini` |

If a project name appears in more than one group or serves multiple business lines, do not treat the group as proof. Use project signals to decide.

## 服务名称输出规则

1. 先定位项目。
2. 再判断是否能命中更细的子项目 / 模块。
3. 命中子项目特例时，输出该子项目对应的 `服务名称`。
4. 命中特例项目时，输出特例覆盖值。
5. 其他情况默认直接使用项目名称作为 `服务名称`。
6. 如果连项目都无法确认，不要猜；继续按路由规则补充信号。

输出时尽量返回：
- `项目`
- `子项目`（如有）
- `服务名称`
- `命中依据`

## Core Pattern

1. List the candidate projects or modules.
2. Extract exact project clues from the prompt.
3. Mark which clues are unique vs common.
4. Match strong signals first.
5. Resolve the service name from the mapping table.
6. Use medium signals only to break ties.
7. Treat company project distribution as a filter, not proof.
8. If still tied, ask for the next-best signal:
   - exact file path
   - package name
   - error string
   - import path
   - test name

## Fast Triage

| Clue | What to do |
|---|---|
| `订单管理` | 优先匹配 `order-admin`，输出 `order-admin` |
| `商家后台` | 先看是 `jbz_admin` 还是 `kp_admin`，默认输出对应项目名称 |
| `供应商后台` | 优先匹配 `supplier-admin-web/suppliers`，输出 `供应商` |
| `中台运营管理系统` | 优先匹配 `supplier-admin-web/middleManage`，输出 `中台运营管理系统` |
| `服务商后台` | 优先匹配 `zan-projects/facilitator`，输出 `facilitator` |
| `供应商移动端` | 优先匹配 `provider-mobile/supplier-mobile`，输出 `supplier-mobile` |
| `微信直播` | 优先匹配 `weixin-live`，输出 `live2` |
| `直播监控` | 优先匹配 `zan-projects/live-monitor`，输出 `live-monitor` |
| `商城小程序` | 优先匹配 `shop_mp`，输出 `shop_mp` |
| `instant apps` | 优先匹配 `instant-apps`，输出 `instant-apps` |
| `大屏展示` | 优先匹配 `report-ui`，输出 `report-ui` |
| `UI库` | 优先匹配 `von-ui`，输出 `von-ui` |

## Common Mistakes

- Choosing the nearest-looking project name instead of the strongest signal
- Forgetting that project name is the default `服务名称`
- Missing an explicit exception such as `weixin-live -> live2`
- Ignoring subproject matches and stopping at the parent project
- Treating common terms as proof
- Asking for more context too early when there is already a unique clue
- Ignoring ambiguity between project-level and module-level identification

## Red Flags

Stop and ask for one more signal if:
- Every clue is generic
- Two candidates share the same strong signals
- The only evidence is project wording
- You cannot name a unique project, module, term, or path that separates the candidates
