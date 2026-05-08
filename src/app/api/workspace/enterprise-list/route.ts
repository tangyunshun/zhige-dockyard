﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
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
    
    // 获取用户的所有企业空间
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
      include: {
        workspacemember: {
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
    
    // 统计信息
    let totalComponents = 0;
    let totalActiveComponents = 0;
    let totalCompletedComponents = 0;
    let totalComponentCalls = 0;

    const totalMembers = enterpriseWorkspaces.reduce((sum: number, ws: any) => {
      return sum + (ws.workspacemember?.length || 0);
    }, 0);

    // 平均响应时间（暂时设为 0）
    const avgResponseTime = 0;
    // 成功率（暂时设为 0）
    const successRate = 0;
    // 最近活动（暂时设为 0）
    const recentActivity = 0;
    // 活跃成员数
    const activeMembers = enterpriseWorkspaces.reduce((sum: number, ws: any) => {
      return sum + (ws.workspacemember?.filter((m: any) => 
        m.user.email || m.user.avatar
      ).length || 0);
    }, 0);

    return NextResponse.json({
      workspaces: enterpriseWorkspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        createdAt: ws.createdAt,
        memberCount: ws.workspacemember?.length || 0,
        componentCount: 0,
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
