import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
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

    const { userIds, status } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (!["active", "inactive", "banned"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: `已更新 ${userIds.length} 个用户状态`,
    });
  } catch (error) {
    console.error("Batch update users error:", error);
    return NextResponse.json(
      { error: "批量更新用户失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    const { userIds } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 不能删除管理员
    const adminUsers = await prisma.user.findMany({
      where: { 
        id: { in: userIds },
        role: { in: ["admin", "super_admin"] }
      },
    });

    if (adminUsers.length > 0) {
      return NextResponse.json({ 
        error: "不能删除管理员用户",
        count: adminUsers.length
      }, { status: 400 });
    }

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    return NextResponse.json({
      success: true,
      message: `已删除 ${userIds.length} 个用户`,
    });
  } catch (error) {
    console.error("Batch delete users error:", error);
    return NextResponse.json(
      { error: "批量删除用户失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
