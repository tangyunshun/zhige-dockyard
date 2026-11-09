# 生产接线图（入口 → 共享服务 → 持久事实 → 恢复 → 页面）

> `IMPLEMENTED_OFFLINE_VERIFIED` = 生产代码已写、隔离测试通过（未连真实库）；
> `FAILED` = 未接线/未实现；`ENVIRONMENT_UNVERIFIED` = 需真实环境才能验证。
> 本轮全部为真实生产代码，非 Memory/Fake 后端替代。

## 验证码 / 重置密码 / 登录 / 注册 / 绑定（U02/U03）
- 入口：`send-email-code` / `send-sms` / `verify-email-code` / `verify-sms-code` / `register` / `login-sms` / `reset-password` / `user/profile`
- 共享服务：`PrismaVerificationBackend`（production）`src/lib/verification-backend.ts`
- 持久事实：`smscode`（既有）+ `VerificationBudget`（离线迁移 `20261109000000_verification_budget_lock` 已含建表+三列）
- challenge 身份：`deriveChallengeId(codeHash)` → `VerifyRecord.challengeId` → `VerifyResult.challengeId` → resetToken 的 `challengeId`+`jti`
- 原子消费：`consumeVerificationCode(..., challengeId)`，Memory/Prisma 两后端均在原子边界内核对身份
- 接线：✅ `verify-email-code`/`verify-sms-code` 签发绑定 token；`reset-password` 校验绑定并按身份消费、消费失败写=0；
  `login-sms` 验证后立即原子取得唯一消费权（并发只一份会话）；`register` 三分支与 `profile` 绑定同样前置消费，
  已移除全部无返回值 `delete*` 宣称已消费。
- 页面：注册/登录/找回密码前端存在（既有），未做真实浏览器串联 → `ENVIRONMENT_UNVERIFIED`

## 计费口径（U08）
- `parseBillingConfig`（`billing-config.ts`）：>10000 不再 ÷10，保留原值
- `getMembershipTokenLimit`（`quota-token.ts`）：只读、不写库、不写死 100
- ✅ `r08-billing-quota.test.ts`（4）

## 全局调价（U09-6）
- `src/app/api/admin/model-pricing/global-markup/route.ts`：真实 `updateMany.count`、
  模型/时段/默认/审计在**单一 `$transaction`**，审计失败整笔回滚；GET 不猜单位
- ✅ `r0d-global-markup.test.ts`（2）

## 公开诊断 / 身份（U05-1/2/3）
- `debug-test01` / `test-db`：平台授权守卫
- `src/lib/security.ts`：删除 `requirePlatformAuth` 的 JWT 弱兜底，完整认证拒绝不复活
- `src/lib/api-key-auth.ts`：命中 Key 后实查账号禁用/封禁/注销状态才放行
- ✅ `r0g-security.test.ts`（5）

## 初始化向导（U05-4）
- `src/lib/install-auth.ts`：基于已批准 `SETUP_TOKEN` 签发短期一次性安装授权（HMAC、purpose、nonce、有效期）
- `verify-setup-token` 签发 → `src/app/init/page.tsx` 保存并传递 `initToken` → `init-admin` 校验并在
  「空库检查 + 唯一认领 + 用户创建」同一事务内消费；无授权/伪造/重放/并发拒绝
- ✅ `r0z-init-wizard.test.ts`（7）+ 独立复核 init-diagnostics-review

## BYO 目的地（U06）
- `src/app/api/workspace/byo-model/test/route.ts`：保留 scheme、host 大小写归一、路径大小写敏感、默认端口归一
- ✅ `r0e-byo-dest.test.ts`（4）

## 支付与唯一履约（U04）
- `src/lib/payment/receipt.ts`：严格元→分解析（10.004 拒绝）、安全整数分、含渠道的认领键
- `src/lib/payment/fulfill.ts`：渠道/币种一致、REAL 精确金额门禁、SUCCESS 不掩盖异常、
  **持久原子唯一认领**（billingrecord 主键 P2002）、多笔晚收款保留首笔并另存冲突
- `alipay.ts`/`wechatpay.ts` + 两条 notify：商户/应用/币种核对、交易状态、交易号、精确金额
- ✅ `r0y-payment-u04.test.ts`（18）、`r0x`（16）、`r0b`（108）基线保持

## 请求内 DDL（U12）
- `src/app/api/webhooks/route.ts`、`src/lib/workspace-byo-model.ts`、`src/app/api/admin/settings/route.ts`
  三处 DDL 全部下线 → 只读结构探针 + 稳定 503 not-ready；settings 配置+审计单一事务
- 离线迁移 `20261109000100_request_ddl_offline`；✅ `r0v-u12-request-ddl.test.ts`（4）

---

## FAILED / 未接线（不得以模块存在代替真实调用链）
- **U07（原 1/F14）**：`parse-admission.ts`、`parse-runner.ts`、`src/app/api/studio/extract-text/route.ts`、
  handler —— 隔离"无停止证明不腾槽"、ACTIVE sweep count 未命中回滚、读取前实际字节边界未改。
- **U01/U10（原 6/8/11）**：`cost-reservation` 仍只有 Memory 后端；`execution-orchestration` 未接真实
  task/attempt/费用持久入口；`refund-basis`/`entitlement-read-guard` 未接实际服务；
  `ops-readiness` 未接管理员页面/API；null tenant scope 跨租户边界未修。
- **U11/U12（原 10/12）**：首页 60+/300%、登录安全回跳、`first-value-journey` 页面、
  `value-cost-metrics` 未接 API；预付/消费/利润分栏与未知成本口径未完成。
- **U05-5/6/7**：标准岗位跨空间私有统计、企业撤权在 UI/Open/Key/资料各入口一致性、历史保留矩阵。
- **U13/U14**：原 1–14 全量唯一共享集成、同版本冻结 SHA 与完整页面/业务矩阵。
