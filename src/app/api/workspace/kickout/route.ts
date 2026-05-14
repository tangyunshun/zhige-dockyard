import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 空间级别踢出接口
 * 将用户从指定工作空间移除，但不影响用户的全局会话
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

    const { workspaceId, userId } = await request.json();

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, type: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 检查用户是否是工作空间成员
    const member = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "用户不是该工作空间成员" },
        { status: 404 }
      );
    }

    // 检查用户是否是工作空间所有者（不能移除所有者）
    // 注意：Owner信息存储在workspace的ownerId字段中
    if (workspace.ownerId === userId) {
      return NextResponse.json(
        { error: "不能移除工作空间所有者" },
        { status: 403 }
      );
    }

    // 记录踢出历史
    const kickHistoryId = "kh_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    await prisma.workspacekickhistory.create({
      data: {
        id: kickHistoryId,
        workspaceId,
        workspaceName: workspace.name,
        userId,
        kickedBy: adminId,
        kickedByName: admin.name || admin.email || "管理员",
      },
    });

    // 移除成员
    await prisma.workspacemember.delete({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    console.log(
      `[空间踢出] 管理员 ${adminId} 将用户 ${userId} 从工作空间 ${workspaceId}(${workspace.name}) 移除`
    );

    return NextResponse.json({
      success: true,
      message: `已将用户从工作空间 ${workspace.name} 移除`,
      workspaceName: workspace.name,
    });
  } catch (error) {
    console.error("Workspace kickout error:", error);
    return NextResponse.json(
      { error: "踢出操作失败" },
      { status: 500 }
    );
  }
}