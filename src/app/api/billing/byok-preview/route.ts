import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { estimatePoints } from "@/lib/billing/pricing-center";
import { loadBillingConfig } from "@/lib/billing/billing-config";
import { pointsToYuan } from "@/lib/point-rate";

// 只读预览：随登记的官方单价与服务费费率实时变化
export const dynamic = "force-dynamic";

/** BYO 部署 ID 形如 `byo:{workspaceId}`（与 workspace-byo-model 的裁决口径一致） */
const byoDeploymentId = (workspaceId: string) => `byo:${workspaceId}`;

/**
 * GET：自带模型（BYOK）「按官方单价 + 服务费」口径的示例扣点预览。
 * 入参：workspaceId（必填）、inputTokens / outputTokens（可选，默认各 1 万 Token 作为示例用量）。
 * 仅空间成员可查；未登记官方单价时返回阻断提示，绝不猜测默认价。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "缺少 workspaceId" }, { status: 400 });
    }

    const membership = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: auth.user.id },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "无权预览该空间" }, { status: 403 });
    }

    const toInt = (raw: string | null, fallback: number) => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
    };
    const inputTokens = toInt(searchParams.get("inputTokens"), 10_000);
    const outputTokens = toInt(searchParams.get("outputTokens"), 10_000);

    const config = await loadBillingConfig();
    const result = await estimatePoints({
      modelDeploymentId: byoDeploymentId(workspaceId),
      inputTokens,
      outputTokens,
      pricingSource: "USER_BYOK",
      config,
    });

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        tokens: { input: inputTokens, output: outputTokens },
        points: result.points,
        yuan: result.points === null ? null : pointsToYuan(result.points),
        basis: result.basis,
        blockedReason: result.blockedReason,
        // 服务费费率（基点）：1500 = 15%，来自 systemconfig，前端不做计算
        byokServiceRateBps: config.byokServiceRateBps,
        snapshot: result.snapshot,
      },
    });
  } catch (error) {
    console.error("[billing-byok-preview] 预览失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "预览失败" }, { status: 500 });
  }
}
