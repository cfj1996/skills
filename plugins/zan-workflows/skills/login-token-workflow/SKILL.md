---
name: login-token-workflow
description: Retrieve merchant admin tokens and C-end user tokens for the test environment, then assemble local debug URLs with `siteId` and `token`. Use when starting local debugging, logging into `testm.jubaozan.cn`, reading `fx_admin_token` / `fx_admin_siteId`, or calling the C-end token endpoint for a known user ID.
---

# Login Token Workflow

Default model profile: `FAST`. Read the shared
[model-routing policy](../../references/model-routing.md) only when the task
expands beyond deterministic token retrieval and URL assembly.

## Overview

Use this skill to fetch the two token types used by the project and wire them into local debugging URLs:

- 商家管理后台 token: `fx_admin_token`
- 商家 id: `fx_admin_siteId`
- C 端用户 token: 通过商家后台 token 交换得到

Use an already authenticated browser session or an approved secret store. When login is
needed, let the user enter their password directly on the login page, not in chat. Never write passwords to skill documentation,
prompts, command output, logs, or generated artifacts. Do not persist cookies or raw tokens.

## Workflow

1. Determine whether the target is a merchant page or a C-end page from the request and project context; resolve this before requesting a C-end identity.
2. Fetch the merchant admin token and merchant site id. For a merchant page, build its local URL directly with these values; no C-end user ID or token exchange is needed.
3. Only for a C-end page, verify the intended test user ID, exchange the merchant token for that user's token, then build the C-end URL. Do not substitute a merchant token if the exchange fails.

## Token Types

- Merchant pages use `fx_admin_token`.
- C-end pages use the user token returned from the C-end token API.
- `siteId` always means the merchant id, usually from `fx_admin_siteId`.

## Reference

- See [`references/token-flow.md`](references/token-flow.md) for the exact login flow, request headers, and local URL patterns.
