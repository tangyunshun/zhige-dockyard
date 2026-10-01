import { prisma } from "@/lib/prisma";
import { loadDeploymentPricing } from "@/lib/model-registry";
import type { DeploymentPricing } from "@/lib/model-pricing";
import { loadBillingConfig, type BillingConfig } from "./billing-config";

/**
 * 算账中心：全系统唯一的「Token → 算力点」计价入口。
 *
 * 硬性约束（来自总纲 4.2）：
 * - 财务计算一律安全整数 / BigInt，禁止浮点近似账务；
 * - 价格未登记一律阻断，绝不猜测默认价、绝不静默取 0；
 * - 每次估价产出可落库的计算快照（单价、系数、费率、价格版本、时间）。
 */

export type PricingSource = "PLATFORM" | "USER_BYOK";

/** 单价口径：决定乘数如何叠加，避免重复加价 / 重复收服务费 */
export type PriceKind =
  /** 用户售价已显式登记（DIRECT_PRICE）：售价已含加价，不再叠加 k */
  | "DIRECT_PRICE"
  /** 仅登记供应商成本：按加价系数 k（模型覆盖优先，否则全局）折算出售价 */
  | "COST_PLUS_MARKUP"
  /** 自带模型（BYOK）官方价：按服务费率折算（不套 k） */
  | "BYOK_OFFICIAL";

/** 单价（微元 / 100 万 Token） */
export interface UnitPriceMicros {
  input: number | null;
  output: number | null;
}

export type EstimateBasis =
  /** 经算账中心换算得出 */
  | "CONVERTED_PRICE"
  /** 价格未登记 → 阻断（调用方须回退到兼容口径并标注，不得静默估价） */
  | "BLOCKED_PRICE_UNREGISTERED";

export interface EstimateSnapshot {
  deploymentId: string;
  pricingSource: PricingSource;
  priceKind: PriceKind | null;
  inputTokens: number;
  outputTokens: number;
  unitPriceMicrosPerMillion: UnitPriceMicros;
  /** 实际生效乘数（基点）：10000 = ×1.0 */
  multiplierBps: number;
  /** 是否命中「按模型覆盖系数」（否则为全局默认 k） */
  markupOverriddenByModel: boolean;
  /** BYOK 场景实际应用的服务费率（基点）；非 BYOK 为 null */
  byokServiceRateBpsApplied: number | null;
  /** 计算中间量（字符串化 BigInt，供落库审计复算） */
  numerator: string;
  denominator: string;
  priceVersion: number | null;
  priceStatus: string | null;
  /** 用量估算来源：USAGE_CALIBRATION 校准表 / CONTRACT_ESTIMATED_TOKENS 合同 / CATALOG_ESTIMATED_TOKENS 目录旧值 */
  estimateSource: string | null;
  /** 本次实际生效的保底点数（null = 未启用保底） */
  minPointsPerTaskApplied: number | null;
  computedAt: string;
}

export interface EstimatePointsResult {
  basis: EstimateBasis;
  /** 应扣算力点（向上取整）；阻断时为 null */
  points: number | null;
  snapshot: EstimateSnapshot;
  /** 阻断原因（可直出给用户/运营的提示文案） */
  blockedReason: string | null;
}

// ============ 押金（hold）用量上界 ============
/** 押金输入 Token 上限：输入材料按「字符数 ÷ 2」粗估，超过该值截断，防止超长材料押金虚高 */
export const DEPOSIT_MAX_INPUT_TOKENS = 4_000;
/** 合同未声明 maxOutputTokens 时押金使用的输出上界默认值 */
export const DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

/**
 * 押金最坏情况 Token 上界（纯函数）：
 * - 输入 = min( max(ceil(材料字符数 ÷ 2), 校准输入均值), cap )；
 *   校准输入均值（billing_usage_calibration 的 in，历史真实 prompt_tokens 均值）作为下限——
 *   中文材料按字符÷2 会系统性低估（汉字 ≈ 1+ token/字，且模型/网关有固定注入开销），
 *   试点实测估算 600 vs 真实 4788，导致押金形同虚设、每单补扣；
 * - cap = max(DEPOSIT_MAX_INPUT_TOKENS, 校准值)：校准值本身是真实用量证据，
 *   超过 4000 时上限随之放宽，避免校准下限被硬顶砍掉（否则补扣问题回归）；
 * - 输出 = 合同 steps maxOutputTokens 之和（>0），否则 DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS。
 * 押金按最坏情况收，保证「押金 ≥ 实扣」，用户余额永不为负、平台不倒贴。
 */
export function computeDepositTokenBounds(
  materialChars: number,
  contractMaxOutputTokens: number | null | undefined,
  calibratedInputTokens?: number | null,
): { inputTokens: number; outputTokens: number } {
  const chars = Number.isFinite(materialChars) && materialChars > 0 ? Math.floor(materialChars) : 0;
  const calib =
    typeof calibratedInputTokens === "number" && Number.isFinite(calibratedInputTokens) && calibratedInputTokens > 0
      ? Math.floor(calibratedInputTokens)
      : 0;
  const cap = Math.max(DEPOSIT_MAX_INPUT_TOKENS, calib);
  const inputTokens = Math.min(Math.max(Math.ceil(chars / 2), calib), cap);
  const out =
    typeof contractMaxOutputTokens === "number" && Number.isFinite(contractMaxOutputTokens) && contractMaxOutputTokens > 0
      ? Math.floor(contractMaxOutputTokens)
      : DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS;
  return { inputTokens, outputTokens: out };
}

/** 100 万 Token（单价分母） */
const TOKENS_PER_MILLION = BigInt(1_000_000);
/** 基点分母（bps） */
const BPS_DENOM = BigInt(10_000);
/** 1 算力点 = 10000 微元（与 point-rate 的 MICROS_PER_POINT 同值） */
const MICROS_PER_POINT = BigInt(10_000);

function toSafeNonNegativeInteger(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** 由 deploymentId 判定价格来源（BYO 部署 id 形如 `byo:{workspaceId}`） */
export function resolvePricingSource(deploymentId: string): PricingSource {
  return typeof deploymentId === "string" && deploymentId.startsWith("byo:")
    ? "USER_BYOK"
    : "PLATFORM";
}

export function byokWorkspaceIdOf(deploymentId: string): string | null {
  if (resolvePricingSource(deploymentId) !== "USER_BYOK") return null;
  const id = deploymentId.slice("byo:".length);
  return id.length > 0 ? id : null;
}

/**
 * 计算实际生效乘数（基点，10000 = ×1.0）：
 * - BYOK_OFFICIAL：10000 + 服务费率
 * - COST_PLUS_MARKUP：10000 +（模型覆盖加价率 ?? 全局 k 对应的加价率）
 * - DIRECT_PRICE：10000（售价已含加价，禁止重复叠加）
 */
export function effectiveMultiplierBps(params: {
  priceKind: PriceKind;
  perModelMarkupRateBps?: number | null;
  markupCoefficientBps: number;
  byokServiceRateBps: number;
}): { multiplierBps: number; markupOverriddenByModel: boolean } {
  const { priceKind } = params;
  if (priceKind === "DIRECT_PRICE") return { multiplierBps: 10_000, markupOverriddenByModel: false };
  if (priceKind === "BYOK_OFFICIAL") {
    return { multiplierBps: 10_000 + Math.max(0, params.byokServiceRateBps), markupOverriddenByModel: false };
  }
  const perModel = params.perModelMarkupRateBps;
  if (perModel !== null && perModel !== undefined && Number.isFinite(perModel)) {
    return { multiplierBps: 10_000 + Math.max(0, Math.floor(perModel)), markupOverriddenByModel: true };
  }
  // 全局 k（k×10000）本身就是「成本 → 售价」的乘数，直接作为 multiplierBps
  return { multiplierBps: Math.max(10_000, params.markupCoefficientBps), markupOverriddenByModel: false };
}

/**
 * 纯函数算账（不查库、无副作用）：
 *   points = ceil( (in × inPrice + out × outPrice) × multiplierBps ÷ (1e6 × 1e4 × 1e4) )
 * 其中单价单位为「微元 / 100 万 Token」，1 算力点 = 10000 微元；全程 BigInt，单次向上取整。
 */
export function computeEstimatedPoints(params: {
  deploymentId: string;
  unit: UnitPriceMicros;
  inputTokens: number;
  outputTokens: number;
  pricingSource: PricingSource;
  priceKind: PriceKind | null;
  perModelMarkupRateBps?: number | null;
  markupCoefficientBps: number;
  byokServiceRateBps: number;
  priceVersion?: number | null;
  priceStatus?: string | null;
  /** 单次执行保底点数：计费 = max(换算点数, minPointsPerTask) */
  minPointsPerTask?: number | null;
  /** 用量估算来源（写入快照供审计） */
  estimateSource?: string | null;
}): EstimatePointsResult {
  const inputTokens = toSafeNonNegativeInteger(params.inputTokens);
  const outputTokens = toSafeNonNegativeInteger(params.outputTokens);
  const { unit } = params;

  const baseSnapshot = {
    deploymentId: params.deploymentId,
    pricingSource: params.pricingSource,
    priceKind: params.priceKind,
    inputTokens,
    outputTokens,
    unitPriceMicrosPerMillion: { input: unit?.input ?? null, output: unit?.output ?? null },
    priceVersion: params.priceVersion ?? null,
    priceStatus: params.priceStatus ?? null,
    estimateSource: params.estimateSource ?? null,
    minPointsPerTaskApplied: null,
    computedAt: new Date().toISOString(),
  };

  // 价格未登记 → 阻断（绝不猜测默认价、绝不按 0 元免费处理）
  if (!unit || unit.input === null || unit.output === null) {
    return {
      basis: "BLOCKED_PRICE_UNREGISTERED",
      points: null,
      blockedReason:
        params.pricingSource === "USER_BYOK"
          ? "该自带模型未登记官方单价，算账中心无法估价；请先登记官方单价（系统绝不猜测默认价）。"
          : "该模型部署未登记单价（用户售价与供应商成本均缺失），算账中心无法估价；请先在模型定价中配置价格。",
      snapshot: {
        ...baseSnapshot,
        multiplierBps: 10_000,
        markupOverriddenByModel: false,
        byokServiceRateBpsApplied: null,
        numerator: "0",
        denominator: (TOKENS_PER_MILLION * MICROS_PER_POINT * BPS_DENOM).toString(),
      },
    };
  }

  const { multiplierBps, markupOverriddenByModel } = effectiveMultiplierBps({
    priceKind: params.priceKind ?? "COST_PLUS_MARKUP",
    perModelMarkupRateBps: params.perModelMarkupRateBps ?? null,
    markupCoefficientBps: params.markupCoefficientBps,
    byokServiceRateBps: params.byokServiceRateBps,
  });

  const numerator =
    (BigInt(inputTokens) * BigInt(unit.input) + BigInt(outputTokens) * BigInt(unit.output)) *
    BigInt(multiplierBps);
  const denominator = TOKENS_PER_MILLION * MICROS_PER_POINT * BPS_DENOM;
  // 向上取整（ceil）：(n + d - 1) / d，全程 BigInt 整除
  const rawPoints = Number((numerator + denominator - BigInt(1)) / denominator);
  // 保底扣点：计费 = max(换算点数, minPointsPerTask)；仅作用于点数计算，无限额度（-1）语义不受影响
  const minPoints = params.minPointsPerTask ?? 0;
  const points = minPoints > 0 ? Math.max(rawPoints, minPoints) : rawPoints;

  return {
    basis: "CONVERTED_PRICE",
    points,
    blockedReason: null,
    snapshot: {
      ...baseSnapshot,
      multiplierBps,
      markupOverriddenByModel,
      byokServiceRateBpsApplied:
        params.pricingSource === "USER_BYOK" ? params.byokServiceRateBps : null,
      minPointsPerTaskApplied: minPoints > 0 ? minPoints : null,
      numerator: numerator.toString(),
      denominator: denominator.toString(),
    },
  };
}

/** 从平台价目解析单价口径（售价优先，其次成本×加价） */
function resolvePlatformUnit(p: DeploymentPricing | null): {
  unit: UnitPriceMicros;
  priceKind: PriceKind | null;
  perModelMarkupRateBps: number | null;
} {
  if (!p) return { unit: { input: null, output: null }, priceKind: null, perModelMarkupRateBps: null };
  const hasDirect = p.priceInputMicrosPerMillion !== null && p.priceOutputMicrosPerMillion !== null;
  if (hasDirect) {
    return {
      unit: { input: p.priceInputMicrosPerMillion, output: p.priceOutputMicrosPerMillion },
      priceKind: "DIRECT_PRICE",
      perModelMarkupRateBps: p.markupRateBps ?? null,
    };
  }
  const hasCost = p.costInputMicrosPerMillion !== null && p.costOutputMicrosPerMillion !== null;
  if (hasCost) {
    return {
      unit: { input: p.costInputMicrosPerMillion, output: p.costOutputMicrosPerMillion },
      priceKind: "COST_PLUS_MARKUP",
      perModelMarkupRateBps: p.markupRateBps ?? null,
    };
  }
  return { unit: { input: null, output: null }, priceKind: null, perModelMarkupRateBps: p.markupRateBps ?? null };
}

/**
 * 算账中心主入口（查库 + 换算）。
 * 价格未登记时返回 BLOCKED_PRICE_UNREGISTERED 且 points = null，
 * 由调用方决定回退策略（兼容期回退现有扣点口径并标注估算，不得静默估价）。
 */
export async function estimatePoints(params: {
  modelDeploymentId: string;
  inputTokens: number;
  outputTokens: number;
  /** 不传则按 deploymentId 推断（byo: 前缀 → USER_BYOK） */
  pricingSource?: PricingSource;
  /** 不传则读 systemconfig */
  config?: BillingConfig;
  /** 用量估算来源（写入快照供审计） */
  estimateSource?: string | null;
}): Promise<EstimatePointsResult> {
  const deploymentId = params.modelDeploymentId;
  const pricingSource = params.pricingSource ?? resolvePricingSource(deploymentId);
  const config = params.config ?? (await loadBillingConfig());

  if (pricingSource === "USER_BYOK") {
    const workspaceId = byokWorkspaceIdOf(deploymentId);
    let byo: { priceInputMicrosPerMillion: number | null; priceOutputMicrosPerMillion: number | null; priceStatus: string | null } | null = null;
    if (workspaceId) {
      byo = await prisma.workspace_byo_model.findUnique({
        where: { workspaceId },
        select: {
          priceInputMicrosPerMillion: true,
          priceOutputMicrosPerMillion: true,
          priceStatus: true,
        },
      });
    }
    return computeEstimatedPoints({
      deploymentId,
      // 方案 B：登记的是「官方单价」，按服务费率折算后收费
      unit: {
        input: byo?.priceInputMicrosPerMillion ?? null,
        output: byo?.priceOutputMicrosPerMillion ?? null,
      },
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      pricingSource: "USER_BYOK",
      priceKind: "BYOK_OFFICIAL",
      perModelMarkupRateBps: null,
      markupCoefficientBps: config.markupCoefficientBps,
      byokServiceRateBps: config.byokServiceRateBps,
      minPointsPerTask: config.minPointsPerTask,
      estimateSource: params.estimateSource ?? null,
      priceVersion: null,
      priceStatus: byo?.priceStatus ?? null,
    });
  }

  const pricing = await loadDeploymentPricing(deploymentId);
  const { unit, priceKind, perModelMarkupRateBps } = resolvePlatformUnit(pricing);
  return computeEstimatedPoints({
    deploymentId,
    unit,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    pricingSource: "PLATFORM",
    priceKind,
    perModelMarkupRateBps,
    markupCoefficientBps: config.markupCoefficientBps,
    byokServiceRateBps: config.byokServiceRateBps,
    minPointsPerTask: config.minPointsPerTask,
    estimateSource: params.estimateSource ?? null,
    priceVersion: pricing?.priceVersion ?? null,
    priceStatus: pricing?.priceStatus ?? null,
  });
}

/**
 * 组件级 Token 拆分：把「总 Token 估算」按合同 maxOutputTokens 拆成输入/输出，
 * 全程数据驱动（合同字段），不猜测比例。
 */
export function splitTokenEstimate(params: {
  estimatedTotalTokens: number;
  maxOutputTokens?: number | null;
}): { inputTokens: number; outputTokens: number } {
  const total = toSafeNonNegativeInteger(params.estimatedTotalTokens);
  const cap = toSafeNonNegativeInteger(params.maxOutputTokens ?? 0);
  if (total === 0) return { inputTokens: 0, outputTokens: 0 };
  const outputTokens = Math.min(cap > 0 ? cap : 0, total);
  return { inputTokens: total - outputTokens, outputTokens };
}
