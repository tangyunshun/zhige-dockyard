import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 获取所有用户并显示详细的会话信息
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        sessionToken: true,
        sessionExpiresAt: true,
        lastForcedLogoutAt: true,
        lastLoginAt: true,
        lastActivityAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const ONLINE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

    // 格式化用户数据，添加详细的在线状态信息
    const formattedUsers = allUsers.map((user) => {
      const now = Date.now();
      const sessionExpiresAtTime = user.sessionExpiresAt 
        ? new Date(user.sessionExpiresAt).getTime() 
        : null;
      const isSessionExpired = sessionExpiresAtTime !== null && sessionExpiresAtTime < now;
      
      let isOnline = false;
      let onlineReason = "";

      if (user.status === "active") {
        if (user.lastForcedLogoutAt) {
          isOnline = false;
          onlineReason = "被强制下线";
        } else if (user.sessionToken && user.sessionExpiresAt) {
          if (isSessionExpired) {
            isOnline = false;
            onlineReason = "会话已过期";
          } else {
            const latestActionTime = user.lastActivityAt
              ? new Date(user.lastActivityAt).getTime()
              : (user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0);
            
            if (latestActionTime > 0 && (now - latestActionTime) <= ONLINE_IDLE_TIMEOUT_MS) {
              isOnline = true;
              onlineReason = "最近 10 分钟内有真实系统活跃操作";
            } else {
              isOnline = false;
              onlineReason = `空闲超时超过 10 分钟已自动离线 (最后活跃距今 ${Math.round((now - latestActionTime) / 1000 / 60)} 分钟)`;
            }
          }
        } else {
          isOnline = false;
          onlineReason = user.sessionToken 
            ? "没有 sessionExpiresAt" 
            : "没有 sessionToken";
        }
      } else {
        isOnline = false;
        onlineReason = `用户状态：${user.status}`;
      }

      return {
        ...user,
        isOnline,
        onlineReason,
        sessionExpiresAtTime,
        currentTime: now,
        timeUntilExpiry: sessionExpiresAtTime 
          ? `${Math.round((sessionExpiresAtTime - now) / 1000 / 60)} 分钟` 
          : "N/A",
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      debugTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Debug users error:", error);
    return NextResponse.json(
      {
        error: "调试失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
