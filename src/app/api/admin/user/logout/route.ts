import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { userId: targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少目标用户 ID" }, { status: 400 });
    }

    // 不能强制管理员下线
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (isAdminRole(targetUser.role)) {
      return NextResponse.json(
        { error: "不能强制管理员下线" },
        { status: 400 },
      );
    }

    // 更新用户的 lastForcedLogoutAt 字段，记录强制下线时间
    // 宽限期（2 分钟）内用户仍然可以正常操作
    // 宽限期过后，API 会返回 401
    const now = new Date();
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        lastForcedLogoutAt: now,
        // 宽限期内保持 sessionToken 不变，让用户能继续操作
        // sessionToken 和 sessionExpiresAt 保持不变
        updatedAt: now,
      },
    });

    console.log(
      `[强制下线 API] 用户 ${targetUserId} 已被强制下线，时间：${now.toISOString()}`,
    );

    return NextResponse.json({
      success: true,
      message: "用户已被强制下线",
    });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json(
      {
        error: "强制下线失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
