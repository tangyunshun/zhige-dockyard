﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { executeAdminUserDeletion } from "@/lib/admin-user-deletion";

export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { userIds, status } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "缺少用户 ID 列表" }, { status: 400 });
    }

    if (!["active", "inactive", "banned"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 保护管理员账号：不允许批量修改其状态
    const adminUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        OR: [
          { role: { contains: "admin", mode: "insensitive" } },
          { role: { contains: "super", mode: "insensitive" } },
        ],
      },
    });

    if (adminUsers.length > 0) {
      return NextResponse.json(
        { error: "不能修改管理员用户状态", count: adminUsers.length },
        { status: 400 }
      );
    }

    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: `已批量更新 ${userIds.length} 个用户状态`,
    });
  } catch (error) {
    console.error("Batch update users error:", error);
    return NextResponse.json(
      {
        error: "批量更新用户状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const userIds: string[] = body.userIds;
    const archivePersonalData = body.archivePersonalData === true;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "缺少用户 ID 列表" }, { status: 400 });
    }

    // 检查是否有管理员用户
    const adminUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        OR: [
          { role: { contains: "admin", mode: "insensitive" } },
          { role: { contains: "super", mode: "insensitive" } },
        ],
      },
    });

    if (adminUsers.length > 0) {
      return NextResponse.json(
        {
          error: "不能删除管理员用户",
          count: adminUsers.length,
        },
        { status: 400 },
      );
    }

    // 归属优先的安全删除：逐用户软删除，企业唯一所有者（情况 C）与个人空间
    // 所有者未归档（情况 A）将被拦截并计入 skipped，绝不物理删除。
    const skipped: { id: string; reason: string }[] = [];
    let processedCount = 0;
    for (const id of userIds) {
      try {
        await executeAdminUserDeletion(id, {
          adminId: userId,
          archivePersonalData,
        });
        processedCount += 1;
      } catch (execErr) {
        skipped.push({
          id,
          reason: execErr instanceof Error ? execErr.message : "删除被拦截",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `已软删除 ${processedCount} 个用户${skipped.length ? `，${skipped.length} 个被拦截` : ""}`,
      processedCount,
      skippedCount: skipped.length,
      skipped,
    });
  } catch (error) {
    console.error("Batch delete users error:", error);
    return NextResponse.json(
      {
        error: "批量删除用户失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
