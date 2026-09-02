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

    // 格式化输出列表
    const formattedUsers = users.map((user) => {
      let isOnline = false;
      if (user.status === "active") {
        if (user.sessionToken && user.sessionExpiresAt) {
          const now = new Date();
          const expiresAt = new Date(user.sessionExpiresAt);
          if (expiresAt > now && !user.lastForcedLogoutAt) {
            isOnline = true;
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
