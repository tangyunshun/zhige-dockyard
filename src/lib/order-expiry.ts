import { prisma } from "@/lib/prisma";

/**
 * 充值订单生命周期（大厂标准做法）：
 * - 下单时写入支付截止时间 expiresAt（默认 2 小时，可用 ORDER_EXPIRE_MINUTES 配置）；
 * - 超时未付的 PENDING 订单由本服务批量置为 EXPIRED，迟到回调/迟到的模拟确认一律拒绝入账；
 * - 与 instrumentation.ts 的进程内调度互为冗余，也可通过 /api/cron 订单清扫入口触发。
 */

export const ORDER_EXPIRE_MINUTES = Math.max(
  5,
  Number(process.env.ORDER_EXPIRE_MINUTES || 0) || 120,
);

/** 下单时的支付截止时间 */
export function newOrderExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ORDER_EXPIRE_MINUTES * 60 * 1000);
}

/** 订单是否已过支付截止时间 */
export function isOrderExpired(order: { status: string; expiresAt?: Date | null }, now: Date = new Date()): boolean {
  if (order.status !== "PENDING") return false;
  if (!order.expiresAt) return false;
  return now > order.expiresAt;
}

export interface ExpireOrdersResult {
  expiredCount: number;
}

/**
 * 批量清算：把超时未付的 PENDING 订单置为 EXPIRED。
 * 时钟口径（关键）：全链路统一走 Prisma 客户端的 JS Date（true UTC），
 * 绝不混用 MySQL NOW()/DATE_SUB()——Windows 下 MySQL 会话时区与 Node 时区不一致时，
 * 混用会让同一列出现两种墙钟，导致过期比对永不命中（本次审查实测踩坑）。
 */
export async function expirePendingOrders(now: Date = new Date()): Promise<ExpireOrdersResult> {
  const result = await (prisma as any).billing_record?.updateMany?.({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  if (result) return { expiredCount: result.count ?? 0 };
  const fallback = await (prisma as any).billingrecord.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return { expiredCount: fallback.count ?? 0 };
}
