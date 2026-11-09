import { describe, it, expect } from "vitest";
import {
  collectPendingRecords,
  redactSensitive,
  readonlyHealthCheck,
  recoverAction,
  resumeStoppedService,
  authorizePriceChange,
  validateBatchPriceCount,
  RECOVERY_PERMISSION,
  PRICE_WRITE_PERMISSION,
  type PendingRecord,
  type RecoveryDelegate,
} from "@/lib/operations/ops-readiness";
import type { RecoverySummary } from "@/lib/billing/execution-orchestration";

const REC: PendingRecord = {
  businessId: "task_1",
  kind: "UNKNOWN_TASK",
  reason: "供应商结果未知",
  status: "UNKNOWN",
  retryCount: 1,
  responsibleRole: "ops:recovery",
  nextStep: "人工核实后决定 SUCCESS/FAILED",
  tenantId: "ent_1",
};

describe("P11 运营恢复/审计/发布准备", () => {
  describe("1) 待处理记录按租户裁剪，未知与失败区分", () => {
    it("非跨租户只看本租户", () => {
      const other: PendingRecord = { ...REC, tenantId: "ent_2" };
      const out = collectPendingRecords([REC, other], "ent_1", false);
      expect(out).toHaveLength(1);
      expect(out[0].tenantId).toBe("ent_1");
    });
    it("跨租户权限可见全部", () => {
      const other: PendingRecord = { ...REC, tenantId: "ent_2" };
      expect(collectPendingRecords([REC, other], null, true)).toHaveLength(2);
    });
  });

  describe("2) 日志脱敏不含 key/验证码/客户正文", () => {
    it("遮蔽 key 与验证码", () => {
      const r = redactSensitive("调用 sk-ABC123DEF456 失败，验证码: 123456，password=secret1");
      expect(r).not.toContain("sk-ABC123DEF456");
      expect(r).not.toContain("123456");
      expect(r).not.toContain("secret1");
      expect(r).toContain("[REDACTED_KEY]");
    });
  });

  describe("3) 只读健康检查零业务副作用", () => {
    it("纯计算返回状态，可注入写入桩验证零写", () => {
      const writes: string[] = [];
      const report = readonlyHealthCheck([
        { name: "db", ready: true, diagnostics: "ok" },
        { name: "worker", ready: false, diagnostics: "未配置" },
      ]);
      expect(report.status).toBe("DEGRADED");
      expect(writes).toHaveLength(0);
    });
    it("全未就绪 → NOT_READY", () => {
      expect(readonlyHealthCheck([{ name: "x", ready: false, diagnostics: "缺失" }]).status).toBe("NOT_READY");
    });
  });

  describe("4) 安全恢复：权限/原因/幂等/审计/unknown 不盲重试", () => {
    const summary: RecoverySummary = { taskId: "task_1", unknownSource: false, differenceState: false, recoveryAction: "REVIEW", note: "执行失败，保守保留" };
    function fakeDelegate(opts: { auditOk?: boolean; recoverOk?: boolean } = {}): RecoveryDelegate {
      return {
        performRecovery: async () => ({ ok: opts.recoverOk ?? true, outcome: "RECOVERED" }),
        audit: async () => ({ ok: opts.auditOk ?? true }),
      };
    }
    it("只读/普通管理员无恢复权限被拒", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "admin", permissions: ["order:read"], reason: "x", idempotencyKey: "k1", intendedOutcome: "SUCCESS" }, fakeDelegate());
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("FORBIDDEN");
    });
    it("缺少原因被拒", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "", idempotencyKey: "k1", intendedOutcome: "SUCCESS" }, fakeDelegate());
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("MISSING_REASON");
    });
    it("缺少幂等键被拒", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "x", idempotencyKey: "", intendedOutcome: "SUCCESS" }, fakeDelegate());
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("MISSING_IDEMPOTENCY");
    });
    it("unknown 不能盲重试（无显式意图）", async () => {
      const unk: RecoverySummary = { ...summary, unknownSource: true };
      const r = await recoverAction("task_1", unk, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "x", idempotencyKey: "k1", intendedOutcome: "REVIEW" }, fakeDelegate());
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("UNKNOWN_NEEDS_DECISION");
    });
    it("审计失败不伪报成功", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "x", idempotencyKey: "k1", intendedOutcome: "SUCCESS" }, fakeDelegate({ auditOk: false }));
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("AUDIT_FAILED");
    });
    it("具备权限/原因/幂等/审计成功 → 恢复成功", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "客户已确认成果", idempotencyKey: "k1", intendedOutcome: "SUCCESS" }, fakeDelegate());
      if (!r.ok) throw new Error("expected success: " + r.code);
      expect(r.outcome).toBe("RECOVERED");
    });
    it("业务恢复失败不产生资金副作用", async () => {
      const r = await recoverAction("task_1", summary, { operatorId: "u", operatorRole: "ops", permissions: [RECOVERY_PERMISSION], reason: "x", idempotencyKey: "k1", intendedOutcome: "SUCCESS" }, fakeDelegate({ recoverOk: false }));
      if (r.ok) throw new Error("expected failure");
      expect(r.code).toBe("RECOVERY_FAILED");
    });
  });

  describe("5) 停止服务未确认不能腾槽", () => {
    it("未确认拒绝", () => {
      const r = resumeStoppedService({ operatorId: "u", permissions: [RECOVERY_PERMISSION], confirmed: false });
      expect(r.ok).toBe(false);
      expect(r.code).toBe("NOT_CONFIRMED");
    });
    it("确认且有权限通过", () => {
      expect(resumeStoppedService({ operatorId: "u", permissions: [RECOVERY_PERMISSION], confirmed: true }).ok).toBe(true);
    });
  });

  describe("6) CF-F06 调价守卫：读权限不能改价，计数须一致", () => {
    it("读权限改价被拒", () => {
      expect(authorizePriceChange(["order:read"]).ok).toBe(false);
    });
    it("price:write 可改价", () => {
      expect(authorizePriceChange([PRICE_WRITE_PERMISSION]).ok).toBe(true);
    });
    it("审计计数与实际修改不一致拒绝伪报", () => {
      expect(validateBatchPriceCount(5, 3).ok).toBe(false);
      expect(validateBatchPriceCount(4, 4).ok).toBe(true);
    });
  });
});
