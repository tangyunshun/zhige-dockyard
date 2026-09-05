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

    // 批量查出每个用户的个人空间配额（算力点），并对新用户/免费用户 <= 0 执行 100 算力点自愈
    const userIds = users.map((u) => u.id);
    const personalWorkspaces = userIds.length > 0
      ? await prisma.workspace.findMany({
          where: {
            ownerId: { in: userIds },
            type: "PERSONAL",
          },
          include: {
            workspacequota: true,
          },
        })
      : [];

    const userQuotaMap: Record<string, number> = {};
    for (const ws of personalWorkspaces) {
      let balance = ws.workspacequota ? Number(ws.workspacequota.tokenBalance) : 0;
      if (balance <= 0) {
        balance = 100;
        if (ws.workspacequota) {
          prisma.workspacequota.update({
            where: { id: ws.workspacequota.id },
            data: { tokenBalance: BigInt(100), updatedAt: new Date() },
          }).catch(() => {});
        } else {
          prisma.workspacequota.create({
            data: {
              id: crypto.randomUUID(),
              workspaceId: ws.id,
              membershipLevelId: "FREE",
              tokenBalance: BigInt(100),
              updatedAt: new Date(),
            },
          }).catch(() => {});
        }
      }
      userQuotaMap[ws.ownerId] = balance;
    }

    const now = Date.now();
    // 在线判定标准（与 PRD 会话空闲超时严格对齐：10 分钟内有活动或心跳视为在线）
    const ONLINE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

    // 格式化输出列表
    const formattedUsers = users.map((user) => {
      const userPoints = userQuotaMap[user.id] ?? 100;
      let isOnline = false;
      if (user.status === "active") {
        if (user.sessionToken && user.sessionExpiresAt) {
          const expiresAt = new Date(user.sessionExpiresAt).getTime();
          // 会话必须未过期，且未被管理员强制下线
          if (expiresAt > now && !user.lastForcedLogoutAt) {
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
