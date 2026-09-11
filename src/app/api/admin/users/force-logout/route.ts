import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCache } from "@/lib/session-cache";
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
 * 单个用户强制下线（与「重置会话」同语义：清空会话 + 记录强制下线时间）
 * 注意：不能依赖 x-user-role 请求头——中间件只注入 x-user-id，该头恒为空，
 * 曾导致所有调用一律 403。统一走 requirePlatformPermission 校验 JWT 与权限。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:reset_session");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const { userId, reason } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "缺少必要参数 userId" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "NOT_FOUND", message: "用户不存在" }, { status: 404 });
    }

    // 越权保护：不能对超级管理员强制下线
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN", message: "权限不足，不能对平台超级管理员强制下线" }, { status: 403 });
    }

    const now = new Date();
    // 1. 更新用户表：清空会话字段并记录强制下线时间
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastForcedLogoutAt: now,
        sessionToken: null,
        sessionExpiresAt: null,
      },
    });

    // 2. 清除内存 sessionCache 中该用户的所有 session
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === userId) {
        sessionCache.delete(key);
      }
    }

    // 3. 写入审计日志
    await writeAuditLog(
      adminId,
      "user:reset_session",
      { targetUserId: userId, reason: reason || "管理员强制下线" },
      null,
      null,
      request
    );

    return NextResponse.json({ success: true, message: "用户已强制下线" });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "强制下线失败" }, { status: 500 });
  }
}
