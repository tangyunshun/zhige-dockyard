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

// POST: 强制下线/重置会话 API (需要 user:reset_session 权限)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:reset_session");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 越权保护：不能踢下线超级管理员
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能对平台超级管理员强制下线" }, { status: 403 });
    }

    // 更新：将用户的 sessionToken 和 sessionExpiresAt 清空，并更新强制下线时间
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    // 写入操作审计日志
    await writeAuditLog(adminId, "user:reset_session", { targetUserId: userId });

    return NextResponse.json({
      success: true,
      message: "用户已成功强制踢下线并清除会话状态",
    });
  } catch (error) {
    console.error("Reset session API error:", error);
    return NextResponse.json(
      { error: "重置用户会话失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
