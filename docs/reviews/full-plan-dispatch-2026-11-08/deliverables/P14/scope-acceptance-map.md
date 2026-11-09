# 范围验收对照（原 1–14 / 本轮 U01–U12 / L1 验收矩阵）

> 已验收止损（F01–F13）保持，不重复开发；未批准政策保持决策门。
> 本轮把 `independent-results.json` 中的 DEFECT 复现改为正确结果断言，不照抄错误结果。

| 原项 | 本轮对应 | 源码/函数 | 测试 | 状态 |
|---|---|---|---|---|
| 原2/4（F15） | U02/U03 验证码 | `verification-backend.ts`、`verification-codes.ts`、`sms-store.ts`、`email-code-store.ts` | r0l/r0l2/r0l3（29） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原2 | U02 reset/login/register 一次性 | `verify-email-code`、`verify-sms-code`、`reset-password`、`login-sms`、`register`、`profile` | r0u（7） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原5（F16/F07） | U03 SMTP 三态 | `mailer.ts` | r0f（4） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原5 | U04 支付唯一履约 | `payment/fulfill.ts`、`receipt.ts`、`alipay.ts`、`wechatpay.ts`、两条 notify | r0y（18）、r0x（16）、r0b（108） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原6/8 | U08 单位 / U09-6 调价事务 | `billing-config.ts`、`quota-token.ts`、`global-markup/route.ts` | r08（4）、r0d（2） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原6/8/11 | U01/U10 成本预算生产实现与接线 | `billing/cost-reservation.ts`、`execution-orchestration.ts` | 无 | FAILED |
| 原7 | 来源可退依据/配额映射守卫接线 | `refund-basis.ts`、`entitlement-read-guard.ts` | 无 | FAILED |
| 原8 | U06 BYO 目的地 | `workspace/byo-model/test/route.ts` | r0e（4） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原9 | U05-1/2/3/4 身份与初始化 | `security.ts`、`api-key-auth.ts`、`install-auth.ts`、`init-admin`、`verify-setup-token`、`init/page.tsx`、诊断路由 | r0g（5）、r0z（7） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原9 | U05-5/6/7 企业撤权与私有数据 | UI/Open/Key/标准岗位 | 无 | FAILED |
| 原10 | U11 首页/登录回跳/首值旅程页面 | `HeroSection.tsx`、`auth/login`、`first-value-journey` | 无 | FAILED（页面串联） |
| 原11 | U01/U10 运营恢复 / null scope / 指标 | `ops-readiness.ts`、`value-cost-metrics.ts` | 无 | FAILED（接线） |
| 原1/3（F14/F16） | U07 解析隔离 | `parse-admission.ts`、`parse-runner.ts`、`extract-text` | 无 | FAILED（未改） |
| 原13 | U12 离线迁移 + 请求 DDL 下线 | 两个 migration.sql、webhooks/BYO/settings 路由 | r0v（4） | IMPLEMENTED_OFFLINE_VERIFIED（迁移未执行） |
| 原14 | U13/U14 唯一共享集成 | 本目录交付材料 | 本目录 + 318/58 测试 | IN_PROGRESS（集成/冻结 SHA 未完成） |

## L1 关键正确结果逐项

| 验收要求 | 本轮结果 |
|---|---|
| 冷启动并发最多合法次数、预算数=准入数、不预建行避开 | ✅ r0l3 / verification-review（忠实 create 唯一） |
| 失败 5 次后核验/消费均受锁；过期不可消费 | ✅ r0l2 / r0l3 |
| 跨日 count 从新预约起算；重复/跨窗口回填不负数 | ✅ r0l3 |
| T 不能消费后来 B；并发同一码最多一个敏感业务成功 | ✅ r0u / reset-review / login-review |
| 消费不可用、密码提交失败、发信拒收无假成功 | ✅ 消费 503 零敏感提交；mailer 三态（密码写失败恢复路径为环境门） |
| 安装向导合法授权完成创建；无授权/重放/并发拒绝 | ✅ r0z / init-diagnostics-review |
| 完整身份拒绝不复活；账号不可用 Key 拒绝 | ✅ r0g / security-review |
| 私有诊断/岗位/企业数据无跨租户；撤权各入口一致 | ⚠️ 公开诊断已加守卫；标准岗位/企业撤权 FAILED |
| 审计失败价格/默认/版本保持原子结果；计数真实 | ✅ r0d / pricing-review |
| scheme/路径/端口/协议/redirect 变更不携带旧凭据 | ✅ r0e / byo-review（redirect 未接） |
| 无停止证明过 100 秒仍占隔离；计数未命中回收不假终态 | ❌ U07 FAILED |
| 双订单并发同交易最多一次权益；渠道/商户/币种/金额严格 | ✅ r0y / payment-review |
| 多笔晚收款不覆盖；失败/重发/查询不双发或写账 | ✅ r0y / r0x |
| 同键异参拒绝、跨实例预算/UNKNOWN/恢复不漏支出、不双扣 | ❌ U01/U10 FAILED |
| 逐来源退款/释放守恒、FREE 读不写 | ⚠️ FREE 读不写 ✅；其余未接线 |
| 实际首页到历史复用/拒绝/UNKNOWN、安全回跳不二次调用 | ❌ U11 FAILED |
| 无 scope 不跨租户；预付/消费/利润分栏 | ❌ U10/U12 FAILED |
| 空迁移链有创建前提；所有请求无 DDL，缺结构外部费用前拒绝 | ✅ r0v / 两个离线迁移（未执行） |

## CF-F01–F12
- CF-F10 请求 DDL：本轮已把 webhooks / BYO / settings 三处全部下线，改为离线迁移 + not-ready。
- CF-F08 标准岗位跨空间私有统计：FAILED（U05-7）。
- 先前的 24 项反例矩阵中，本轮新增/修正覆盖 U04 五项、U05-4 向导闭环、U02 challenge 绑定与短信并发、U12 请求零 DDL；解析/页面/指标反例仍未实现。

---

# 本轮新增映射（2026-11-10 第三轮）

| 原编号 | 实际入口/函数 | 测试 | 状态 |
| --- | --- | --- | --- |
| 原5/U04 | `src/lib/payment/fulfill.ts` fulfillPaidOrder（全类型唯一认领 + 终态原子事实行 + SUCCESS 差异行）；`receipt.ts` receiptClaimId | r0y（4 新用例）、r0b（93） | IMPLEMENTED_OFFLINE_VERIFIED |
| 原2/U02 | `src/lib/verification-backend.ts`（VerificationSendClaim 认领/fail-closed/原子签发/recordFailure）；`reset-password/route.ts`（PasswordResetClaim 状态机）；`send-email-code/route.ts`（可信 ip/actor） | r0l/r0l2/r0l3/r0u | IMPLEMENTED_OFFLINE_VERIFIED |
| 原2/U03 | `src/lib/mailer.ts`（精确收件人/NO_CONFIRMATION_FACT/SMTP_NOT_CONFIGURED=failed） | r0f | IMPLEMENTED_OFFLINE_VERIFIED |
| 原9/U05（部分） | `webhooks/route.ts` + workspace list/switch/upgrade/create-personal/hub-dashboard（完整 validateUser）；`auth/login/page.tsx` sanitizeInternalRedirect | 源码接线 + r0g/r0z 回归 | 部分完成（撤权矩阵/首页未做=FAILED） |
| 原11/U09-6 | `admin/model-pricing/global-markup/route.ts`（交互式事务内审计） | r0d | IMPLEMENTED_OFFLINE_VERIFIED |
| 原8/U06 | `workspace/byo-model/test/route.ts` normalizeEndpoint（query 参与） | r0e | IMPLEMENTED_OFFLINE_VERIFIED |
| 原1/F14 | `parse-admission.ts` sweep（证据门）/`extract-text/route.ts`（size 预检 + EXIT_CONFIRMED） | r0k/r0k1 | IMPLEMENTED_OFFLINE_VERIFIED |
| 原6/7/8 U01/U10 | cost-reservation/execution-orchestration/refund-basis 接真实入口 | — | FAILED（未实现） |
| 原10/11/12 U11/U12 | ops-readiness/value-cost-metrics 接真实后台/API | — | FAILED（未实现） |
| 原13 | schema +VerificationSendClaim/+PasswordResetClaim（离线草案） | tsc exit 0 | 部分；迁移属环境门 |
| 原14 | final-manifest/final-tests/handoff 更新 | — | 部分；浏览器旅程 ENVIRONMENT_UNVERIFIED |
