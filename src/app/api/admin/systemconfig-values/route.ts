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

/** 更新价格凭证确认记录与对账起点（系统管理员或模型管理员权限） */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { pricingPriceVoucherNote, reconciliationStartDate } = body;

    if (pricingPriceVoucherNote !== undefined) {
      // 规范化：去首尾空白；限长 500 字（与前端输入框上限一致），防止超长文本存库后撑爆展示卡片
      const note = String(pricingPriceVoucherNote ?? "").trim();
      if (note.length > 500) {
        return NextResponse.json(
          { success: false, error: "定价确认说明过长（最多 500 字），请精简后保存" },
          { status: 400 },
        );
      }
      await prisma.systemconfig.upsert({
        where: { key: "pricing.priceVoucherNote" },
        update: { value: note },
        create: { key: "pricing.priceVoucherNote", value: note },
      });
    }

    if (reconciliationStartDate !== undefined) {
      await prisma.systemconfig.upsert({
        where: { key: "reconciliation.startDate" },
        update: { value: String(reconciliationStartDate ?? "") },
        create: { key: "reconciliation.startDate", value: String(reconciliationStartDate ?? "") },
      });
    }

    return NextResponse.json({
      success: true,
      message: "配置已更新",
    });
  } catch (error) {
    console.error("[systemconfig-values] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "更新失败" }, { status: 500 });
  }
}
