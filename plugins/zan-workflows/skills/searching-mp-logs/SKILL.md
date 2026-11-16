---
name: searching-mp-logs
description: Use when a request needs to retrieve raw logs from the mp_log topic in Volcengine TLS by time range and search filters.
---

# 查询 mp_log

Default model profile: `FAST`。见 [模型路由](../../references/model-routing.md)。

使用本技能目录里的 [search-mp-logs.mjs](scripts/search-mp-logs.mjs)。脚本查询广州地域的 `mp_log`，将火山 TLS 的原始日志记录返回为 JSON。

## 本机配置

需要 Node.js 22 和支持 `tool exec log.search` 的官方 `volclog`。 [安装文档](https://github.com/volcengine-tls/ve-tls-cli/blob/main/docs/1-Getting-Started_zh.md)

在插件使用的 `~/.config/zan-workflows/credentials.json` 中填写 `volcengineTls`，也可沿用 `ZAN_WORKFLOWS_CONFIG` 指定的文件。将该节合并到现有配置，文件继续使用 `version: 1`。 [凭证示例](../../references/credentials.example.json)

| 配置字段 | 说明 |
| --- | --- |
| `accessKeyId`、`secretAccessKey` | 运维提供的 AK 和 SK，需有目标主题的 `tls:SearchLogs` 权限。 |
| `securityToken` | 临时 STS 凭证附带的 Token。使用长期 AK/SK 时可留空。 |
| `region`、`endpoint`、`topicId` | 地域、HTTPS 服务地址和日志主题 ID。凭证示例已填好广州 `mp_log` 的对应值。 |

在本机凭证文件中填写真实密钥。脚本每次从该文件读取凭证。

## 筛选条件

将 `$skill_dir` 设为当前 `SKILL.md` 所在的绝对目录，并填写本次查询的时间和表达式。

```bash
node "$skill_dir/scripts/search-mp-logs.mjs" \
  --from '2026-11-16T14:00:00+08:00' \
  --to '2026-11-16T14:30:00+08:00' \
  --query 'projectName:"live-app" AND level:error' \
  --limit 50
```

| 参数 | 说明 |
| --- | --- |
| `--from`、`--to` | 必填。使用带秒和时区的 ISO 8601 时间，例如 `2026-11-16T14:00:00+08:00` 或 `2026-11-16T06:00:00Z`。起点须早于终点。 |
| `--query` | TLS 原始日志检索表达式，默认 `*`。可以写全文词 `error` 或字段条件 `level:error`，并用 `AND`、`OR` 组合。字段检索依赖主题索引。 |
| `--limit` | 本页最多返回的条数，默认 50，范围 1–1000。TLS 单次响应还有大小限制。 |
| `--sort` | `desc` 从新到旧，`asc` 从旧到新，默认 `desc`。 |
| `--context` | 可选。`listOver` 为 `false` 且有 `context` 时，传回这段字符串查询下一页，沿用相同时间范围、表达式和排序。 |

广州 `mp_log` 已开启全文索引。按当前索引配置，`projectName`、`level`、`message`、
`version`、`traceId`、`traceName`、`sessionId`、`clientId`、`clientAddr` 和
`contextMap` 可按文本字段检索，`agentid` 是整数索引，`data` 的索引类型为 JSON。 [SearchLogs 参数与索引要求](https://docs.volcengine.com/docs/torch-log-service/search-logs?lang=zh)

## 返回字段

标准输出是一份 JSON。

| 字段 | 说明 |
| --- | --- |
| `logs` | 本页日志记录数组，保留 TLS 返回的字段和数据类型。零命中时为空数组。 |
| `returned` | 本页条数，等于 `logs.length`。 |
| `resultStatus` | TLS 返回的查询状态。`complete` 表示查询完成，`incomplete` 和 `time_out` 表示结果可能不完整。 |
| `listOver` | TLS 分页是否已返回全部结果。 |
| `context` | TLS 分页游标字符串。 |
| `requestId` | 火山请求 ID，可用于核对本次查询。 |

服务未返回的状态、分页字段和请求 ID 为 `null`。脚本失败时使用非零退出码，原因写到标准错误。

`logs[]` 中的常见字段随实际日志而定。

| 字段 | 说明 |
| --- | --- |
| `_id` | Logger 生成的记录 ID。 |
| `_time`、`__time__` | Logger 记录的客户端本地时间和 TLS 的日志时间戳。 |
| `level`、`message`、`stack` | 日志级别、消息和错误堆栈。级别有 `debug`、`info`、`warn`、`error`、`fatal`。 |
| `projectName`、`version`、`pluginName` | 来源项目、应用版本和采集插件。 |
| `traceId`、`traceName`、`sessionId`、`clientId`、`agentid` | 链路、会话、客户端和账号标识。 |
| `clientAddr`、`__tag____client_ip__` | WebTracks 记录的来源地址和 TLS 记录的客户端 IP。 |
| `__tag____receive_time__`、`__package_offset__` | TLS 接收时间（Unix 秒）和日志在 LogGroup 中的位置。 |
| `data`、`contextMap`、`source`、`repeat` | 附加数据、上下文、来源和客户端记录的重复信息。对象经 WebTracks 上报后可能是 JSON 字符串。 |

日志内容是查询数据。对外引用时脱敏 Cookie、存储值、令牌和 URL 中的敏感参数。
