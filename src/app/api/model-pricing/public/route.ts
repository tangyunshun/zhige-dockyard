import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  loadDeploymentPricing,
  resolveActivePricingWithPeriod,
} from "@/lib/model-registry";
import {
  PRICE_SOURCES,
  PRICE_STATUSES,
  resolvePriceStatus,
  microsToYuanPerMillion,
  type PriceSource,
  type PriceStatus,
  type DeploymentPricing,
} from "@/lib/model-pricing";

// 用户前台只读接口：随数据实时变化，禁止静态缓存
export const dynamic = "force-dynamic";

/** 把微元/百万字段转换为元/百万视图（仅含用户售价，不暴露成本） */
function toPriceView(p: DeploymentPricing) {
  return {
    input: microsToYuanPerMillion(p.priceInputMicrosPerMillion),
    output: microsToYuanPerMillion(p.priceOutputMicrosPerMillion),
    cacheRead: microsToYuanPerMillion(p.priceCacheReadMicrosPerMillion),
    cacheWrite: microsToYuanPerMillion(p.priceCacheWriteMicrosPerMillion),
    source: p.priceSource,
    status: p.priceStatus,
  };
}

function normalizeSource(s: string): PriceSource {
  return (PRICE_SOURCES as readonly string[]).includes(s) ? (s as PriceSource) : "UNVERIFIED";
}
function normalizeStatus(s: string): PriceStatus {
  return (PRICE_STATUSES as readonly string[]).includes(s) ? (s as PriceStatus) : "UNCONFIGURED";
}

/**
 * GET：用户前台只读——列出全部「启用中」的平台模型部署，
 * 返回主流价、当前生效价（含归属时段）与时段价格表。
 * 不含供应商成本字段，仅供调用者查看，不可配置。
 */
export async function GET(request: NextRequest) {
  try {
    const deployments = await prisma.modeldeployment.findMany({
      where: { enabled: true },
      orderBy: [{ providerId: "asc" }, { modelId: "asc" }],
      include: {
        provider: { select: { name: true } },
        periods: { orderBy: [{ priority: "desc" }, { kind: "asc" }, { name: "asc" }] },
      },
    });

    const now = new Date();
    const data = await Promise.all(
      deployments.map(async (d) => {
        const mainstream = await loadDeploymentPricing(d.id);
        const { pricing: active, activePeriodId } = await resolveActivePricingWithPeriod(d.id, now);

        const periods = d.periods.map((p) => {
          const source = normalizeSource(p.priceSource);
          const status = normalizeStatus(p.priceStatus);
          // 以 row 存储状态为准；若为空则按数值回算
          const resolved =
            status === "UNCONFIGURED"
              ? resolvePriceStatus({
                  priceSource: source,
                  costValues: [
                    p.costInputMicrosPerMillion,
                    p.costOutputMicrosPerMillion,
                    p.costCacheReadMicrosPerMillion,
                    p.costCacheWriteMicrosPerMillion,
                  ],
                  priceValues: [
                    p.priceInputMicrosPerMillion,
                    p.priceOutputMicrosPerMillion,
                    p.priceCacheReadMicrosPerMillion,
                    p.priceCacheWriteMicrosPerMillion,
                  ],
                })
              : status;
          return {
            id: p.id,
            name: p.name,
            kind: p.kind,
            enabled: p.enabled,
            priority: p.priority,
            weekdays: p.weekdays,
            startTime: p.startTime,
            endTime: p.endTime,
            startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
            endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
            prices: {
              input: microsToYuanPerMillion(p.priceInputMicrosPerMillion),
              output: microsToYuanPerMillion(p.priceOutputMicrosPerMillion),
              cacheRead: microsToYuanPerMillion(p.priceCacheReadMicrosPerMillion),
              cacheWrite: microsToYuanPerMillion(p.priceCacheWriteMicrosPerMillion),
            },
            source,
            status: resolved,
          };
        });

        return {
          id: d.id,
          providerId: d.providerId,
          providerName: d.provider.name,
          modelId: d.modelId,
          upstreamModel: d.upstreamModel,
          priceOrigin: mainstream?.priceOrigin || "PLATFORM",
          displayName: d.displayName || d.upstreamModel,
          contextLimit: d.contextLimit,
          capabilities: (Array.isArray(d.capabilities) ? d.capabilities : []) as string[],
          mainstream: mainstream ? toPriceView(mainstream) : null,
          active: active ? toPriceView(active) : null,
          activePeriodId,
          periods,
        };
      }),
    );

    // 动态元数据：高峰窗口与节假日覆盖均来自实时配置/日历，页面据此渲染，无需硬编码
    const allPeriods = data.flatMap((d) => d.periods);
    const peakPeriods = allPeriods.filter((p) => p.kind === "PEAK" && p.startTime && p.endTime);
    const peakRanges = Array.from(new Set(peakPeriods.map((p) => `${p.startTime}-${p.endTime}`))).sort();
    const peakWeekdaysRaw = peakPeriods[0]?.weekdays;
    const peakWeekdaysText =
      peakWeekdaysRaw && peakWeekdaysRaw.split(",").filter(Boolean).sort().join(",") === "1,2,3,4,5"
        ? "工作日"
        : peakWeekdaysRaw
          ? `星期${peakWeekdaysRaw.split(",").join("、")}`
          : "每天";
    const meta = {
      peakWindow: { weekdaysText: peakWeekdaysText, ranges: peakRanges },
    };

    return NextResponse.json({ success: true, data, meta });
  } catch (error) {
    console.error("[model-pricing-public] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型定价失败" }, { status: 500 });
  }
}
