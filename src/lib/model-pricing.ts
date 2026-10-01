/**
 * 模型价格体系（Phase 1 收口）
 *
 * 单位约定：价格以「微元 / 100 万 Token」保存（1 微元 = 1e-6 元）。
 *  - 支持元/百万小数与低价模型：0.2 分/1K = 2 元/百万 = 2_000_000 微元；
 *  - 不再以「整数分/1K」作为唯一单位（旧字段仅作展示换算）。
 *
 * 关键边界：
 *  - **供应商成本**与**用户售价**分开保存，互不覆盖；
 *  - 观测数据（如综合有效成本）只能作为 OBSERVED_ONLY 记录，**不得冒充输入/输出官方单价**；
 *  - 未配置 / 明确免费 / 已确认价格必须可区分（UNCONFIGURED / FREE / OBSERVED_ONLY / VERIFIED）；
 *  - 当前结算模式仍为 ESTIMATED_COMPATIBILITY，不做真实 Token 结算。
 */

export const MICROS_PER_YUAN = 1_000_000;
/** 单字段上限：2000 元 / 100 万 Token（防误填天文数字） */
export const MAX_PRICE_MICROS_PER_MILLION = 2_000_000_000;
/** 平台加价率上限：100000 bps = 1000% */
export const MAX_MARKUP_BPS = 100_000;

export const PRICE_SOURCES = ["UNVERIFIED", "OBSERVED_ONLY", "VERIFIED"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
export const PRICE_STATUSES = ["UNCONFIGURED", "FREE", "OBSERVED_ONLY", "VERIFIED"] as const;
export type PriceStatus = (typeof PRICE_STATUSES)[number];

/** 成本/售价字段名（供应成本与用户售价严格分开） */
export const COST_FIELDS = [
  "costInputMicrosPerMillion",
  "costOutputMicrosPerMillion",
  "costCacheReadMicrosPerMillion",
  "costCacheWriteMicrosPerMillion",
] as const;
export const PRICE_FIELDS = [
  "priceInputMicrosPerMillion",
  "priceOutputMicrosPerMillion",
  "priceCacheReadMicrosPerMillion",
  "priceCacheWriteMicrosPerMillion",
] as const;
export type CostField = (typeof COST_FIELDS)[number];
export type PriceField = (typeof PRICE_FIELDS)[number];

export interface DeploymentPricing {
  currency: string;
  costInputMicrosPerMillion: number | null;
  costOutputMicrosPerMillion: number | null;
  costCacheReadMicrosPerMillion: number | null;
  costCacheWriteMicrosPerMillion: number | null;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceCacheReadMicrosPerMillion: number | null;
  priceCacheWriteMicrosPerMillion: number | null;
  priceSource: PriceSource;
  priceStatus: PriceStatus;
  markupRateBps: number | null;
  priceVersion: number;
  effectiveFrom: string | null;
}

// ---------------- 单位换算（纯函数，便于单测） ----------------

/** 微元/百万 → 元/百万（保留小数） */
export function microsToYuanPerMillion(micros: number | null | undefined): number | null {
  if (micros === null || micros === undefined) return null;
  return micros / MICROS_PER_YUAN;
}

/** 元/百万 → 微元/百万（四舍五入到整数微元） */
export function yuanPerMillionToMicros(yuan: number): number {
  return Math.round(yuan * MICROS_PER_YUAN);
}

/** 分/1K → 微元/百万（1 分/1K = 10 元/百万） */
export function centsPer1KToMicrosPerMillion(cents: number): number {
  return Math.round(cents * 10 * MICROS_PER_YUAN);
}

/** 微元/百万 → 分/1K（导出兼容旧展示字段） */
export function microsPerMillionToCentsPer1K(micros: number | null | undefined): number | null {
  if (micros === null || micros === undefined) return null;
  return micros / MICROS_PER_YUAN / 10;
}

function isAllUnset(vals: Array<number | null | undefined>): boolean {
  return vals.every((v) => v === null || v === undefined);
}

function isSet(v: number | null | undefined): boolean {
  return v !== null && v !== undefined;
}

/**
 * 价格状态判定：
 *  - 全部未配置 → UNCONFIGURED
 *  - 来源为 OBSERVED_ONLY → OBSERVED_ONLY（仅观测，不得用于结算）
 *  - 来源 VERIFIED 且全部价格为 0 → FREE（明确免费）
 *  - 来源 VERIFIED 且存在 >0 价格 → VERIFIED（已确认）
 *  - 其他（未验证但有数值）→ UNCONFIGURED（不予采信）
 */
export function resolvePriceStatus(p: {
  priceSource: PriceSource;
  costValues: Array<number | null | undefined>;
  priceValues: Array<number | null | undefined>;
}): PriceStatus {
  const all = [...p.costValues, ...p.priceValues];
  if (isAllUnset(all)) return "UNCONFIGURED";
  if (p.priceSource === "OBSERVED_ONLY") return "OBSERVED_ONLY";
  if (p.priceSource === "VERIFIED") {
    const sum = all.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
    return sum === 0 ? "FREE" : "VERIFIED";
  }
  return "UNCONFIGURED";
}

// 说明：基于单一 priceStatus 推断可结算性的旧入口已删除。
// 结算判断唯一入口为 evaluateSettlementReadiness()；生产路径与快照不得再另行推断。

// ---------------- 状态语义拆分：供应商成本 / 用户售价 ----------------

/** 供应商成本状态：UNCONFIGURED 未配置 | OBSERVED_ONLY 仅观测 | VERIFIED 已确认 */
export type SupplierCostStatus = "UNCONFIGURED" | "OBSERVED_ONLY" | "VERIFIED";
/** 用户售价状态：UNCONFIGURED 未配置 | FREE 明确免费 | CONFIGURED 已配置 */
export type UserPriceStatus = "UNCONFIGURED" | "FREE" | "CONFIGURED";

/**
 * 供应商成本状态：
 *  - 输入成本与输出成本必须**同时存在**；
 *  - priceSource 必须为 VERIFIED；
 *  - 任一缺失都不得返回 VERIFIED（缓存成本按供应商能力单独处理，不影响本状态）。
 */
export function resolveSupplierCostStatus(pricing: DeploymentPricing | null): SupplierCostStatus {
  if (!pricing) return "UNCONFIGURED";
  const hasInput = isSet(pricing.costInputMicrosPerMillion);
  const hasOutput = isSet(pricing.costOutputMicrosPerMillion);
  const hasCache = isSet(pricing.costCacheReadMicrosPerMillion) || isSet(pricing.costCacheWriteMicrosPerMillion);
  if (!hasInput && !hasOutput && !hasCache) return "UNCONFIGURED";
  if (pricing.priceSource === "OBSERVED_ONLY") return "OBSERVED_ONLY";
  // 输入/输出成本必须成对配置，且来源已确认，才视为 VERIFIED
  if (!hasInput || !hasOutput) return "UNCONFIGURED";
  return pricing.priceSource === "VERIFIED" ? "VERIFIED" : "UNCONFIGURED";
}

/**
 * 用户售价状态（基于**统一定价模式**判定）：
 *  - DIRECT_PRICE：以直接配置的输入/输出售价为准；
 *  - COST_PLUS_MARKUP：以成本 + 加价率推导出的**有效售价**为准（不得再误判为 UNCONFIGURED）；
 *  - 其余 → UNCONFIGURED。
 */
export function resolveUserPriceStatus(pricing: DeploymentPricing | null): UserPriceStatus {
  if (!pricing) return "UNCONFIGURED";
  const eff = resolveEffectiveUserPrice(pricing);
  if (!eff.mode) return "UNCONFIGURED";
  if (!eff.has.input || !eff.has.output) return "UNCONFIGURED";
  const vals = [eff.inputMicrosPerMillion, eff.outputMicrosPerMillion, eff.cacheReadMicrosPerMillion, eff.cacheWriteMicrosPerMillion].filter(
    (v): v is number => typeof v === "number",
  );
  return vals.length > 0 && vals.every((v) => v === 0) ? "FREE" : "CONFIGURED";
}

// ---------------- 统一「有效用户售价」（两种定价模式的唯一出口） ----------------

export interface EffectiveUserPrice {
  mode: PricingMode | null;
  inputMicrosPerMillion: number | null;
  outputMicrosPerMillion: number | null;
  cacheReadMicrosPerMillion: number | null;
  cacheWriteMicrosPerMillion: number | null;
  has: { input: boolean; output: boolean; cacheRead: boolean; cacheWrite: boolean };
}

/**
 * 统一计算有效用户售价（禁止隐式混合两种定价模式）：
 *  - DIRECT_PRICE：逐项直取用户售价（输入/输出/缓存各自独立）；
 *  - COST_PLUS_MARKUP：对**供应商已配置的每个成本类别**按 markup 推导对应售价；
 *  - 模式冲突/未定义 → 全空（不可结算）。
 */
export function resolveEffectiveUserPrice(pricing: DeploymentPricing | null): EffectiveUserPrice {
  const empty: EffectiveUserPrice = {
    mode: null,
    inputMicrosPerMillion: null,
    outputMicrosPerMillion: null,
    cacheReadMicrosPerMillion: null,
    cacheWriteMicrosPerMillion: null,
    has: { input: false, output: false, cacheRead: false, cacheWrite: false },
  };
  if (!pricing) return empty;
  const mode = resolvePricingMode(pricing);
  if (!mode) return empty;

  if (mode === "DIRECT_PRICE") {
    const input = pricing.priceInputMicrosPerMillion ?? null;
    const output = pricing.priceOutputMicrosPerMillion ?? null;
    const cacheRead = pricing.priceCacheReadMicrosPerMillion ?? null;
    const cacheWrite = pricing.priceCacheWriteMicrosPerMillion ?? null;
    return {
      mode,
      inputMicrosPerMillion: input,
      outputMicrosPerMillion: output,
      cacheReadMicrosPerMillion: cacheRead,
      cacheWriteMicrosPerMillion: cacheWrite,
      has: { input: isSet(input), output: isSet(output), cacheRead: isSet(cacheRead), cacheWrite: isSet(cacheWrite) },
    };
  }

  // COST_PLUS_MARKUP：对已配置的成本类别逐项推导售价
  const bps = pricing.markupRateBps;
  const derive = (cost: number | null | undefined): number | null =>
    isSet(cost) && isSet(bps) ? Math.round(cost! * (1 + bps! / 10_000)) : null;
  const input = derive(pricing.costInputMicrosPerMillion);
  const output = derive(pricing.costOutputMicrosPerMillion);
  const cacheRead = derive(pricing.costCacheReadMicrosPerMillion);
  const cacheWrite = derive(pricing.costCacheWriteMicrosPerMillion);
  return {
    mode,
    inputMicrosPerMillion: input,
    outputMicrosPerMillion: output,
    cacheReadMicrosPerMillion: cacheRead,
    cacheWriteMicrosPerMillion: cacheWrite,
    has: { input: isSet(input), output: isSet(output), cacheRead: isSet(cacheRead), cacheWrite: isSet(cacheWrite) },
  };
}

/**
 * 结算就绪判定：必须**同时**满足
 *  a. 供应商成本已确认（VERIFIED）；
 *  b. 用户输入/输出售价已配置（CONFIGURED/FREE）；
 *  c. 缓存价格策略明确（供应商有缓存成本时，用户侧缓存售价必须同时配置）；
 *  d. 加价规则合法（0 ≤ markupRateBps ≤ 上限）；
 *  e. 结算功能已正式启用（当前恒为 false，所以本函数当前恒返回 false）。
 */
export function evaluateSettlementReadiness(
  pricing: DeploymentPricing | null,
  opts: { settlementFeatureEnabled?: boolean; usage?: UsageCostInput } = {},
): boolean {
  if (!opts.settlementFeatureEnabled) return false; // (e)
  if (!pricing) return false;
  if (resolveSupplierCostStatus(pricing) !== "VERIFIED") return false; // (a)
  const eff = resolveEffectiveUserPrice(pricing);
  if (!eff.mode) return false; // 定价模式未定义/冲突
  if (!eff.has.input || !eff.has.output) return false; // (b) 输入/输出有效售价必须齐备
  // (c) 缓存逐项匹配：供应商已配置的缓存成本类别，必须有对应有效售价
  if (isSet(pricing.costCacheReadMicrosPerMillion) && !eff.has.cacheRead) return false;
  if (isSet(pricing.costCacheWriteMicrosPerMillion) && !eff.has.cacheWrite) return false;
  // (c2) 若给定实际用量，则每个有实际用量的类别都必须有有效售价
  const usage = opts.usage;
  if (usage) {
    const usedCats: Array<[keyof EffectiveUserPrice["has"], number | null | undefined]> = [
      ["input", usage.inputTokens],
      ["output", usage.outputTokens],
      ["cacheRead", usage.cacheReadTokens],
      ["cacheWrite", usage.cacheWriteTokens],
    ];
    for (const [cat, tokens] of usedCats) {
      if (typeof tokens === "number" && tokens > 0 && !eff.has[cat]) return false;
    }
  }
  // (d) 加价规则合法且定价模式互斥
  if (!isPricingModeValid(pricing)) return false;
  return true;
}

// ---------------- 商业定价模式（两种模式互斥） ----------------

/** DIRECT_PRICE 直接配置用户售价 | COST_PLUS_MARKUP 供应商成本 + 平台加价率推算售价 */
export type PricingMode = "DIRECT_PRICE" | "COST_PLUS_MARKUP";

/**
 * 解析定价模式（不允许 markupRateBps=null 被不同路径各自解释）：
 *  - 已配置用户输入/输出售价 → DIRECT_PRICE；
 *  - 未配置直接售价、但成本已配置且 markupRateBps 非空 → COST_PLUS_MARKUP；
 *  - 其余（含两者都具备）→ null（未定义/冲突，不可结算）。
 */
export function resolvePricingMode(pricing: DeploymentPricing | null): PricingMode | null {
  if (!pricing) return null;
  const directConfigured = isSet(pricing.priceInputMicrosPerMillion) && isSet(pricing.priceOutputMicrosPerMillion);
  const markupConfigured = isSet(pricing.markupRateBps);
  const costConfigured = isSet(pricing.costInputMicrosPerMillion) && isSet(pricing.costOutputMicrosPerMillion);
  if (directConfigured && markupConfigured) return null; // 互斥冲突
  if (directConfigured) return "DIRECT_PRICE";
  if (!directConfigured && costConfigured && markupConfigured) return "COST_PLUS_MARKUP";
  return null;
}

/** 定价模式是否合法（互斥校验 + 加价率范围） */
export function isPricingModeValid(pricing: DeploymentPricing | null): boolean {
  if (!pricing) return false;
  const directConfigured = isSet(pricing.priceInputMicrosPerMillion) && isSet(pricing.priceOutputMicrosPerMillion);
  const markupConfigured = isSet(pricing.markupRateBps);
  if (directConfigured && markupConfigured) return false; // 两种模式不得同时使用
  if (markupConfigured && (pricing.markupRateBps! < 0 || pricing.markupRateBps! > MAX_MARKUP_BPS)) return false;
  return resolvePricingMode(pricing) !== null;
}

/** 按模式推算用户售价（COST_PLUS_MARKUP：成本 × (1 + markup)；DIRECT_PRICE：直接取售价） */
export function deriveUserPriceMicrosPerMillion(
  pricing: DeploymentPricing | null,
  kind: "input" | "output",
): number | null {
  if (!pricing) return null;
  const mode = resolvePricingMode(pricing);
  const direct = kind === "input" ? pricing.priceInputMicrosPerMillion : pricing.priceOutputMicrosPerMillion;
  if (mode === "DIRECT_PRICE") return direct;
  if (mode === "COST_PLUS_MARKUP") {
    const cost = kind === "input" ? pricing.costInputMicrosPerMillion : pricing.costOutputMicrosPerMillion;
    if (!isSet(cost) || !isSet(pricing.markupRateBps)) return null;
    return Math.round(cost! * (1 + pricing.markupRateBps! / 10_000));
  }
  return null;
}

// ---------------- 后台价格录入校验 ----------------

export interface PricingInput {
  currency?: unknown;
  costInputMicrosPerMillion?: unknown;
  costOutputMicrosPerMillion?: unknown;
  costCacheReadMicrosPerMillion?: unknown;
  costCacheWriteMicrosPerMillion?: unknown;
  priceInputMicrosPerMillion?: unknown;
  priceOutputMicrosPerMillion?: unknown;
  priceCacheReadMicrosPerMillion?: unknown;
  priceCacheWriteMicrosPerMillion?: unknown;
  priceSource?: unknown;
  markupRateBps?: unknown;
  effectiveFrom?: unknown;
}

export type PricingValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function parsePriceCell(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} 必须是数字` };
  if (!Number.isInteger(n)) return { ok: false, error: `${label} 精度超出限制（最小单位 1 微元/百万 Token）` };
  if (n < 0) return { ok: false, error: `${label} 不能为负数` };
  if (n > MAX_PRICE_MICROS_PER_MILLION) {
    return { ok: false, error: `${label} 超出上限（≤ ${MAX_PRICE_MICROS_PER_MILLION} 微元/百万，即 2000 元/百万）` };
  }
  return { ok: true, value: n };
}

/** 校验后台价格录入（非负、整数微元、上限、来源枚举、加价率、生效时间、币种） */
export function validatePricingInput(input: PricingInput): PricingValidation {
  const data: Record<string, unknown> = {};

  for (const f of [...COST_FIELDS, ...PRICE_FIELDS]) {
    const r = parsePriceCell((input as Record<string, unknown>)[f], f);
    if (!r.ok) return r;
    data[f] = r.value;
  }

  if (input.currency !== undefined && input.currency !== null && input.currency !== "") {
    const cur = String(input.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) return { ok: false, error: "币种必须为 3 位字母代码（如 CNY / USD）" };
    data.currency = cur;
  }

  if (input.priceSource !== undefined) {
    const src = String(input.priceSource).trim().toUpperCase();
    if (!(PRICE_SOURCES as readonly string[]).includes(src)) {
      return { ok: false, error: `价格来源非法（可选：${PRICE_SOURCES.join(" / ")}）` };
    }
    data.priceSource = src;
  }

  if (input.markupRateBps !== undefined && input.markupRateBps !== null && input.markupRateBps !== "") {
    const bps = Number(input.markupRateBps);
    if (!Number.isInteger(bps)) return { ok: false, error: "平台加价率必须为整数基点（1bp = 0.01%）" };
    if (bps < 0) return { ok: false, error: "平台加价率不能为负数" };
    if (bps > MAX_MARKUP_BPS) return { ok: false, error: `平台加价率超出上限（≤ ${MAX_MARKUP_BPS} bp）` };
    data.markupRateBps = bps;
  }

  if (input.effectiveFrom !== undefined && input.effectiveFrom !== null && input.effectiveFrom !== "") {
    const d = new Date(String(input.effectiveFrom));
    if (Number.isNaN(d.getTime())) return { ok: false, error: "生效时间格式非法（应为 ISO 时间）" };
    data.effectiveFrom = d;
  }

  // 定价模式互斥：同一请求中不得同时直接配售价又给加价率
  const directBoth =
    (data.priceInputMicrosPerMillion !== undefined && data.priceInputMicrosPerMillion !== null) &&
    (data.priceOutputMicrosPerMillion !== undefined && data.priceOutputMicrosPerMillion !== null);
  const markupGiven = data.markupRateBps !== undefined && data.markupRateBps !== null;
  if (directBoth && markupGiven) {
    return {
      ok: false,
      error: "定价模式互斥：DIRECT_PRICE（直接配置输入/输出售价）与 COST_PLUS_MARKUP（成本+加价率）不得同时使用",
    };
  }

  return { ok: true, data };
}

/** 校验后计算价格状态（供写入时使用） */
export function computeStatusFromData(data: Record<string, unknown>, fallbackSource: PriceSource): PriceStatus {
  return resolvePriceStatus({
    priceSource: (data.priceSource as PriceSource) ?? fallbackSource,
    costValues: COST_FIELDS.map((f) => (data[f] as number | null) ?? null),
    priceValues: PRICE_FIELDS.map((f) => (data[f] as number | null) ?? null),
  });
}

// ---------------- 成本 / 售价计算（纯函数） ----------------

export interface UsageCostInput {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}

export interface UsageCostResult {
  currency: string;
  /** 供应商成本（微元） */
  costMicros: number | null;
  /** 用户售价（微元） */
  priceMicros: number | null;
  costYuan: number | null;
  priceYuan: number | null;
  /** 成本计价是否可用（未配置成本 → false，不臆造 0） */
  costPriced: boolean;
  /** 售价计价是否可用（未配置售价 → false） */
  pricePriced: boolean;
  /** 缺失价格的类别（如 ["output"]）；非空表示不可结算 */
  missingCostCategories: string[];
  missingPriceCategories: string[];
  /** 是否处于可结算状态（当前阶段恒为 false） */
  settlementReady: boolean;
}

function microsFrom(perMillion: number | null | undefined, tokens: number | null | undefined): number | null {
  if (perMillion === null || perMillion === undefined) return null;
  const t = typeof tokens === "number" && Number.isFinite(tokens) ? tokens : 0;
  return Math.round((perMillion * t) / 1_000_000);
}

/**
 * 按 Token 用量计算供应商成本与用户售价（严格模式）：
 *  - 实际用量 > 0 的**每个类别**都必须有对应价格；
 *  - 任一类别缺价 → 整体返回不可结算（costMicros/priceMicros = null），**不得只算已配置部分并静默成功**；
 *  - 未配置即 null，不回落到 0。
 */
export function computeUsageCost(
  pricing: DeploymentPricing | null,
  usage: UsageCostInput,
  opts: {
    /**
     * 结算功能开关（Phase 2 由结算服务显式传入）。
     * Phase 1 默认 false —— 本函数不自行决定结算是否可用，仍统一委托 evaluateSettlementReadiness 门禁。
     */
    settlementFeatureEnabled?: boolean;
  } = {},
): UsageCostResult {
  const currency = pricing?.currency ?? "CNY";
  // 售价统一取「有效用户售价」（DIRECT_PRICE 直取；COST_PLUS_MARKUP 由成本+加价推导）
  const eff = resolveEffectiveUserPrice(pricing);
  const categories: Array<{ key: string; tokens: number; cost: number | null | undefined; price: number | null | undefined }> = [
    { key: "input", tokens: usage.inputTokens ?? 0, cost: pricing?.costInputMicrosPerMillion, price: eff.inputMicrosPerMillion },
    { key: "output", tokens: usage.outputTokens ?? 0, cost: pricing?.costOutputMicrosPerMillion, price: eff.outputMicrosPerMillion },
    { key: "cacheRead", tokens: usage.cacheReadTokens ?? 0, cost: pricing?.costCacheReadMicrosPerMillion, price: eff.cacheReadMicrosPerMillion },
    { key: "cacheWrite", tokens: usage.cacheWriteTokens ?? 0, cost: pricing?.costCacheWriteMicrosPerMillion, price: eff.cacheWriteMicrosPerMillion },
  ];

  const missingCostCategories: string[] = [];
  const missingPriceCategories: string[] = [];
  let costSum = 0;
  let priceSum = 0;
  let costRequired = false;
  let priceRequired = false;

  for (const c of categories) {
    const tokens = typeof c.tokens === "number" && Number.isFinite(c.tokens) && c.tokens > 0 ? c.tokens : 0;
    if (tokens <= 0) continue;
    costRequired = true;
    priceRequired = true;
    if (isSet(c.cost)) costSum += microsFrom(c.cost, tokens)!;
    else missingCostCategories.push(c.key);
    if (isSet(c.price)) priceSum += microsFrom(c.price, tokens)!;
    else missingPriceCategories.push(c.key);
  }

  const costUsable = costRequired && missingCostCategories.length === 0;
  const priceUsable = priceRequired && missingPriceCategories.length === 0;

  return {
    currency,
    costMicros: costUsable ? costSum : null,
    priceMicros: priceUsable ? priceSum : null,
    costYuan: costUsable ? costSum / MICROS_PER_YUAN : null,
    priceYuan: priceUsable ? priceSum / MICROS_PER_YUAN : null,
    costPriced: costUsable,
    pricePriced: priceUsable,
    missingCostCategories,
    missingPriceCategories,
    // 结算判断唯一入口：evaluateSettlementReadiness（Phase 1 生产路径传入 false → 恒 false）
    settlementReady: evaluateSettlementReadiness(pricing, {
      settlementFeatureEnabled: opts.settlementFeatureEnabled ?? false,
      usage,
    }),
  };
}

// ---------------- 纯 BigInt 整数计费函数（Phase 2A 结算路径专用真源） ----------------

export interface UsageCostInputBigInt {
  inputTokens?: bigint | number | null;
  outputTokens?: bigint | number | null;
  cacheReadTokens?: bigint | number | null;
  cacheWriteTokens?: bigint | number | null;
}

export interface UsageCostResultBigInt {
  currency: string;
  /** 供应商成本（微元，BigInt） */
  costMicros: bigint | null;
  /** 用户售价（微元，BigInt） */
  priceMicros: bigint | null;
  /** 成本计价是否可用 */
  costPriced: boolean;
  /** 售价计价是否可用 */
  pricePriced: boolean;
  /** 缺失价格的类别 */
  missingCostCategories: string[];
  missingPriceCategories: string[];
  /** 是否处于可结算状态 */
  settlementReady: boolean;
}

const B_ZERO = BigInt(0);
const B_MILLION = BigInt(1_000_000);
const B_HALF_MILLION = BigInt(500_000);
const B_BPS_BASE = BigInt(10_000);
const B_HALF_BPS = BigInt(5_000);

/** 纯 BigInt 整数微元计算：四舍五入除法 (perMillion * tokens + 500,000) / 1,000,000，禁止 Math.round(Number) */
function microsFromBigInt(perMillion: bigint | null | undefined, tokens: bigint): bigint | null {
  if (perMillion === null || perMillion === undefined) return null;
  if (tokens <= B_ZERO) return B_ZERO;
  return (perMillion * tokens + B_HALF_MILLION) / B_MILLION;
}

function toBigIntToken(val: unknown): bigint {
  if (typeof val === "bigint") return val < B_ZERO ? B_ZERO : val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const floor = Math.floor(val);
    return floor <= 0 ? B_ZERO : BigInt(floor);
  }
  return B_ZERO;
}

/**
 * 纯 BigInt 整数计费计算：单价、Token、微元全程使用 BigInt 运算，
 * 严禁在结算路径上调用 Math.round(Number)，从根本上杜绝大数精度截断与浮点误差。
 */
export function computeUsageCostBigInt(
  pricing: DeploymentPricing | null,
  usage: UsageCostInputBigInt,
  opts: { settlementFeatureEnabled?: boolean } = {}
): UsageCostResultBigInt {
  const currency = pricing?.currency ?? "CNY";
  const mode = resolvePricingMode(pricing);

  // 解析有效 BigInt 价格
  let effInputPrice: bigint | null = null;
  let effOutputPrice: bigint | null = null;
  let effCacheReadPrice: bigint | null = null;
  let effCacheWritePrice: bigint | null = null;

  if (mode === "DIRECT_PRICE") {
    effInputPrice = isSet(pricing?.priceInputMicrosPerMillion) ? BigInt(pricing!.priceInputMicrosPerMillion!) : null;
    effOutputPrice = isSet(pricing?.priceOutputMicrosPerMillion) ? BigInt(pricing!.priceOutputMicrosPerMillion!) : null;
    effCacheReadPrice = isSet(pricing?.priceCacheReadMicrosPerMillion) ? BigInt(pricing!.priceCacheReadMicrosPerMillion!) : null;
    effCacheWritePrice = isSet(pricing?.priceCacheWriteMicrosPerMillion) ? BigInt(pricing!.priceCacheWriteMicrosPerMillion!) : null;
  } else if (mode === "COST_PLUS_MARKUP" && isSet(pricing?.markupRateBps)) {
    const bps = BigInt(pricing!.markupRateBps!);
    const derive = (cost: number | null | undefined): bigint | null => {
      if (!isSet(cost)) return null;
      const c = BigInt(cost!);
      return (c * (B_BPS_BASE + bps) + B_HALF_BPS) / B_BPS_BASE;
    };
    effInputPrice = derive(pricing?.costInputMicrosPerMillion);
    effOutputPrice = derive(pricing?.costOutputMicrosPerMillion);
    effCacheReadPrice = derive(pricing?.costCacheReadMicrosPerMillion);
    effCacheWritePrice = derive(pricing?.costCacheWriteMicrosPerMillion);
  }

  const costInput = isSet(pricing?.costInputMicrosPerMillion) ? BigInt(pricing!.costInputMicrosPerMillion!) : null;
  const costOutput = isSet(pricing?.costOutputMicrosPerMillion) ? BigInt(pricing!.costOutputMicrosPerMillion!) : null;
  const costCacheRead = isSet(pricing?.costCacheReadMicrosPerMillion) ? BigInt(pricing!.costCacheReadMicrosPerMillion!) : null;
  const costCacheWrite = isSet(pricing?.costCacheWriteMicrosPerMillion) ? BigInt(pricing!.costCacheWriteMicrosPerMillion!) : null;

  const categories: Array<{
    key: string;
    tokens: bigint;
    cost: bigint | null;
    price: bigint | null;
  }> = [
    { key: "input", tokens: toBigIntToken(usage.inputTokens), cost: costInput, price: effInputPrice },
    { key: "output", tokens: toBigIntToken(usage.outputTokens), cost: costOutput, price: effOutputPrice },
    { key: "cacheRead", tokens: toBigIntToken(usage.cacheReadTokens), cost: costCacheRead, price: effCacheReadPrice },
    { key: "cacheWrite", tokens: toBigIntToken(usage.cacheWriteTokens), cost: costCacheWrite, price: effCacheWritePrice },
  ];

  const missingCostCategories: string[] = [];
  const missingPriceCategories: string[] = [];
  let costSum = B_ZERO;
  let priceSum = B_ZERO;
  let costRequired = false;
  let priceRequired = false;

  for (const c of categories) {
    if (c.tokens <= B_ZERO) continue;
    costRequired = true;
    priceRequired = true;
    if (c.cost !== null) costSum += microsFromBigInt(c.cost, c.tokens)!;
    else missingCostCategories.push(c.key);
    if (c.price !== null) priceSum += microsFromBigInt(c.price, c.tokens)!;
    else missingPriceCategories.push(c.key);
  }

  const costUsable = costRequired && missingCostCategories.length === 0;
  const priceUsable = priceRequired && missingPriceCategories.length === 0;

  // 将 BigInt usage 转为 number 用于 evaluateSettlementReadiness 门禁判断（仅用于判空）
  const readiness = evaluateSettlementReadiness(pricing, {
    settlementFeatureEnabled: opts.settlementFeatureEnabled ?? false,
    usage: {
      inputTokens: Number(usage.inputTokens ?? 0),
      outputTokens: Number(usage.outputTokens ?? 0),
      cacheReadTokens: Number(usage.cacheReadTokens ?? 0),
      cacheWriteTokens: Number(usage.cacheWriteTokens ?? 0),
    },
  });

  return {
    currency,
    costMicros: costUsable ? costSum : null,
    priceMicros: priceUsable ? priceSum : null,
    costPriced: costUsable,
    pricePriced: priceUsable,
    missingCostCategories,
    missingPriceCategories,
    settlementReady: readiness,
  };
}

// ---------------- 价格快照（写入任务 config，历史不可变） ----------------

export interface RegistryPricingSnapshot {
  pricingSource: "MODEL_REGISTRY";
  providerId: string;
  modelId: string;
  currency: string;
  priceVersion: number | null;
  priceSource: PriceSource | null;
  priceStatus: PriceStatus;
  /** 供应商成本状态（UNCONFIGURED / OBSERVED_ONLY / VERIFIED） */
  supplierCostStatus: SupplierCostStatus;
  /** 用户售价状态（UNCONFIGURED / FREE / CONFIGURED） */
  userPriceStatus: UserPriceStatus;
  /** 商业定价模式（DIRECT_PRICE / COST_PLUS_MARKUP / null=未定义或互斥冲突） */
  pricingMode: PricingMode | null;
  /**
   * 有效用户售价（微元/百万，覆盖 input/output/cacheRead/cacheWrite）。
   * 与 userPrice、pricingMode 同源：均来自同一个 resolveEffectiveUserPrice() 结果。
   */
  derivedUserPrice: {
    inputMicrosPerMillion: number | null;
    outputMicrosPerMillion: number | null;
    cacheReadMicrosPerMillion: number | null;
    cacheWriteMicrosPerMillion: number | null;
  };
  effectiveFrom: string | null;
  markupRateBps: number | null;
  /** 供应商成本（元/百万 Token 与 微元/百万） */
  supplierCost: Record<string, number | null>;
  /** 用户售价（元/百万 Token 与 微元/百万）——有效用户售价 */
  userPrice: Record<string, number | null>;
  billingMode: "ESTIMATED_COMPATIBILITY";
  settlementEnabled: boolean;
  note: string;
}

function pair(map: Record<string, number | null>, key: string, micros: number | null): void {
  map[`${key}MicrosPerMillion`] = micros;
  map[`${key}YuanPerMillion`] = microsToYuanPerMillion(micros);
}

/**
 * 构建注册表价格快照。
 * 供应商成本与用户售价分开；观测口径数据不会进入本快照的输入/输出价。
 */
export function buildRegistryPricingSnapshot(params: {
  providerId: string;
  modelId: string;
  pricing: DeploymentPricing | null;
}): RegistryPricingSnapshot {
  const p = params.pricing;
  const supplierCost: Record<string, number | null> = {};
  const userPrice: Record<string, number | null> = {};
  pair(supplierCost, "input", p?.costInputMicrosPerMillion ?? null);
  pair(supplierCost, "output", p?.costOutputMicrosPerMillion ?? null);
  pair(supplierCost, "cacheRead", p?.costCacheReadMicrosPerMillion ?? null);
  pair(supplierCost, "cacheWrite", p?.costCacheWriteMicrosPerMillion ?? null);
  // 用户售价统一取「有效用户售价」，保证 userPrice / derivedUserPrice / pricingMode 三者一致
  const effective = resolveEffectiveUserPrice(p);
  pair(userPrice, "input", effective.inputMicrosPerMillion);
  pair(userPrice, "output", effective.outputMicrosPerMillion);
  pair(userPrice, "cacheRead", effective.cacheReadMicrosPerMillion);
  pair(userPrice, "cacheWrite", effective.cacheWriteMicrosPerMillion);

  const status: PriceStatus = p?.priceStatus ?? "UNCONFIGURED";
  return {
    pricingSource: "MODEL_REGISTRY",
    supplierCostStatus: resolveSupplierCostStatus(p),
    userPriceStatus: resolveUserPriceStatus(p),
    /** 商业定价模式（DIRECT_PRICE / COST_PLUS_MARKUP / null=未定义或冲突） */
    pricingMode: resolvePricingMode(p),
    /**
     * 有效用户售价（与 userPrice 同源，均取自 effective）：
     * DIRECT_PRICE 直取售价；COST_PLUS_MARKUP 由成本 × (1+加价率) 逐项推导。
     */
    derivedUserPrice: {
      inputMicrosPerMillion: effective.inputMicrosPerMillion,
      outputMicrosPerMillion: effective.outputMicrosPerMillion,
      cacheReadMicrosPerMillion: effective.cacheReadMicrosPerMillion,
      cacheWriteMicrosPerMillion: effective.cacheWriteMicrosPerMillion,
    },
    providerId: params.providerId,
    modelId: params.modelId,
    currency: p?.currency ?? "CNY",
    priceVersion: p?.priceVersion ?? null,
    priceSource: p?.priceSource ?? null,
    priceStatus: status,
    effectiveFrom: p?.effectiveFrom ?? null,
    markupRateBps: p?.markupRateBps ?? null,
    supplierCost,
    userPrice,
    billingMode: "ESTIMATED_COMPATIBILITY",
    // 五项条件（成本确认/售价配置/缓存策略/加价规则/结算功能启用），当前结算功能未启用 → 恒为 false
    settlementEnabled: evaluateSettlementReadiness(p, { settlementFeatureEnabled:  false }),
    note: "ESTIMATED_COMPATIBILITY：按组件 estimatedModelTokens 预估扣点，尚未按真实 Token 结算；价格状态以 priceStatus 为准（UNCONFIGURED/FREE/OBSERVED_ONLY/VERIFIED）。",
  };
}
