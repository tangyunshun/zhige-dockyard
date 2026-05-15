﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

// GET: 获取用户列表（用于调试）
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
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
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

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
          if (!isSessionExpired) {
            isOnline = true;
            onlineReason = "有 sessionToken 且未过期";
          } else {
            isOnline = false;
            onlineReason = "会话已过期";
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

// PATCH: 修改用户状态
export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { userId } = params;
    const { status, bannedUntil } = await request.json();

    // 验证必填字段
    if (!status) {
      return NextResponse.json({ error: "缺少状态字段" }, { status: 400 });
    }

    // 验证状态值
    if (!["active", "inactive", "banned", "deleted"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 获取目标用户
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 不能操作超级管理员
    if (targetUser.role === "super_admin") {
      return NextResponse.json({ error: "不能操作超级管理员" }, { status: 403 });
    }

    // 不能操作自己
    if (userId === adminId) {
      return NextResponse.json({ error: "不能操作自己" }, { status: 403 });
    }

    // 构建更新数据
    const updateData: any = {
      status,
    };

    // 如果是封禁状态，设置封禁时间
    if (status === "banned") {
      updateData.bannedUntil = bannedUntil || null;
      // 清除会话（强制下线）
      updateData.sessionToken = null;
      updateData.sessionExpiresAt = null;
    } else {
      // 解封或激活时清除封禁时间
      updateData.bannedUntil = null;
    }

    // 更新用户状态
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    console.log(
      `[修改用户状态] 管理员 ${adminId} 将用户 ${userId} 的状态修改为 ${status}`,
    );

    return NextResponse.json({
      success: true,
      message: "状态已更新",
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return NextResponse.json(
      {
        error: "更新状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
