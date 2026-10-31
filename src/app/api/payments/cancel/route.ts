export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * POST /api/payments/cancel —— 取消本人「待支付」在线充值订单
 *
 * 仅当订单为本人、type=TOKEN_RECHARGE、且当前状态为 PENDING 时可取消。
 * 取消后状态置 CANCELLED，模拟确认入账接口会因「非 PENDING」而拒绝，从而保证闭环一致。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { orderNo } = (await request.json().catch(() => ({}))) as { orderNo?: string };
    if (!orderNo) return NextResponse.json({ error: "缺少 orderNo" }, { status: 400 });

    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (!billingModel) return NextResponse.json({ error: "账单表不可用，无法取消订单" }, { status: 500 });

    const order = await billingModel.findUnique({ where: { id: orderNo } });
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.userId !== auth.user.id) return NextResponse.json({ error: "无权操作该订单" }, { status: 403 });
    if (order.type !== "TOKEN_RECHARGE") {
      return NextResponse.json({ error: "该订单类型不支持取消" }, { status: 400 });
    }
    if (order.status !== "PENDING") {
      return NextResponse.json(
        { error: `订单当前状态为 ${order.status}，仅「待支付」订单可取消` },
        { status: 409 },
      );
    }

    const updated = await billingModel.update({
      where: { id: orderNo },
      data: { status: "CANCELLED", updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      status: updated.status,
      message: "订单已取消，可重新发起充值",
    });
  } catch (error) {
    console.error("[payments/cancel] 取消订单失败:", (error as Error)?.message);
    return NextResponse.json({ error: (error as Error)?.message || "取消订单失败" }, { status: 500 });
  }
}
