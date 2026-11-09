import { prisma } from "@/lib/prisma";
import { grantPoints } from "@/lib/credit-service";
import { isOrderExpired } from "@/lib/order-expiry";

/**
 * 支付成功后的统一入账服务：真实回调（微信/支付宝）与模拟确认共用同一套状态机。
 *
 * 状态机（缺一不可）：
 * 1. 订单不存在 → 拒绝；
 * 2. 已 SUCCESS → 幂等返回（不重复入账）；
 * 3. 非 PENDING（EXPIRED/FAILED）→ 拒绝；
 * 4. 本地已过支付截止时间 → 落库置 EXPIRED 并拒绝（迟到回调）；
 * 5. 按订单类型入账（RECHARGE 加点 / SEAT_ADDON 加席位 / PLAN_UPGRADE 开通企业空间），
 *    全部以 order.id 作幂等键（grantPoints 去重 + idempotent 状态检查），重复通知零副作用。
 */

export interface FulfillOrderInput {
  orderNo: string;
  /** 支付方式标记（写入流水，如 WECHAT_PAY / ALIPAY） */
  paymentMethod: string;
  /** 流水备注 */
  remark: string;
  paymentMode: string;
  /** 网关侧交易号（写入 metadata 便于对账） */
  gatewayTransactionId?: string | null;
  /** 网关侧实付金额（分），用于与订单金额核对 */
  gatewayAmountCents?: number | null;
}

export interface FulfillOrderResult {
  ok: boolean;
  status: "FULFILLED" | "ALREADY_PROCESSED" | "REJECTED";
  error?: string;
  points?: number;
  seats?: number;
  workspaceId?: string | null;
}

function getBillingModel() {
  return (prisma as any).billing_record || (prisma as any).billingrecord;
}

export async function fulfillPaidOrder(input: FulfillOrderInput): Promise<FulfillOrderResult> {
  const billingModel = getBillingModel();
  if (!billingModel) return { ok: false, status: "REJECTED", error: "账单表不可用" };

  const order = await billingModel.findUnique({ where: { id: input.orderNo } });
  if (!order) return { ok: false, status: "REJECTED", error: "订单不存在" };

  // 幂等：已入账订单直接返回成功（微信/支付宝会重发通知）
  if (order.status === "SUCCESS") {
    return { ok: true, status: "ALREADY_PROCESSED", workspaceId: order.workspaceId ?? null };
  }
  if (order.status !== "PENDING") {
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${order.status}，不可入账` };
  }
  // 迟到回调：本地已过支付截止时间 → 落库 EXPIRED 并拒绝
  if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
    await billingModel.update({ where: { id: input.orderNo }, data: { status: "EXPIRED", updatedAt: new Date() } }).catch(() => {});
    return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
  }

  // 金额核对：网关侧金额必须与订单金额一致（分），不一致属于严重异常，拒绝入账并保留原状供人工排查
  if (input.gatewayAmountCents != null && Number(order.amount) !== Number(input.gatewayAmountCents)) {
    console.error(
      `[fulfill] 金额不一致！订单 ${input.orderNo} 本地=${order.amount} 网关=${input.gatewayAmountCents}，拒绝入账`,
    );
    return { ok: false, status: "REJECTED", error: "回调金额与订单金额不一致，拒绝入账" };
  }

  const meta = (order.metadata || {}) as Record<string, unknown>;
  const orderType = (order.type || "TOKEN_RECHARGE") as string;
  const markSuccess = (extra: Record<string, unknown>) =>
    billingModel.update({
      where: { id: input.orderNo },
      data: {
        status: "SUCCESS",
        updatedAt: new Date(),
        metadata: { ...meta, paidAt: new Date().toISOString(), paymentMode: input.paymentMode, ...extra },
      },
    });

  // 席位增购
  if (orderType === "SEAT_ADDON") {
    const seats = Number(meta.seats ?? 0);
    if (!Number.isFinite(seats) || seats <= 0) {
      return { ok: false, status: "REJECTED", error: "订单缺少有效席位数" };
    }
    const workspaceId = order.workspaceId as string;
    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({ where: { id: workspaceId }, data: { extraSeats: { increment: seats } } });
      await billingModel.update({
        where: { id: input.orderNo },
        data: {
          status: "SUCCESS",
          updatedAt: new Date(),
          metadata: {
            ...meta,
            paidAt: new Date().toISOString(),
            paymentMode: input.paymentMode,
            gatewayTransactionId: input.gatewayTransactionId ?? null,
            seatsAdded: seats,
          },
        },
      });
    });
    return { ok: true, status: "FULFILLED", seats, workspaceId };
  }

  // 企业空间开通
  if (orderType === "PLAN_UPGRADE") {
    const { fulfillEnterpriseUpgradeFromOrder } = await import("@/lib/workspace-upgrade-service");
    const fulfillment = await fulfillEnterpriseUpgradeFromOrder(input.orderNo);
    await markSuccess({ newWorkspaceId: fulfillment.newWorkspaceId, gatewayTransactionId: input.gatewayTransactionId ?? null });
    return { ok: true, status: "FULFILLED", workspaceId: fulfillment.newWorkspaceId };
  }

  // 算力点充值（默认类型）
  const points = Number(meta.points ?? 0);
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, status: "REJECTED", error: "订单缺少有效点数" };
  }
  const workspaceId = order.workspaceId as string;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true, name: true } });
  const scope: "WALLET" | "WORKSPACE" = ws?.type === "ENTERPRISE" ? "WORKSPACE" : "WALLET";

  const grant = await grantPoints({
    scope,
    userId: order.userId,
    workspaceId,
    points,
    sourceType: "RECHARGE",
    type: "RECHARGE",
    title: order.title,
    amountCents: Number(order.amount ?? 0),
    paymentMethod: input.paymentMethod,
    orderNo: order.id,
    sourceId: order.id,
    workspaceType: ws?.type ?? null,
    workspaceName: ws?.name ?? null,
    remark: input.remark,
    // 幂等键：绑定订单号，重复通知只入账一次
    idempotencyKey: order.id,
  });

  await markSuccess({ grantLedgerId: grant.ledgerId, gatewayTransactionId: input.gatewayTransactionId ?? null });
  return { ok: true, status: "FULFILLED", points, workspaceId };
}
