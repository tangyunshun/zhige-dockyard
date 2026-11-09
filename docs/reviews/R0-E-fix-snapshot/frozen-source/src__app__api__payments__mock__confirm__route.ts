export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { grantPoints, getBalanceSummary } from "@/lib/credit-service";
import { resolvePaymentMode } from "@/lib/payment-gateway";
import { isOrderExpired } from "@/lib/order-expiry";
import { fulfillEnterpriseUpgradeFromOrder } from "@/lib/workspace-upgrade-service";

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

/** 已入账订单的幂等响应（按订单类型区分）；[R0-B1 F1] 超时竞争落败复用同一契约 */
async function alreadyProcessedPayload(o: any) {
  const m = (o.metadata || {}) as Record<string, unknown>;
  const t = (o.type || "TOKEN_RECHARGE") as string;
  if (t === "SEAT_ADDON") {
    return {
      success: true,
      alreadyProcessed: true,
      seats: Number(m.seatsAdded ?? m.seats ?? 0),
      message: "该订单此前已完成入账，未重复扣款。",
    };
  }
  if (t === "PLAN_UPGRADE") {
    return {
      success: true,
      alreadyProcessed: true,
      workspaceId: String(m.newWorkspaceId ?? ""),
      message: "该订单此前已完成入账，企业空间已开通。",
    };
  }
  const balance = await getBalanceSummary(o.userId, o.workspaceId);
  return {
    success: true,
    alreadyProcessed: true,
    points: Number(m.points ?? 0),
    balance,
    message: "该订单此前已完成入账，未重复扣款。",
  };
}

export async function GET(request: NextRequest) {
  try {
    // KN-SEC：模拟收银台整条链路（含订单详情查询）仅 MOCK 模式可用，REAL 模式不泄露任何订单信息
    if (resolvePaymentMode() !== "MOCK") {
      return NextResponse.json({ error: "当前为真实支付模式，模拟收银台不可用" }, { status: 403 });
    }
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
        type: order.type || "TOKEN_RECHARGE",
        amountCents: Number(order.amount ?? 0),
        points: Number(meta.points ?? 0),
        seats: Number(meta.seats ?? 0),
        status: order.status,
        channel: order.channel,
        paymentMode: resolvePaymentMode(),
        discountPercent: Number(meta.discountPercent ?? 0),
        discountLabel: String(meta.discountLabel ?? ""),
        workspaceId: order.workspaceId,
        planName: String(meta.planName ?? ""),
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
    const orderType = (order.type || "TOKEN_RECHARGE") as string;

    // 幂等：已完成入账的订单直接返回成功，不重复执行
    if (order.status === "SUCCESS") {
      return NextResponse.json(await alreadyProcessedPayload(order));
    }
    if (order.status !== "PENDING") {
      return NextResponse.json({ error: `订单当前状态为 ${order.status}，不可入账` }, { status: 409 });
    }
    // 订单生命周期：超时未付的订单不可再入账。
    // [R0-B1 F1] 条件关闭：仅仍为 PENDING 且确实过截止的记录才可置 EXPIRED；竞争失败
    // （另一请求刚提交 SUCCESS）按最新状态分类返回"已处理"，不覆盖已完成权益。
    if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
      const expired = await billingModel.updateMany({
        where: { id: orderNo, status: "PENDING" },
        data: { status: "EXPIRED", updatedAt: new Date() },
      });
      if (expired.count !== 1) {
        const latest = await billingModel.findUnique({ where: { id: orderNo } });
        if (latest?.status === "SUCCESS") {
          return NextResponse.json(await alreadyProcessedPayload(latest));
        }
        if (latest?.status === "PENDING") {
          return NextResponse.json({ error: "订单状态处理冲突，请稍后重试" }, { status: 409 });
        }
        return NextResponse.json(
          { error: `订单当前状态为 ${latest?.status}，不可入账` },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "订单已超时未支付（超过支付截止时间），请重新下单" }, { status: 409 });
    }

    // 席位增购：[R0-B] 与真实回调共用席位专用履约服务（同一状态机、同一入账规则）：
    // 事务写边界条件更新裁决唯一履约权，席位增量与订单状态同事务原子提交/回滚。
    // MOCK 无网关实付金额（isRealPayment=false），paymentMode 如实记录为 MOCK，不冒充真实收入。
    if (orderType === "SEAT_ADDON") {
      const { fulfillSeatAddonOrder } = await import("@/lib/payment/seat-addon-fulfill");
      const fulfillment = await fulfillSeatAddonOrder({
        orderNo,
        paymentMode: "MOCK",
        isRealPayment: false,
        gatewayTransactionId: null,
        gatewayAmountCents: null,
      });
      if (!fulfillment.ok) {
        // 暂时冲突/可重试故障 → 503；其余拒绝（含损坏订单/状态不可入账）→ 409，保留错误说明
        const httpStatus = fulfillment.retryable ? 503 : 409;
        return NextResponse.json({ error: fulfillment.error }, { status: httpStatus });
      }
      if (fulfillment.status === "ALREADY_PROCESSED") {
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          seats: fulfillment.seats,
          message: "该订单此前已完成入账，未重复扣款。",
        });
      }
      return NextResponse.json({
        success: true,
        alreadyProcessed: false,
        seats: fulfillment.seats,
        message: `模拟收款成功，已为空间增购 ${fulfillment.seats} 个席位（非真实扣款）`,
      });
    }

    // 企业空间升级：支付确认后真正开通企业空间（含孤儿补偿，幂等）
    if (orderType === "PLAN_UPGRADE") {
      const fulfillment = await fulfillEnterpriseUpgradeFromOrder(orderNo);
      await billingModel.update({
        where: { id: orderNo },
        data: {
          status: "SUCCESS",
          updatedAt: new Date(),
          metadata: {
            ...meta,
            paidAt: new Date().toISOString(),
            paymentMode: "MOCK",
            newWorkspaceId: fulfillment.newWorkspaceId,
          },
        },
      });
      return NextResponse.json({
        success: true,
        alreadyProcessed: false,
        workspaceId: fulfillment.newWorkspaceId,
        message: `模拟收款成功，企业空间已开通（${fulfillment.message}）`,
      });
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
