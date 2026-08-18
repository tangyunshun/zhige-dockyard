import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCache } from "@/lib/session-cache";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const requestUserId = request.headers.get("x-user-id");
    const requestUserRole = request.headers.get("x-user-role");

    // 校验是否为管理员角色
    const isAdmin = requestUserRole && [
      "admin",
      "super_admin",
      "superadmin",
      "ADMIN",
      "SUPERADMIN",
      "SUPER_ADMIN"
    ].includes(requestUserRole);

    if (!requestUserId || !isAdmin) {
      return NextResponse.json({ error: "FORBIDDEN", message: "您无权执行此操作" }, { status: 403 });
    }

    const { userId, reason } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "缺少必要参数 userId" }, { status: 400 });
    }

    const now = new Date();
    // 1. 更新用户表：lastForcedLogoutAt = now, sessionToken = null, sessionExpiresAt = null
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastForcedLogoutAt: now,
        sessionToken: null,
        sessionExpiresAt: null,
      }
    });

    // 2. 清除内存 sessionCache 中该用户的所有 session
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === userId) {
        sessionCache.delete(key);
      }
    }

    // 3. 写入审计日志 operationlog：action: "ADMIN_FORCE_LOGOUT"
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId: requestUserId,
        action: "ADMIN_FORCE_LOGOUT",
        resource: "user/session",
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        details: JSON.stringify({
          targetUserId: userId,
          reason: reason || "管理员强制下线",
        }),
      }
    });

    return NextResponse.json({ success: true, message: "用户已强制下线" });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "强制下线失败" }, { status: 500 });
  }
}
