import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 检查个人空间是否可以删除
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

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 检查是否为个人空间
    if (workspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "此工作空间不是个人空间" }, { status: 400 });
    }

    // 检查权限：只有空间所有者才能删除
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限删除此空间" }, { status: 403 });
    }

    // 检查是否可以删除
    const issues: Array<{
      type: "error" | "warning";
      message: string;
      count?: number;
    }> = [];

    // 1. 检查是否有其他成员（除了所有者）
    const otherMembers = workspace.members.filter((m: any) => m.userId !== userId);
    if (otherMembers.length > 0) {
      issues.push({
        type: "error",
        message: `空间还有 ${otherMembers.length} 名成员，需要先移除或转移所有权`,
        count: otherMembers.length,
      });
    }

    // 2. 检查组件任务（通过 tenantId 查询）
    const inProgressTasks = await prisma.componenttask.count({
      where: {
        tenantId: workspaceId,
        status: "IN_PROGRESS",
      },
    });

    const completedTasks = await prisma.componenttask.count({
      where: {
        tenantId: workspaceId,
        status: "COMPLETED",
      },
    });

    if (inProgressTasks > 0) {
      issues.push({
        type: "error",
        message: `空间有 ${inProgressTasks} 个进行中的组件任务，需要先完成或取消`,
        count: inProgressTasks,
      });
    }

    if (completedTasks > 0) {
      issues.push({
        type: "error",
        message: `空间有 ${completedTasks} 个已完成的组件，删除后将不可用`,
        count: completedTasks,
      });
    }

    // 3. 检查项目
    const projectCount = await prisma.project.count({
      where: {
        workspaceId: workspaceId,
      },
    });

    if (projectCount > 0) {
      issues.push({
        type: "error",
        message: `空间有 ${projectCount} 个项目，需要先删除或转移`,
        count: projectCount,
      });
    }

    // 4. 检查是否为用户最后一个空间
    const userWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
      },
    });

    if (userWorkspaces.length === 1) {
      issues.push({
        type: "warning",
        message: "删除后您将没有任何可用空间，需要重新创建",
      });
    }

    // 判断是否可以删除
    const canDelete = !issues.some((issue) => issue.type === "error");

    return NextResponse.json({
      success: true,
      data: {
        canDelete,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type,
        },
        stats: {
          members: otherMembers.length,
          inProgressTasks,
          completedTasks,
          projects: projectCount,
        },
        issues,
      },
    });
  } catch (error) {
    console.error("Check personal workspace error:", error);
    return NextResponse.json(
      { error: "检测失败，请稍后重试" },
      { status: 500 }
    );
  }
}
