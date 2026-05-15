import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const accountStatus = searchParams.get("accountStatus") || "";
    const loginStatus = searchParams.get("loginStatus") || "";
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
          createdAt: true,
          lastLoginAt: true,
          lastForcedLogoutAt: true,
          sessionToken: true,
          sessionExpiresAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // 为用户添加 isOnline 字段
    let formattedUsers = users.map((user) => {
      // 判断用户是否在线的逻辑：
      // 1. 账号状态必须是 active
      // 2. 有 sessionToken 且未过期
      // 3. lastForcedLogoutAt 为 null
      // 注意：不再严格要求 lastLoginAt 在 5 分钟内，只要 sessionToken 有效就算在线
      let isOnline = false;
      
      if (user.status === 'active') {
        // 检查是否被强制下线
        if (user.lastForcedLogoutAt) {
          // 如果被强制下线，直接判定为离线
          isOnline = false;
        } else if (user.sessionToken && user.sessionExpiresAt) {
          // 检查会话是否过期
          const sessionExpired = new Date(user.sessionExpiresAt).getTime() < Date.now();
          
          if (!sessionExpired) {
            // 会话未过期，判定为在线（不再严格要求 5 分钟内有操作）
            isOnline = true;
          } else {
            // 会话已过期，判定为离线
            isOnline = false;
          }
        } else {
          // 没有会话信息，判定为离线
          isOnline = false;
        }
      }

      return {
        ...user,
        isOnline,
      };
    });

    // 根据 loginStatus 过滤用户
    if (loginStatus) {
      const isOnlineFilter = loginStatus === "online";
      formattedUsers = formattedUsers.filter(user => user.isOnline === isOnlineFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        users: formattedUsers,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : error,
    );
    console.error("Error stack:", error instanceof Error ? error.stack : "N/A");
    return NextResponse.json(
      {
        error: "获取用户列表失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
