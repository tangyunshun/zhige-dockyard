import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSettlementReadiness,
  resolveSupplierCostStatus,
  resolveUserPriceStatus,
  resolvePricingMode,
  resolveEffectiveUserPrice,
  isPricingModeValid,
  deriveUserPriceMicrosPerMillion,
  computeUsageCost,
  buildRegistryPricingSnapshot,
  validatePricingInput,
  type DeploymentPricing,
} from "../model-pricing";

/** 基准：成本 VERIFIED（输入5/输出30 元每百万），无用户售价 */
function base(over: Partial<DeploymentPricing> = {}): DeploymentPricing {
  return {
    currency: "CNY",
    costInputMicrosPerMillion: 5_000_000,
    costOutputMicrosPerMillion: 30_000_000,
    costCacheReadMicrosPerMillion: null,
    costCacheWriteMicrosPerMillion: null,
    priceInputMicrosPerMillion: null,
    priceOutputMicrosPerMillion: null,
    priceCacheReadMicrosPerMillion: null,
    priceCacheWriteMicrosPerMillion: null,
    priceSource: "VERIFIED",
    priceStatus: "VERIFIED",
    markupRateBps: null,
    priceVersion: 1,
    effectiveFrom: "2026-09-19T00:00:00.000Z",
    ...over,
  };
}

describe("供应商成本状态收紧（输入/输出必须成对 + 来源 VERIFIED）", () => {
  test("仅输入成本 → UNCONFIGURED（不得 VERIFIED）", () => {
    assert.equal(resolveSupplierCostStatus(base({ costOutputMicrosPerMillion: null })), "UNCONFIGURED");
  });
  test("仅输出成本 → UNCONFIGURED", () => {
    assert.equal(resolveSupplierCostStatus(base({ costInputMicrosPerMillion: null })), "UNCONFIGURED");
  });
  test("输入+输出 + VERIFIED → VERIFIED；来源未验证 → UNCONFIGURED", () => {
    assert.equal(resolveSupplierCostStatus(base()), "VERIFIED");
    assert.equal(resolveSupplierCostStatus(base({ priceSource: "UNVERIFIED" })), "UNCONFIGURED");
  });
  test("仅观测来源 → OBSERVED_ONLY（即使有数值）", () => {
    assert.equal(resolveSupplierCostStatus(base({ priceSource: "OBSERVED_ONLY" })), "OBSERVED_ONLY");
  });
});

describe("结算就绪：成本 VERIFIED 但售价为空 → 必须 false", () => {
  test("成本已确认、售价未配置 → settlementEnabled=false", () => {
    const p = base();
    assert.equal(resolveUserPriceStatus(p), "UNCONFIGURED");
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), false);
    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });
    assert.equal(snap.supplierCostStatus, "VERIFIED");
    assert.equal(snap.userPriceStatus, "UNCONFIGURED");
    assert.equal(snap.settlementEnabled, false);
    assert.equal(snap.billingMode, "ESTIMATED_COMPATIBILITY");
  });

  test("结算功能未启用（settlementFeatureEnabled=false）→ 即使售价齐备也 false", () => {
    const p = base({ priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000 });
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), true, "四项齐备且功能开启时可就绪");
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: false }), false, "当前阶段必须 false");
  });
});

describe("缓存价格逐项匹配（不得用「任一非空」通过）", () => {
  const priced = { priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000 };

  test("① 有缓存成本读、无缓存售价读 → false", () => {
    const p = base({ ...priced, costCacheReadMicrosPerMillion: 500_000, priceCacheReadMicrosPerMillion: null });
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), false);
  });
  test("② 有缓存成本读、且有缓存售价读 → true", () => {
    const p = base({ ...priced, costCacheReadMicrosPerMillion: 500_000, priceCacheReadMicrosPerMillion: 600_000 });
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), true);
  });
  test("③ 有缓存成本写、无缓存售价写 → false", () => {
    const p = base({ ...priced, costCacheWriteMicrosPerMillion: 6_250_000, priceCacheWriteMicrosPerMillion: null });
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), false);
  });
  test("④ 有缓存成本写、且有缓存售价写 → true；只配读不配写仍 false", () => {
    const ok = base({ ...priced, costCacheWriteMicrosPerMillion: 6_250_000, priceCacheWriteMicrosPerMillion: 7_000_000 });
    assert.equal(evaluateSettlementReadiness(ok, { settlementFeatureEnabled: true }), true);
    const partial = base({
      ...priced,
      costCacheReadMicrosPerMillion: 500_000,
      priceCacheReadMicrosPerMillion: 600_000,
      costCacheWriteMicrosPerMillion: 6_250_000,
      priceCacheWriteMicrosPerMillion: null,
    });
    assert.equal(evaluateSettlementReadiness(partial, { settlementFeatureEnabled: true }), false, "写缓存缺价必须 false");
  });
});

describe("computeUsageCost 严格模式：有用量的类别必须都有价格", () => {
  const full = base({ priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000 });

  test("input 缺价 → 不可用，且列出缺失类别（不得只算已配置部分）", () => {
    const r = computeUsageCost(base({ costInputMicrosPerMillion: null }), { inputTokens: 1000, outputTokens: 100 });
    assert.equal(r.costMicros, null);
    assert.equal(r.costPriced, false);
    assert.deepEqual(r.missingCostCategories, ["input"]);
  });
  test("output 缺价 → 不可用", () => {
    const r = computeUsageCost(base({ costOutputMicrosPerMillion: null }), { inputTokens: 1000, outputTokens: 100 });
    assert.equal(r.costMicros, null);
    assert.deepEqual(r.missingCostCategories, ["output"]);
  });
  test("cacheRead 有实际用量但缺价 → 不可用", () => {
    const r = computeUsageCost(full, { inputTokens: 100, cacheReadTokens: 5000 });
    assert.equal(r.costMicros, null);
    assert.deepEqual(r.missingCostCategories, ["cacheRead"]);
  });
  test("cacheWrite 有实际用量但缺价 → 不可用；补价后可用", () => {
    const missing = computeUsageCost(full, { inputTokens: 100, cacheWriteTokens: 2000 });
    assert.equal(missing.costMicros, null);
    assert.deepEqual(missing.missingCostCategories, ["cacheWrite"]);

    const ok = computeUsageCost(base({ ...full, costCacheWriteMicrosPerMillion: 6_250_000 }), {
      inputTokens: 100,
      cacheWriteTokens: 2000,
    });
    assert.equal(ok.costPriced, true);
    assert.equal(Number(ok.costYuan?.toFixed(6)), Number(((5_000_000 * 100 + 6_250_000 * 2000) / 1e6 / 1e6).toFixed(6)));
  });
  test("5/30 元每百万：输入 4799 + 输出 512 = 0.039355 元（售价未配置 → 售价不可用）", () => {
    const r = computeUsageCost(base({ priceInputMicrosPerMillion: null, priceOutputMicrosPerMillion: null }), {
      inputTokens: 4799,
      outputTokens: 512,
    });
    assert.equal(Number(r.costYuan?.toFixed(6)), 0.039355);
    assert.equal(r.priceMicros, null);
    assert.equal(r.pricePriced, false);
    assert.equal(r.settlementReady, false);
  });
});

describe("商业定价模式互斥（DIRECT_PRICE / COST_PLUS_MARKUP）", () => {
  test("直接售价 → DIRECT_PRICE；成本+加价 → COST_PLUS_MARKUP；两者同时 → 冲突 null", () => {
    const direct = base({ priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000 });
    assert.equal(resolvePricingMode(direct), "DIRECT_PRICE");

    const markup = base({ markupRateBps: 2000 });
    assert.equal(resolvePricingMode(markup), "COST_PLUS_MARKUP");

    const both = base({
      priceInputMicrosPerMillion: 6_000_000,
      priceOutputMicrosPerMillion: 36_000_000,
      markupRateBps: 2000,
    });
    assert.equal(resolvePricingMode(both), null);
    assert.equal(isPricingModeValid(both), false);
    assert.equal(evaluateSettlementReadiness(both, { settlementFeatureEnabled: true }), false);
  });

  test("COST_PLUS_MARKUP 按加价率推算售价（成本5/30，+20% → 6/36 元每百万）", () => {
    const p = base({ markupRateBps: 2000 });
    assert.equal(deriveUserPriceMicrosPerMillion(p, "input"), 6_000_000);
    assert.equal(deriveUserPriceMicrosPerMillion(p, "output"), 36_000_000);
    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });
    assert.equal(snap.pricingMode, "COST_PLUS_MARKUP");
    assert.equal(snap.derivedUserPrice.inputMicrosPerMillion, 6_000_000);
  });

  test("录入校验：同时提交直接售价与加价率 → 拒绝（互斥）", () => {
    const r = validatePricingInput({
      priceInputMicrosPerMillion: 6_000_000,
      priceOutputMicrosPerMillion: 36_000_000,
      markupRateBps: 2000,
    });
    assert.equal(r.ok, false);
  });

  test("COST_PLUS_MARKUP 贯通：5/30 + 20% → 有效售价 6/36 微元/百万，状态 CONFIGURED（不得误判 UNCONFIGURED）", () => {
    const p = base({ markupRateBps: 2000 });
    const eff = resolveEffectiveUserPrice(p);
    assert.equal(eff.mode, "COST_PLUS_MARKUP");
    assert.equal(eff.inputMicrosPerMillion, 6_000_000);
    assert.equal(eff.outputMicrosPerMillion, 36_000_000);
    assert.equal(resolveUserPriceStatus(p), "CONFIGURED", "成本+加价必须视为已配置售价");
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), true);

    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });
    assert.equal(snap.pricingMode, "COST_PLUS_MARKUP");
    // userPrice / derivedUserPrice 必须与有效售价一致
    assert.equal(snap.userPrice.inputMicrosPerMillion, 6_000_000);
    assert.equal(snap.derivedUserPrice.inputMicrosPerMillion, 6_000_000);
    assert.equal(snap.userPrice.outputMicrosPerMillion, 36_000_000);
    assert.equal(snap.derivedUserPrice.outputMicrosPerMillion, 36_000_000);
  });

  test("COST_PLUS_MARKUP 实际用户成本：输入 4799 + 输出 512 → 6/36 价得 0.047311 元", () => {
    const p = base({ markupRateBps: 2000 });
    const r = computeUsageCost(p, { inputTokens: 4799, outputTokens: 512 });
    // 4799/1e6*6 + 512/1e6*36 = 0.028794 + 0.018432 = 0.047226
    assert.equal(r.pricePriced, true, "必须使用有效售价计算，而不是读取空的原始 priceInput/priceOutput");
    assert.equal(Number(r.priceYuan?.toFixed(6)), 0.047226);
    assert.equal(Number(r.costYuan?.toFixed(6)), 0.039355);
  });

  test("COST_PLUS_MARKUP 缓存：供应商有缓存成本 → 推导对应售价；无成本则无需售价", () => {
    const withCacheCost = base({ markupRateBps: 2000, costCacheReadMicrosPerMillion: 500_000 });
    const eff = resolveEffectiveUserPrice(withCacheCost);
    assert.equal(eff.cacheReadMicrosPerMillion, 600_000, "0.5 元/百万 +20% = 0.6 元/百万");
    assert.equal(evaluateSettlementReadiness(withCacheCost, { settlementFeatureEnabled: true }), true);
    // 实际用到 cacheRead 时也有有效售价
    assert.equal(
      evaluateSettlementReadiness(withCacheCost, { settlementFeatureEnabled: true, usage: { cacheReadTokens: 1000 } }),
      true,
    );
    // DIRECT_PRICE 下缓存成本存在但无缓存售价 → 不可就绪
    const directMissingCache = base({
      priceInputMicrosPerMillion: 6_000_000,
      priceOutputMicrosPerMillion: 36_000_000,
      costCacheReadMicrosPerMillion: 500_000,
    });
    assert.equal(evaluateSettlementReadiness(directMissingCache, { settlementFeatureEnabled: true }), false);
  });
});

describe("COST_PLUS_MARKUP 完整快照（含缓存成本）与口径一致性", () => {
  test("四个类别的 userPrice / derivedUserPrice 与 pricingMode 同源一致", () => {
    const p = base({
      markupRateBps: 2000,
      costCacheReadMicrosPerMillion: 500_000, // 0.5 元/百万
      costCacheWriteMicrosPerMillion: 6_250_000, // 6.25 元/百万
    });
    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });

    assert.equal(snap.pricingMode, "COST_PLUS_MARKUP");
    // 成本 +20% 推导：input 6 / output 36 / cacheRead 0.6 / cacheWrite 7.5（元/百万 → 微元）
    const expected = {
      input: 6_000_000,
      output: 36_000_000,
      cacheRead: 600_000,
      cacheWrite: 7_500_000,
    };
    for (const [key, micros] of Object.entries(expected)) {
      assert.equal(snap.userPrice[`${key}MicrosPerMillion`], micros, `userPrice.${key} 必须为有效售价`);
      assert.equal(snap.derivedUserPrice[`${key}MicrosPerMillion` as keyof typeof snap.derivedUserPrice], micros, `derivedUserPrice.${key} 必须与 userPrice 同源`);
    }
    // 快照不再暴露旧顶层兼容字段
    assert.ok(!("inputPricePerMillion" in snap), "不得保留 inputPricePerMillion 兼容字段");
    assert.ok(!("outputPricePerMillion" in snap), "不得保留 outputPricePerMillion 兼容字段");
    assert.equal(snap.settlementEnabled, false, "Phase 1 生产路径仍关闭真实结算");
  });

  test("计算 / 快照 / 账务预览价格一致（同一有效售价口径）", () => {
    const p = base({ markupRateBps: 2000, costCacheReadMicrosPerMillion: 500_000 });
    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });
    const cost = computeUsageCost(p, { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 });

    // 快照单价 × 1M tokens 必须等于计算结果（同源）
    const expectedPriceMicros =
      snap.userPrice.inputMicrosPerMillion! + snap.userPrice.outputMicrosPerMillion! + snap.userPrice.cacheReadMicrosPerMillion!;
    assert.equal(cost.priceMicros, expectedPriceMicros, "计算价格必须与快照单价一致");
    assert.equal(cost.pricePriced, true);
    // 成本侧一致
    const expectedCostMicros =
      snap.supplierCost.inputMicrosPerMillion! + snap.supplierCost.outputMicrosPerMillion! + snap.supplierCost.cacheReadMicrosPerMillion!;
    assert.equal(cost.costMicros, expectedCostMicros);
  });

  test("null 仍表示未配置（不得变成 0 元免费）", () => {
    const p = base({ markupRateBps: 2000, costCacheReadMicrosPerMillion: null });
    const snap = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: p });
    assert.equal(snap.userPrice.cacheReadMicrosPerMillion, null, "无缓存成本 → 无缓存售价，必须是 null");
    assert.equal(snap.derivedUserPrice.cacheReadMicrosPerMillion, null);
    assert.notEqual(snap.userPrice.cacheReadMicrosPerMillion, 0, "未配置不得变成 0 元免费");
  });
});

describe("computeUsageCost 结算开关由外部显式传入（不再内部写死）", () => {
  test("Phase 2 预留：显式传入 true 时按有效售价与门禁判定就绪", () => {
    const p = base({ markupRateBps: 2000 });
    const phase1 = computeUsageCost(p, { inputTokens: 1000, outputTokens: 100 });
    assert.equal(phase1.settlementReady, false, "Phase 1 默认关闭结算");
    const phase2 = computeUsageCost(p, { inputTokens: 1000, outputTokens: 100 }, { settlementFeatureEnabled: true });
    assert.equal(phase2.settlementReady, true, "显式开启且五项条件满足时应可就绪（Phase 2 预留）");
    assert.equal(phase1.priceMicros, phase2.priceMicros, "结算开关不影响价格计算结果");
  });

  test("结算判断仍唯一走 evaluateSettlementReadiness（结果一致）", () => {
    const p = base({ markupRateBps: 2000 });
    const usage = { inputTokens: 1000, outputTokens: 100 };
    const viaCompute = computeUsageCost(p, usage, { settlementFeatureEnabled: true });
    const viaGate = evaluateSettlementReadiness(p, { settlementFeatureEnabled: true, usage });
    assert.equal(viaCompute.settlementReady, viaGate);
  });
});

describe("结算就绪矩阵", () => {
  const direct = base({ priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000 });
  const markup = base({ markupRateBps: 2000 });
  const conflict = base({
    priceInputMicrosPerMillion: 6_000_000,
    priceOutputMicrosPerMillion: 36_000_000,
    markupRateBps: 2000,
  });

  test("DIRECT_PRICE + 开关开 → 就绪", () => {
    assert.equal(evaluateSettlementReadiness(direct, { settlementFeatureEnabled: true }), true);
  });
  test("COST_PLUS_MARKUP + 开关开 → 就绪", () => {
    assert.equal(evaluateSettlementReadiness(markup, { settlementFeatureEnabled: true }), true);
  });
  test("两种模式冲突 → 不可就绪", () => {
    assert.equal(evaluateSettlementReadiness(conflict, { settlementFeatureEnabled: true }), false);
  });
  test("缺输入/输出成本 → 不可就绪", () => {
    assert.equal(evaluateSettlementReadiness(base({ costInputMicrosPerMillion: null, markupRateBps: 2000 }), { settlementFeatureEnabled: true }), false);
    assert.equal(evaluateSettlementReadiness(base({ costOutputMicrosPerMillion: null, markupRateBps: 2000 }), { settlementFeatureEnabled: true }), false);
  });
  test("缺对应缓存售价 → 不可就绪", () => {
    const p = base({
      priceInputMicrosPerMillion: 6_000_000,
      priceOutputMicrosPerMillion: 36_000_000,
      costCacheWriteMicrosPerMillion: 6_250_000,
      priceCacheWriteMicrosPerMillion: null,
    });
    assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: true }), false);
  });
  test("开关关闭（当前生产状态）→ 始终不可就绪", () => {
    for (const p of [direct, markup]) {
      assert.equal(evaluateSettlementReadiness(p, { settlementFeatureEnabled: false }), false);
    }
  });
});
