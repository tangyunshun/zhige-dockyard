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
  status: "FULFILLED" | "ALREADY_PROCESSED" | "RECEIPT_PENDING_RECOVERY" | "REJECTED";
  error?: string;
  points?: number;
  seats?: number;
  workspaceId?: string | null;
}

function getBillingModel() {
  return (prisma as any).billing_record || (prisma as any).billingrecord;
}

/**
 * [R1] 收款事实核验：真实网关回调须携带受控验签后的交易号与实付金额，且金额与订单一致。
 * 缺交易号/金额或金额不符 → 拒绝；杜绝以 null 或仅验签就入账。
 * 仅用于取消/超时后收到已验收款这类「需留存待恢复事实」的分支；普通 PENDING 入账沿用原有
 * 「金额若提供必须一致」的轻量校验，避免改动已签收的 F05 幂等契约（r0b 基线不传交易号）。
 */
function receiptVerified(input: FulfillOrderInput, order: { amount?: unknown }): { ok: boolean; error?: string } {
  if (!input.gatewayTransactionId) return { ok: false, error: "缺少网关交易号，拒绝入账" };
  if (input.gatewayAmountCents == null) return { ok: false, error: "缺少网关实付金额，拒绝入账" };
  if (Number(order.amount) !== Number(input.gatewayAmountCents)) {
    return { ok: false, error: "回调金额与订单金额不一致，拒绝入账" };
  }
  return { ok: true };
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

  // [R1] 同一渠道交易号不可支撑多个独立订单：若已被其他 SUCCESS 订单占用，拒绝后续履约。
  // （业务交易唯一约束，与 order.id 幂等键的「持久化事件去重」分离；未提供交易号时跳过此检查。）
  if (input.gatewayTransactionId) {
    const dup = await billingModel.findFirst({
      where: {
        status: "SUCCESS",
        id: { not: input.orderNo },
        metadata: { path: ["gatewayTransactionId"], equals: input.gatewayTransactionId },
      },
    });
    if (dup) {
      console.warn(`[fulfill] 渠道交易号 ${input.gatewayTransactionId} 已被订单 ${dup.id} 使用，拒绝重复履约`);
      return { ok: false, status: "REJECTED", error: "该渠道交易号已被其他订单使用，拒绝重复履约" };
    }
  }

  // [R1] 取消/超时后确已收款：保留可信收款事实进入「待运营恢复」状态，不发放、不丢钱。
  // 网关重试时返回成功 ACK（ok:true）以停止重发；资金发放交由第 11 批复用恢复服务处理。
  if (order.status === "CANCELLED" || order.status === "EXPIRED") {
    const v = receiptVerified(input, order);
    if (!v.ok) return { ok: false, status: "REJECTED", error: v.error };
    const meta = (order.metadata || {}) as Record<string, unknown>;
    const existing = meta.pendingReceipt as { gatewayTransactionId?: string } | undefined;
    if (existing?.gatewayTransactionId === input.gatewayTransactionId) {
      return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
    }
    await billingModel.update({
      where: { id: input.orderNo },
      data: {
        metadata: {
          ...meta,
          pendingReceipt: {
            gatewayTransactionId: input.gatewayTransactionId,
            gatewayAmountCents: input.gatewayAmountCents,
            channel: input.paymentMethod,
            recordedAt: new Date().toISOString(),
            recoverable: true,
          },
        },
      },
    });
    console.warn(`[fulfill] 订单 ${input.orderNo} 已${order.status}，但收到已验收款，已留存待恢复事实（未发放）`);
    return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
  }

  if (order.status !== "PENDING") {
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${order.status}，不可入账` };
  }
  // 迟到回调：本地已过支付截止时间 → 条件关闭（仅仍为 PENDING 的记录可置 EXPIRED）并拒绝。
  // [R0-B1 F1] 禁止按旧读直接按 id 把订单改为 EXPIRED：条件更新 count=0 说明另一请求刚提交
  // SUCCESS（或状态已被其他终态处理），按最新状态分类，不覆盖已完成权益。
  // [R1] 若迟到回调确已收款（交易号+金额一致），优先留存待恢复事实而非直接拒绝丢钱。
  if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
    const v = receiptVerified(input, order);
    if (v.ok) {
      const meta = (order.metadata || {}) as Record<string, unknown>;
      const existing = meta.pendingReceipt as { gatewayTransactionId?: string } | undefined;
      if (existing?.gatewayTransactionId !== input.gatewayTransactionId) {
        await billingModel.update({
          where: { id: input.orderNo },
          data: {
            metadata: {
              ...meta,
              pendingReceipt: {
                gatewayTransactionId: input.gatewayTransactionId,
                gatewayAmountCents: input.gatewayAmountCents,
                channel: input.paymentMethod,
                recordedAt: new Date().toISOString(),
                recoverable: true,
              },
            },
          },
        });
      }
      console.warn(`[fulfill] 订单 ${input.orderNo} 已超时但收到已验收款，已留存待恢复事实（未发放）`);
      return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
    }
    const expired = await billingModel.updateMany({
      where: { id: input.orderNo, status: "PENDING" },
      data: { status: "EXPIRED", updatedAt: new Date() },
    });
    if (expired.count === 1) {
      return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
    }
    const latest = await billingModel.findUnique({ where: { id: input.orderNo } });
    if (latest?.status === "SUCCESS") {
      return { ok: true, status: "ALREADY_PROCESSED", workspaceId: latest.workspaceId ?? null };
    }
    if (latest?.status === "PENDING") {
      return { ok: false, status: "REJECTED", error: "支付截止判断冲突，请稍后重试" };
    }
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${latest?.status}，不可入账` };
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

  // 席位增购：[R0-B] 统一走席位专用履约服务（与模拟确认同一状态机）：
  // 事务写边界条件更新裁决唯一履约权，席位增量与订单状态同事务提交/回滚；
  // REAL 必须携带受控回调验证的实付金额且与订单一致，否则拒绝入账。
  if (orderType === "SEAT_ADDON") {
    const { fulfillSeatAddonOrder } = await import("@/lib/payment/seat-addon-fulfill");
    return fulfillSeatAddonOrder({
      orderNo: input.orderNo,
      paymentMode: input.paymentMode,
      isRealPayment: true,
      gatewayTransactionId: input.gatewayTransactionId ?? null,
      gatewayAmountCents: input.gatewayAmountCents ?? null,
    });
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
