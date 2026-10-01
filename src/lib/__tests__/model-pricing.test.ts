import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MICROS_PER_YUAN,
  centsPer1KToMicrosPerMillion,
  microsPerMillionToCentsPer1K,
  microsToYuanPerMillion,
  yuanPerMillionToMicros,
  resolvePriceStatus,
  validatePricingInput,
  buildRegistryPricingSnapshot,
  computeUsageCost,
  evaluateSettlementReadiness,
  type DeploymentPricing,
} from "../model-pricing";

describe("价格单位与精度（微元 / 100 万 Token）", () => {
  test("低价模型：0.2 分/1K → 2 元/百万 → 2_000_000 微元", () => {
    const micros = centsPer1KToMicrosPerMillion(0.2);
    assert.equal(micros, 2_000_000);
    assert.equal(microsToYuanPerMillion(micros), 2);
    assert.equal(microsPerMillionToCentsPer1K(micros), 0.2);
  });

  test("元/百万 小数可往返转换", () => {
    assert.equal(yuanPerMillionToMicros(1.25), 1_250_000);
    assert.equal(microsToYuanPerMillion(1_250_000), 1.25);
    assert.equal(MICROS_PER_YUAN, 1_000_000);
  });

  test("未配置返回 null（不臆造 0 价）", () => {
    assert.equal(microsToYuanPerMillion(null), null);
    assert.equal(microsPerMillionToCentsPer1K(undefined), null);
  });
});

describe("价格状态：未配置 / 免费 / 仅观测 / 已确认 必须可区分", () => {
  const none = [null, null, null, null] as Array<number | null>;
  test("全部未配置 → UNCONFIGURED", () => {
    assert.equal(resolvePriceStatus({ priceSource: "UNVERIFIED", costValues: none, priceValues: none }), "UNCONFIGURED");
  });
  test("VERIFIED 且全为 0 → FREE", () => {
    assert.equal(
      resolvePriceStatus({ priceSource: "VERIFIED", costValues: [0, 0, 0, 0], priceValues: [0, 0, 0, 0] }),
      "FREE",
    );
  });
  test("OBSERVED_ONLY（综合成本观测）→ OBSERVED_ONLY，不得视为已确认", () => {
    assert.equal(
      resolvePriceStatus({ priceSource: "OBSERVED_ONLY", costValues: [1, 2, null, null], priceValues: [null, null, null, null] }),
      "OBSERVED_ONLY",
    );
  });
  test("VERIFIED 且存在 >0 → VERIFIED；未验证来源即便有数值也按 UNCONFIGURED", () => {
    assert.equal(
      resolvePriceStatus({ priceSource: "VERIFIED", costValues: [1, null, null, null], priceValues: [null, null, null, null] }),
      "VERIFIED",
    );
    assert.equal(
      resolvePriceStatus({ priceSource: "UNVERIFIED", costValues: [1, null, null, null], priceValues: [null, null, null, null] }),
      "UNCONFIGURED",
    );
  });
  test("结算判断唯一入口 evaluateSettlementReadiness：结算功能未启用时恒为 false", () => {
    assert.equal(evaluateSettlementReadiness(null), false);
    assert.equal(evaluateSettlementReadiness(null, { settlementFeatureEnabled: true }), false, "无价格配置不得结算");
  });
});

describe("后台价格录入校验（非负 / 精度 / 上限 / 枚举）", () => {
  test("合法输入通过：成本与售价分开", () => {
    const r = validatePricingInput({
      costInputMicrosPerMillion: 1_000_000,
      priceInputMicrosPerMillion: 2_000_000,
      priceSource: "verified",
      markupRateBps: 2000,
      effectiveFrom: "2026-09-19T00:00:00.000Z",
      currency: "cny",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.costInputMicrosPerMillion, 1_000_000);
      assert.equal(r.data.priceInputMicrosPerMillion, 2_000_000);
      assert.equal(r.data.priceSource, "VERIFIED");
      assert.equal(r.data.currency, "CNY");
      assert.ok(r.data.effectiveFrom instanceof Date);
    }
  });

  test("负数 / 小数 / 超上限 / 非法来源 / 非法币种 / 非法加价率 / 非法时间 全部拒绝", () => {
    assert.equal(validatePricingInput({ priceInputMicrosPerMillion: -1 }).ok, false);
    assert.equal(validatePricingInput({ priceInputMicrosPerMillion: 1.5 }).ok, false);
    assert.equal(validatePricingInput({ priceInputMicrosPerMillion: 2_000_000_001 }).ok, false);
    assert.equal(validatePricingInput({ priceSource: "HACK" }).ok, false);
    assert.equal(validatePricingInput({ currency: "CN" }).ok, false);
    assert.equal(validatePricingInput({ markupRateBps: -1 }).ok, false);
    assert.equal(validatePricingInput({ markupRateBps: 1.5 }).ok, false);
    assert.equal(validatePricingInput({ effectiveFrom: "not-a-date" }).ok, false);
  });
});

describe("价格快照（写入任务 config，含版本/来源/生效时间）", () => {
  const pricing: DeploymentPricing = {
    currency: "CNY",
    costInputMicrosPerMillion: 1_000_000,
    costOutputMicrosPerMillion: 3_000_000,
    costCacheReadMicrosPerMillion: 100_000,
    costCacheWriteMicrosPerMillion: 200_000,
    priceInputMicrosPerMillion: 2_000_000,
    priceOutputMicrosPerMillion: 6_000_000,
    priceCacheReadMicrosPerMillion: 200_000,
    priceCacheWriteMicrosPerMillion: 400_000,
    priceSource: "VERIFIED",
    priceStatus: "VERIFIED",
    // DIRECT_PRICE 模式下不得同时配置加价率（互斥）
    markupRateBps: null,
    priceVersion: 3,
    effectiveFrom: "2026-09-19T00:00:00.000Z",
  };

  test("包含 provider/model/版本/来源/生效时间与成本-售价分离结构", () => {
    const s = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing });
    assert.equal(s.pricingSource, "MODEL_REGISTRY");
    assert.equal(s.providerId, "MagicAI");
    assert.equal(s.modelId, "gpt-5.5");
    assert.equal(s.priceVersion, 3);
    assert.equal(s.priceSource, "VERIFIED");
    assert.equal(s.effectiveFrom, "2026-09-19T00:00:00.000Z");
    assert.equal(s.supplierCost.inputYuanPerMillion, 1);
    assert.equal(s.userPrice.inputYuanPerMillion, 2);
    assert.equal(s.billingMode, "ESTIMATED_COMPATIBILITY");
    assert.equal(s.settlementEnabled, false, "当前阶段不得开启真实 Token 结算");
  });

  test("未配置价格时不得臆造输入/输出价", () => {
    const s = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: null });
    assert.equal(s.priceStatus, "UNCONFIGURED");
    assert.equal(s.userPrice.inputMicrosPerMillion, null, "未配置必须为 null，不得变成 0 元免费");
    assert.equal(s.userPrice.outputMicrosPerMillion, null, "未配置必须为 null，不得变成 0 元免费");
    assert.equal(s.billingMode, "ESTIMATED_COMPATIBILITY");
  });

  test("仅观测状态（OBSERVED_ONLY）不得进入快照的已确认价格", () => {
    const observed: DeploymentPricing = {
      ...pricing,
      priceSource: "OBSERVED_ONLY",
      priceStatus: "OBSERVED_ONLY",
      costInputMicrosPerMillion: null,
      costOutputMicrosPerMillion: null,
      priceInputMicrosPerMillion: null,
      priceOutputMicrosPerMillion: null,
    };
    const s = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: observed });
    assert.equal(s.priceStatus, "OBSERVED_ONLY");
    assert.equal(s.userPrice.inputMicrosPerMillion, null, "仅观测不得作为已确认售价");
    assert.equal(s.settlementEnabled, false);
  });
});

describe("按用量计算供应商成本（成本与售价分离）", () => {
  const costOnly: DeploymentPricing = {
    currency: "CNY",
    costInputMicrosPerMillion: 5_000_000, // 5 元/百万
    costOutputMicrosPerMillion: 30_000_000, // 30 元/百万
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
  };

  test("5/30 元每百万：输入 4799 + 输出 512 → 0.039355 元", () => {
    const r = computeUsageCost(costOnly, { inputTokens: 4799, outputTokens: 512 });
    assert.equal(r.costMicros, 39_355);
    assert.equal(Number(r.costYuan?.toFixed(6)), 0.039355);
    assert.equal(r.costPriced, true);
    assert.equal(r.pricePriced, false, "未配置售价时不得臆造用户价格");
    assert.equal(r.priceYuan, null);
    assert.equal(r.settlementReady, false, "当前阶段不得按真实 Token 结算");
  });

  test("含缓存读写价格时分别计入；未配置成本则返回 null", () => {
    const withCache: DeploymentPricing = {
      ...costOnly,
      costCacheReadMicrosPerMillion: 500_000, // 0.5 元/百万
      costCacheWriteMicrosPerMillion: 6_250_000, // 6.25 元/百万
    };
    const r = computeUsageCost(withCache, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 1_000_000,
    });
    // 5 + 0 + 1 + 6.25 = 12.25 元
    assert.equal(Number(r.costYuan?.toFixed(4)), 12.25);

    const none = computeUsageCost(
      { ...costOnly, costInputMicrosPerMillion: null, costOutputMicrosPerMillion: null },
      { inputTokens: 1000 },
    );
    assert.equal(none.costMicros, null);
    assert.equal(none.costPriced, false);
  });
});
