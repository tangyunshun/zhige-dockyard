import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
        workspacemember: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 验证权限
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权删除该工作空间" }, { status: 403 });
    }

    // 检查是否有其他成员
    const otherMembers = workspace.workspacemember.filter((m: any) => m.userId !== userId);
    if (otherMembers.length > 0) {
      return NextResponse.json(
        { error: "工作空间还有其他成员，请先移除所有成员后再删除" },
        { status: 400 }
      );
    }

    // 根据 action 执行不同的操作
    if (action === "DELETE") {
      // 删除工作空间
      await prisma.workspace.delete({
        where: { id: workspaceId },
      });
    } else if (action === "DEACTIVATE") {
      // 禁用工作空间
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { status: "DISABLED" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json({ error: "删除工作空间失败" }, { status: 500 });
  }
}
