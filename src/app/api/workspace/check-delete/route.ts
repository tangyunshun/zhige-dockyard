import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 检查企业空间是否可以删除
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

    // 检查权限：只有空间所有者才能删除
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限删除此空间" }, { status: 403 });
    }

    // 检查是否可以删除
    const issues: string[] = [];
    const warnings: string[] = [];

    // 1. 检查是否有其他成员
    const otherMembers = workspace.members.filter((m: any) => m.userId !== userId);
    if (otherMembers.length > 0) {
      issues.push(`空间还有 ${otherMembers.length} 名成员，需要先移除或转移所有权`);
    }

    // 2. 获取组件任务统计（通过 tenantId 查询，因为 componenttask 使用 tenantId 关联工作空间）
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
      warnings.push(`空间有 ${inProgressTasks} 个进行中的组件任务，删除后将中断`);
    }

    if (completedTasks > 0) {
      warnings.push(`空间有 ${completedTasks} 个已完成的组件，删除后将不可用`);
    }

    // 4. 检查是否为用户最后一个企业空间
    const userEnterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    if (userEnterpriseWorkspaces.length === 1) {
      warnings.push("这是您的最后一个企业空间，删除后需要重新创建");
      
      // 检查是否还有个人空间
      const personalWorkspace = await prisma.workspace.findFirst({
        where: {
          ownerId: userId,
          type: "PERSONAL",
        },
      });

      if (!personalWorkspace) {
        warnings.push("删除后您将没有任何可用空间，需要重新创建");
      }
    }

    // 判断是否可以删除
    const canDelete = issues.length === 0;

    return NextResponse.json({
      canDelete,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        memberCount: workspace.members.length,
        componentCount: inProgressTasks + completedTasks,
      },
      issues,
      warnings,
    });
  } catch (error) {
    console.error("Check workspace deletion error:", error);
    return NextResponse.json(
      { error: "检查失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
