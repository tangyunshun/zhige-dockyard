﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 获取用户有权限访问的所有工作空间
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            workspacemember: {
              some: {
                userId,
              },
            },
          },
        ],
      },
      include: {
        workspacemember: true,
      },
    });

    const workspaceIds = workspaces.map((ws: any) => ws.id);

    // 获取所有属于这些工作空间的组件任务
    const componentTasks = await prisma.componenttask.findMany({
      where: {
        tenantId: {
          in: workspaceIds,
        },
      },
      select: {
        id: true,
        status: true,
        type: true,
        createdAt: true,
        completedAt: true,
        tenantId: true,
      },
    });

    // 按工作空间分组统计
    const statsByWorkspace = workspaceIds.map((workspaceId: string) => {
      const tasks = componentTasks.filter((t: any) => t.tenantId === workspaceId);
      const completed = tasks.filter((t: any) => t.status === 'COMPLETED').length;
      const inProgress = tasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
      const pending = tasks.filter((t: any) => t.status === 'PENDING').length;
      const failed = tasks.filter((t: any) => t.status === 'FAILED').length;
      
      return {
        workspaceId,
        total: tasks.length,
        completed,
        inProgress,
        pending,
        failed,
      };
    });

    // 总体统计
    const totalStats = {
      total: componentTasks.length,
      completed: componentTasks.filter((t: any) => t.status === 'COMPLETED').length,
      inProgress: componentTasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
      pending: componentTasks.filter((t: any) => t.status === 'PENDING').length,
      failed: componentTasks.filter((t: any) => t.status === 'FAILED').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        workspaces: statsByWorkspace,
        total: totalStats,
      },
    });
  } catch (error) {
    console.error("获取使用统计失败:", error);
    return NextResponse.json({ error: "获取使用统计失败" }, { status: 500 });
  }
}
