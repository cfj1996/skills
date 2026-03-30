# TAPD Open API

## 目标

优先用 API 拉取需求/缺陷详情和评论，减少页面抓取成本。

## 鉴权

- 使用 `Authorization: Bearer <ACCESS_TOKEN>`
- `ACCESS_TOKEN` 通过环境变量读取，不要写入技能文件

## 需要的环境变量

- `TAPD_ACCESS_TOKEN`：必需
- `TAPD_API_BASE`：可选，默认 `https://api.tapd.cn`

## 常用接口

### 需求

- `GET /stories`
- 传 `workspace_id` 和 `id`
- 常用字段：`id,name,status,priority_label,description,owner,creator,created,modified,module,feature,release_id`

### 缺陷

- `GET /bugs`
- 传 `workspace_id` 和 `id`
- 常用字段：`id,title,status,priority_label,severity,description,module,reporter,creator,created,modified,owner,fixer`

### 评论

- `GET /comments`
- 传 `workspace_id`、`entry_id`
- `entry_type`：
  - 需求：`stories`
  - 缺陷：`bug|bug_remark`
- 常用字段：`id,title,description,author,entry_type,entry_id,created,modified`

## 使用顺序

1. 从 URL 解析 `workspace_id` 和 `item_id`
2. 根据类型请求详情接口
3. 请求评论接口
4. 将返回的 HTML 内容转成可读文本
5. 仅在 API 无法覆盖原型或图片信息时，再回退到页面浏览
