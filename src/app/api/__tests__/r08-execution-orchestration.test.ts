import { describe, it, expect } from "vitest";
import {
  CostReservationService,
  MemoryReservationBackend,
  type AdmitInputs,
  type QuoteInput,
  type ReserveConfig,
} from "@/lib/billing/cost-reservation";
import {
  executeAttempt,
  recoverAttempt,
  type AttemptDelegate,
  type RecoverySummary,
} from "@/lib/billing/execution-orchestration";

const PRICED: AdmitInputs = {
  pricing: {
    currency: "CNY",
    priceStatus: "VERIFIED",
    costInputMicrosPerMillion: 1000,
    costOutputMicrosPerMillion: 2000,
    costCacheReadMicrosPerMillion: 0,
    costCacheWriteMicrosPerMillion: 0,
    rules: null,
  },
  contextLimit: 100000,
  maxOutputTokens: 1000,
  budgetPoints: 5,
  markupRateBps: 2000,
};

function quote(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    userId: "u1",
    workspaceId: "ws1",
    paymentAccountId: "acct1",
    contractId: "c1",
    priceVersionId: "pv1",
    inputDigest: "sha256:abc",
    modelStrategy: "deepseek-flash",
    executionScope: "STUDIO",
    validUntil: 9_999_999_999_999,
    idempotencyKey: "k_" + Math.random().toString(36).slice(2),
    ...over,
  };
}

class FakeAttemptDelegate implements AttemptDelegate {
  consumeDeductions = 0;
  refundCalls: string[] = [];
  holds: string[] = [];
  completedHolds = new Set<string>();
  releasedHolds = new Set<string>();
  recoveries: RecoverySummary[] = [];
  txCount = 0;
  /** 这些 taskId 的 consume 返回供应商未知 */
  unknownTasks = new Set<string>();
  /** 这些 taskId 的 createHold 抛错（模拟结算失败） */
  failHoldTasks = new Set<string>();
  /** 这些 taskId 的 consume 抛错（模拟确定失败） */
  failConsumeTasks = new Set<string>();
  /** 到达第 N 次 canContinue 调用时返回 false（硬关闭） */
  shutdownAfter = Infinity;
  private canCount = 0;

  canContinue(): boolean {
    this.canCount += 1;
    return this.canCount <= this.shutdownAfter;
  }
  async consume(taskId: string, key: string) {
    if (this.failConsumeTasks.has(taskId)) throw new Error("模型调用确定失败");
    if (this.unknownTasks.has(taskId)) return { ledgerIds: [], consumed: BigInt(0), unknown: true };
    // 幂等：同一幂等键只扣一次（真实 credit-service 凭 consume idempotencyKey 保证）
    if ((this as any)._consumed?.has(key)) return { ledgerIds: [], consumed: BigInt(0) };
    if (!(this as any)._consumed) (this as any)._consumed = new Set<string>();
    (this as any)._consumed.add(key);
    this.consumeDeductions += 1;
    return { ledgerIds: [`L_${key}`], consumed: BigInt(100) };
  }
  async refund(taskId: string) {
    this.refundCalls.push(taskId);
  }
  async createHold(taskId: string) {
    if (this.failHoldTasks.has(taskId)) throw new Error("结算 hold 失败");
    const id = `H_${taskId}_${this.holds.length}`;
    this.holds.push(id);
    return id;
  }
  async completeHold(holdId: string) {
    this.completedHolds.add(holdId);
  }
  async releaseHold(holdId: string) {
    this.releasedHolds.add(holdId);
  }
  async enqueueRecovery(summary: RecoverySummary) {
    this.recoveries.push(summary);
  }
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.txCount += 1;
    return fn();
  }
}

function svc(backend: MemoryReservationBackend, cap = BigInt(1_000_000)): CostReservationService {
  const config: ReserveConfig = { platformBudgetCapMicros: cap };
  return new CostReservationService(backend, config);
}

describe("P08 执行编排：锁序 / 幂等 / 安全恢复", () => {
  it("成功路径：扣点→结算→释放在途；一次扣点", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    const r = await executeAttempt({ taskId: "t1", idempotencyKey: "k1", quote: quote({ idempotencyKey: "k1" }), admit: PRICED, consumeInput: {} }, svc(b), d);
    expect(r.outcome).toBe("SUCCESS");
    expect(d.consumeDeductions).toBe(1);
    expect(d.completedHolds.has("H_t1_0")).toBe(true);
    const row = await b.getReservation("k1");
    expect(row?.status).toBe("SETTLED");
  });

  it("确定失败（结算 hold 失败）：退点 + 释放预约，不双付", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    d.failHoldTasks.add("t2");
    const r = await executeAttempt({ taskId: "t2", idempotencyKey: "k2", quote: quote({ idempotencyKey: "k2" }), admit: PRICED, consumeInput: {} }, svc(b), d);
    expect(r.outcome).toBe("FAILED");
    expect(d.refundCalls).toContain("t2");
    expect(d.consumeDeductions).toBe(1); // 扣了一次，退一次，不双扣
    const row = await b.getReservation("k2");
    expect(row?.status).toBe("RELEASED");
  });

  it("供应商结果未知：保守保留在途 + 登记恢复，不盲释再重试", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    d.unknownTasks.add("t3");
    const r = await executeAttempt({ taskId: "t3", idempotencyKey: "k3", quote: quote({ idempotencyKey: "k3" }), admit: PRICED, consumeInput: {} }, svc(b), d);
    expect(r.outcome).toBe("UNKNOWN");
    expect(d.recoveries.some((x) => x.unknownSource)).toBe(true);
    expect(d.completedHolds.has("H_t3_0")).toBe(false); // hold 不完成、不释放（保守）
    const row = await b.getReservation("k3");
    expect(row?.status).toBe("UNKNOWN");
  });

  it("重放同一幂等键：已结算→拒绝，不重复扣点", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    const ctx = { taskId: "t4", idempotencyKey: "k4", quote: quote({ idempotencyKey: "k4" }), admit: PRICED, consumeInput: {} };
    const first = await executeAttempt(ctx, svc(b), d);
    expect(first.outcome).toBe("SUCCESS");
    const second = await executeAttempt(ctx, svc(b), d);
    expect(second.outcome).toBe("REJECTED"); // ALREADY_SETTLED
    expect(d.consumeDeductions).toBe(1); // 仍只扣一次
  });

  it("并发 attempt 同幂等键：不双扣", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    const ctx = { taskId: "t5", idempotencyKey: "k5", quote: quote({ idempotencyKey: "k5" }), admit: PRICED, consumeInput: {} };
    const [a, c] = await Promise.all([executeAttempt(ctx, svc(b), d), executeAttempt(ctx, svc(b), d)]);
    expect([a.outcome, c.outcome]).toContain("SUCCESS");
    expect(d.consumeDeductions).toBe(1); // 并发不双扣
  });

  it("硬关闭信号：安全中断，保守保留待恢复", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    d.shutdownAfter = 0; // 第一次 canContinue 即 false
    const r = await executeAttempt({ taskId: "t6", idempotencyKey: "k6", quote: quote({ idempotencyKey: "k6" }), admit: PRICED, consumeInput: {} }, svc(b), d);
    expect(r.outcome).toBe("UNKNOWN");
    expect(d.recoveries.length).toBeGreaterThan(0);
    expect(d.completedHolds.size).toBe(0);
  });

  it("恢复：未知→成功恢复（结算），不重新扣点", async () => {
    const b = new MemoryReservationBackend();
    const d = new FakeAttemptDelegate();
    d.unknownTasks.add("t7");
    const ctx = { taskId: "t7", idempotencyKey: "k7", quote: quote({ idempotencyKey: "k7" }), admit: PRICED, consumeInput: {} };
    const first = await executeAttempt(ctx, svc(b), d);
    expect(first.outcome).toBe("UNKNOWN");
    const rec = await recoverAttempt(ctx, svc(b), d, "SUCCESS");
    expect(rec.outcome).toBe("RECOVERED");
    expect(d.consumeDeductions).toBe(0); // 未知路径本就未实际扣点；恢复不重新扣点
    const row = await b.getReservation("k7");
    expect(row?.status).toBe("SETTLED");
  });
});
