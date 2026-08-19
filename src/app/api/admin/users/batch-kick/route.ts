import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { assertCSRF } from "@/lib/csrf";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

const MAX_BATCH_SIZE = 100;

/**
 * G-01 批量强制下线（批量踢出）
 * 管理员一次性将多个用户踢下线：清空其会话令牌并打上强制下线时间戳，
 * 用户在下一个受保护请求/刷新时将立即收到 A-403（SESSION_KICKED）。
 */
export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json({ error: "CSRF_INVALID", message: "请求来源校验失败" }, { status: 403 });
    }

    const authResult = await requirePlatformPermission(request, "user:reset_session");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userIds, reason } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "请提供需要强制下线的用户 ID 列表" }, { status: 400 });
    }

    if (userIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `单次最多支持 ${MAX_BATCH_SIZE} 个用户` },
        { status: 400 }
      );
    }

    // 去重
    const uniqueIds = [...new Set(userIds)] as string[];

    // 越权保护：过滤出可踢出的用户（排除平台超级管理员）
    const targets = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, role: true, email: true },
    });

    const kickable = targets.filter((u) => getCleanRole(u.role) !== "SUPER_ADMIN");
    const skippedSuperAdmin = targets.length - kickable.length;

    if (kickable.length === 0) {
      return NextResponse.json(
        { error: "所选用户均为平台超级管理员，无法强制下线" },
        { status: 403 }
      );
    }

    const now = new Date();
    // 批量清空会话并打上强制下线时间戳
    const result = await prisma.user.updateMany({
      where: { id: { in: kickable.map((u) => u.id) } },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        refreshTokenPrev: null,
        lastForcedLogoutAt: now,
      },
    });

    // 写入操作审计日志（G-01：批量强踢属于高危管理操作）
    await writeAuditLog(
      adminId,
      "user:batch_kick",
      {
        targetUserIds: kickable.map((u) => u.id),
        kickedCount: result.count,
        skippedSuperAdmin,
        reason: reason || null,
      },
      null,
      null,
      request
    );

    console.log(
      `[批量强踢] 管理员 ${adminId} 强制下线 ${result.count} 个用户（跳过超管 ${skippedSuperAdmin} 个）`
    );

    return NextResponse.json({
      success: true,
      message: `已成功强制下线 ${result.count} 个用户`,
      kickedCount: result.count,
      skippedSuperAdmin,
    });
  } catch (error) {
    console.error("Batch kick API error:", error);
    return NextResponse.json(
      { error: "批量强制下线失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
