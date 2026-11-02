---
title: OpenAPI 接入指南
category: api-doc
sortOrder: 10
summary: API Key 的创建与保管规则、鉴权方式、开放接口端点清单与调用示例。
tags: OpenAPI,API Key,鉴权,接口,开发者
---

# OpenAPI 接入指南

## 创建 API Key

1. 登录后进入"开发者"页。
2. 点击"创建 API Key"，填写备注名。
3. Key 仅在创建成功时完整展示一次，请立即保存。此后列表中只显示前缀，遗失只能作废重建。

## 鉴权

所有开放接口通过 HTTP 请求头携带 Key：

```bash
Authorization: Bearer YOUR_API_KEY
```

Key 在服务端以哈希存储，泄露后请立即在开发者页作废。

## 端点清单

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| /api/open/v1/me | GET | 当前 Key 的账号信息 |
| /api/open/v1/workspaces | GET | 可用工作空间列表 |
| /api/open/v1/components | GET | 已装配组件列表 |
| /api/open/v1/tasks | GET | 任务列表（分页） |
| /api/open/v1/tasks/:id | GET | 任务详情（状态与成果） |
| /api/open/v1/execute | POST | 发起组件执行（返回任务 ID） |

## 调用示例

```bash
# 发起执行
curl -X POST "https://你的域名/api/open/v1/execute" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"componentId":"C01","workspaceId":"你的空间ID","inputSource":{"text":"标书全文…"}}'

# 查询任务
curl "https://你的域名/api/open/v1/tasks/TASK_ID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 计费与错误

通过 API 发起的执行与页面执行同规则计费（执行前扣点、失败退回）。错误响应为 JSON，含 error 字段；常见错误：未授权（Key 无效或缺失）、余额不足、组件未装配、输入不符合契约。

## 相关文档

- 《Webhooks 与异步任务》：任务状态与轮询。
