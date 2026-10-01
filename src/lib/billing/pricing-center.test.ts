import { describe, it, expect } from "vitest";
import {
  computeEstimatedPoints,
  effectiveMultiplierBps,
  splitTokenEstimate,
  resolvePricingSource,
} from "./pricing-center";
import { parseBillingConfig, BILLING_CONFIG_KEYS } from "./billing-config";

/**
 * 算账中心纯逻辑单测（vitest 风格，进 `npm test` 主链路）。
 * 覆盖：0 Token、超大数、向上取整、模型覆盖系数、BYOK 费率、价格未登记阻断。
 */

const CONFIG = {
  markupCoefficientBps: 20_000, // k = 2.0
  byokServiceRateBps: 1_500, // 15%
};

/** 5 元 / 百万 Token = 5_000_000 微元 */
const PRICE_5YUAN = 5_000_000;

function platform(over: Partial<Parameters<typeof computeEstimatedPoints>[0]> = {}) {
  return computeEstimatedPoints({
    deploymentId: "dep-1",
    unit: { input: PRICE_5YUAN, output: PRICE_5YUAN },
    inputTokens: 0,
    outputTokens: 0,
    pricingSource: "PLATFORM",
    priceKind: "COST_PLUS_MARKUP",
    markupCoefficientBps: CONFIG.markupCoefficientBps,
    byokServiceRateBps: CONFIG.byokServiceRateBps,
    ...over,
  });
}

describe("算账中心：纯逻辑换算（BigInt / 向上取整）", () => {
  it("0 Token → 0 点，且不得因除零或负号产生异常", () => {
    const r = platform({ inputTokens: 0, outputTokens: 0 });
    expect(r.basis).toBe("CONVERTED_PRICE");
    expect(r.points).toBe(0);
    expect(r.snapshot.numerator).toBe("0");
  });

  it("基准换算：100 万 Token × 5 元/百万 × k2.0 = 10 元 = 1000 点", () => {
    const r = platform({ inputTokens: 1_000_000 });
    expect(r.points).toBe(1000);
    expect(r.snapshot.multiplierBps).toBe(20_000);
    expect(r.snapshot.markupOverriddenByModel).toBe(false);
  });

  it("向上取整：1 Token 也要进 1 点（不得向下取整成 0 点免费）", () => {
    expect(platform({ inputTokens: 1 }).points).toBe(1);
  });

  it("超大数不丢精度：1e12 Token × 30 元/百万 × k2.0 = 6_000_000_000 点", () => {
    const r = platform({
      unit: { input: 30_000_000, output: 30_000_000 },
      inputTokens: 1_000_000_000_000,
    });
    expect(r.points).toBe(6_000_000_000);
    expect(Number.isSafeInteger(r.points as number)).toBe(true);
    // 用 BigInt 复算验证中间量未被浮点污染
    const num = BigInt(r.snapshot.numerator);
    const den = BigInt(r.snapshot.denominator);
    expect(Number((num + den - BigInt(1)) / den)).toBe(r.points);
  });

  it("负数 / NaN 用量按 0 处理，不得产出负点", () => {
    const r = platform({ inputTokens: -100, outputTokens: Number.NaN });
    expect(r.snapshot.inputTokens).toBe(0);
    expect(r.snapshot.outputTokens).toBe(0);
    expect(r.points).toBe(0);
  });

  it("输入 + 输出分别计价后合并向上取整（各 1 Token → 1 点）", () => {
    expect(platform({ inputTokens: 1, outputTokens: 1 }).points).toBe(1);
  });
});

describe("算账中心：加价系数与 BYOK 费率", () => {
  it("按模型覆盖系数优先于全局 k（50000bps → ×6）", () => {
    const r = platform({ inputTokens: 1_000_000, perModelMarkupRateBps: 50_000 });
    expect(r.snapshot.multiplierBps).toBe(60_000);
    expect(r.snapshot.markupOverriddenByModel).toBe(true);
    expect(r.points).toBe(3000);
  });

  it("DIRECT_PRICE（售价已登记）不再叠加加价系数，禁止重复加价", () => {
    const r = platform({ inputTokens: 1_000_000, priceKind: "DIRECT_PRICE" });
    expect(r.snapshot.multiplierBps).toBe(10_000);
    expect(r.points).toBe(500);
  });

  it("BYOK：官方价 × (1 + 15%) 折算，且不套全局 k", () => {
    const r = computeEstimatedPoints({
      deploymentId: "byo:ws-1",
      unit: { input: PRICE_5YUAN, output: PRICE_5YUAN },
      inputTokens: 1_000_000,
      outputTokens: 0,
      pricingSource: "USER_BYOK",
      priceKind: "BYOK_OFFICIAL",
      markupCoefficientBps: CONFIG.markupCoefficientBps, // 若误套 k 会得到 1150
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    expect(r.snapshot.multiplierBps).toBe(11_500);
    expect(r.snapshot.byokServiceRateBpsApplied).toBe(1500);
    expect(r.points).toBe(575);
  });

  it("effectiveMultiplierBps：三类口径互不串台", () => {
    expect(
      effectiveMultiplierBps({
        priceKind: "DIRECT_PRICE",
        markupCoefficientBps: 20_000,
        byokServiceRateBps: 1_500,
      }),
    ).toEqual({ multiplierBps: 10_000, markupOverriddenByModel: false });
    expect(
      effectiveMultiplierBps({
        priceKind: "COST_PLUS_MARKUP",
        markupCoefficientBps: 20_000,
        byokServiceRateBps: 1_500,
      }),
    ).toEqual({ multiplierBps: 20_000, markupOverriddenByModel: false });
    expect(
      effectiveMultiplierBps({
        priceKind: "BYOK_OFFICIAL",
        markupCoefficientBps: 20_000,
        byokServiceRateBps: 1_500,
      }),
    ).toEqual({ multiplierBps: 11_500, markupOverriddenByModel: false });
  });
});

describe("算账中心：价格未登记一律阻断（绝不猜测默认价）", () => {
  it("平台模型单价缺失 → 阻断且 points 为 null", () => {
    const r = computeEstimatedPoints({
      deploymentId: "dep-x",
      unit: { input: null, output: null },
      inputTokens: 1000,
      outputTokens: 1000,
      pricingSource: "PLATFORM",
      priceKind: null,
      markupCoefficientBps: CONFIG.markupCoefficientBps,
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    expect(r.basis).toBe("BLOCKED_PRICE_UNREGISTERED");
    expect(r.points).toBeNull();
    expect(r.blockedReason).toBeTruthy();
  });

  it("输入单价有、输出单价缺 → 同样阻断（不得按 0 元补齐）", () => {
    const r = computeEstimatedPoints({
      deploymentId: "dep-x",
      unit: { input: PRICE_5YUAN, output: null },
      inputTokens: 1000,
      outputTokens: 1000,
      pricingSource: "PLATFORM",
      priceKind: "COST_PLUS_MARKUP",
      markupCoefficientBps: CONFIG.markupCoefficientBps,
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    expect(r.basis).toBe("BLOCKED_PRICE_UNREGISTERED");
    expect(r.points).toBeNull();
  });

  it("BYOK 未登记官方价 → 阻断文案指向登记官方单价", () => {
    const r = computeEstimatedPoints({
      deploymentId: "byo:ws-1",
      unit: { input: null, output: null },
      inputTokens: 1000,
      outputTokens: 1000,
      pricingSource: "USER_BYOK",
      priceKind: "BYOK_OFFICIAL",
      markupCoefficientBps: CONFIG.markupCoefficientBps,
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    expect(r.basis).toBe("BLOCKED_PRICE_UNREGISTERED");
    expect(r.blockedReason ?? "").toContain("官方单价");
  });
});

describe("算账中心：来源判定与 Token 拆分", () => {
  it("byo: 前缀判定为 USER_BYOK，其余为 PLATFORM", () => {
    expect(resolvePricingSource("byo:ws-1")).toBe("USER_BYOK");
    expect(resolvePricingSource("dep-1")).toBe("PLATFORM");
  });

  it("Token 拆分按合同 maxOutputTokens，不猜测比例", () => {
    expect(splitTokenEstimate({ estimatedTotalTokens: 10_000, maxOutputTokens: 2_200 })).toEqual({
      inputTokens: 7_800,
      outputTokens: 2_200,
    });
    // 上限大于总量时不得产出负输入
    expect(splitTokenEstimate({ estimatedTotalTokens: 1_000, maxOutputTokens: 4_000 })).toEqual({
      inputTokens: 0,
      outputTokens: 1_000,
    });
    expect(splitTokenEstimate({ estimatedTotalTokens: 0, maxOutputTokens: 2_000 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe("计费配置：systemconfig 解析（非法值回退默认，绝不静默取 0）", () => {
  it("空配置 → 负责人拍板的默认值（k=2.0 / 15% / 3 月 / 100 点 / 500 元）", () => {
    const c = parseBillingConfig([]);
    expect(c.markupCoefficientBps).toBe(20_000);
    expect(c.byokServiceRateBps).toBe(1_500);
    expect(c.freeMonths).toBe(3);
    expect(c.freePointsPerMonth).toBe(100);
    expect(c.refundReviewThresholdCents).toBe(50_000);
  });

  it("合法配置被采纳", () => {
    const c = parseBillingConfig([
      { key: BILLING_CONFIG_KEYS.markupCoefficientBps, value: "25000" },
      { key: BILLING_CONFIG_KEYS.byokServiceRateBps, value: "2000" },
    ]);
    expect(c.markupCoefficientBps).toBe(25_000);
    expect(c.byokServiceRateBps).toBe(2_000);
  });

  it("非法配置（NaN / 越界）回退默认", () => {
    const c = parseBillingConfig([
      { key: BILLING_CONFIG_KEYS.markupCoefficientBps, value: "abc" },
      { key: BILLING_CONFIG_KEYS.byokServiceRateBps, value: "-1" },
      { key: BILLING_CONFIG_KEYS.freeMonths, value: "9999" },
    ]);
    expect(c.markupCoefficientBps).toBe(20_000);
    expect(c.byokServiceRateBps).toBe(1_500);
    expect(c.freeMonths).toBe(3);
  });

  it("k < 1（亏本系数）被拒绝，回退默认 k=2.0", () => {
    const c = parseBillingConfig([{ key: BILLING_CONFIG_KEYS.markupCoefficientBps, value: "5000" }]);
    expect(c.markupCoefficientBps).toBe(20_000);
  });
});
