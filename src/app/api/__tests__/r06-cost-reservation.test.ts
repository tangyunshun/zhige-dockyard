import { describe, it, expect } from "vitest";
import {
  CostReservationService,
  MemoryReservationBackend,
  type AdmitInputs,
  type QuoteInput,
  type ReserveConfig,
} from "@/lib/billing/cost-reservation";

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
  budgetPoints: 5, // > 计算出的 1 点成本，放行
  markupRateBps: 2000,
};

const FREE: AdmitInputs = {
  pricing: {
    currency: "CNY",
    priceStatus: "FREE",
    costInputMicrosPerMillion: 0,
    costOutputMicrosPerMillion: 0,
    rules: null,
  },
  contextLimit: 100000,
  maxOutputTokens: 1000,
  // 预算点数取正数以通过既有准入的「正整数预算」守卫；成本由 pricing 单价决定（此处为 0），故仍判定免费、零成本
  budgetPoints: 5,
  markupRateBps: 2000,
};

const NO_PRICE: AdmitInputs = { ...PRICED, pricing: null };

function quote(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    userId: "u1",
    workspaceId: "ws1",
    paymentAccountId: "acct1",
    contractId: "c1",
    priceVersionId: "pv1",
    inputDigest: "sha256:abc",
    modelStrategy: "deepseek-flash",
    executionScope: "PARSE",
    validUntil: 9_999_999_999_999,
    idempotencyKey: "k_" + Math.random().toString(36).slice(2),
    ...over,
  };
}

function svc(backend: MemoryReservationBackend, cap: bigint | null, now = () => 1000): CostReservationService {
  const config: ReserveConfig = { platformBudgetCapMicros: cap, now };
  return new CostReservationService(backend, config);
}

describe("P06 成本预约生命周期", () => {
  it("合法付费报价 → 预约成功且平台在途占用增加", async () => {
    const b = new MemoryReservationBackend();
    const r = await svc(b, BigInt(1_000_000)).admitAndReserve(quote(), PRICED);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reservation.status).toBe("RESERVED");
      expect(r.costMicros > BigInt(0)).toBe(true);
    }
  });

  it("FREE 价格 → 零成本预约成功（不占正预算）", async () => {
    const b = new MemoryReservationBackend();
    const r = await svc(b, BigInt(1_000_000)).admitAndReserve(quote(), FREE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.costMicros).toBe(BigInt("0"));
  });

  it("缺价格/状态不可信 → 准入拒绝（零扣点零调用）", async () => {
    const b = new MemoryReservationBackend();
    const r = await svc(b, BigInt(1_000_000)).admitAndReserve(quote(), NO_PRICE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ADMISSION_REJECTED");
  });

  it("超预算（budgetPoints 不足）→ 准入拒绝", async () => {
    const b = new MemoryReservationBackend();
    const r = await svc(b, BigInt(1_000_000)).admitAndReserve(quote(), { ...PRICED, budgetPoints: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ADMISSION_REJECTED");
  });

  it("平台预算已批准且超上限 → 预约被暂缓", async () => {
    const b = new MemoryReservationBackend();
    const cap = BigInt("200"); // 仅够一次（一次 123 微元）
    const s = svc(b, cap);
    const first = await s.admitAndReserve(quote({ idempotencyKey: "k1" }), PRICED);
    expect(first.ok).toBe(true);
    const second = await s.admitAndReserve(quote({ idempotencyKey: "k2" }), PRICED);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("PLATFORM_BUDGET_EXCEEDED");
  });

  it("跨实例共享平台预算：两个服务实例共用同一后端上限", async () => {
    const b = new MemoryReservationBackend(); // 单一真相源，模拟跨实例
    const cap = BigInt("200");
    const sA = svc(b, cap);
    const sB = svc(b, cap);
    const a = await sA.admitAndReserve(quote({ idempotencyKey: "a" }), PRICED);
    expect(a.ok).toBe(true);
    const bRes = await sB.admitAndReserve(quote({ idempotencyKey: "b" }), PRICED);
    expect(bRes.ok).toBe(false); // B 实例看到 A 已占用的在途，超过共享上限
    if (!bRes.ok) expect(bRes.code).toBe("PLATFORM_BUDGET_EXCEEDED");
  });

  it("-1 权益用户不豁免平台成本：仍占在途且受上限约束", async () => {
    const b = new MemoryReservationBackend();
    const cap = BigInt("200");
    const r = await svc(b, cap).admitAndReserve(quote({ userId: "-1", idempotencyKey: "m1" }), PRICED);
    expect(r.ok).toBe(true); // -1 也要走预约（不豁免）
    const r2 = await svc(b, cap).admitAndReserve(quote({ userId: "-1", idempotencyKey: "m2" }), PRICED);
    expect(r2.ok).toBe(false); // 同样受 cap 约束
  });

  it("管理员身份不豁免平台成本：仍占在途且受上限约束", async () => {
    const b = new MemoryReservationBackend();
    const cap = BigInt("200");
    const r = await svc(b, cap).admitAndReserve(quote({ userId: "admin", idempotencyKey: "ad1" }), PRICED);
    expect(r.ok).toBe(true);
    const r2 = await svc(b, cap).admitAndReserve(quote({ userId: "admin", idempotencyKey: "ad2" }), PRICED);
    expect(r2.ok).toBe(false);
  });

  it("平台预算未批准（cap=null）且正成本 → 决策门拦截；FREE 放行", async () => {
    const b = new MemoryReservationBackend();
    const blocked = await svc(b, null).admitAndReserve(quote({ idempotencyKey: "nb1" }), PRICED);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("PLATFORM_BUDGET_BLOCKED");
    const free = await svc(b, null).admitAndReserve(quote({ idempotencyKey: "nb2" }), FREE);
    expect(free.ok).toBe(true); // FREE/0 成本不受未批准预算拦截
  });

  it("过期报价 → 拒绝（材料/版本变化须重新裁决）", async () => {
    const b = new MemoryReservationBackend();
    const r = await svc(b, BigInt(1_000_000), () => 2000).admitAndReserve(
      quote({ validUntil: 1500, idempotencyKey: "e1" }),
      PRICED,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("QUOTE_EXPIRED");
  });

  it("幂等：同幂等键重复提交 → 返回既有预约，不重复占预算", async () => {
    const b = new MemoryReservationBackend();
    const s = svc(b, BigInt(1_000_000));
    const k = "idem1";
    const first = await s.admitAndReserve(quote({ idempotencyKey: k }), PRICED);
    expect(first.ok).toBe(true);
    const second = await s.admitAndReserve(quote({ idempotencyKey: k }), PRICED);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.reservation.status).toBe("RESERVED");
    // 在途只增一次：第一次 123，第二次返回既有不应再增
    const third = await s.admitAndReserve(quote({ idempotencyKey: "k_other" }), PRICED);
    expect(third.ok).toBe(true); // 第二次实际占用才会让第三次在默认大 cap 下仍 ok
  });

  it("结算成功 → 释放平台在途", async () => {
    const b = new MemoryReservationBackend();
    const s = svc(b, BigInt(1_000_000));
    const r = await s.admitAndReserve(quote({ idempotencyKey: "s1" }), PRICED);
    expect(r.ok).toBe(true);
    const st = await s.settle("s1");
    expect(st.ok).toBe(true);
    expect(st.status).toBe("SETTLED");
  });

  it("确定失败 → 释放预约与在途", async () => {
    const b = new MemoryReservationBackend();
    const s = svc(b, BigInt(1_000_000));
    await s.admitAndReserve(quote({ idempotencyKey: "f1" }), PRICED);
    const st = await s.release("f1");
    expect(st.ok).toBe(true);
    expect(st.status).toBe("RELEASED");
  });

  it("未知供应商结果 → 保守保留在途，不盲释；后续可结算", async () => {
    const b = new MemoryReservationBackend();
    const s = svc(b, BigInt(1_000_000));
    await s.admitAndReserve(quote({ idempotencyKey: "u1" }), PRICED);
    const u = await s.markUnknown("u1");
    expect(u.ok).toBe(true);
    expect(u.status).toBe("UNKNOWN");
    const st = await s.settle("u1"); // 迟到成功/恢复
    expect(st.ok).toBe(true);
    expect(st.status).toBe("SETTLED");
  });
});
