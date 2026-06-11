﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

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

    const userId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少目标用户 ID" }, { status: 400 });
    }

    // 清除用户的会话令牌和强制下线记录
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        lastForcedLogoutAt: null,
      },
    });

    console.log(
      `[清除会话 API] 已清除用户 ${targetUserId} 的会话令牌`,
    );

    return NextResponse.json({
      success: true,
      message: "已清除用户会话",
    });
  } catch (error) {
    console.error("Clear session error:", error);
    return NextResponse.json(
      {
        error: "清除会话失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
