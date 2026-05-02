import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, role, status } = body;

    if (!userId) {
      return NextResponse.json({ error: "用户 ID 不能为空" }, { status: 400 });
    }

    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || (admin.role !== "admin" && admin.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 检查目标用户是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 不能修改超级管理员和自己
    if (targetUser.role === "super_admin" || targetUser.id === adminId) {
      return NextResponse.json(
        { error: "不能修改超级管理员或自己的账号" },
        { status: 403 },
      );
    }

    const updateData: any = {};
    if (role) {
      updateData.role = role;
    }
    if (status) {
      updateData.status = status;

      // 如果是停用用户，同时执行强制下线
      if (status === "inactive" || status === "banned") {
        updateData.lastForcedLogoutAt = new Date();
        updateData.sessionToken = null;
        updateData.sessionExpiresAt = null;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      {
        error: "更新用户信息失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "用户 ID 不能为空" }, { status: 400 });
    }

    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || (admin.role !== "admin" && admin.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 检查目标用户是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 不能删除超级管理员和自己
    if (targetUser.role === "super_admin" || targetUser.id === adminId) {
      return NextResponse.json(
        { error: "不能删除超级管理员或自己的账号" },
        { status: 403 },
      );
    }

    // 只能删除已停用的用户
    if (targetUser.status !== "inactive" && targetUser.status !== "banned") {
      return NextResponse.json(
        { error: "只能删除已停用的用户" },
        { status: 400 },
      );
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({
      success: true,
      message: "用户已删除",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      {
        error: "删除用户失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
