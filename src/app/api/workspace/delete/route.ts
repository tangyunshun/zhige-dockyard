import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, action } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    if (!action || !["DELETE", "DEACTIVATE"].includes(action)) {
      return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
    }

    // 获取工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 检查权限
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 检查是否有其他成员
    const otherMembers = workspace.members.filter((m: any) => m.userId !== userId);
    if (otherMembers.length > 0) {
      return NextResponse.json(
        { error: "空间还有其他成员，请先移除或转移所有权" },
        { status: 400 }
      );
    }

    // 根据 action 参数执行不同的操作
    if (action === "DELETE") {
      // 物理删除
      // 先删除成员关系
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId },
      });

      // 删除空间（Prisma 会级联删除相关数据）
      await prisma.workspace.delete({
        where: { id: workspaceId },
      });
    } else if (action === "DEACTIVATE") {
      // 逻辑注销 - 只修改状态
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { status: "DISABLED" },
      });
    }

    // 记录操作日志
    try {
      await prisma.operationLog.create({
        data: {
          userId,
          workspaceId,
          action: "DELETE_WORKSPACE",
          resource: "Workspace",
          details: {
            workspaceName: workspace.name,
            reason: "用户主动注销",
          },
        },
      });
    } catch (logError) {
      // 日志记录失败不影响主要操作
      console.error("Failed to create operation log:", logError);
    }

    return NextResponse.json({
      success: true,
      message: "空间已注销",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    const errorMessage = error instanceof Error ? error.message : "操作失败";
    console.error("Error details:", errorMessage);
    return NextResponse.json(
      { error: errorMessage, details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
