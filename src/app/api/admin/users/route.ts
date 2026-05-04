import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const accountStatus = searchParams.get("accountStatus") || ""; // 账号状态
    const loginStatus = searchParams.get("loginStatus") || ""; // 登录状态
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

    // 格式化用户数据，添加 isOnline 字段
    let formattedUsers = users.map((user) => {
      // 判断用户是否在线：
      // 1. 用户状态必须是 active
      // 2. 有 sessionToken 且未过期
      // 3. 没有被强制下线（lastForcedLogoutAt 为 null）
      // 4. 用户最近有活跃行为（lastLoginAt 在 5 分钟内）
      // 必须同时满足以上 4 个条件才显示在线
      let isOnline = false;
      
      if (user.status === 'active') {
        // 首先检查是否被强制下线
        if (user.lastForcedLogoutAt) {
          // 被强制下线后，立即显示离线
          isOnline = false;
        } else if (user.sessionToken && user.sessionExpiresAt) {
          // 检查会话是否过期
          const sessionExpired = new Date(user.sessionExpiresAt).getTime() < Date.now();
          
          if (!sessionExpired) {
            // 检查用户是否最近活跃（5 分钟 = 300 秒）
            const now = Date.now();
            const lastLoginTime = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
            const timeSinceLastLogin = (now - lastLoginTime) / 1000; // 秒
            const isActiveRecently = timeSinceLastLogin < 300; // 5 分钟内
            
            if (isActiveRecently) {
              // 有会话令牌、未过期、且最近活跃，才是真的在线
              isOnline = true;
            } else {
              // 会话有效但长时间未活跃，显示离线（用户可能去吃饭了或者关闭了浏览器）
              isOnline = false;
            }
          } else {
            // 会话已过期，显示离线
            isOnline = false;
          }
        } else {
          // 没有会话令牌，显示离线
          isOnline = false;
        }
      }

      return {
        ...user,
        isOnline,
      };
    });

    // 如果指定了登录状态筛选，则过滤结果
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
