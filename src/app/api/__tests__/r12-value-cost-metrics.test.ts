import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  offlineProfitSensitivity,
  type RawTaskFact,
  type RawLedgerFact,
  type RawCostFact,
  type MetricQueryOptions,
} from "@/lib/metrics/value-cost-metrics";

const baseOpts: MetricQueryOptions = {
  tenantId: "ent_1",
  windowStartMs: 0,
  windowEndMs: 1_000_000_000,
  tzOffsetMinutes: 480,
  purchasedUnconsumedMicros: BigInt(0),
};

function task(over: Partial<RawTaskFact> = {}): RawTaskFact {
  return {
    id: "t1", tenantId: "ent_1", scenario: "s", createdAtMs: 1000, firstValidResultAtMs: 2000,
    isRetry: false, isSimulation: false, isInternalTest: false, structurallyValid: true, recognizedSatisfied: false,
    qualityFailed: false, refunded: false, isReuse: false, recoveryDifference: false, ...over,
  };
}
function ledger(over: Partial<RawLedgerFact> = {}): RawLedgerFact {
  return { id: "l1", tenantId: "ent_1", category: "PAID", amountMicros: BigInt(1000), pseudoRevenue: false, ...over };
}
function cost(over: Partial<RawCostFact> = {}): RawCostFact {
  return { id: "c1", tenantId: "ent_1", component: "FILE", costMicros: BigInt(100), ...over };
}

describe("P12 用户价值/留存/成本经营指标（只读聚合）", () => {
  describe("1) 排除噪声：模拟/内部测试/同任务重试/赠送伪收入", () => {
    it("模拟与内部测试不计入结构有效成果", () => {
      const m = computeMetrics([task(), task({ id: "t2", isSimulation: true }), task({ id: "t3", isInternalTest: true })], [], [], baseOpts);
      expect((m.structuralValidResults as any).value).toBe(1);
    });
    it("同任务重试不计入重复完成/复用", () => {
      const m = computeMetrics([task({ id: "t1", isReuse: true }), task({ id: "t2", isRetry: true, isReuse: true })], [], [], baseOpts);
      expect((m.repeatCompletionReuse as any).value).toBe(1);
    });
    it("赠送/人工伪收入从真实收款剔除", () => {
      const m = computeMetrics([], [ledger(), ledger({ id: "l2", category: "GIFT", amountMicros: BigInt(999), pseudoRevenue: true }), ledger({ id: "l3", category: "MANUAL", amountMicros: BigInt(888), pseudoRevenue: true })], [], baseOpts);
      expect((m.realCollectedMicros as any).value).toBe(BigInt(1000));
    });
  });

  describe("2) 未知成本/收入标 unknown，不填 0", () => {
    it("收款金额未知 → realCollectedMicros 为 UNKNOWN", () => {
      const m = computeMetrics([], [ledger({ amountMicros: null })], [], baseOpts);
      expect(m.realCollectedMicros.kind).toBe("UNKNOWN");
    });
    it("供应商成本未知 → supplierCostMicros 为 UNKNOWN 且利润不可确定", () => {
      const m = computeMetrics([], [], [cost({ costMicros: null })], baseOpts);
      expect(m.supplierCostMicros.kind).toBe("UNKNOWN");
      expect(m.profitNotDeterminable).toBe(true);
    });
  });

  describe("3) 成本覆盖缺口显式列出，不填 0", () => {
    it("仅提供 FILE 成本，其余组件为缺口", () => {
      const m = computeMetrics([], [], [cost({ component: "FILE" })], baseOpts);
      expect(m.costCoverageGaps).toContain("OCR");
      expect(m.costCoverageGaps).toContain("STORAGE");
      expect(m.costCoverageGaps.length).toBe(8);
    });
  });

  describe("4) 样本不足不编 DAU/留存/转化", () => {
    it("完全无基准数据 → 结构有效成果 INSUFFICIENT_SAMPLE", () => {
      const m = computeMetrics([], [], [], baseOpts);
      expect(m.structuralValidResults.kind).toBe("INSUFFICIENT_SAMPLE");
    });
    it("有基准但无有效成果 → 结构有效成果为真实 0（非样本不足）", () => {
      const m = computeMetrics([task({ structurallyValid: false, firstValidResultAtMs: null })], [], [], baseOpts);
      expect(m.structuralValidResults.kind).toBe("NUMBER");
      expect((m.structuralValidResults as any).value).toBe(0);
    });
  });

  describe("5) 已购未消费余额不计入已赚收入", () => {
    it("purchasedUnconsumedMicros 仅展示，不并入真实收款", () => {
      const opts = { ...baseOpts, purchasedUnconsumedMicros: BigInt(5000) };
      const m = computeMetrics([], [ledger()], [], opts);
      expect(m.purchasedUnconsumedMicros).toBe(BigInt(5000));
      expect((m.realCollectedMicros as any).value).toBe(BigInt(1000));
    });
  });

  describe("6) 租户隔离：只看本租户", () => {
    it("其他租户事实被排除，本租户照常计算", () => {
      const m = computeMetrics(
        [task(), task({ id: "t2", tenantId: "ent_2" })],
        [ledger(), ledger({ id: "l2", tenantId: "ent_2", amountMicros: BigInt(9999) })],
        [cost(), cost({ id: "c2", tenantId: "ent_2" })],
        baseOpts,
      );
      expect((m.structuralValidResults as any).value).toBe(1);
      expect((m.realCollectedMicros as any).value).toBe(BigInt(1000));
    });
  });

  describe("7) 结构验证 ≠ 用户认可（下载一次不当满意）", () => {
    it("结构有效但未被显式认可 → recognizedSatisfied 少于 structuralValid", () => {
      const m = computeMetrics([task({ structurallyValid: true, recognizedSatisfied: false })], [], [], baseOpts);
      expect((m.structuralValidResults as any).value).toBe(1);
      expect((m.recognizedSatisfied as any).value).toBe(0);
    });
  });

  describe("8) 参数化离线利润测算不写回", () => {
    it("毛利与目标贡献仅展示，附不写回说明", () => {
      const r = offlineProfitSensitivity(BigInt(1000), BigInt(600), 2000);
      expect(r.grossMarginMicros).toBe(BigInt(400));
      expect(r.targetContributionMicros).toBe(BigInt(200));
      expect(r.note).toContain("不写回");
    });
  });

  describe("9) 恢复差异计数（批次8/11 unknown）", () => {
    it("recoveryDifference 统计差异任务", () => {
      const m = computeMetrics([task({ id: "t1", recoveryDifference: true }), task({ id: "t2", recoveryDifference: true })], [], [], baseOpts);
      expect((m.recoveryDifference as any).value).toBe(2);
    });
  });
});
