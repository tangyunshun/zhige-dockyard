import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// GET: 获取单个用户详情 (需要 user:read)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    const [targetUser, apikeyCount, componentCount, loginHistoryCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          workspacemember: {
            include: {
              workspace: true,
            },
            take: 5,
          },
        },
      }),
      prisma.apikey.count({
        where: { userId: targetUserId },
      }),
      prisma.componenttask.count({
        where: { userId: targetUserId },
      }),
      prisma.loginhistory.count({
        where: { userId: targetUserId },
      }),
    ]);

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    let effectiveLastLoginAt = targetUser.lastLoginAt;
    if (!effectiveLastLoginAt && (targetUser.sessionToken || targetUser.sessionExpiresAt)) {
      effectiveLastLoginAt = targetUser.sessionExpiresAt
        ? new Date(new Date(targetUser.sessionExpiresAt).getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date();
      prisma.user.update({
        where: { id: targetUser.id },
        data: { lastLoginAt: effectiveLastLoginAt },
      }).catch(() => {});
    }

    // 连表查询最新的封禁案由凭证记录
    const latestAppealMeta = await prisma.accountappeal.findFirst({
      where: { userId: targetUser.id },
      orderBy: { createdAt: "desc" },
    });

    const banReasonText = targetUser.banReason || latestAppealMeta?.banReason || "系统检测到账号存在违规行为，已被限制使用";

    return NextResponse.json({
      success: true,
      data: {
        ...targetUser,
        banReason: banReasonText,
        lastLoginAt: effectiveLastLoginAt,
        stats: {
          workspaceCount: targetUser.workspacemember.length,
          apikeyCount,
          componentCount,
          loginHistoryCount,
        },
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "获取用户信息失败" },
      { status: 500 }
    );
  }
}

// PATCH: 更新用户信息/角色/状态 (需要 user:update, 修改角色仅限 SuperAdmin)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, status, role, bannedUntil, banReason } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    // 1. 基本编辑鉴权
    const authResult = await requirePlatformPermission(request, "user:update");
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

    // 超管越权保护：不能操作超级管理员
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能对超级管理员执行编辑或限制操作" }, { status: 403 });
    }

    // 不能操作自己 (针对非角色变更的 status 调整安全放行)
    if (userId === adminId && role !== undefined && role !== targetUser.role) {
      return NextResponse.json({ error: "不能修改自己的账户角色" }, { status: 403 });
    }

    // 2. 角色修改限制：修改用户平台角色仅 SuperAdmin 允许
    if (role !== undefined && role !== targetUser.role) {
      if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "越权警告：只有超级管理员允许变更用户的平台角色" }, { status: 403 });
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (status !== undefined) {
      if (!["active", "inactive", "banned", "deleted"].includes(status)) {
        return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
      }
      updateData.status = status;
      if (status === "banned") {
        // 如果是封禁状态，更新解封时间与即时强制下线时间戳
        updateData.bannedUntil = bannedUntil ? new Date(bannedUntil) : null;
        updateData.lastForcedLogoutAt = new Date();
        // 将管理员选择/输入的封禁原因落库到用户表（权威来源）
        if (banReason) {
          updateData.banReason = banReason;
        }
      } else if (status === "active") {
        // 解封时清空封禁原因
        updateData.banReason = null;
      }
    }
    if (role !== undefined) {
      if (role === "admin") {
        if (targetUser.role === "admin") {
          return NextResponse.json({ error: "任命失败：该用户当前已是运营管理员，请勿重复任命。" }, { status: 400 });
        }
        // 限制：系统中只能存在唯一一个普通的运营管理员 (PlatformAdmin)
        const existingAdmin = await prisma.user.findFirst({
          where: {
            role: "admin",
            id: { not: userId }
          }
        });
        if (existingAdmin) {
          return NextResponse.json({ error: "任命失败：系统当前已存在一位运营管理员，请先撤销其管理员身份。" }, { status: 400 });
        }
      }
      // 归一化写入数据库 (支持 admin / user)
      updateData.role = role === "admin" ? "admin" : role === "super_admin" ? "super_admin" : "user";
    }

    // 更新用户状态与角色
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // 记录高危操作审计日志并持久化
    await writeAuditLog(adminId, "user:update", { targetUserId: userId, updates: updateData }, null, null, request);

    console.log(
      `[更新用户状态/角色] 管理员 ${adminId} 对用户 ${userId} 执行了更新。数据为:`,
      updateData
    );

    return NextResponse.json({
      success: true,
      message: "用户信息已成功更新",
      data: updatedUser
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return NextResponse.json(
      { error: "更新状态失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除用户 (需要 SUPER_ADMIN)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;
    const adminRole = authResult.user!.role;

    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "越权警告：只有超级管理员允许物理删除用户账号" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    if (targetUserId === adminId) {
      return NextResponse.json({ error: "不能删除自己" }, { status: 403 });
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    // 记录审计
    await writeAuditLog(adminId, "user:delete", { targetUserId }, null, null, request);

    return NextResponse.json({
      success: true,
      message: "用户已物理删除成功",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "删除用户失败" },
      { status: 500 }
    );
  }
}
