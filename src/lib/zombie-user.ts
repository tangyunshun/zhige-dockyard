/**
 * 僵尸用户识别与清理（系统清理功能）
 *
 * 判定标准（须同时满足）：
 *   A. 超过 1 年未登录（lastLoginAt 为空时以 createdAt 兜底：注册后从未登录也算「未登录」，
 *      但注册不足 1 年的新用户不算僵尸，避免误伤）；
 *   B. 从未产生有效数据，须同时满足：
 *      - 未创建任何「有效」工作空间（即仅拥有从未使用的默认个人空间，或完全没有空间）；
 *      - 未在个人空间上传任何文件 / 知识库文档；
 *      - 未消耗任何算力（pointledger 出账 = 0）；
 *      - 未加入任何企业空间。
 *
 * 特权账号（super_admin / admin）不参与僵尸判定，避免误清理管理员。
 *
 * 落地：每日定时扫描（instrumentation 进程内调度 + scripts 独立脚本双重兜底）刷新 user.is_zombie 标记；
 * 管理后台列表接口直接读取该标记做筛选与打标；另提供手动触发接口 /api/admin/users/zombie-scan。
 */
import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

/** 未登录判定阈值：365 天 */
export const ZOMBIE_INACTIVE_DAYS = 365;

export interface ZombieScanResult {
  /** 本仓库 detect 不返回扫描总量，固定为 0，保留字段以便上层扩展 */
  scanned: number;
  /** 当前僵尸用户总数 */
  zombieCount: number;
  /** 已发送系统通知的超级管理员数量 */
  notified: number;
}

/** 计算用户「有效最后登录时间」：优先 lastLoginAt，缺失则以注册时间兜底 */
function effectiveLastLoginAt(u: { lastLoginAt: Date | null; createdAt: Date }): Date {
  return u.lastLoginAt ?? u.createdAt;
}

/**
 * 全量扫描并刷新 is_zombie 标记。返回当前僵尸用户总数。
 * 采用游标分页 + 批量聚合，避免一次性巨量查询与逐用户 N+1。
 */
export async function detectZombieUsers(): Promise<number> {
  const threshold = new Date(Date.now() - ZOMBIE_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const zombieIds = new Set<string>();

  let cursor: string | undefined;
  const PAGE = 500;
  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        status: { notIn: ["deleted", "deleting"] },
        role: { notIn: ["super_admin", "admin"] },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, lastLoginAt: true, createdAt: true },
      orderBy: { id: "asc" },
      take: PAGE,
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    // 仅保留「有效最后登录时间已超过阈值」的候选
    const candidates = users.filter(
      (u) => effectiveLastLoginAt(u).getTime() < threshold.getTime()
    );
    if (candidates.length === 0) continue;

    const candidateIds = candidates.map((c) => c.id);

    // —— 数据信号批量聚合 ——
    // 1) 拥有的工作空间
    const owned = await prisma.workspace.findMany({
      where: { ownerId: { in: candidateIds } },
      select: { id: true, ownerId: true, type: true },
    });
    const ownerMap = new Map<string, { id: string; type: string }[]>();
    for (const w of owned) {
      const arr = ownerMap.get(w.ownerId) ?? [];
      arr.push({ id: w.id, type: w.type });
      ownerMap.set(w.ownerId, arr);
    }
    const personalWsIds = owned.filter((w) => w.type === "PERSONAL").map((w) => w.id);
    const enterpriseOwnerSet = new Set(
      owned.filter((w) => w.type === "ENTERPRISE").map((w) => w.ownerId)
    );

    // 2) 个人空间内是否有文件 / 文档 / 对话（任一即视为「使用过」）
    const usedPersonalOwners = new Set<string>();
    if (personalWsIds.length) {
      const [assetRows, docRows, convRows] = await Promise.all([
        prisma.asset.groupBy({
          by: ["workspaceId"],
          where: { workspaceId: { in: personalWsIds } },
          _count: { _all: true },
        }),
        prisma.document.groupBy({
          by: ["workspaceId"],
          where: { workspaceId: { in: personalWsIds } },
          _count: { _all: true },
        }),
        prisma.conversation.findMany({
          where: { workspaceId: { in: personalWsIds } },
          select: { workspaceId: true },
          distinct: ["workspaceId"],
        }),
      ]);
      const usedWs = new Set<string>([
        ...assetRows.filter((r) => r._count._all > 0).map((r) => r.workspaceId),
        ...docRows.filter((r) => r._count._all > 0).map((r) => r.workspaceId),
        ...convRows.map((r) => r.workspaceId),
      ]);
      for (const [ownerId, wsList] of ownerMap) {
        if (wsList.some((w) => w.type === "PERSONAL" && usedWs.has(w.id))) {
          usedPersonalOwners.add(ownerId);
        }
      }
    }

    // 3) 算力消耗（pointledger 出账）
    const computeRows = await prisma.pointledger.findMany({
      where: { userId: { in: candidateIds }, direction: "OUT" },
      select: { userId: true },
      distinct: ["userId"],
    });
    const computeSet = new Set(computeRows.map((r) => r.userId));

    // 4) 企业空间成员
    const entMemberRows = await prisma.workspacemember.findMany({
      where: { userId: { in: candidateIds } },
      select: { userId: true, workspaceId: true },
    });
    const entWsIds = new Set(
      (
        await prisma.workspace.findMany({
          where: { id: { in: entMemberRows.map((m) => m.workspaceId) }, type: "ENTERPRISE" },
          select: { id: true },
        })
      ).map((w) => w.id)
    );
    const entMemberSet = new Set(
      entMemberRows.filter((m) => entWsIds.has(m.workspaceId)).map((m) => m.userId)
    );

    // —— 综合判定：候选 + 无任何有效数据 = 僵尸 ——
    for (const id of candidateIds) {
      const hasData =
        enterpriseOwnerSet.has(id) ||
        computeSet.has(id) ||
        entMemberSet.has(id) ||
        usedPersonalOwners.has(id);
      if (!hasData) zombieIds.add(id);
    }
  }

  // 刷新标记：置位当前僵尸，复位历史误标（避免空 in 导致 Prisma 查询异常）
  const ids = [...zombieIds];
  if (ids.length) {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isZombie: true } });
  }
  await prisma.user.updateMany({
    where: { isZombie: true, NOT: { id: { in: ids.length ? ids : ["__none__"] } } },
    data: { isZombie: false },
  });

  return zombieIds.size;
}

/**
 * 扫描僵尸用户并向超级管理员推送系统通知（每日定时任务入口）。
 * 仅在检测到僵尸用户时才发送通知，避免骚扰。
 */
export async function scanAndNotifyZombies(): Promise<ZombieScanResult> {
  const zombieCount = await detectZombieUsers();
  let notified = 0;
  if (zombieCount > 0) {
    const superAdmins = await prisma.user.findMany({
      where: { role: "super_admin", status: { notIn: ["deleted", "deleting"] } },
      select: { id: true },
    });
    const title = "系统检测到僵尸用户";
    const content = `系统检测到 ${zombieCount} 个僵尸用户（超 1 年未登录且无有效数据），建议您前往后台进行清理。`;
    for (const admin of superAdmins) {
      await addNotification(admin.id, title, content, "system", "/admin/users?zombie=1", false);
      notified += 1;
    }
  }
  return { scanned: 0, zombieCount, notified };
}
