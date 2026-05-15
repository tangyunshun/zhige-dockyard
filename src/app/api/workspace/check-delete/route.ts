import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 检查工作空间是否可以删除
export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取工作空间信息（只包含 workspacemember）
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 检查用户是否是所有者
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权删除该工作空间" }, { status: 403 });
    }

    // 检查工作空间是否可以删除
    const issues: string[] = [];
    const warnings: string[] = [];

    // 1. 检查工作空间是否有其他成员
    const otherMembers = workspace.workspacemember.filter((m) => m.userId !== userId);
    if (otherMembers.length > 0) {
      issues.push(`该工作空间还有 ${otherMembers.length} 个其他成员，请先移除所有成员`);
    }

    // 2. 检查是否有进行中的组件任务
    const activeTasks = await prisma.componenttask.count({
      where: {
        tenantId: workspaceId,
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    });

    if (activeTasks > 0) {
      warnings.push(`该工作空间还有 ${activeTasks} 个进行中的组件任务`);
    }

    return NextResponse.json({
      canDelete: issues.length === 0,
      issues,
      warnings,
    });
  } catch (error) {
    console.error("Check delete error:", error);
    const errorMessage = error instanceof Error ? error.message : "检查删除失败";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
