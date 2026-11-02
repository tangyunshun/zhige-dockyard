---
title: Webhooks 与异步任务
category: api-doc
sortOrder: 20
summary: execute 的异步任务模式、任务状态机、轮询方式与退款状态的解读。
tags: Webhooks,异步任务,轮询,任务状态,开发者
---

# Webhooks 与异步任务

## 异步模式

POST /execute 不会同步返回执行结果，而是立即返回任务 ID 与初始状态。模型处理可能持续数十秒到数分钟，请以任务详情接口的结果为准。

```json
{ "taskId": "task_xxx", "status": "pending" }
```

## 任务状态

| 状态 | 含义 |
| --- | --- |
| pending | 已受理，排队中 |
| running | 执行中 |
| success | 成功，成果物就绪 |
| failed | 失败，error 字段给出原因；已扣算力点自动原路退回 |

## 轮询建议

- 间隔 3~5 秒轮询 GET /tasks/:id，拿到 success 或 failed 即停止。
- 连续轮询超过 10 分钟仍未终态时，按失败处理并提交工单附任务 ID。
- 请勿以高于 1 次/秒的频率轮询，超频会被限流。

## 结果与退款

- success：详情中包含结构化成果物，可直接下载或读取内容。
- failed：详情中 error / errorCode 说明失败原因；扣点已在失败时原路退回，点数流水可在账务中心核对。

## 相关文档

- 《OpenAPI 接入指南》：鉴权与端点。
