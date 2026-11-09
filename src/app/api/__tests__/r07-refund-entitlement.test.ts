import { describe, it, expect } from "vitest";
import {
  computeNetRefundable,
  previewRefundable,
  type LedgerRecord,
  type SourceBucket,
} from "@/lib/billing/refund-basis";
import { classifyQuotaDoubleBinding, assertReadDoesNotGrant } from "@/lib/billing/entitlement-read-guard";

function rec(id: string, type: LedgerRecord["type"], bucket: LedgerRecord["bucket"], points: bigint): LedgerRecord {
  return { id, type, bucket, points };
}

describe("P07 净可退依据与来源守恒", () => {
  it("混合付费/赠送/企业来源：按桶计算净可退", () => {
    const recs: LedgerRecord[] = [
      rec("c1", "CONSUME", "WALLET", BigInt(100)),
      rec("c2", "CONSUME", "PERSONAL_GIFT", BigInt(50)),
      rec("c3", "CONSUME", "WORKSPACE", BigInt(200)),
      rec("c4", "CONSUME", "MEMBER", BigInt(30)),
      rec("g1", "GRANT", "WALLET", BigInt(1000)), // GRANT 不计入可退基数
    ];
    const basis = computeNetRefundable(recs);
    const get = (b: SourceBucket) => basis.byBucket.find((x) => x.bucket === b)!;
    expect(get("WALLET").refundable).toBe(BigInt(100));
    expect(get("PERSONAL_GIFT").refundable).toBe(BigInt(50));
    expect(get("WORKSPACE").refundable).toBe(BigInt(200));
    expect(get("MEMBER").refundable).toBe(BigInt(30));
    expect(basis.totalRefundable).toBe(BigInt(380));
  });

  it("已退/已释放不能再次创造额度（净可退扣减，不透支）", () => {
    const recs: LedgerRecord[] = [
      rec("c1", "CONSUME", "WALLET", BigInt(100)),
      rec("r1", "REFUND", "WALLET", BigInt(40)), // 自动退点
      rec("l1", "RELEASE", "WALLET", BigInt(10)), // 结算释放
    ];
    const basis = computeNetRefundable(recs);
    const w = basis.byBucket.find((x) => x.bucket === "WALLET")!;
    expect(w.consumed).toBe(BigInt(100));
    expect(w.refunded).toBe(BigInt(40));
    expect(w.released).toBe(BigInt(10));
    expect(w.refundable).toBe(BigInt(50)); // 100-40-10
    expect(basis.totalRefundable).toBe(BigInt(50));
  });

  it("预留释放后重复退：再次 REFUND 不会凭空增加可退", () => {
    const recs: LedgerRecord[] = [
      rec("c1", "CONSUME", "WALLET", BigInt(100)),
      rec("r1", "REFUND", "WALLET", BigInt(100)), // 已全额退
      rec("r2", "REFUND", "WALLET", BigInt(100)), // 异常重复退记录（不应创造额度）
    ];
    const basis = computeNetRefundable(recs);
    const w = basis.byBucket.find((x) => x.bucket === "WALLET")!;
    expect(w.refundable).toBe(BigInt(0)); // 已退≥已扣 → 下限 0，不产生透支额度
    expect(basis.differenceReasons.some((r) => r.includes("WALLET") && r.includes("异常透支"))).toBe(true);
  });

  it("来源不明进入差异状态，不创建兜底付费事实抹平", () => {
    const recs: LedgerRecord[] = [
      rec("c1", "CONSUME", "WALLET", BigInt(100)),
      rec("u1", "CONSUME", "UNKNOWN", BigInt(25)), // 历史来源不明
    ];
    const basis = computeNetRefundable(recs);
    expect(basis.unknownSourceAmount).toBe(BigInt(25));
    expect(basis.differenceReasons.some((r) => r.includes("来源不明"))).toBe(true);
    // 仍按已知桶计算可退，但绝不把 UNKNOWN 金额并入可退总额
    expect(basis.totalRefundable).toBe(BigInt(100));
  });

  it("归属守恒：赠送/企业资产不转个人（桶间不互转）", () => {
    const recs: LedgerRecord[] = [
      rec("c1", "CONSUME", "PERSONAL_GIFT", BigInt(50)),
      rec("c2", "CONSUME", "WORKSPACE", BigInt(80)),
    ];
    const basis = computeNetRefundable(recs);
    const gift = basis.byBucket.find((x) => x.bucket === "PERSONAL_GIFT")!;
    const ws = basis.byBucket.find((x) => x.bucket === "WORKSPACE")!;
    expect(gift.refundable).toBe(BigInt(50)); // 退回仍归赠送桶
    expect(ws.refundable).toBe(BigInt(80)); // 退回仍归空间池
    expect(basis.totalRefundable).toBe(BigInt(130));
  });
});

describe("P07 只读可退预览与 F07 暂停保持", () => {
  const recs: LedgerRecord[] = [rec("c1", "CONSUME", "WALLET", BigInt(100))];

  it("模型失败退款：预览就绪且返回明细", () => {
    const p = previewRefundable({ records: recs, refundNature: "MODEL_FAILURE", commercialRefundApproved: false });
    expect(p.ready).toBe(true);
    if (p.ready) expect(p.basis.totalRefundable).toBe(BigInt(100));
  });

  it("结算释放：预览就绪", () => {
    const p = previewRefundable({ records: recs, refundNature: "SETTLEMENT_RELEASE", commercialRefundApproved: false });
    expect(p.ready).toBe(true);
  });

  it("商业售后退款在 F07 APPROVE 暂停期间明确未就绪（不执行）", () => {
    const p = previewRefundable({ records: recs, refundNature: "COMMERCIAL", commercialRefundApproved: false });
    expect(p.ready).toBe(false);
    if (!p.ready) expect(p.reason).toBe("F07_APPROVE_PAUSED");
  });

  it("商业售后退款在已批准后就绪", () => {
    const p = previewRefundable({ records: recs, refundNature: "COMMERCIAL", commercialRefundApproved: true });
    expect(p.ready).toBe(true);
  });

  it("无可退金额：预览未就绪（NO_REFUNDABLE）", () => {
    const p = previewRefundable({ records: [], refundNature: "MODEL_FAILURE", commercialRefundApproved: false });
    expect(p.ready).toBe(false);
    if (!p.ready) expect(p.reason).toBe("NO_REFUNDABLE");
  });
});

describe("P07 CF-F04 / CF-F09 只读不变量", () => {
  it("CF-F09：1:1 空间↔quota 正常，不标记冲突", () => {
    const r = classifyQuotaDoubleBinding([
      { spaceId: "s1", quotaId: "q1" },
      { spaceId: "s2", quotaId: "q2" },
    ]);
    expect(r.doubled).toBe(false);
    expect(r.conflicts).toHaveLength(0);
    expect(r.resolved["s1"]).toBe("q1");
  });

  it("CF-F09：空间↔quota 双关联只标记人工复核，不自动重绑/补额度", () => {
    const r = classifyQuotaDoubleBinding([
      { spaceId: "s1", quotaId: "q1" },
      { spaceId: "s1", quotaId: "q2" }, // 一个空间多个 quota
      { spaceId: "s3", quotaId: "q3" },
    ]);
    expect(r.doubled).toBe(true);
    expect(r.conflicts.some((c) => c.includes("s1") && c.includes("多个 quota"))).toBe(true);
    expect(r.resolved["s1"]).toBeUndefined(); // 双关联项不擅自认领
    expect(r.resolved["s3"]).toBe("q3");
  });

  it("CF-F04：读操作改权益即违反红线", () => {
    const bad = assertReadDoesNotGrant({ kind: "queryFreeTier", mutatesEntitlement: true });
    expect(bad.safe).toBe(false);
    const ok = assertReadDoesNotGrant({ kind: "queryFreeTier", mutatesEntitlement: false });
    expect(ok.safe).toBe(true);
  });
});
