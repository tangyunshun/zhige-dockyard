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

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    // 强制用户登出
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "已强制用户登出",
    });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json(
      { error: "强制登出失败" },
      { status: 500 }
    );
  }
}
