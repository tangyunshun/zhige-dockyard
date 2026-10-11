import { describe, it, expect } from "vitest";
import {
  computeEstimatedPoints,
  resolvePlatformUnit,
} from "./pricing-center";
import { resolveEffectiveUserPrice, type DeploymentPricing } from "@/lib/model-pricing";
import { periodMatchesNow } from "@/lib/model-registry";

/**
 * PRICING-FIX-R3 任务三：估价/结算口径统一确定性测试（纯逻辑，不依赖 DB）。
 * 核心不变量：
 *  - 时段价由「时段成本 × 加价率」运行时派生，严禁硬编码数值；
 *  - 估价（estimatePoints）、押金预扣、结算、就绪判定四路径统一吃「时段生效价」；
 *  - 无时段命中的模型，估价数值 = 主流价派生（与改动前一致）。
 */

const CONFIG = { markupCoefficientBps: 2_000, byokServiceRateBps: 1_500 };

/** deepseek-flash 闲时时段形态：成本 1/4 元/百万（微元），无直配价，加价率 20% */
function flashIdlePeriod(): DeploymentPricing {
  return {
    currency: "CNY",
    costInputMicrosPerMillion: 1_000_000,
    costOutputMicrosPerMillion: 4_000_000,
    costCacheReadMicrosPerMillion: null,
    costCacheWriteMicrosPerMillion: null,
    priceInputMicrosPerMillion: null,
    priceOutputMicrosPerMillion: null,
    priceCacheReadMicrosPerMillion: null,
    priceCacheWriteMicrosPerMillion: null,
    priceSource: "VERIFIED",
    priceStatus: "VERIFIED",
    markupRateBps: 2000,
    priceVersion: 2,
    effectiveFrom: null,
  };
}

/** 主流价形态：成本与闲时一致（deepseek-flash 主表 cost 1/4、markup 2000） */
function flashMainstream(): DeploymentPricing {
  return { ...flashIdlePeriod(), priceVersion: 9 };
}

describe("PRICING-FIX-R3：时段价 = 成本 × 加价率 派生（严禁硬编码）", () => {
  it("时段命中 → 时段派生价 = 时段成本 × 1.2（1.2 / 4.8 元/百万）", () => {
    const eff = resolveEffectiveUserPrice(flashIdlePeriod());
    expect(eff.mode).toBe("COST_PLUS_MARKUP");
    expect(eff.inputMicrosPerMillion).toBe(1_200_000); // ¥1.20/百万
    expect(eff.outputMicrosPerMillion).toBe(4_800_000); // ¥4.80/百万
  });

  it("未命中时段 → 主流价派生与时段派生在成本相同时完全一致（估价/结算同源）", () => {
    const periodEff = resolveEffectiveUserPrice(flashIdlePeriod());
    const mainEff = resolveEffectiveUserPrice(flashMainstream());
    // 成本相同 → 派生售价必须逐字段相等（否则估价与结算口径会分裂）
    expect(mainEff.inputMicrosPerMillion).toBe(periodEff.inputMicrosPerMillion);
    expect(mainEff.outputMicrosPerMillion).toBe(periodEff.outputMicrosPerMillion);
    expect(mainEff.mode).toBe(periodEff.mode);

    // 同一用量下，时段派生与主流派生的估价点数完全相同
    const periodUnit = resolvePlatformUnit(flashIdlePeriod());
    const mainUnit = resolvePlatformUnit(flashMainstream());
    const r1 = computeEstimatedPoints({
      deploymentId: "dep-flash-period",
      unit: periodUnit.unit,
      inputTokens: 1_000_000,
      outputTokens: 0,
      pricingSource: "PLATFORM",
      priceKind: periodUnit.priceKind,
      perModelMarkupRateBps: periodUnit.perModelMarkupRateBps,
      markupCoefficientBps: CONFIG.markupCoefficientBps,
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    const r2 = computeEstimatedPoints({
      deploymentId: "dep-flash-main",
      unit: mainUnit.unit,
      inputTokens: 1_000_000,
      outputTokens: 0,
      pricingSource: "PLATFORM",
      priceKind: mainUnit.priceKind,
      perModelMarkupRateBps: mainUnit.perModelMarkupRateBps,
      markupCoefficientBps: CONFIG.markupCoefficientBps,
      byokServiceRateBps: CONFIG.byokServiceRateBps,
    });
    expect(r1.points).toBe(r2.points);
    expect(r1.points).toBe(120); // 1元/百万 × 1.2 × 100万Token = 1.2元 = 120点
  });

  it("HOLIDAY 特判：自动节假日时段仅在法定节假日命中，且派生价同样走成本×加价率", () => {
    const holidayPeriod = {
      ...flashIdlePeriod(),
      kind: "HOLIDAY" as const,
      startDate: null,
      endDate: null,
      weekdays: null,
      startTime: null,
      endTime: null,
    };
    // 国庆节当天（按中国日历 +08:00 命中）
    const onHoliday = new Date("2026-10-01T04:00:00Z");
    const normalDay = new Date("2026-03-15T04:00:00Z");
    expect(periodMatchesNow(holidayPeriod as any, onHoliday)).toBe(true);
    expect(periodMatchesNow(holidayPeriod as any, normalDay)).toBe(false);

    // HOLIDAY 时段（仅成本+加价率，无直配价）必须能被正确派生为 COST_PLUS_MARKUP，而非 UNCONFIGURED
    const eff = resolveEffectiveUserPrice(holidayPeriod);
    expect(eff.mode).toBe("COST_PLUS_MARKUP");
    expect(eff.inputMicrosPerMillion).toBe(1_200_000);
    expect(eff.outputMicrosPerMillion).toBe(4_800_000);
  });
});
