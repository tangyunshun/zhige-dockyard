import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import {
  loadDeploymentPricing,
  resolveActivePricingWithPeriod,
  resolveDefaultDeployment,
} from "@/lib/model-registry";
import { microsToYuanPerMillion, type DeploymentPricing } from "@/lib/model-pricing";

// 执行前价格提示：随时段实时变化，禁止静态缓存
export const dynamic = "force-dynamic";

/** 把微元/百万字段转换为元/百万视图（仅含用户售价，不暴露供应商成本） */
function toPriceView(p: DeploymentPricing | null) {
  if (!p) return null;
  return {
    input: microsToYuanPerMillion(p.priceInputMicrosPerMillion),
    output: microsToYuanPerMillion(p.priceOutputMicrosPerMillion),
    cacheRead: microsToYuanPerMillion(p.priceCacheReadMicrosPerMillion),
    cacheWrite: microsToYuanPerMillion(p.priceCacheWriteMicrosPerMillion),
    source: p.priceSource,
    status: p.priceStatus,
  };
}

/**
 * GET：查询「某空间执行某组件时」实际会采用的模型部署及其当前生效单价。
 * 裁决口径与执行路径完全一致（统一走 resolveDefaultDeployment：空间自带 > 空间默认 > 平台默认），
 * 前端据此在执行前如实展示单价，不可配置、不含成本字段。
 * 入参：workspaceId（必填）、capabilities（必填，逗号分隔，来自合同 requiredCapabilities）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    const capabilities = Array.from(
      new Set(
        (searchParams.get("capabilities") || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length > 0),
      ),
    );

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "缺少 workspaceId" }, { status: 400 });
    }
    // 能力集合为空时不得猜测：与执行门禁一致的稳定前置校验
    if (capabilities.length === 0) {
      return NextResponse.json(
        { success: false, error: "缺少组件能力声明（requiredCapabilities 为空）", code: "MODEL_CAPABILITY_NOT_DECLARED" },
        { status: 400 },
      );
    }

    // 仅本人所属空间可查询，避免泄露其他空间的模型裁决结果
    const membership = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: auth.user.id },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "无权查询该空间的生效定价" }, { status: 403 });
    }

    const plan = await resolveDefaultDeployment({ workspaceId, requiredCapabilities: capabilities });

    const now = new Date();
    const [mainstream, activeResult, deployment] = await Promise.all([
      loadDeploymentPricing(plan.deploymentId),
      resolveActivePricingWithPeriod(plan.deploymentId, now),
      prisma.modeldeployment.findUnique({
        where: { id: plan.deploymentId },
        include: {
          provider: { select: { name: true } },
          periods: { select: { id: true, name: true, kind: true } },
        },
      }),
    ]);

    const activePeriod =
      deployment?.periods?.find((p) => p.id === activeResult.activePeriodId) || null;

    return NextResponse.json({
      success: true,
      data: {
        deploymentId: plan.deploymentId,
        providerId: plan.providerId,
        providerName: deployment?.provider?.name || plan.providerId,
        modelId: plan.modelId,
        upstreamModel: plan.upstreamModelId,
        displayName: deployment?.displayName || plan.upstreamModelId,
        // 裁决来源：SPACE_DEFAULT 空间默认 / PLATFORM_DEFAULT 平台默认 / WORKSPACE_BYO 空间自带
        defaultSource: plan.defaultSource,
        mainstream: toPriceView(mainstream),
        active: toPriceView(activeResult.pricing),
        activePeriod: activePeriod
          ? { id: activePeriod.id, name: activePeriod.name, kind: activePeriod.kind }
          : null,
      },
    });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    // 裁决类失败（如 MODEL_NOT_ALLOWED / MODEL_CAPABILITY_NOT_DECLARED）按原错误码透传，便于前端如实提示
    if (e?.code) {
      return NextResponse.json(
        { success: false, error: e.message || "模型裁决失败", code: e.code },
        { status: e.status || 400 },
      );
    }
    console.error("[model-pricing-effective] 查询生效定价失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询生效定价失败" }, { status: 500 });
  }
}
