import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/** 只读暴露少量管理后台展示用配置（价格凭证确认 / 对账起点），不含任何密钥 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: ["pricing.priceVoucherNote", "reconciliation.startDate"] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({
      success: true,
      data: {
        pricingPriceVoucherNote: map["pricing.priceVoucherNote"] ?? null,
        reconciliationStartDate: map["reconciliation.startDate"] ?? null,
      },
    });
  } catch (error) {
    console.error("[systemconfig-values] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询失败" }, { status: 500 });
  }
}
