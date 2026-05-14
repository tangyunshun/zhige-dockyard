import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 批量强制用户下线API
 * 允许管理员同时强制多个用户下线
 */
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { userIds } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "缺少用户ID列表" }, { status: 400 });
    }

    // 过滤掉管理员自己
    const targetUserIds = userIds.filter((id: string) => id !== adminId);

    if (targetUserIds.length === 0) {
      return NextResponse.json({ error: "没有可操作的用户" }, { status: 400 });
    }

    // 批量更新用户会话状态
    const result = await prisma.user.updateMany({
      where: {
        id: {
          in: targetUserIds,
        },
        role: {
          not: "SUPER_ADMIN", // 不能强制超级管理员下线
        },
      },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    console.log(`[批量强制下线] 管理员 ${adminId} 强制 ${result.count} 个用户下线`);

    return NextResponse.json({
      success: true,
      message: `已成功强制 ${result.count} 个用户下线`,
      count: result.count,
    });
  } catch (error) {
    console.error("Batch logout error:", error);
    return NextResponse.json(
      { error: "批量强制下线失败" },
      { status: 500 }
    );
  }
}