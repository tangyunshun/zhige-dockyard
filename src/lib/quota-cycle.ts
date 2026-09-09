import { PrismaClient } from "@prisma/client";
import { grantNewUserGift } from "@/lib/credit-service";

/**
 * 计算下一个自然月初 (下个月 1 日 00:00:00)
 */
export function getNextMonthResetDate(now: Date = new Date()): Date {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth;
}

/**
 * 校验并执行【自然月级】的账户/用量维护（不产生任何免费算力额度）：
 *
 * 1. 注册福利：当本次请求发生在该用户自己的个人空间时，按「注册当月起连续 3 个自然月、
 *    每月 100 点、当月有效月底清零」规则发放当月的注册福利（第 4 个月起自动停发）。
 *    发放与订阅解耦：用户当月首次使用即到账，避免依赖定时任务。
 *
 * 2. 成员月度用量统计清零：仅将 workspacemember.monthlyTokenUsed 计数归零（这是用量统计，
 *    不是赠送额度）；「用完自费充值」的余额不在此处做任何补足。
 *
 * 注意：历史上本函数会把空间余额「月度自动补足到会员 tokenLimit」并推后 resetAt，
 * 等同于无上限白送算力，现已被移除。空间/钱包余额只增不减的来源仅剩：
 * 在线充值、线下人工入账、购买所得与注册福利（限 3 个月）。
 */
export async function checkAndResetQuotaCycle(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string
) {
  const now = new Date();

  // 1. 注册福利月度发放：仅当操作发生在该用户「自己的个人空间」内才触发
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, type: true, ownerId: true },
  });
  if (ws && ws.type === "PERSONAL" && ws.ownerId === userId) {
    await grantNewUserGift({
      userId,
      workspaceId,
      workspaceName: ws.name,
      userEmail: null,
    }).catch((e) => console.warn("[注册福利] 当月注册福利发放警告:", e));
  }

  // 2. 成员月度用量统计清零（仅统计计数，非赠送）
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
      }).catch((e) => console.warn("[算力重置] 成员算力月度使用量自动清零警告:", e));
    }
  }
}
