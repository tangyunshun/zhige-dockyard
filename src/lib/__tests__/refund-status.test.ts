/**
 * 退款与账务状态权威派生（deriveRefundStatus）确定性单测。
 *
 * 抵扣规则（refund-status.ts）：
 *  - 状态必须从数据库账务事实（pointledger / refundrecovery）派生，严禁从前端或错误码猜测；
 *  - 存在消费流水但无退款/恢复证据 → UNKNOWN（严禁称已退款或误判未扣费）；
 *  - 前置阻断且无消费流水 → NO_CHARGE；
 *  - chargeAttempted 严格三态（true/false/null），缺失/未知一律保留 null，严禁推断。
 *
 * 本测试覆盖 refundStatus 五态与 chargeAttempted 三态，作为三组件详情字段的可确定性证据。
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { deriveRefundStatus } from "@/lib/refund-status";

describe("退款状态权威派生（deriveRefundStatus）覆盖 refundStatus 五态与 chargeAttempted 三态", () => {
  it("1. 存在退款流水 → REFUNDED，chargeAttempted=true，refundedPoints>0", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: false, refundLedgerPoints: 12 });
    assert.equal(m.refundStatus, "REFUNDED");
    assert.equal(m.chargeAttempted, true);
    assert.equal(m.refundedPoints, 12);
  });

  it("2. recovery PENDING → REFUND_PENDING，chargeAttempted=true", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: false, recoveryStatus: "PENDING" });
    assert.equal(m.refundStatus, "REFUND_PENDING");
    assert.equal(m.chargeAttempted, true);
  });

  it("3. recovery REQUIRES_REVIEW → RECONCILIATION_REQUIRED，chargeAttempted=true", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: false, recoveryStatus: "REQUIRES_REVIEW" });
    assert.equal(m.refundStatus, "RECONCILIATION_REQUIRED");
    assert.equal(m.chargeAttempted, true);
  });

  it("4. 存在消费流水但无退款/恢复证据 → UNKNOWN，chargeAttempted=true（严禁声称已退款/未扣费）", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: true });
    assert.equal(m.refundStatus, "UNKNOWN");
    assert.equal(m.chargeAttempted, true);
  });

  it("5. 前置阻断（chargeAttemptedExplicit=false）且无消费流水 → NO_CHARGE，chargeAttempted=false", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: false, chargeAttemptedExplicit: false });
    assert.equal(m.refundStatus, "NO_CHARGE");
    assert.equal(m.chargeAttempted, false);
  });

  it("6. 无任何账务事实且无法判断扣费 → UNKNOWN，chargeAttempted=null（三态之第三态）", () => {
    const m = deriveRefundStatus({ taskId: "t", hasConsumeLedger: false });
    assert.equal(m.refundStatus, "UNKNOWN");
    assert.equal(m.chargeAttempted, null);
  });
});
