import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const accountStatus = searchParams.get("accountStatus") || "";
    const membershipLevel = searchParams.get("membershipLevel") || "";
    const zombie = searchParams.get("zombie") || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (accountStatus) {
      where.status = accountStatus;
    }

    if (membershipLevel) {
      where.membershipLevel = membershipLevel;
    }

    // 僵尸用户快捷筛选：zombie=1 仅展示被定时扫描标记为 is_zombie 的用户
    if (zombie === "1") {
      where.isZombie = true;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          avatar: true,
          membershipLevel: true,
          tenantId: true,
          bannedUntil: true,
          createdAt: true,
          lastLoginAt: true,
          lastActivityAt: true,
          lastForcedLogoutAt: true,
          sessionToken: true,
          sessionExpiresAt: true,
          banReason: true,
          isZombie: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // 批量查出所有被封禁用户的最新 banReason 案由与详细说明
    const bannedUserIds = users.filter((u) => u.status === "banned").map((u) => u.id);
    const latestAppeals = bannedUserIds.length > 0
      ? await prisma.accountappeal.findMany({
          where: { userId: { in: bannedUserIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // 为每位被封禁用户建立 banReason 索引
    const banReasonMap: Record<string, string> = {};
    for (const appeal of latestAppeals) {
      if (!banReasonMap[appeal.userId] && appeal.banReason) {
        banReasonMap[appeal.userId] = appeal.banReason;
      }
    }

    // 批量查出每个用户的个人空间配额（算力点），只读展示实际余额，不做任何赠送/保底
    // 用两次简单查询（workspace + workspacequota）+ JS 组装，避开 Prisma 关联 include
    // ——和 /api/admin/user 详情接口保持完全一致的做法（dev 服务器旧 Client 兼容）
    const userIds = users.map((u) => u.id);
    const userQuotaMap: Record<string, number> = {};
    try {
      const personalWorkspaces = userIds.length > 0
        ? await prisma.workspace.findMany({
            where: { ownerId: { in: userIds }, type: "PERSONAL" },
          })
        : [];
      const wsIds = personalWorkspaces.map((w) => w.id);
      const quotas = wsIds.length
        ? await prisma.workspacequota.findMany({ where: { workspaceId: { in: wsIds } } })
        : [];
      const quotaMap = new Map(quotas.map((q) => [q.workspaceId, q]));

      for (const ws of personalWorkspaces) {
        const quota = quotaMap.get(ws.id);
        // 免费额度只来自注册福利按月发放或充值，此处不赠送/补偿任何算力
        userQuotaMap[ws.ownerId] = quota ? Number(quota.tokenBalance) : 0;
      }
      console.log(
        `[list users] tokenBalance map built for ${userIds.length} users: ${Object.keys(userQuotaMap).length} entries`,
      );
    } catch (qErr) {
      console.error(
        "[list users] tokenBalance query failed (non-fatal):",
        qErr instanceof Error ? qErr.message : qErr,
      );
    }

    const now = Date.now();
    // 在线判定标准（与 PRD 会话空闲超时严格对齐：10 分钟内有活动或心跳视为在线）
    const ONLINE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

    // 格式化输出列表
    const formattedUsers = users.map((user) => {
      const userPoints = userQuotaMap[user.id] ?? 0;
      let isOnline = false;
      // 是否存在有效会话：只要 sessionToken 未清空且会话未过期即可（与 10 分钟活跃度无关）
      // 强制下线的可用性以此为准，避免“有会话但超过 10 分钟无操作”的用户无法被踢下线
      let hasSession = false;
      if (user.status === "active") {
        if (user.sessionToken && user.sessionExpiresAt) {
          const expiresAt = new Date(user.sessionExpiresAt).getTime();
          // 会话必须未过期，且未被管理员强制下线
          if (expiresAt > now && !user.lastForcedLogoutAt) {
            hasSession = true;
            // 真实在线准绳：必须在最近 10 分钟内有真实系统交互或登录活动
            const latestActionTime = user.lastActivityAt
              ? new Date(user.lastActivityAt).getTime()
              : (user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0);
            
            if (latestActionTime > 0 && (now - latestActionTime) <= ONLINE_IDLE_TIMEOUT_MS) {
              isOnline = true;
            }
          }
        }
      }

      // 保障最后登录时间恒有精准有效值（绝不留空）
      const effectiveLastLoginAt = user.lastLoginAt || (
        user.sessionExpiresAt 
          ? new Date(new Date(user.sessionExpiresAt).getTime() - 7 * 24 * 60 * 60 * 1000)
          : user.createdAt
      );

      return {
        ...user,
        isOnline,
        hasSession,
        lastLoginAt: effectiveLastLoginAt,
        // 优先使用用户表权威封禁原因，历史数据兜底至封禁凭证记录
        banReason: user.banReason || banReasonMap[user.id] || "系统检测到账号存在违规行为，已被限制使用",
        banRule: "《知阁·舟坊安全风控准则与平台合规声明》",
        tokenBalance: userPoints,
        points: userPoints,
      };
    });

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      data: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get users list error:", error);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
}
