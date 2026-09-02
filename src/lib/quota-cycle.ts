import { PrismaClient } from "@prisma/client";

/**
 * 计算下一个自然月初 (下个月 1 日 00:00:00)
 */
export function getNextMonthResetDate(now: Date = new Date()): Date {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth;
}

/**
 * 校验并自动重置【空间配额】与【成员月度算力额度】（跨自然月自动重置）
 */
export async function checkAndResetQuotaCycle(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string
) {
  const now = new Date();

  // 1. 检查空间配额
  const quota = await prisma.workspacequota.findUnique({
    where: { workspaceId },
    include: { membershiplevel: true },
  });

  if (quota) {
    const isExpired = !quota.resetAt || quota.resetAt.getTime() <= now.getTime();
    if (isExpired && quota.membershiplevel) {
      const nextReset = getNextMonthResetDate(now);
      const defaultTokenLimit = BigInt(quota.membershiplevel.tokenLimit || 1000);
      const currentBalance = quota.tokenBalance;
      const newTokenBalance = currentBalance < defaultTokenLimit ? defaultTokenLimit : currentBalance;

      await prisma.workspacequota.update({
        where: { workspaceId },
        data: {
          tokenBalance: newTokenBalance,
          resetAt: nextReset,
          updatedAt: now,
        },
      }).catch((e) => console.warn("[算力重置] 空间算力月度自动重置警告:", e));
    }
  }

  // 2. 检查成员额度
  const member = await prisma.workspacemember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (member) {
    const isMemberExpired = !member.quotaResetAt || member.quotaResetAt.getTime() <= now.getTime();
    if (isMemberExpired) {
      const nextReset = getNextMonthResetDate(now);

      await prisma.workspacemember.update({
        where: { id: member.id },
        data: {
          monthlyTokenUsed: BigInt(0),
          quotaResetAt: nextReset,
        },
      }).catch((e) => console.warn("[算力重置] 成员算力月度使用量自动重置警告:", e));
    }
  }
}
