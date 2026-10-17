/**
 * 空间算力点余额预警。
 *
 * 规则：当空间余额（pointgrant 分桶剩余量之和，真源）低于 workspacequota.poolLowThreshold 时，
 * 向空间所有者发送一条站内通知。为避免刷屏，同一空间 24 小时内只发一次。
 *
 * 该函数为「尽力而为」：任何异常都不得阻断主流程（查询、结算、充值），调用方可用 .catch 吞掉。
 */

import { prisma } from "@/lib/prisma";

const ALERT_DEDUPE_HOURS = 24;

/** 计算空间当前可用算力点（真源：ACTIVE 且未过期分桶的 remaining 之和） */
export async function getWorkspacePointsBalance(workspaceId: string): Promise<number> {
  const now = new Date();
  const grants = await prisma.pointgrant.findMany({
    where: {
      workspaceId,
      scope: "WORKSPACE",
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { remaining: true },
  });
  return grants.reduce((sum, g) => sum + Number(g.remaining || 0), 0);
}

/**
 * 检查空间余额是否低于预警阈值，低于则发送一条通知（24h 去重）。
 * 返回是否真的发出了通知，便于测试与日志。
 */
export async function checkWorkspaceLowBalance(workspaceId: string): Promise<boolean> {
  try {
    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId },
      select: { poolLowThreshold: true },
    });
    const threshold = Number(quota?.poolLowThreshold ?? 0);
    if (threshold <= 0) return false; // 未设置阈值，不预警

    const balance = await getWorkspacePointsBalance(workspaceId);
    if (balance >= threshold) return false;

    // 空间所有者（通知接收人）
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true, name: true },
    });
    if (!workspace?.ownerId) return false;

    // 24 小时去重：同一空间、同一类型、未读的通知已存在则不再发
    const since = new Date(Date.now() - ALERT_DEDUPE_HOURS * 60 * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: {
        userId: workspace.ownerId,
        type: "QUOTA_LOW_BALANCE",
        isRead: false,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.notification.create({
      data: {
        id: `ntf-quota-low-${workspaceId}-${Date.now()}`,
        userId: workspace.ownerId,
        type: "QUOTA_LOW_BALANCE",
        title: "算力点余额不足预警",
        content: `空间「${workspace.name}」当前可用算力点为 ${balance.toLocaleString()}，已低于预警阈值 ${threshold.toLocaleString()}。请及时充值或申请提升额度，否则任务将因额度不足无法执行。`,
        link: `/workspace/${encodeURIComponent(workspaceId)}/quota`,
        createdAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    console.warn("[quota-alert] 余额预警检查失败（已忽略，不阻断主流程）:", (error as Error)?.message);
    return false;
  }
}
