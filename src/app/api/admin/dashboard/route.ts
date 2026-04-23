import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    // 获取用户信息（从 session 或 token）
    const userId = authHeader.replace("Bearer ", "");
    console.log("Dashboard API - User ID from token:", userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    console.log(
      "Dashboard API - User found:",
      user ? { id: user.id, role: user.role } : "null",
    );

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在，请先登录" },
        { status: 404 },
      );
    }

    if (user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json(
        { error: "权限不足，需要管理员角色" },
        { status: 403 },
      );
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
      prisma.Workspace.count(),
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
    const recentWorkspaces = await prisma.Workspace.findMany({
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
