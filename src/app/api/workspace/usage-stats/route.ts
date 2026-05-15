import { NextRequest, NextResponse } from "next/server";
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

    // 计算成功率
    const successRate = totalStats.total > 0 
      ? Math.round((totalStats.completed / totalStats.total) * 100) 
      : 0;

    // 计算平均响应时间（模拟数据，实际需要从 component_task 中添加响应时间字段）
    const avgResponseTime = totalStats.total > 0 ? Math.round(Math.random() * 200 + 50) : 0;

    // 统计个人空间和企业空间数量
    const personalSpaceCount = workspaces.filter((ws: any) => ws.type === 'PERSONAL').length;
    const enterpriseSpaceCount = workspaces.filter((ws: any) => ws.type === 'ENTERPRISE').length;

    // 统计总成员数
    const totalMembers = workspaces.reduce((sum: number, ws: any) => sum + ws.workspacemember.length, 0);

    // 统计活跃组件（最近有任务的组件类型）
    const activeComponentTypes = new Set(componentTasks.map((t: any) => t.type));
    const activeComponents = activeComponentTypes.size;

    // 模拟 token 消耗数据（实际需要从 component_task 中添加 token 字段）
    const monthlyTokens = totalStats.total * Math.round(Math.random() * 1000 + 500);
    const totalTokens = monthlyTokens * Math.round(Math.random() * 12 + 1);

    return NextResponse.json({
      success: true,
      statistics: {
        // 核心指标
        totalComponentCalls: totalStats.total,
        activeComponents: activeComponents,
        successRate: successRate,
        avgResponseTime: avgResponseTime,
        
        // 空间统计
        personalSpaceCount: personalSpaceCount,
        enterpriseSpaceCount: enterpriseSpaceCount,
        totalMembers: totalMembers,
        totalComponents: totalStats.total,
        
        // Token 消耗
        monthlyTokens: monthlyTokens,
        totalTokens: totalTokens,
        
        // 最近活动
        weeklyTasks: totalStats.total, // 简化处理，使用总数
        completionRate: successRate,
      },
    });
  } catch (error) {
    console.warn("获取使用统计失败:", error);
    return NextResponse.json({ error: "获取使用统计失败" }, { status: 500 });
  }
}
