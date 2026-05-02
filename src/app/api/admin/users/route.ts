import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const status = searchParams.get("status") || "";
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

    if (status) {
      where.status = status;
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

    // 格式化用户数据，添加 isOnline 字段
    const formattedUsers = users.map((user) => {
      // 判断用户是否在线：
      // 1. 用户状态必须是 active
      // 2. 会话未过期
      // 3. 没有被强制下线
      let isOnline = false;
      
      if (user.status === 'active') {
        // 检查会话是否过期
        const sessionExpired = user.sessionExpiresAt && new Date(user.sessionExpiresAt).getTime() < Date.now();
        
        if (!sessionExpired) {
          // 检查是否被强制下线（只要有 lastForcedLogoutAt 记录，就立即显示离线）
          if (user.lastForcedLogoutAt) {
            isOnline = false; // 强制下线后立即显示离线
            console.log(
              `[Admin API] 用户 ${user.id} 被强制下线，isOnline=false`,
            );
          } else if (user.sessionToken) {
            // 有会话令牌且未过期，就是在线的
            isOnline = true;
            console.log(
              `[Admin API] 用户 ${user.id} isOnline=true (有 sessionToken 且未过期)`,
            );
          }
        }
      }

      return {
        ...user,
        isOnline,
      };
    });

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
