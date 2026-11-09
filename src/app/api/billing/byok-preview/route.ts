import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { loadBillingConfig } from "@/lib/billing/billing-config";

// 只读预览：随登记的官方单价与服务费费率实时变化
export const dynamic = "force-dynamic";

/**
 * GET：自带模型（BYOK）扣点预览。
 * [R0-I / 原方案 F12] BYOK 任务收费口径未确认 → 安全暂停：
 * 不再提供「按官方单价 + 服务费」的可扣点报价，points/yuan 恒为 null，
 * blocked/canExecute 如实标记，与 Studio 执行准入（BYOK_BILLING_POLICY_UNCONFIRMED）一致。
 * 仅空间成员可查；GET 全程只读，不调用模型、不更新配置。
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

    // [R0-I] 收费口径未确认：不调用估价、不返回可扣点报价（历史算法保留在纯函数内不代表当前可收费）
    const config = await loadBillingConfig();

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        tokens: { input: inputTokens, output: outputTokens },
        blocked: true,
        canExecute: false,
        code: "BYOK_BILLING_POLICY_UNCONFIRMED",
        message: "自带模型（BYOK）的任务调用暂不可用：平台收费口径待确认。本次不产生可扣点报价，未扣点、未调用模型。",
        points: null,
        yuan: null,
        basis: null,
        blockedReason: "BYOK_BILLING_POLICY_UNCONFIRMED",
        // 服务费费率（基点）：仅作为已存配置展示，不构成当前 Studio BYOK 任务收费生效
        byokServiceRateBps: config.byokServiceRateBps,
        snapshot: null,
      },
    });
  } catch (error) {
    console.error("[billing-byok-preview] 预览失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "预览失败" }, { status: 500 });
  }
}
