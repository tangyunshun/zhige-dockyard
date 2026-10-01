export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { grantPoints, getBalanceSummary } from "@/lib/credit-service";
import { resolvePaymentMode } from "@/lib/payment-gateway";

/**
 * 模拟支付：收银台确认（**唯一在模拟模式下产生入账动作的地方**）
 *
 * GET  /api/payments/mock/confirm?orderNo=xxx   查询订单信息（无副作用）
 * POST /api/payments/mock/confirm               body { orderNo } 确认收款并入账
 *
 * 安全约束：
 *  1. 仅当 PAYMENT_MODE 为模拟模式时可用（真实模式下必须走网关回调，杜绝伪造支付）；
 *  2. 以 orderNo 作为 grantPoints 幂等键，重复点击只会入账一次；
 *  3. 订单必须是 PENDING 才可入账，已 SUCCESS 的直接返回成功（幂等），其他状态 409。
 */
function getBillingModel() {
  return (prisma as any).billing_record || (prisma as any).billingrecord;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const orderNo = (request.nextUrl.searchParams.get("orderNo") || "").trim();
    if (!orderNo) return NextResponse.json({ error: "缺少 orderNo" }, { status: 400 });

    const billingModel = getBillingModel();
    const order = await billingModel.findUnique({ where: { id: orderNo } });
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.userId !== auth.user.id) return NextResponse.json({ error: "无权查看该订单" }, { status: 403 });

    const meta = (order.metadata || {}) as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      data: {
        orderNo: order.id,
        title: order.title,
        amountCents: Number(order.amount ?? 0),
        points: Number(meta.points ?? 0),
        status: order.status,
        channel: order.channel,
        paymentMode: resolvePaymentMode(),
        discountPercent: Number(meta.discountPercent ?? 0),
        discountLabel: String(meta.discountLabel ?? ""),
        workspaceId: order.workspaceId,
      },
    });
  } catch (error) {
    console.error("[mock-confirm] 查询订单失败:", (error as Error)?.message);
    return NextResponse.json({ error: "查询订单失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const mode = resolvePaymentMode();
    if (mode !== "MOCK") {
      return NextResponse.json({ error: "当前为真实支付模式，禁止使用模拟确认入账" }, { status: 403 });
    }

    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const { orderNo } = (await request.json().catch(() => ({}))) as { orderNo?: string };
    if (!orderNo) return NextResponse.json({ error: "缺少 orderNo" }, { status: 400 });

    const billingModel = getBillingModel();
    const order = await billingModel.findUnique({ where: { id: orderNo } });
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.userId !== auth.user.id) return NextResponse.json({ error: "无权操作该订单" }, { status: 403 });

    const meta = (order.metadata || {}) as Record<string, unknown>;

    // 幂等：已完成入账的订单直接返回成功，不重复加点
    if (order.status === "SUCCESS") {
      const balance = await getBalanceSummary(auth.user.id, order.workspaceId);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        points: Number(meta.points ?? 0),
        balance,
        message: "该订单此前已完成入账，未重复扣款。",
      });
    }
    if (order.status !== "PENDING") {
      return NextResponse.json({ error: `订单当前状态为 ${order.status}，不可入账` }, { status: 409 });
    }

    const points = Number(meta.points ?? 0);
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json({ error: "订单缺少有效点数，无法入账" }, { status: 400 });
    }

    const workspaceId = order.workspaceId as string;
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true, name: true } });
    const scope: "WALLET" | "WORKSPACE" = ws?.type === "ENTERPRISE" ? "WORKSPACE" : "WALLET";

    const grant = await grantPoints({
      scope,
      userId: auth.user.id,
      workspaceId,
      points,
      sourceType: "RECHARGE",
      type: "RECHARGE",
      title: order.title,
      amountCents: Number(order.amount ?? 0),
      paymentMethod: `MOCK_${order.channel || "ONLINE_PAY"}`,
      orderNo: order.id,
      sourceId: order.id,
      workspaceType: ws?.type ?? null,
      workspaceName: ws?.name ?? null,
      remark: "模拟支付入账（非真实收款，仅用于流程联调）",
      // 幂等键：与本订单号绑定，重复确认只入账一次
      idempotencyKey: order.id,
    });

    await billingModel.update({
      where: { id: orderNo },
      data: {
        status: "SUCCESS",
        updatedAt: new Date(),
        metadata: {
          ...meta,
          paidAt: new Date().toISOString(),
          paymentMode: "MOCK",
          grantLedgerId: grant.ledgerId,
        },
      },
    });

    const balance = await getBalanceSummary(auth.user.id, workspaceId);
    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      points,
      balance,
      message: `模拟收款成功，已入账 ${points.toLocaleString()} 算力点（非真实扣款）`,
    });
  } catch (error) {
    console.error("[mock-confirm] 入账失败:", (error as Error)?.message);
    return NextResponse.json({ error: (error as Error)?.message || "模拟支付入账失败" }, { status: 500 });
  }
}
