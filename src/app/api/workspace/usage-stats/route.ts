﻿import { NextRequest, NextResponse } from "next/server";
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

    // 获取组件目录真实 Token 消耗基准（estimatedTokens），用于统计真实算力消耗
    const catalogTokens = await prisma.componentcatalog.findMany({
      select: { id: true, estimatedTokens: true },
    });
    const tokenBaseMap = new Map(catalogTokens.map((c) => [c.id, Number(c.estimatedTokens)]));

    // 任务状态归一化：兼容 simulate(SUCCESS/FAILED)、use(completed 小写) 等实际写入状态
    const isCompletedStatus = (s: string) => ["COMPLETED", "SUCCESS", "DONE", "completed", "succeeded"].includes(s);
    const isInProgressStatus = (s: string) => ["IN_PROGRESS", "RUNNING", "running"].includes(s);
    const isPendingStatus = (s: string) => ["PENDING", "QUEUED", "pending", "queued"].includes(s);
    const isFailedStatus = (s: string) => ["FAILED", "ERROR", "failed"].includes(s);

    // 按工作空间分组统计
    const statsByWorkspace = workspaceIds.map((workspaceId: string) => {
      const tasks = componentTasks.filter((t: any) => t.tenantId === workspaceId);
      const completed = tasks.filter((t: any) => isCompletedStatus(t.status)).length;
      const inProgress = tasks.filter((t: any) => isInProgressStatus(t.status)).length;
      const pending = tasks.filter((t: any) => isPendingStatus(t.status)).length;
      const failed = tasks.filter((t: any) => isFailedStatus(t.status)).length;
      
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
      completed: componentTasks.filter((t: any) => isCompletedStatus(t.status)).length,
      inProgress: componentTasks.filter((t: any) => isInProgressStatus(t.status)).length,
      pending: componentTasks.filter((t: any) => isPendingStatus(t.status)).length,
      failed: componentTasks.filter((t: any) => isFailedStatus(t.status)).length,
    };

    // 计算成功率
    const successRate = totalStats.total > 0 
      ? Math.round((totalStats.completed / totalStats.total) * 100) 
      : 0;

    // 计算平均响应时间（真实数据：已完成任务的 createdAt → completedAt 平均耗时，单位秒）
    const completedTasks = componentTasks.filter((t: any) => isCompletedStatus(t.status) && t.completedAt);
    const totalDurationMs = completedTasks.reduce(
      (sum: number, t: any) => sum + Math.max(0, new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()),
      0,
    );
    const avgResponseTime = completedTasks.length > 0
      ? Number((totalDurationMs / completedTasks.length / 1000).toFixed(1))
      : 0;

    // 统计个人空间和企业空间数量
    const personalSpaceCount = workspaces.filter((ws: any) => ws.type === 'PERSONAL').length;
    const enterpriseSpaceCount = workspaces.filter((ws: any) => ws.type === 'ENTERPRISE').length;

    // 统计总成员数（跨空间按 userId 去重，避免重复计数）
    const uniqueMemberIds = new Set<string>();
    workspaces.forEach((ws: any) => {
      (ws.workspacemember || []).forEach((m: any) => uniqueMemberIds.add(m.userId));
    });
    const totalMembers = uniqueMemberIds.size;

    // 统计活跃组件（空间内真实装配并启用的组件，口径与空间内 bound 一致）
    const boundUsages = await prisma.componentusage.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { componentId: true, metadata: true },
    });
    const activeComponentIds = new Set<string>();
    boundUsages.forEach((u: any) => {
      if (!u.metadata) return;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean") activeComponentIds.add(u.componentId);
      } catch {
        activeComponentIds.add(u.componentId);
      }
    });
    // 历史数据回退：无任何带 enabled 标记的记录时，全部 usage 计入
    if (activeComponentIds.size === 0) {
      boundUsages.forEach((u: any) => activeComponentIds.add(u.componentId));
    }
    const activeComponents = activeComponentIds.size;

    // Token 消耗真实统计：各组件任务数 × 组件目录 estimatedTokens 基准
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyTasks = componentTasks.filter((t: any) => new Date(t.createdAt) >= startOfMonth);
    const calcTokens = (tasks: any[]) =>
      tasks.reduce((sum: number, t: any) => sum + (tokenBaseMap.get(t.type) ?? 0), 0);
    const monthlyTokens = calcTokens(monthlyTasks);
    const totalTokens = calcTokens(componentTasks);

    // 趋势数据（近 7 天 / 近 30 天每日 Token 消耗，按真实任务时间聚合）
    const buildTrend = (days: number) => {
      const points: number[] = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(today);
        dayStart.setHours(0, 0, 0, 0);
        dayStart.setDate(dayStart.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const dayTasks = componentTasks.filter((t: any) => {
          const ts = new Date(t.createdAt);
          return ts >= dayStart && ts < dayEnd;
        });
        points.push(calcTokens(dayTasks));
      }
      return points;
    };
    const trendData7d = buildTrend(7);
    const trendData30d = buildTrend(30);

    // Top 3 热门组件（按调用频次，名称从 component_catalog 读取）
    const typeCount = new Map<string, number>();
    componentTasks.forEach((t: any) => {
      typeCount.set(t.type, (typeCount.get(t.type) || 0) + 1);
    });
    const topTypes = Array.from(typeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topCatalog = await prisma.componentcatalog.findMany({
      where: { id: { in: topTypes.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    const topNameMap = new Map(topCatalog.map((c) => [c.id, c.name]));
    const topComponents = topTypes.map(([id, count]) => ({
      componentId: id,
      name: topNameMap.get(id) || `组件 ${id}`,
      callCount: count,
    }));

    // 存储空间：聚合用户所有 workspacequota 记录
    const quotaRows = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    const storageUsed = quotaRows.reduce((s, q) => s + Number(q.storageUsed), 0);
    const storageLimit = quotaRows.reduce((s, q) => s + Number(q.storageLimit), 0);

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
        completedCount: completedTasks.length, // 已完成任务数（归档资产）

        // 趋势图数据（真实聚合）
        trendData7d,
        trendData30d,

        // Top 3 热门组件（真实统计）
        topComponents,

        // 存储空间（真实配额）
        storage: {
          used: storageUsed,
          limit: storageLimit,
        },
      },
    });
  } catch (error) {
    console.warn("获取使用统计失败:", error);
    return NextResponse.json({ error: "获取使用统计失败" }, { status: 500 });
  }
}
