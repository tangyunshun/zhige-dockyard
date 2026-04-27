import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
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

    if (targetUser.role === "admin" || targetUser.role === "super_admin") {
      return NextResponse.json({ error: "不能强制管理员下线" }, { status: 400 });
    }

    // 这里可以添加会话管理逻辑，比如清除 Redis 中的会话
    // 暂时只返回成功响应

    return NextResponse.json({
      success: true,
      message: "用户已被强制下线",
    });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json(
      { error: "强制下线失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
