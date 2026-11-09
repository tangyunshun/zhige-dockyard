/**
 * [R0-H/原方案 F11 → R0-H1 H-BOUND] 平台模型固定点数兼容模式：执行前成本准入（纯函数，唯一裁决真源）。
 *
 * 规则（IDE-R0-H-PROMPT.md §3/§4 与 IDE-R0-H1-PROMPT.md §2）：
 *  - 取消旧「成本超过 2 倍才阻断」容忍区：保守执行成本上界 > 本次实际会扣的名义预算即拒绝；
 *  - 输入 Token 上界来源（可核查、按部署适用；非字符粗估、非经验常数）：
 *      服务端最终模型计划（modelPlan）中的注册表硬上下文限制 contextLimit。
 *      该值是当前部署在服务端登记的真实硬上限：本次请求的输入+输出 Token 总量不可能超过它，
 *      因此用「完整 contextLimit」作为输入量预算是保守的（允许偏保守，不按比例缩小成本边界）。
 *      适用条件：contextLimit 必须为正安全整数——0/缺失/负数/非法/客户端传入值一律不是可靠来源，
 *      此时返回稳定「无法核价/未就绪」错误（零扣点/零 hold/零 execute/无任务），不猜默认值继续。
 *    字符粗估（estimateCombinedTokenCount）与字节数仅用于展示/诊断（如输入防爆阀提示），
 *    不作为成本上界——字节数+固定余量对所有协议无条件通用的做法已于 R0-H2 移除。
 *  - 成本缺失 ≠ 免费：pricing 缺失、状态不可信（UNCONFIGURED/UNVERIFIED/OBSERVED_ONLY）、
 *    币种不可靠（非 CNY，本系统点数换算唯一权威口径）、任一侧成本缺失/非法，都不得按 0 继续；
 *    只有权威事实证明免费（priceStatus=FREE，或 VERIFIED 且两侧成本均为 0）才按零成本放行；
 *  - 未知可能费用不得静默忽略：pricing.rules 非空（存在无法证明与本次费用无关的规则）或
 *    缓存计费类别已登记非零成本（本次是否命中缓存不可预知）→ 拒绝（不实现通用规则引擎，不涨价）；
 *  - 预算 = 本次实际会扣的合法整数点数（固定点数计费的 rawCost）；非正整数视为损坏配置拒绝；
 *  - 金额全程 BigInt 微元（1 算力点 = 10000 微元，MICROS_PER_POINT 唯一真源），
 *    除法一律向上取整（保守上界），加价系数沿用既有统一口径（10000+bps）；
 *  - 供应商成本、用户售价、点数面值、现金收入与利润是不同概念：本函数只做
 *    「保守成本上界 ≤ 名义预算」的止损比较，不构成任何利润率或补贴授权。
 */

import { MICROS_PER_POINT } from "@/lib/point-rate";

/** 可采信的价格状态：明确免费，或供应商价目表已确认 */
const TRUSTED_PRICE_STATUSES = new Set(["FREE", "VERIFIED"]);

export interface CostAdmissionPricing {
  currency?: string | null;
  priceStatus?: string | null;
  costInputMicrosPerMillion?: unknown;
  costOutputMicrosPerMillion?: unknown;
  /** 缓存计费类别：非空非零时本次是否产生缓存费用不可预知 → 不可建立可信上界 */
  costCacheReadMicrosPerMillion?: unknown;
  costCacheWriteMicrosPerMillion?: unknown;
  /** 非标定价规则容器：非空对象视为存在无法证明与本次费用无关的规则 → 拒绝 */
  rules?: unknown;
}

export type CostAdmissionDecision =
  | {
      allowed: true;
      /** 保守成本上界（微元，BigInt）；免费时为 BigInt("0") */
      conservativeCostMicros: bigint;
      /** 保守成本上界折算点数（向上取整；免费时 0） */
      conservativeCostPoints: number;
      /** 输入 Token 上界（= 注册表硬上下文限制，快照/诊断用，不含原始材料） */
      inputTokenUpperBound: number;
      inputBoundSource: "REGISTRY_CONTEXT_LIMIT_FULL";
      /** 本次名义预算（点） */
      budgetPoints: number;
    }
  | { allowed: false; code: "MODEL_COST_NOT_TRUSTWORTHY" | "MODEL_COST_EXCEEDS_BUDGET"; error: string };

function toNonNegativeSafeInt(v: unknown): number | null {
  // null/undefined 视为「缺失」，绝不与 0 混淆（Number(null) === 0 的陷阱）
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** 向上取整整除（保守上界）：ceil(a / b)，a/b 均为非负 BigInt，b > 0 */
function ceilDiv(a: bigint, b: bigint): bigint {
  if (a === BigInt("0")) return BigInt("0");
  return (a + b - BigInt("1")) / b;
}

/**
 * 非标规则检查：rules 非空对象（含数组）时存在无法证明与本次费用无关的条目 → 不可信。
 * 空对象/缺失/null 视为未登记任何规则。
 */
function hasUnknownPricingRules(rules: unknown): boolean {
  if (rules === null || rules === undefined) return false;
  if (typeof rules !== "object") return true; // 非对象形态无法解释
  if (Array.isArray(rules)) return rules.length > 0;
  return Object.keys(rules as Record<string, unknown>).length > 0;
}

/** 缓存计费类别是否已登记非零成本（本次请求是否命中缓存不可预知 → 无法保守覆盖） */
function hasUncoverableCacheCost(pricing: CostAdmissionPricing): boolean {
  for (const key of ["costCacheReadMicrosPerMillion", "costCacheWriteMicrosPerMillion"] as const) {
    const v = pricing[key];
    if (v === null || v === undefined) continue; // 未登记缓存类别
    const n = toNonNegativeSafeInt(v);
    if (n === null || n > 0) return true; // 非法或非零 → 无法覆盖
  }
  return false;
}

export function decidePlatformModelCostAdmission(args: {
  pricing: CostAdmissionPricing | null | undefined;
  /** 服务端最终模型计划的注册表硬上下文限制（客户端不可传入；缺失/0/非法 → 不可建立边界） */
  contextLimit: unknown;
  /** 实际传给适配器的输出硬上限（请求参数本身即硬上界） */
  maxOutputTokens: number;
  /** 本次实际会扣的固定点数（名义预算） */
  budgetPoints: number;
  /** 生效加价率基点（模型级覆盖 ?? 全局 k），沿用既有统一口径 */
  markupRateBps: number;
}): CostAdmissionDecision {
  const { maxOutputTokens, budgetPoints } = args;

  // 1. 名义预算：必须是本次实际会扣的合法正整数点数（损坏配置诚实拒绝，不取整猜测）
  if (!Number.isSafeInteger(budgetPoints) || budgetPoints <= 0) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该组件的扣点配置不是有效的正整数点数，无法建立本次执行预算，已取消执行（未扣点、未调用模型）。请联系平台管理员修正组件定价。",
    };
  }
  // 2. 输入 Token 可靠上界：服务端最终计划中的注册表硬上下文限制（完整值作保守输入预算）。
  //    0/缺失/负数/非整数不是可靠来源 → 稳定拒绝；不使用客户端传入值或默认猜测。
  const contextLimit = toNonNegativeSafeInt(args.contextLimit);
  if (contextLimit === null || contextLimit <= 0) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型未登记有效的硬上下文限制，无法建立可核查的执行成本边界，已取消执行（未扣点、未调用模型）。请联系平台管理员在模型注册表登记该模型的上下文上限。",
    };
  }
  const inputTokenUpperBound = contextLimit; // 完整硬限制作保守输入预算（允许偏保守）
  const outTok = toNonNegativeSafeInt(maxOutputTokens);
  if (outTok === null) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "本次请求的输出上限参数非法，无法建立可信成本边界，已取消执行（未扣点、未调用模型）。",
    };
  }
  // 4. 价格记录必须存在（缺失 ≠ 免费）
  const pricing = args.pricing ?? null;
  if (!pricing) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型的供应商成本未配置，无法核验本次执行成本，已取消执行（未扣点、未调用模型）。请联系平台管理员在模型注册表登记并确认价格。",
    };
  }
  // 5. 状态可采信：仅 FREE / VERIFIED；UNCONFIGURED / UNVERIFIED / OBSERVED_ONLY / 未知一律不可信
  if (!pricing.priceStatus || !TRUSTED_PRICE_STATUSES.has(String(pricing.priceStatus))) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型的价格尚未经过确认（未配置或仅有观测数据），无法核验本次执行成本，已取消执行（未扣点、未调用模型）。请联系平台管理员确认模型定价。",
    };
  }
  // 6. 币种：点数换算唯一权威口径为 CNY 微元；其他币种无授权换算规则，不猜汇率
  if (String(pricing.currency ?? "CNY") !== "CNY") {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型价格币种不是平台统一计费币种，无法可靠换算本次执行成本，已取消执行（未扣点、未调用模型）。请联系平台管理员核对价格币种。",
    };
  }
  // 7. 未知可能费用规则：无法可靠解释 → 拒绝（不静默忽略、不实现通用规则引擎、不涨价）
  if (hasUnknownPricingRules(pricing.rules)) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型价格包含平台无法可靠解释的计费规则，本次执行成本无法保守核算，已取消执行（未扣点、未调用模型）。请联系平台管理员核对该模型的非标计费规则。",
    };
  }
  // 8. 缓存计费类别：已登记非零缓存成本时本次是否命中不可预知 → 拒绝
  if (hasUncoverableCacheCost(pricing)) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型登记了缓存计费类别，本次执行是否产生缓存费用无法预知，已取消执行（未扣点、未调用模型）。请联系平台管理员核对模型缓存价格。",
    };
  }
  // 9. 成本单价：两侧都必须是已登记的非负安全整数（输入与输出都可能产生用量，缺一不可）
  const costIn = toNonNegativeSafeInt(pricing.costInputMicrosPerMillion);
  const costOut = toNonNegativeSafeInt(pricing.costOutputMicrosPerMillion);
  if (costIn === null || costOut === null) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "该模型的供应商成本单价缺失或非法，无法核验本次执行成本，已取消执行（未扣点、未调用模型）。请联系平台管理员补全模型成本价格。",
    };
  }
  // 10. 加价系数：非负安全整数基点（沿用既有统一口径）
  const markupBps = toNonNegativeSafeInt(args.markupRateBps);
  if (markupBps === null) {
    return {
      allowed: false,
      code: "MODEL_COST_NOT_TRUSTWORTHY",
      error: "模型加价系数配置非法，无法建立可信成本边界，已取消执行（未扣点、未调用模型）。请联系平台管理员核对计费配置。",
    };
  }

  // 11. 保守成本上界（BigInt 微元，除法全部向上取整）：
  //    成本微元 = ceil((输入上界×输入单价 + 输出硬上限×输出单价) / 1e6)
  //    售价底线微元 = ceil(成本微元 × (10000 + 加价基点) / 10000)
  const MILLION = BigInt("1000000");
  const costMicros = ceilDiv(
    BigInt(inputTokenUpperBound) * BigInt(costIn) + BigInt(outTok) * BigInt(costOut),
    MILLION,
  );
  const saleMicros = ceilDiv(costMicros * BigInt(10000 + markupBps), BigInt("10000"));
  const costPoints = Number(ceilDiv(saleMicros, MICROS_PER_POINT)); // MICROS_PER_POINT = 10000
  const budget = BigInt(budgetPoints);

  if (saleMicros > budget * MICROS_PER_POINT) {
    // 不暴露内部成本数值与单价明细
    return {
      allowed: false,
      code: "MODEL_COST_EXCEEDS_BUDGET",
      error: `本次任务按当前模型定价评估的执行成本已超过该组件定价（${budgetPoints} 点），已取消执行：未扣除算力点、未调用模型服务。请稍后重试，或联系平台管理员调整组件定价。`,
    };
  }

  return {
    allowed: true,
    conservativeCostMicros: saleMicros,
    conservativeCostPoints: costPoints,
    inputTokenUpperBound,
    inputBoundSource: "REGISTRY_CONTEXT_LIMIT_FULL",
    budgetPoints,
  };
}
