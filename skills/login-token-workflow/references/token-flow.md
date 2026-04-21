# Token Flow Reference

## 1. Merchant admin token

- Login page: `https://testm.jubaozan.cn/sup/login.jsp`
- Account: `yishiwuyou`
- Password: `Qazxswedc547896321`
- Submit to: `https://testm.jubaozan.cn/sup/login.do`

Read these cookies from the response:

- `fx_admin_token` -> merchant platform token
- `fx_admin_siteId` -> merchant id

## 2. C-end user token

Use the merchant platform token and merchant id to call:

```bash
curl 'https://testbk.jubaozan.cn/micro/user/admin/agent/access/token/{用户ID}' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'origin: https://testm.jubaozan.cn' \
  -H 'referer: https://testm.jubaozan.cn/' \
  -H 'responsetype: text/html' \
  -H 'x-c3-platform: FACTORY' \
  -H 'x-c3-site: {商家ID}' \
  -H 'x-c3-sjid: {商家ID}' \
  -H 'x-c3-token: {商家平台TOKEN}'
```

Known user IDs:

- `320037001` -> self
- `350004927` -> 熊思，C 端开发人员

## 3. Local debug URL

- Merchant pages: `siteId={fx_admin_siteId}&token={fx_admin_token}`
- C-end pages: `siteId={fx_admin_siteId}&token={C端用户token}`

Keep the `siteId` value aligned with the merchant id from `fx_admin_siteId`. Re-fetch the merchant admin token before the C-end token if the cookie has expired.
