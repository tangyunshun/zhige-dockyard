import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 1. 查找名称包含 "Gao" 的所有工作空间
    const workspaces = await prisma.workspace.findMany({
      where: {
        name: {
          contains: "Gao",
        },
      },
    });

    const results = [];

    for (const ws of workspaces) {
      // 2. 统计这个空间下的成员数量
      const memberCount = await prisma.workspacemember.count({
        where: { workspaceId: ws.id },
      });

      // 3. 统计这个空间下的 componenttask (以 tenantId 为 workspaceId)
      const taskCount = await prisma.componenttask.count({
        where: { tenantId: ws.id },
      });

      // 4. 查询 componenttask 的统计信息 (如按类型 type 分组，或者按状态 status 分组)
      const taskGroupByType = await prisma.componenttask.groupBy({
        by: ["type"],
        where: { tenantId: ws.id },
        _count: {
          id: true,
        },
      });

      // 5. 查询最近创建的 20 个 componenttask
      const latestTasks = await prisma.componenttask.findMany({
        where: { tenantId: ws.id },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          createdAt: true,
          userId: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });

      results.push({
        workspace: ws,
        memberCount,
        taskCount,
        taskGroupByType,
        latestTasks,
      });
    }

    return NextResponse.json({
      success: true,
      queryTime: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error("Debug query error:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
}
