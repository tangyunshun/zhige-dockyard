/**
 * 组件成本底线（防亏本红线）唯一计算真源。
 *
 * 口径与后台「成本底线与定价参考」面板、算账中心完全一致：
 *   成本微元 = 输入Token × 成本单价(微元/百万) + 输出Token × 成本单价(微元/百万)
 *   售价(底线)微元 = 成本微元 × (1 + 加价系数基点/10000)
 *   底线点数 = ceil(售价微元 / 10000)，至少 1 点
 *
 * 无选型模型或未登记成本价时返回 null（表示无法计算底线，跳过校验）。
 * 管理后台保存组件、执行链路成本巡检、初始化脚本一律复用本模块，严禁各处重复实现。
 */
import { prisma } from "@/lib/prisma";
import { loadBillingConfig } from "@/lib/billing/billing-config";

/** 1 算力点 = 10000 微元（¥0.01） */
export const MICROS_PER_POINT = 10_000;

/** 价格行中与成本底线相关的字段（modelpricing 的子集） */
export interface CostPricingLike {
  costInputMicrosPerMillion?: unknown;
  costOutputMicrosPerMillion?: unknown;
  /** 模型级加价率基点：与算账中心同口径（模型级优先、全局兜底） */
  markupRateBps?: unknown;
}

/**
 * 纯函数：由供应商成本单价 + 预估 Token + 全局加价系数计算成本底线点数。
 * 单价均为「微元 / 100 万 Token」口径；输入/输出任一未登记（≤0）时按 0 计。
 */
export function computeCostFloorFromPricing(
  pricing: CostPricingLike | null | undefined,
  inputTokens: number,
  outputTokens: number,
  markupCoefficientBps: number,
): number | null {
  if (!pricing) return null;
  const costIn = Number(pricing.costInputMicrosPerMillion ?? 0);
  const costOut = Number(pricing.costOutputMicrosPerMillion ?? 0);
  if (!(costIn > 0) && !(costOut > 0)) return null;
  const k = (10000 + (markupCoefficientBps ?? 0)) / 10000;
  const totalMicros = (inputTokens * costIn + outputTokens * costOut) / 1e6;
  const saleMicros = totalMicros * k;
  return Math.max(1, Math.ceil(saleMicros / MICROS_PER_POINT));
}

/**
 * 按选型模型部署 ID 计算成本底线点数。
 * 读取 modelpricing 成本单价与加价系数（模型级 markupRateBps 优先、全局兜底，
 * 与算账中心 pricing-center 的 effectiveMarkup 同口径）；模型不存在 / 未登记成本价返回 null。
 */
export async function computeCostFloorPoints(
  deploymentId?: string | null,
  inputTokens = 0,
  outputTokens = 0,
): Promise<number | null> {
  if (!deploymentId) return null;
  const pricing = await prisma.modelpricing.findUnique({
    where: { deploymentId },
    select: {
      costInputMicrosPerMillion: true,
      costOutputMicrosPerMillion: true,
      markupRateBps: true,
    },
  });
  if (!pricing) return null;
  const cfg = await loadBillingConfig();
  const effectiveMarkupBps =
    pricing.markupRateBps != null && Number.isFinite(Number(pricing.markupRateBps))
      ? Number(pricing.markupRateBps)
      : cfg.markupCoefficientBps ?? 0;
  return computeCostFloorFromPricing(
    pricing,
    inputTokens,
    outputTokens,
    effectiveMarkupBps,
  );
}
