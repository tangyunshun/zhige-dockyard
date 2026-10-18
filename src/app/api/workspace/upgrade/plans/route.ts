import { NextResponse } from "next/server";
import { getWorkspacePlans } from "@/lib/workspace-plan-service";

/**
 * GET /api/workspace/upgrade/plans
 * 个人空间升级企业空间时可供选择的套餐列表（仅在线可购买的启用套餐）。
 * 定价信息非敏感数据，登录与否均可读取；真正的购买校验（purchasable、
 * 配额上限）仍由 POST /api/workspace/upgrade 在执行时严格把关。
 */
export async function GET() {
  try {
    const plans = await getWorkspacePlans({ onlyActive: true, onlyPurchasable: true });
    return NextResponse.json({
      success: true,
      data: {
        plans: plans.map((p) => ({
          key: p.key,
          name: p.name,
          description: p.description,
          priceMonthly: p.priceMonthly,
          priceYearly: p.priceYearly,
          maxMembers: p.maxMembers,
          maxComponents: p.maxComponents,
          maxStorage: p.maxStorage,
          maxApiCalls: p.maxApiCalls,
          trialGift: p.trialGift
            ? { enabled: p.trialGift.enabled, points: p.trialGift.points, expireDays: p.trialGift.expireDays }
            : null,
          features: p.features,
          sortOrder: p.sortOrder,
        })),
      },
    });
  } catch (error) {
    console.error("Get upgrade plans error:", error);
    return NextResponse.json(
      { success: false, error: "获取套餐列表失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
