import { prisma } from "@/lib/prisma";
import { isOrderExpired } from "@/lib/order-expiry";

/**
 * [R0-B] 席位增购（SEAT_ADDON）专用履约服务 —— REAL 回调与 MOCK 模拟确认共用同一份状态机。
 *
 * 业务保证：
 * A. 唯一履约权：在数据库事务写边界用「带 PENDING 条件的原子 updateMany + count 判断」裁决
 *    同一订单；只有胜者能增加席位并记录本次履约。并发/重复请求即使都在事务外读到 PENDING，
 *    也只有一个能通过条件更新（其余 count=0 → 回滚后重读分类）。不靠按钮禁用、进程内锁或事务外读。
 * B. 原子一致：席位增量、订单 SUCCESS 状态、履约记录（metadata.seatsAdded 等）全部使用
 *    同一个事务客户端（tx 账单模型），一起提交或回滚；事务回调内禁止根客户端写入。
 * C. REAL/MOCK 同一规则：入账校验完全一致；REAL 额外要求受控回调验证的实付金额且与订单一致，
 *    MOCK 不伪造真实收入（paymentMode 如实写入 metadata）。
 * D. 发权益前校验：订单类型/状态/有效期、席位正安全整数（不 Math.floor 猜损坏订单）、
 *    金额合法性、目标空间存在且为企业空间、extraSeats 相加不溢出、套餐到期基准一致；
 *    无法安全履约时明确拒绝并保留证据，不伪装成功、不擅自退款（订单保持原状供人工处置）。
 *
 * 状态机：仅 PENDING 可被条件更新为 SUCCESS；FAILED/EXPIRED/REFUNDED 等不会被覆盖。
 * 竞争失败后区分：已完成（SUCCESS → ALREADY_PROCESSED）/ 不可处理（非 PENDING → REJECTED）/
 * 暂时冲突（仍 PENDING → 可重试 REJECTED）。
 */

/** Prisma Int 上限（extraSeats 为 Int 列） */
const MAX_DB_INT = 2147483647;

export interface SeatFulfillInput {
  orderNo: string;
  /** 支付模式，如实写入履约记录（REAL 回调传 REAL，模拟确认传 MOCK） */
  paymentMode: string;
  /** 是否真实收款来源：真实网关回调 true（强制要求合法实付金额）；模拟确认 false */
  isRealPayment: boolean;
  /** 网关侧交易号（写入履约记录便于对账；模拟确认无） */
  gatewayTransactionId?: string | null;
  /** 网关侧实付金额（分）：isRealPayment 时必填且必须与订单金额一致 */
  gatewayAmountCents?: number | null;
}

export type SeatFulfillResult =
  | { ok: true; status: "FULFILLED"; seats: number; workspaceId: string }
  | { ok: true; status: "ALREADY_PROCESSED"; seats: number; workspaceId: string | null }
  | { ok: false; status: "REJECTED"; error: string; /** true 表示暂时冲突/故障，可安全重试 */
      retryable?: boolean };

function getBillingModel(client?: unknown) {
  const c = (client ?? prisma) as Record<string, any>;
  return c.billing_record || c.billingrecord;
}

export async function fulfillSeatAddonOrder(input: SeatFulfillInput): Promise<SeatFulfillResult> {
  const billingModel = getBillingModel();
  if (!billingModel) return { ok: false, status: "REJECTED", error: "账单表不可用" };

  // ── 1. 事务外预读：快速失败与分类，不作为履约依据（履约权在事务写边界裁决） ──
  const order = await billingModel.findUnique({ where: { id: input.orderNo } });
  if (!order) return { ok: false, status: "REJECTED", error: "订单不存在" };
  if (order.type !== "SEAT_ADDON") {
    return { ok: false, status: "REJECTED", error: "订单类型非席位增购，拒绝按席位入账" };
  }
  // 幂等：已入账订单直接返回已处理（真实回调会重发通知）
  if (order.status === "SUCCESS") {
    const meta = (order.metadata || {}) as Record<string, unknown>;
    return {
      ok: true,
      status: "ALREADY_PROCESSED",
      seats: Number(meta.seatsAdded ?? meta.seats ?? 0),
      workspaceId: (order.workspaceId as string) ?? null,
    };
  }
  if (order.status !== "PENDING") {
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${order.status}，不可入账` };
  }
  // 迟到回调：本地已过支付截止时间 → 落库 EXPIRED 并拒绝（单字段状态迁移，不涉及权益）
  if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
    await billingModel
      .update({ where: { id: input.orderNo }, data: { status: "EXPIRED", updatedAt: new Date() } })
      .catch(() => {});
    return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
  }

  // ── 2. 金额校验（REAL 必须有受控回调验证的实付金额且与订单一致；损坏金额拒绝并留证据） ──
  const orderAmount = Number(order.amount);
  if (!Number.isSafeInteger(orderAmount) || orderAmount <= 0) {
    console.error(`[seat-fulfill] 订单 ${input.orderNo} 金额无效（${order.amount}），拒绝入账，请人工核查`);
    return { ok: false, status: "REJECTED", error: "订单金额无效，拒绝入账，请人工核查" };
  }
  if (input.isRealPayment) {
    const paid = input.gatewayAmountCents;
    if (paid == null || !Number.isSafeInteger(paid) || paid <= 0) {
      return { ok: false, status: "REJECTED", error: "缺少合法的网关实付金额，拒绝入账" };
    }
    if (paid !== orderAmount) {
      console.error(
        `[seat-fulfill] 金额不一致！订单 ${input.orderNo} 本地=${orderAmount} 网关=${paid}，拒绝入账`,
      );
      return { ok: false, status: "REJECTED", error: "回调金额与订单金额不一致，拒绝入账" };
    }
  }

  // ── 3. 订单可信数据校验（发放权益前；损坏订单拒绝并保留证据，不猜成有效） ──
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const seatsRaw = meta.seats as unknown;
  if (typeof seatsRaw !== "number" || !Number.isSafeInteger(seatsRaw) || seatsRaw <= 0) {
    console.error(`[seat-fulfill] 订单 ${input.orderNo} 席位数无效（${String(seatsRaw)}），拒绝入账，请人工核查`);
    return { ok: false, status: "REJECTED", error: "订单席位数无效，拒绝入账，请人工核查" };
  }
  const seats = seatsRaw;
  const workspaceId = typeof order.workspaceId === "string" && order.workspaceId ? order.workspaceId : "";
  if (!workspaceId) {
    return { ok: false, status: "REJECTED", error: "订单缺少目标空间，拒绝入账，请人工核查" };
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, type: true, extraSeats: true, planExpiresAt: true },
  });
  if (!workspace) {
    return { ok: false, status: "REJECTED", error: "目标空间不存在，拒绝入账，请人工核查" };
  }
  if (workspace.type !== "ENTERPRISE") {
    return { ok: false, status: "REJECTED", error: "目标空间类型已变化，拒绝入账，请人工核查" };
  }
  if (!workspace.planExpiresAt) {
    return { ok: false, status: "REJECTED", error: "目标空间套餐未设置到期时间，拒绝入账，请人工核查" };
  }
  const planExpiresMs = new Date(workspace.planExpiresAt).getTime();
  if (!Number.isFinite(planExpiresMs) || planExpiresMs <= Date.now()) {
    return { ok: false, status: "REJECTED", error: "套餐已到期，席位折算基准失效，拒绝入账，请人工核查" };
  }
  // 下单时记录的套餐到期日与当前不一致（已续费/变更）→ 折算基准失效，拒绝并人工处置
  const orderExpiresAt = typeof meta.expiresAt === "string" ? meta.expiresAt : null;
  if (orderExpiresAt) {
    const orderExpMs = new Date(orderExpiresAt).getTime();
    if (!Number.isFinite(orderExpMs) || orderExpMs !== planExpiresMs) {
      console.error(
        `[seat-fulfill] 订单 ${input.orderNo} 到期基准变化：下单=${orderExpiresAt} 当前=${new Date(planExpiresMs).toISOString()}，拒绝入账，请人工核查`,
      );
      return { ok: false, status: "REJECTED", error: "套餐到期时间已变化，席位折算基准失效，拒绝入账，请人工核查" };
    }
  }
  const currentExtra = Number(workspace.extraSeats ?? 0);
  if (!Number.isSafeInteger(currentExtra) || currentExtra < 0) {
    return { ok: false, status: "REJECTED", error: "空间现有席位数异常，拒绝入账，请人工核查" };
  }
  if (seats > MAX_DB_INT - currentExtra) {
    return { ok: false, status: "REJECTED", error: "席位增量超出存储上限，拒绝入账，请人工核查" };
  }

  // ── 4. 事务：写边界条件更新争夺唯一履约权 → 席位增量（同一 tx，原子提交/回滚） ──
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const txBilling = getBillingModel(tx);
      // 唯一履约权：仅 PENDING 可被条件更新为 SUCCESS；并发/重复请求只有一个 count=1
      const claimed = await txBilling.updateMany({
        where: { id: input.orderNo, status: "PENDING" },
        data: {
          status: "SUCCESS",
          updatedAt: now,
          metadata: {
            ...meta,
            paidAt: now.toISOString(),
            paymentMode: input.paymentMode,
            gatewayTransactionId: input.gatewayTransactionId ?? null,
            seatsAdded: seats,
          },
        },
      });
      if (claimed.count !== 1) {
        // 未获得履约权：抛错回滚（本事务无任何写入），由外层重读分类
        throw new Error("SEAT_CLAIM_LOST");
      }
      // 席位增量：与订单状态同一事务客户端，同提交同回滚
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { extraSeats: { increment: seats } },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SEAT_CLAIM_LOST") {
      // 事务已回滚；用根客户端重读当前状态分类（事务内快照可能滞后，不在事务内判断）
      const latest = await billingModel.findUnique({ where: { id: input.orderNo } });
      if (latest?.status === "SUCCESS") {
        const latestMeta = (latest.metadata || {}) as Record<string, unknown>;
        return {
          ok: true,
          status: "ALREADY_PROCESSED",
          seats: Number(latestMeta.seatsAdded ?? latestMeta.seats ?? 0),
          workspaceId: (latest.workspaceId as string) ?? null,
        };
      }
      if (latest?.status === "PENDING") {
        // 竞争对方尚未提交：暂时冲突，可安全重试
        return { ok: false, status: "REJECTED", error: "履约权竞争冲突，请稍后重试", retryable: true };
      }
      return { ok: false, status: "REJECTED", error: `订单当前状态为 ${latest?.status}，不可入账` };
    }
    // 真实故障：席位与订单状态同回滚，订单保持 PENDING 可安全重试；不吞异常、不伪装成功、不擅自退款
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 履约事务失败（已回滚，订单保持 PENDING，可安全重试）:`,
      (err as Error)?.message,
    );
    return {
      ok: false,
      status: "REJECTED",
      error: "席位履约事务失败，订单保持待支付状态，可安全重试",
      retryable: true,
    };
  }

  return { ok: true, status: "FULFILLED", seats, workspaceId };
}
