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

// POST: 封禁用户 API (需要 user:ban 权限)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:ban");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userId, bannedUntil, reason } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 越权保护：不能封禁超级管理员
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能封禁平台超级管理员" }, { status: 403 });
    }

    // 不能操作自己
    if (userId === adminId) {
      return NextResponse.json({ error: "不能封禁自己" }, { status: 403 });
    }

    // 封禁更新：状态设为 banned，强制踢出登录态并清除 session
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "banned",
        bannedUntil: bannedUntil ? new Date(bannedUntil) : null,
        sessionToken: null,
        sessionExpiresAt: null,
      },
    });

    // 写入操作审计日志
    await writeAuditLog(adminId, "user:ban", { targetUserId: userId, bannedUntil, reason });

    return NextResponse.json({
      success: true,
      message: "用户已成功封禁并强制下线",
    });
  } catch (error) {
    console.error("Ban user API error:", error);
    return NextResponse.json(
      { error: "封禁用户失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}