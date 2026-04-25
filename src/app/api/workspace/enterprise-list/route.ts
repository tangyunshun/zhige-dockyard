import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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
    
    // 获取用户的所有企业空间
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    console.log("Found enterprise workspaces:", enterpriseWorkspaces.length);
    console.log("Workspaces:", JSON.stringify(enterpriseWorkspaces, null, 2));
    
    // 统计数据
    let totalComponents = 0;
    let totalActiveComponents = 0; // 进行中的任务
    let totalCompletedComponents = 0;
    let totalComponentCalls = 0; // 组件调用次数（通过 completed 任务计算）

    // 注意：Workspace 没有直接关联 componentTasks，需要通过其他方式获取
    // 这里暂时将组件数设为 0，实际应该从其他途径统计

    const totalMembers = enterpriseWorkspaces.reduce((sum: number, ws: any) => {
      return sum + (ws.members?.length || 0);
    }, 0);

    // 计算平均响应时间（模拟数据，实际应该从任务中计算）
    const avgResponseTime = 0;
    // 计算成功率（模拟数据，实际应该从任务结果计算）
    const successRate = 0;
    // 最近活动（暂时设为 0）
    const recentActivity = 0;
    // 活跃成员数（简单判断，实际应该检查 lastLoginAt）
    const activeMembers = enterpriseWorkspaces.reduce((sum: number, ws: any) => {
      return sum + (ws.members?.filter((m: any) => 
        m.user.email || m.user.avatar
      ).length || 0);
    }, 0);

    return NextResponse.json({
      workspaces: enterpriseWorkspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        createdAt: ws.createdAt,
        memberCount: ws.members?.length || 0,
        componentCount: 0, // 暂时设为 0
        activeTasks: 0,
        completedTasks: 0,
      })),
      statistics: {
        totalWorkspaces: enterpriseWorkspaces.length,
        totalComponents,
        totalActiveComponents,
        totalCompletedComponents,
        totalComponentCalls,
        avgResponseTime,
        successRate,
        recentActivity,
        totalMembers,
        activeMembers,
      },
    });
  } catch (error) {
    console.error("Get enterprise workspaces error:", error);
    return NextResponse.json(
      { error: "获取企业空间列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
