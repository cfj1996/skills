---
name: login-token-workflow
description: Retrieve merchant admin tokens and C-end user tokens for the test environment, then assemble local debug URLs with `siteId` and `token`. Use when starting local debugging, logging into `testm.jubaozan.cn`, reading `fx_admin_token` / `fx_admin_siteId`, or calling the C-end token endpoint for a known user ID.
---

# Login Token Workflow

## Overview

Use this skill to fetch the two token types used by the project and wire them into local debugging URLs:

- 商家管理后台 token: `fx_admin_token`
- 商家 id: `fx_admin_siteId`
- C 端用户 token: 通过商家后台 token 交换得到

Do not print passwords, cookies, or raw tokens unless the user explicitly asks for them.

## Workflow

1. Fetch the merchant admin token.
2. Use the merchant admin token plus merchant site id to fetch a C-end user token.
3. Build the local debug URL with `siteId` and the token that matches the current page type.

## Token Types

- Merchant pages use `fx_admin_token`.
- C-end pages use the user token returned from the C-end token API.
- `siteId` always means the merchant id, usually from `fx_admin_siteId`.

## Reference

- See [`references/token-flow.md`](references/token-flow.md) for the exact login flow, request headers, and local URL patterns.
