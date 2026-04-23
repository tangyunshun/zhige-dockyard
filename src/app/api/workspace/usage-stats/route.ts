import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");

    // 获取用户的所有工作空间（个人 + 企业）
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
              },
            },
          },
        ],
      },
      include: {
        members: true,
      },
    });

    const workspaceIds = workspaces.map(ws => ws.id);

    // 获取用户相关的所有组件任务
    const componentTasks = await prisma.componentTask.findMany({
      where: {
        workspaceId: {
          in: workspaceIds,
        },
      },
      select: {
        id: true,
        status: true,
        stage: true,
        createdAt: true,
        completedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    // 统计数据
    const totalComponentCalls = componentTasks.filter(
      task => task.status === "COMPLETED"
    ).length;

    const activeComponents = componentTasks.filter(
      task => task.status === "IN_PROGRESS"
    ).length;

    const totalComponents = componentTasks.length;

    // 计算成功率
    const successRate = totalComponents > 0
      ? Math.round((totalComponentCalls / totalComponents) * 1000) / 10
      : 0;

    // 计算平均响应时间（模拟数据，实际应该从任务性能数据中计算）
    const avgResponseTime = totalComponentCalls > 0
      ? Math.round(Math.random() * 100 + 100)
      : 0;

    // 按空间类型统计
    const personalSpaceCount = workspaces.filter(ws => ws.type === "PERSONAL").length;
    const enterpriseSpaceCount = workspaces.filter(ws => ws.type === "ENTERPRISE").length;

    // 总成员数（只计算企业空间）
    const totalMembers = workspaces
      .filter(ws => ws.type === "ENTERPRISE")
      .reduce((sum, ws) => sum + ws.members.length, 0);

    // 最近 7 天活动
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentActivity = componentTasks.filter(
      task => new Date(task.createdAt) > sevenDaysAgo
    ).length;

    return NextResponse.json({
      statistics: {
        totalComponentCalls,
        activeComponents,
        totalComponents,
        successRate,
        avgResponseTime,
        personalSpaceCount,
        enterpriseSpaceCount,
        totalMembers,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("获取使用统计失败:", error);
    return NextResponse.json(
      { error: "获取使用统计失败" },
      { status: 500 }
    );
  }
}
