# 生产接线图（每项入口 → 共享服务 → 持久事实 → 恢复 → 页面）

> 标注生产后端；`FAILED` 表示未接线 / 未实现，`IMPLEMENTED_OFFLINE_VERIFIED` 表示代码已写且隔离测试通过（未连真实库）。

## 验证码 / 重置密码（U02/U03）
- 入口：`send-email-code` / `send-sms` / `verify-email-code` / `verify-sms-code` / `verify-sms` / `register` / `login-sms` / `reset-password` / `user/profile`
- 共享服务：`PrismaVerificationBackend`（production，可注入替身）`src/lib/verification-backend.ts`
- 持久事实：`smscode`（既有） + `VerificationBudget`（新增列：lastSentAt/failCount/lockedUntil，离线迁移 `20261109000000_verification_budget_lock`）
- 真实算法：60s 间隔、10 次/日、5 次失败锁 30 分钟、平台/IP/账号技术边界，version CAS 并发
- 接线：✅ 路由已正确调用 `consume*` 并检查返回值、`reset-password` 消费失败写=0、`verify-sms-code` 固定 reset-password 用途、`login-sms` 用 `login` 用途 await 消费
- 页面：注册/登录/找回密码前端存在（既有），未在本批次新增串联测试 → `ENVIRONMENT_UNVERIFIED`

## 计费口径（U08）
- `parseBillingConfig`：去掉 >10000 ÷10（`src/lib/billing/billing-config.ts`）
- `getMembershipTokenLimit`：只读、不写库、不写死 100（`src/lib/quota-token.ts`）
- 离线验证：✅ `r08-billing-quota.test.ts`（4 用例）

## 全局调价（U09-6）
- 入口：`src/app/api/admin/model-pricing/global-markup/route.ts`
- 修复：删重复 upsert、真实 `updateMany.count`、审计与改价同事务、GET 不猜单位

## 公开诊断（U05-3）
- `src/app/api/health/debug-test01/route.ts`：加 `requirePlatformPermission(system:manage, debug:read)`
- `src/app/api/test-db/route.ts`：同上

## 初始化（U05-4）
- `src/app/api/auth/init-admin/route.ts`：授权 token + 事务唯一认领 + Prisma create

## BYO 测试（U06）
- `src/app/api/workspace/byo-model/test/route.ts`：仅同 destination 才复用已保存密钥

---

## FAILED / 未接线（按指令必须如实申报，不得以 Memory* 代替）
- **U04 支付**：`src/lib/payment/fulfill.ts`、`wechatpay.ts`、`alipay.ts`、notify 入口——未改动，并发唯一认领/真实收款事实缺失。
- **U05-1/2/5/6/7**：`src/lib/auth.ts` 完整认证兜底复活、`src/lib/api-key-auth.ts` 账号状态/撤销、`src/middleware.ts`、企业撤权 UI/Open/Key 一致性、标准岗位公共目录泄露——未改动。
- **U07 解析**：`src/lib/parse-admission.ts`、`parse-runner.ts`、`src/app/api/studio/extract-text/route.ts`、`handler.ts`——隔离释放/有界读取未改动。
- **U01/U10/U11**：既有纯逻辑层（`cost-reservation`、`refund-basis`、`execution-orchestration`、`ops-readiness`、`value-cost-metrics`、`first-value-journey`）**未接真实 API/页面入口**；首页虚假声明、登录 redirect 校验、报价确认页、历史下载不重调模型——未在本批次落地。
- **U12 请求内 DDL**：webhooks 自愈建表、BYO 保存热 ALTER、后台 settings 惰性扩列——尚未处理。
