import { prisma } from "@/lib/prisma";

/**
 * 对公充值工单超期自动清理（数据保留策略：仅保留最近 3 年）。
 * 由 src/instrumentation.ts 每日调度，也可通过 /api/cron/recharge-order-cleanup 外部触发。
 */

/** 数据保留期：3 年 */
export const RECHARGE_ORDER_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/** 删除创建时间超过保留期的对公充值工单，返回删除数量。 */
export async function cleanupExpiredRechargeOrders(): Promise<{ deletedCount: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - RECHARGE_ORDER_RETENTION_MS);
  const deleted = await prisma.tokenrechargeorder.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deletedCount: deleted.count, cutoff: cutoff.toISOString() };
}
