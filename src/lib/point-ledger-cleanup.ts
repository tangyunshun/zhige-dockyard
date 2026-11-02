import { prisma } from "@/lib/prisma";

/**
 * 算力点流水超期自动清理（数据保留策略：仅保留最近 3 年）。
 * 由 src/instrumentation.ts 每日调度，也可通过 /api/cron/point-ledger-cleanup 外部触发。
 *
 * 边界说明：
 *  - 余额本身不受影响（真源在 pointgrant / userwallet / workspacequota，只清理流水明细）；
 *  - 「累计充值 / 累计消费」等按流水汇总的统计，清理后仅反映保留窗口内的口径。
 */

/** 数据保留期：3 年 */
export const POINT_LEDGER_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/** 删除创建时间超过保留期的算力点流水，返回删除数量与截止时间。 */
export async function cleanupExpiredPointLedger(): Promise<{ deletedCount: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - POINT_LEDGER_RETENTION_MS);
  const deleted = await prisma.pointledger.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deletedCount: deleted.count, cutoff: cutoff.toISOString() };
}
