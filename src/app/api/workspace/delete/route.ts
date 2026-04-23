import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
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
    const otherMembers = workspace.members.filter(m => m.userId !== userId);
    if (otherMembers.length > 0) {
      return NextResponse.json(
        { error: "空间还有其他成员，请先移除或转移所有权" },
        { status: 400 }
      );
    }

    if (action === "DEACTIVATE") {
      // 注销操作：软删除，设置状态为 INACTIVE
      const deactivatedWorkspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          status: "INACTIVE",
          description: `[已注销] ${workspace.description || ""}`,
        },
      });

      // 记录操作日志
      await prisma.operationLog.create({
        data: {
          userId,
          workspaceId,
          action: "DEACTIVATE_WORKSPACE",
          resource: "Workspace",
          details: {
            workspaceName: workspace.name,
            reason: "用户主动注销",
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "空间已注销",
        workspace: deactivatedWorkspace,
      });
    } else {
      // 删除操作：先删除成员关系，再删除空间
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId },
      });

      // 删除空间（Prisma 会级联删除相关数据）
      await prisma.workspace.delete({
        where: { id: workspaceId },
      });

      // 记录操作日志
      await prisma.operationLog.create({
        data: {
          userId,
          workspaceId,
          action: "DELETE_WORKSPACE",
          resource: "Workspace",
          details: {
            workspaceName: workspace.name,
            reason: "用户主动删除",
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "空间已删除",
      });
    }
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: "操作失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
