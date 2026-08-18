import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

// 统一的客户端角色清洗函数
const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// GET: 获取单个用户会话状态调试 (需要 user:read 权限)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
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

// PATCH: 修改用户状态/角色 (修改角色仅限 SuperAdmin, 封禁需要 user:ban, 修改状态需要 user:update)
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const params = await context.params;
    const { userId } = params;

    const body = await request.json();
    const { status, bannedUntil, role } = body;

    // 1. 判断是封禁操作还是普通属性编辑，以匹配不同的操作权限
    const isBanAction = status === "banned";
    const requiredPermission = isBanAction ? "user:ban" : "user:update";

    const authResult = await requirePlatformPermission(request, requiredPermission);
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;
    const adminRole = authResult.user!.role;

    // 获取目标用户
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 2. 超管越权保护：不能操作超级管理员
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能对超级管理员执行编辑或限制操作" }, { status: 403 });
    }

    // 不能操作自己
    if (userId === adminId) {
      return NextResponse.json({ error: "不能操作自己" }, { status: 403 });
    }

    // 3. 角色修改限制：修改用户平台角色仅 SuperAdmin 允许
    if (role !== undefined && role !== targetUser.role) {
      if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "越权警告：只有超级管理员允许变更用户的平台角色" }, { status: 403 });
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (status !== undefined) {
      // 验证状态值
      if (!["active", "inactive", "banned", "deleted"].includes(status)) {
        return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
      }
      updateData.status = status;

      // 如果是封禁状态，设置封禁时间并强制踢下线
      if (status === "banned") {
        updateData.bannedUntil = bannedUntil ? new Date(bannedUntil) : null;
        updateData.sessionToken = null;
        updateData.sessionExpiresAt = null;
      } else {
        updateData.bannedUntil = null;
      }
    }

    if (role !== undefined) {
      updateData.role = role;
    }

    // 更新用户状态
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // 记录高危审计日志并持久化落库
    const auditAction = isBanAction ? "user:ban" : "user:update";
    await writeAuditLog(adminId, auditAction, { targetUserId: userId, updates: updateData });

    console.log(
      `[修改用户状态/角色] 管理员 ${adminId} 对用户 ${userId} 执行了 ${auditAction}。更新数据为:`,
      updateData
    );

    return NextResponse.json({
      success: true,
      message: "用户信息更新成功",
      data: updatedUser
    });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      {
        error: "更新用户信息失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
