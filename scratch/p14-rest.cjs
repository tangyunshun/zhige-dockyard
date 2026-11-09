// P14 其余交付物更新（history/ 已保留旧版）
const fs = require("fs");
const D = "docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/";
const nl = "\n";

// ── scope-acceptance-map.md 追加本轮映射 ──
const sm = [
  "", "---", "", "# 本轮新增映射（2026-11-10 第三轮）", "",
  "| 原编号 | 实际入口/函数 | 测试 | 状态 |",
  "| --- | --- | --- | --- |",
  "| 原5/U04 | `src/lib/payment/fulfill.ts` fulfillPaidOrder（全类型唯一认领 + 终态原子事实行 + SUCCESS 差异行）；`receipt.ts` receiptClaimId | r0y（4 新用例）、r0b（93） | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原2/U02 | `src/lib/verification-backend.ts`（VerificationSendClaim 认领/fail-closed/原子签发/recordFailure）；`reset-password/route.ts`（PasswordResetClaim 状态机）；`send-email-code/route.ts`（可信 ip/actor） | r0l/r0l2/r0l3/r0u | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原2/U03 | `src/lib/mailer.ts`（精确收件人/NO_CONFIRMATION_FACT/SMTP_NOT_CONFIGURED=failed） | r0f | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原9/U05（部分） | `webhooks/route.ts` + workspace list/switch/upgrade/create-personal/hub-dashboard（完整 validateUser）；`auth/login/page.tsx` sanitizeInternalRedirect | 源码接线 + r0g/r0z 回归 | 部分完成（撤权矩阵/首页未做=FAILED） |",
  "| 原11/U09-6 | `admin/model-pricing/global-markup/route.ts`（交互式事务内审计） | r0d | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原8/U06 | `workspace/byo-model/test/route.ts` normalizeEndpoint（query 参与） | r0e | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原1/F14 | `parse-admission.ts` sweep（证据门）/`extract-text/route.ts`（size 预检 + EXIT_CONFIRMED） | r0k/r0k1 | IMPLEMENTED_OFFLINE_VERIFIED |",
  "| 原6/7/8 U01/U10 | cost-reservation/execution-orchestration/refund-basis 接真实入口 | — | FAILED（未实现） |",
  "| 原10/11/12 U11/U12 | ops-readiness/value-cost-metrics 接真实后台/API | — | FAILED（未实现） |",
  "| 原13 | schema +VerificationSendClaim/+PasswordResetClaim（离线草案） | tsc exit 0 | 部分；迁移属环境门 |",
  "| 原14 | final-manifest/final-tests/handoff 更新 | — | 部分；浏览器旅程 ENVIRONMENT_UNVERIFIED |",
  "",
].join(nl);
fs.appendFileSync(D + "scope-acceptance-map.md", sm);

// ── production-wiring-map.md 追加 ──
const pw = [
  "", "---", "", "# 本轮新增接线（2026-11-10）", "",
  "- 支付：notify 路由 → `fulfillPaidOrder` → **全类型** (渠道,商户,交易号) billingrecord 唯一认领（P2002 裁决）→ 席位/企业/点数履约 → SUCCESS；终态/晚到账 → 原子事实行（PENDING_RECOVERY/DIFF_FACT）→ 运营可追溯（未发放）。",
  "- 验证码：send-email-code（可信 ip/actor）→ admitSend（预算 + VerificationSendClaim 认领）→ issue（同事务换码）→ sendMail（精确接收事实）→ onSendResult（按 sendId 幂等回退/终态）；verify/consume 同一失败锁，服务不可用 fail-closed 503。",
  "- 改密：resetToken(jti) → PasswordResetClaim 状态机 → 消费与写密提交一致性（失败可重试/重放幂等）。",
  "- 身份：Webhooks 与 5 个工作空间入口一律完整 validateUser；登录回跳 sanitizeInternalRedirect。",
  "- 解析：extract-text → size 预检 → 原子准入 → worker → exit 确认 → 释放；无停止证据不腾槽（QUARANTINED 诊断保留），EXIT_CONFIRMED 证据回收。",
  "- 仍为纯契约/未接线（FAILED）：cost-reservation 生产后端、task/attempt 持久化、来源退款真实 ledger、ops 恢复后台、指标 API。",
  "",
].join(nl);
fs.appendFileSync(D + "production-wiring-map.md", pw);

// ── user-journey-evidence.md 追加 ──
const uj = [
  "", "---", "", "# 本轮补充（2026-11-10）", "",
  "- 本轮未做浏览器旅程验证（环境门）：登录回跳净化为源码级实现 + tsc 验证，实际页面行为未在浏览器中点击确认。",
  "- 登录→预检→任务→成果→历史的端到端页面串联仍未完成（首页改版/模块接线属 FAILED 项）。",
  "",
].join(nl);
fs.appendFileSync(D + "user-journey-evidence.md", uj);

// ── schema-migration-and-recovery.md 追加 ──
const sc = [
  "", "---", "", "# 本轮 schema 增量（2026-11-10，离线草案未迁移）", "",
  "## 新增模型",
  "1. `VerificationSendClaim`（U02 发送预约身份绑定）：id=`${sendId}:${scope}` 主键、sendId 索引、status(PENDING|REFUNDED|SETTLED|OBSOLETE)、windowStart( BigInt 窗口判据)。回滚：DROP TABLE。",
  "2. `PasswordResetClaim`（U02 改密授权认领）：id=resetToken jti 主键、status(PENDING|AUTH_CONSUMED|COMPLETED)。回滚：DROP TABLE。",
  "",
  "## 与既有草案的关系",
  "- 与 VerificationBudget/smscode/storageoperation 同为离线草案；上线前统一迁移 + 重新生成客户端。",
  "- 未执行迁移前：发送认领创建失败 → admitSend 503 并释放占用（无认领不发送）；PasswordResetClaim delegate 缺失 → reset-password 503 RESET_CLAIM_NOT_READY（零副作用）。",
  "- 历史 checksum/已部署实例兼容：未核实（真实环境门），不猜、不真实 apply。",
  "",
].join(nl);
fs.appendFileSync(D + "schema-migration-and-recovery.md", sc);

// ── decisions-and-release-gates.md 追加（无新增批准，仅记录状态） ──
const dg = [
  "", "---", "", "# 2026-11-10 状态更新", "",
  "- 本轮无新增决策批准项；全部既有门维持：售价/预算/退款政策、真实迁移/部署、浏览器验证、真实渠道互通。",
  "- 未接线模块（成本后端/运营恢复/指标）按指令标记 FAILED（工程缺口），非 DECISION_BLOCKED。",
  "",
].join(nl);
fs.appendFileSync(D + "decisions-and-release-gates.md", dg);

console.log("P14 deliverables updated");
