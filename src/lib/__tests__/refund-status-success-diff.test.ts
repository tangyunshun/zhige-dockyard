import { describe, it, expect } from "vitest";
import { deriveRefundStatus } from "../refund-status";

/**
 * refundStatus 语义修复（CORE-3 终审发现）：
 * SUCCESS 任务存在 REFUND 流水时是「真实结算差额退（多退）」，不得展示为「已退款」。
 * - SUCCESS + REFUND → refundStatus null（前端不展示退款横幅），refundedPoints 保留；
 * - FAILED + REFUND → REFUNDED（既有语义不变）。
 */
describe("deriveRefundStatus：SUCCESS 结算差额退语义", () => {
  it("SUCCESS + REFUND 流水 → refundStatus null（多退非失败退款）", () => {
    const r = deriveRefundStatus({
      taskId: "t-success",
      hasConsumeLedger: true,
      refundLedgerPoints: 5,
      taskStatus: "SUCCESS",
      chargeAttemptedExplicit: true,
    });
    expect(r.refundStatus).toBeNull();
    expect(r.refundedPoints).toBe(5);
    expect(r.chargeAttempted).toBe(true);
  });

  it("FAILED + REFUND 流水 → REFUNDED（既有语义不变）", () => {
    const r = deriveRefundStatus({
      taskId: "t-failed",
      hasConsumeLedger: true,
      refundLedgerPoints: 14,
      taskStatus: "FAILED",
      chargeAttemptedExplicit: true,
    });
    expect(r.refundStatus).toBe("REFUNDED");
    expect(r.refundedPoints).toBe(14);
  });

  it("无 taskStatus（历史调用方）保持 REFUNDED 兼容", () => {
    const r = deriveRefundStatus({
      taskId: "t-legacy",
      hasConsumeLedger: true,
      refundLedgerPoints: 7,
      chargeAttemptedExplicit: true,
    });
    expect(r.refundStatus).toBe("REFUNDED");
  });

  it("SUCCESS 无退款流水 → 走 UNKNOWN/NO_CHARGE 既有规则（不受影响）", () => {
    const r = deriveRefundStatus({
      taskId: "t-nocharge",
      hasConsumeLedger: false,
      refundLedgerPoints: null,
      taskStatus: "SUCCESS",
      chargeAttemptedExplicit: false,
    });
    expect(r.refundStatus).toBe("NO_CHARGE");
    expect(r.chargeAttempted).toBe(false);
  });
});
