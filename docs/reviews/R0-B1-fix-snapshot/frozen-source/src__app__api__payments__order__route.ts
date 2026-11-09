export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/payments/order?orderNo= —— 订单状态查询（仅本人订单）
 * 供收银台页面（扫码页等）轮询支付结果；只读，不做任何入账动作。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const orderNo = request.nextUrl.searchParams.get("orderNo");
    if (!orderNo) return NextResponse.json({ error: "缺少 orderNo" }, { status: 400 });

    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (!billingModel) return NextResponse.json({ error: "账单表不可用" }, { status: 500 });

    const order = await billingModel.findUnique({ where: { id: orderNo } });
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.userId !== auth.user.id) return NextResponse.json({ error: "无权查看该订单" }, { status: 403 });

    const meta = (order.metadata || {}) as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      data: {
        orderNo: order.id,
        title: order.title,
        type: order.type,
        amountCents: Number(order.amount ?? 0),
        points: Number(meta.points ?? 0),
        seats: Number(meta.seats ?? 0),
        status: order.status,
        channel: order.channel,
        expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
        codeUrl: typeof meta.codeUrl === "string" ? meta.codeUrl : null,
      },
    });
  } catch (error) {
    console.error("[payments/order] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ error: "查询订单失败" }, { status: 500 });
  }
}
