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

/**
 * PATCH /api/admin/users/[id]/status
 * 更新用户状态（包含激活、停用、封禁与设置解封时间/解封原因）
 */
export async function PATCH(
  request: NextRequest,
  context: any
) {
  try {
    const paramsResolved = await context.params;
    const userId = paramsResolved.id;

    if (!userId) {
      return NextResponse.json({ error: "缺少目标用户 ID" }, { status: 400 });
    }

    // 1. 验证管理员权限
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.errorResponse || "权限不足" },
        { status: 403 }
      );
    }

    const adminId = authResult.user!.id;
    const { status, bannedUntil, banReason } = await request.json();

    if (!status || !["active", "inactive", "banned"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 2. 获取目标用户
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "目标用户不存在" }, { status: 404 });
    }

    // 防保护逻辑：不能封禁/停用超级管理员，也不能封禁自己
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "越权保护：不能对超级管理员执行停用或封禁操作" },
        { status: 403 }
      );
    }

    if (targetUser.id === adminId) {
      return NextResponse.json(
        { error: "安全保护：管理员不能封禁或停用自己" },
        { status: 403 }
      );
    }

    // 3. 构建更新 Payload
    const updatePayload: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === "banned") {
      updatePayload.bannedUntil = bannedUntil ? new Date(bannedUntil) : null;
      // 即时写入强制下线时间戳，使其 Session 立刻失效
      updatePayload.lastForcedLogoutAt = new Date();
      // 将管理员选择/输入的封禁原因落库到用户表，供用户详情、登录申诉、申诉详情统一读取
      updatePayload.banReason = banReason || "管理员手动设置";
    } else if (status === "active") {
      // 激活时清空封禁时间与封禁原因
      updatePayload.bannedUntil = null;
      updatePayload.banReason = null;
    } else if (status === "inactive") {
      updatePayload.lastForcedLogoutAt = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });

    // 4. 持久化审计日志
    await writeAuditLog(
      adminId,
      `user:status:${status}`,
      {
        targetUserId: userId,
        targetEmail: targetUser.email,
        status,
        bannedUntil,
        banReason: banReason || "管理员手动设置",
      },
      null,
      null,
      request
    );

    console.log(
      `[用户风控状态变更] 管理员 ${adminId} 将用户 ${userId} 的状态修改为 ${status}`
    );

    return NextResponse.json({
      success: true,
      message: `用户状态已更新为 ${status}`,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Change user status API error:", error);
    return NextResponse.json(
      { error: "修改用户状态失败" },
      { status: 500 }
    );
  }
}
