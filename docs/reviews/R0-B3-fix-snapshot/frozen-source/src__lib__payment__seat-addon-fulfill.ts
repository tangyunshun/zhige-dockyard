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
  // 迟到回调：本地已过支付截止时间 → 条件关闭（仅仍为 PENDING 的记录可置 EXPIRED）并拒绝。
  // [R0-B1 F1] 超时关闭与成功履约竞争同一订单状态：条件更新 count=0 说明另一请求刚提交
  // SUCCESS（或状态已被其他终态处理），按最新状态分类，绝不把已成功订单覆盖成 EXPIRED。
  if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
    const expired = await billingModel.updateMany({
      where: { id: input.orderNo, status: "PENDING" },
      data: { status: "EXPIRED", updatedAt: new Date() },
    });
    if (expired.count === 1) {
      return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
    }
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
      return { ok: false, status: "REJECTED", error: "支付截止判断冲突，请稍后重试", retryable: true };
    }
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${latest?.status}，不可入账` };
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
    select: {
      id: true,
      type: true,
      status: true,
      extraSeats: true,
      plan: true,
      planBillingCycle: true,
      planExpiresAt: true,
    },
  });
  if (!workspace) {
    return { ok: false, status: "REJECTED", error: "目标空间不存在，拒绝入账，请人工核查" };
  }
  if (workspace.type !== "ENTERPRISE") {
    return { ok: false, status: "REJECTED", error: "目标空间类型已变化，拒绝入账，请人工核查" };
  }
  // [R0-B1 F2] 空间可写状态（与 assertWorkspaceWritable 同一规则：ARCHIVED/DISABLED 不可写）
  if (workspace.status === "ARCHIVED" || workspace.status === "DISABLED") {
    return { ok: false, status: "REJECTED", error: "目标空间已归档或停用，拒绝入账，请人工核查" };
  }
  if (!workspace.planExpiresAt) {
    return { ok: false, status: "REJECTED", error: "目标空间套餐未设置到期时间，拒绝入账，请人工核查" };
  }
  const planExpiresMs = new Date(workspace.planExpiresAt).getTime();
  if (!Number.isFinite(planExpiresMs) || planExpiresMs <= Date.now()) {
    return { ok: false, status: "REJECTED", error: "套餐已到期，席位折算基准失效，拒绝入账，请人工核查" };
  }
  // [R0-B1 F2] 下单记录的可信报价事实（planKey/billingCycle/expiresAt）必须齐全且与当前一致；
  // 缺失或变化不默认当前配置补齐，明确拒绝列人工核查，不改历史订单、不擅自退款。
  const orderPlanKey = typeof meta.planKey === "string" && meta.planKey ? meta.planKey : null;
  if (!orderPlanKey) {
    return { ok: false, status: "REJECTED", error: "订单缺少套餐标识（planKey），无法确定原报价，拒绝入账，请人工核查" };
  }
  if (workspace.plan !== orderPlanKey) {
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 套餐变化：下单=${orderPlanKey} 当前=${workspace.plan}，拒绝入账，请人工核查`,
    );
    return { ok: false, status: "REJECTED", error: "套餐与下单记录不一致，席位折算基准失效，拒绝入账，请人工核查" };
  }
  const orderCycle = typeof meta.billingCycle === "string" && meta.billingCycle ? meta.billingCycle : null;
  // [R0-B2-2] 履约端独立核验订单计费周期属于合法集合（MONTH/YEAR）；缺失或非法（含历史损坏的
  // WEEK/null/空值）明确拒绝入账列人工核查，不默认 MONTH、不改历史数据。
  if (orderCycle && orderCycle !== "MONTH" && orderCycle !== "YEAR") {
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 计费周期非法：${orderCycle}，拒绝入账，请人工核查`,
    );
    return { ok: false, status: "REJECTED", error: "订单计费周期非法（仅支持月付/年付），拒绝入账，请人工核查" };
  }
  if (!orderCycle) {
    return { ok: false, status: "REJECTED", error: "订单缺少计费周期（billingCycle），无法确定原报价，拒绝入账，请人工核查" };
  }
  if ((workspace.planBillingCycle ?? null) !== orderCycle) {
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 计费周期变化：下单=${orderCycle} 当前=${workspace.planBillingCycle}，拒绝入账，请人工核查`,
    );
    return { ok: false, status: "REJECTED", error: "计费周期与下单记录不一致，席位折算基准失效，拒绝入账，请人工核查" };
  }
  const orderExpiresAt = typeof meta.expiresAt === "string" && meta.expiresAt ? meta.expiresAt : null;
  if (!orderExpiresAt) {
    return { ok: false, status: "REJECTED", error: "订单缺少到期基准（expiresAt），无法确定原报价，拒绝入账，请人工核查" };
  }
  const orderExpMs = new Date(orderExpiresAt).getTime();
  if (!Number.isFinite(orderExpMs) || orderExpMs !== planExpiresMs) {
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 到期基准变化：下单=${orderExpiresAt} 当前=${new Date(planExpiresMs).toISOString()}，拒绝入账，请人工核查`,
    );
    return { ok: false, status: "REJECTED", error: "套餐到期时间已变化，席位折算基准失效，拒绝入账，请人工核查" };
  }
  const currentExtra = Number(workspace.extraSeats ?? 0);
  if (!Number.isSafeInteger(currentExtra) || currentExtra < 0) {
    return { ok: false, status: "REJECTED", error: "空间现有席位数异常，拒绝入账，请人工核查" };
  }
  if (seats > MAX_DB_INT - currentExtra) {
    return { ok: false, status: "REJECTED", error: "席位增量超出存储上限，拒绝入账，请人工核查" };
  }

  // ── 4. 事务：写边界条件更新争夺唯一履约权 → 事务内重读 + 带关键事实条件的席位写入（同一 tx，原子提交/回滚） ──
  // [R0-B2-1] 授权裁决时刻 now 在进入事务/取得锁后计算（覆盖「预检通过、排队/取锁后才跨过截止」的窗口）：
  // 订单支付截止与套餐到期均在写边界用同一 now 重新核验，而非依赖事务外的旧 now。
  const expectedPlanKey = orderPlanKey;
  const expectedCycle = orderCycle;
  const expectedExpiresAt = new Date(planExpiresMs);
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const txBilling = getBillingModel(tx);
      // 唯一履约权：仅 PENDING 且支付截止未过可被条件更新为 SUCCESS；并发/重复请求只有一个 count=1。
      // 时间口径与 order-expiry 的 isOrderExpired 完全一致：过期定义为 now > expiresAt，
      // 故「仍可履约」= expiresAt >= now（gte，恰好相等不算过期）；expiresAt 为 null 的历史订单
      // 按 helper 原语义视为无截止、不过期，用 OR 显式保留，避免新增条件静默拒绝历史订单。
      // 预检通过后、进入事务/取锁前跨过支付截止的排队请求，因该条件 count=0，
      // 落回 SEAT_CLAIM_LOST 按最新状态分类，不再错误履约。
      const claimed = await txBilling.updateMany({
        where: {
          id: input.orderNo,
          status: "PENDING",
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
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
      // [R0-B1 F2] 事务内重读空间最新事实（并发订单同空间增量后重新核对溢出），
      // 席位写入带关键事实条件（type/plan/planBillingCycle/planExpiresAt/status）——
      // planExpiresAt 同时要求仍严格晚于裁决时刻（gt: now），以覆盖「预检后套餐到期、
      // 在实际写边界前变化」；检查之后发生的变化无法通过条件，count=0 即整体回滚。
      const wsNow = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true, type: true, status: true, extraSeats: true,
          plan: true, planBillingCycle: true, planExpiresAt: true,
        },
      });
      if (!wsNow || wsNow.type !== "ENTERPRISE" || wsNow.status === "ARCHIVED" || wsNow.status === "DISABLED") {
        throw new Error("SEAT_QUALIFICATION_LOST");
      }
      const wsExtra = Number(wsNow.extraSeats ?? 0);
      if (!Number.isSafeInteger(wsExtra) || wsExtra < 0 || seats > MAX_DB_INT - wsExtra) {
        throw new Error("SEAT_QUALIFICATION_LOST");
      }
      const seatWrite = await tx.workspace.updateMany({
        where: {
          id: workspaceId,
          type: "ENTERPRISE",
          status: { notIn: ["ARCHIVED", "DISABLED"] },
          plan: expectedPlanKey,
          planBillingCycle: expectedCycle,
          planExpiresAt: { gt: now, equals: expectedExpiresAt },
        },
        data: { extraSeats: { increment: seats } },
      });
      if (seatWrite.count !== 1) {
        // 资格/报价基准在检查后到写入前发生变化：与订单状态一起回滚，不产生"成功订单无权益"
        throw new Error("SEAT_QUALIFICATION_LOST");
      }
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
        // 本次未取得履约权：可能是竞争冲突，也可能是排队后已跨过支付截止。
        // 重新核验：确已过期则条件落 EXPIRED 并诚实拒绝；否则仍是暂时冲突，可安全重试。
        if (isOrderExpired(latest as { status: string; expiresAt?: Date | null })) {
          const setExp = await billingModel.updateMany({
            where: { id: input.orderNo, status: "PENDING" },
            data: { status: "EXPIRED", updatedAt: new Date() },
          });
          if (setExp.count === 1) {
            return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
          }
          const again = await billingModel.findUnique({ where: { id: input.orderNo } });
          if (again?.status === "SUCCESS") {
            const againMeta = (again.metadata || {}) as Record<string, unknown>;
            return {
              ok: true,
              status: "ALREADY_PROCESSED",
              seats: Number(againMeta.seatsAdded ?? againMeta.seats ?? 0),
              workspaceId: (again.workspaceId as string) ?? null,
            };
          }
          return { ok: false, status: "REJECTED", error: `订单当前状态为 ${again?.status}，不可入账` };
        }
        // 竞争对方尚未提交：暂时冲突，可安全重试
        return { ok: false, status: "REJECTED", error: "履约权竞争冲突，请稍后重试", retryable: true };
      }
      return { ok: false, status: "REJECTED", error: `订单当前状态为 ${latest?.status}，不可入账` };
    }
    if (err instanceof Error && err.message === "SEAT_QUALIFICATION_LOST") {
      // 资格/报价失效：订单状态与席位同回滚（订单保留 PENDING 原状供人工核查），不退款、不改历史账
      console.error(`[seat-fulfill] 订单 ${input.orderNo} 空间资格或报价基准在写入边界校验失败，已回滚，请人工核查`);
      return {
        ok: false,
        status: "REJECTED",
        error: "空间资格或报价基准已变化，席位未发放，请人工核查（订单保留待支付原状）",
      };
    }
    // 真实故障：席位与订单状态同回滚；不吞异常、不伪装成功、不擅自退款。
    // [R0-B1 F1] 不无条件断言"一定保持 PENDING"——提交结果以订单号查询核实为准，重试同一订单不会多发。
    console.error(
      `[seat-fulfill] 订单 ${input.orderNo} 履约事务失败（事务已回滚，可用订单号查询核实状态）:`,
      (err as Error)?.message,
    );
    return {
      ok: false,
      status: "REJECTED",
      error: "席位履约事务失败，订单状态未确认变更（可凭订单号查询核实），可安全重试同一订单",
      retryable: true,
    };
  }

  return { ok: true, status: "FULFILLED", seats, workspaceId };
}
