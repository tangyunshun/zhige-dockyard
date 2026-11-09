# 范围验收对照（原 1–14 / R0–R5 / CF-F01–F12）

> 已验收止损（F01–F13）保持，不重复开发；未选商业候选列 `OPTIONAL_NOT_SELECTED`。

| 原项 | 本次对应 | 源码/函数 | 测试 | 状态 |
|---|---|---|---|---|
| 原2/4（F15） | U02/U03 | `src/lib/verification-backend.ts`、`verification-codes.ts`、`mailer.ts` + 4 路由 | r0l / r0l2（24） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原5（F16/F07） | U03-7 SMTP 三态 | `src/lib/mailer.ts` | r0l（SEND_FAILED/SEND_UNKNOWN） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原5 | U04 | `payment/fulfill.ts`、`wechatpay.ts`、`alipay.ts` | 无 | FAILED |
| 原6 | U01/U08/U10 | `billing/cost-reservation.ts`、`billing-config.ts`、`quota-token.ts` | r08（4） | U08 部分 IMPLEMENTED，U01/U10 接线 FAILED |
| 原7 | U01/U08 | `credit-service.ts`、`refund-basis.ts`、`entitlement-read-guard.ts` | 无 | FAILED（接线） |
| 原8 | U01/U06/U10 | `billing/execution-orchestration.ts`、`byo-model/test/route.ts` | U06 代码 | U06 IMPLEMENTED，U01/U10 接线 FAILED |
| 原9 | U05 | `auth.ts`、`security.ts`、`api-key-auth.ts`、`middleware.ts` | 无 | PARTIAL（U05-3/4 完成，其余 FAILED） |
| 原10 | U01/U11 | `HeroSection.tsx`、`auth/login`、`ConfirmRunModal` 等 | 无 | FAILED（页面串联） |
| 原11 | U01/U09/U10 | `operations/ops-readiness.ts`、`admin/model-pricing/global-markup/route.ts` | U09-6 代码 | U09-6 IMPLEMENTED，U01/U10 接线 FAILED |
| 原12 | U01/U10 | `metrics/value-cost-metrics.ts` | 无 | FAILED（接线） |
| 原1/3（F14/F16） | U07 / U03 | `parse-admission.ts`、`parse-runner.ts` | 无 | FAILED（U07 未改） |
| 原13 | U01/U03/U12 | schema/migrations 单写者；请求 DDL 移除 | 见 schema 文档 | PARTIAL |
| 原14 | U13/U14 | 本目录交付材料 | 本目录 | IN_PROGRESS |

## CF-F01–F12（原费用矩阵）逐项
- CF-F08 标准岗位泄露全空间统计、CF-F10 请求 DDL：已在指令 U05-7 与 U12 标注；CF-F10 部分处理（公开诊断），webhooks/BYO/settings 待处理。
- 24 项反例矩阵：已覆盖 resetToken 重放、验证消费 503、正确 verificationBudget delegate、立即重发/失败锁、FREE 只读、合法 20000 bps、BYO 新目的地空 key、无 exit 不腾槽（U07 未实现）、公开诊断无私有数据、init 并发仅一创建。其余支付/解析/页面反例仍 FAILED。
