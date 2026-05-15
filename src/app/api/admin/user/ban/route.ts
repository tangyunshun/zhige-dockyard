import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 封禁用户API
 * 支持永久封禁和临时封禁
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

    const { userId, duration, reason } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    // 不能封禁超级管理员
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (targetUser.role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "不能封禁超级管理员" }, { status: 403 });
    }

    // 计算封禁截止时间
    let bannedUntil: Date | null = null;
    if (duration && duration > 0) {
      bannedUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    }

    // 更新用户状态
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "banned",
        bannedUntil,
        sessionToken: null,
        sessionExpiresAt: null,
      },
    });

    console.log(`[封禁用户] 管理员 ${adminId} 封禁用户 ${userId}，时长: ${duration ? `${duration}天` : '永久'}，原因: ${reason || '未说明'}`);

    return NextResponse.json({
      success: true,
      message: bannedUntil 
        ? `用户已被临时封禁 ${duration} 天` 
        : "用户已被永久封禁",
      bannedUntil: bannedUntil?.toISOString(),
    });
  } catch (error) {
    console.error("Ban user error:", error);
    return NextResponse.json(
      { error: "封禁用户失败" },
      { status: 500 }
    );
  }
}