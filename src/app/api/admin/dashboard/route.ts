import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    
    // 检查是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    // 并行获取所有统计数据
    const [
      totalUsers,
      totalWorkspaces,
      totalComponents,
      activeUsers,
      pendingReviews,
      systemLogs,
    ] = await Promise.all([
      // 总用户数
      prisma.user.count(),
      // 总工作空间数
      prisma.workspace.count(),
      // 总组件数（从 componenttask 统计）
      prisma.componenttask.count(),
      // 活跃用户数（最近 7 天创建的用户，模拟活跃用户）
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 待审核项目（这里用 componenttask 的 pending 状态模拟）
      prisma.componenttask.count({
        where: { status: "pending" },
      }),
      // 系统日志（最近 24 小时创建的任务）
      prisma.componenttask.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // 计算系统健康度（基于成功率）
    const completedTasks = await prisma.componenttask.count({
      where: { status: "completed" },
    });
    const totalTasks = await prisma.componenttask.count();
    const systemHealth =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;

    // 获取最近注册用户
    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // 获取最近工作空间
    const recentWorkspaces = await prisma.workspace.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          take: 1,
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalWorkspaces,
        totalComponents,
        activeUsers,
        pendingReviews,
        systemLogs,
        systemHealth: Number(systemHealth.toFixed(1)),
        recentUsers,
        recentWorkspaces,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return NextResponse.json(
      {
        error: "获取数据失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
