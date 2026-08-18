import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";

/**
 * 工作空间主控制台 Bento Dashboard 聚合数据 API 接口
 * 聚合拉取用户个人信息、工作空间列表、成员数/组件数、配额使用以及管理员专属待办与全站宏观监控指标
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 验证用户身份
    let userId: string | null = null;
    let userRole = "user";

    // 优先从中间件注入的 x-user-id 获取
    userId = request.headers.get("x-user-id");

    // 如果没有 x-user-id，尝试从 Authorization header 获取
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer ") {
        const authResult = await validateUser(authHeader);
        if (authResult.valid) {
          userId = authResult.user!.id;
          userRole = authResult.user!.role || "user";
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 2. 从数据库加载完整用户信息，确保与最新数据一致
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        role: true,
        membershipLevel: true,
        email: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const membershipLevel = dbUser.membershipLevel || "FREE";
    const isAdmin = dbUser.role === "admin" || dbUser.role === "super_admin";

    // 获取会员等级对应配额信息
    const levelData = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel },
    });

    const isVip = membershipLevel !== "FREE" || isAdmin;
    const maxEnterpriseWorkspaces = isVip ? 3 : 1;
    const maxTeamSize = levelData ? Number(levelData.maxTeamSize) : 5;
    const maxStorage = levelData ? Number(levelData.maxStorage) : 1073741824;
    const maxApiCalls = levelData ? Number(levelData.maxApiCalls) : 1000;
    const tokenLimit = membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;

    // 3. 并行查询工作空间列表、Token 消耗以及系统管理员指标（若为管理员）
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // 查询用户相关的 workspacemember 记录
    const workspaceMembersPromise = prisma.workspacemember.findMany({
      where: { userId },
      include: {
        workspace: true,
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    // 查询用户作为所有者的工作空间
    const ownedWorkspacesPromise = prisma.workspace.findMany({
      where: { ownerId: userId },
    });

    // 本月 Token 使用统计
    const monthUsagePromise = prisma.componentusage.count({
      where: {
        userId,
        usedAt: { gte: startOfMonth },
      },
    });

    // 历史累计 Token 使用统计
    const totalUsagePromise = prisma.componentusage.count({
      where: { userId },
    });

    // 查询最近使用最频繁的 Top 3 组件
    const topComponentsPromise = prisma.componentusage.groupBy({
      by: ["componentId"],
      where: { userId },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 3,
    });

    // 查询最近 3 次安全登录历史记录
    const loginHistoryPromise = prisma.loginhistory.findMany({
      where: { userId },
      orderBy: { loginAt: "desc" },
      take: 3,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        loginAt: true,
      },
    });

    // 并行运行基础用户数据查询
    const [workspaceMembers, ownedWorkspaces, monthUsageCount, totalUsageCount, topComponentsData, loginHistory] = await Promise.all([
      workspaceMembersPromise,
      ownedWorkspacesPromise,
      monthUsagePromise,
      totalUsagePromise,
      topComponentsPromise,
      loginHistoryPromise,
    ]);

    // 合并并去重工作空间
    const workspaceMap = new Map<string, any>();
    workspaceMembers.forEach((member) => {
      if (member.workspace) {
        workspaceMap.set(member.workspace.id, {
          id: member.workspace.id,
          name: member.workspace.name,
          type: member.workspace.type,
          ownerId: member.workspace.ownerId,
          description: member.workspace.description,
          logo: member.workspace.logo,
          createdAt: member.workspace.createdAt,
          updatedAt: member.workspace.updatedAt,
          role: member.role,
        });
      }
    });

    ownedWorkspaces.forEach((ws) => {
      if (!workspaceMap.has(ws.id)) {
        workspaceMap.set(ws.id, {
          id: ws.id,
          name: ws.name,
          type: ws.type,
          ownerId: ws.ownerId,
          description: ws.description,
          logo: ws.logo,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
          role: "OWNER",
        });
      }
    });

    // 如果没有个人空间，不再自动创建（符合 GET 无副作用原则），而是向前端返回需要创建的标记
    const hasPersonalWorkspace = Array.from(workspaceMap.values()).some(
      (ws) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );
    const needsPersonalWorkspace = !hasPersonalWorkspace;

    // 联合计算每个工作空间的成员数与组件数
    const workspacesWithCounts = await Promise.all(
      Array.from(workspaceMap.values()).map(async (ws) => {
        // 自动完成兜底自愈初始化
        await ensureDefaultComponents(ws.id, userId);

        const [usages, memberCount] = await Promise.all([
          prisma.componentusage.findMany({
            where: { workspaceId: ws.id },
            select: { componentId: true },
            distinct: ['componentId'],
          }),
          prisma.workspacemember.count({
            where: { workspaceId: ws.id },
          }),
        ]);

        const componentCount = usages.length;

        return {
          ...ws,
          componentCount,
          memberCount,
        };
      })
    );

    // 过滤个人工作空间与企业工作空间
    const personalWorkspace = workspacesWithCounts.find(ws => ws.type === "PERSONAL") || null;
    const enterpriseWorkspaces = workspacesWithCounts.filter(ws => ws.type === "ENTERPRISE");

    // 会员特权与额度信息构建
    const enterpriseCount = enterpriseWorkspaces.length;
    const availableEnterpriseSlots = Math.max(0, maxEnterpriseWorkspaces - enterpriseCount);

    const userQuota = {
      isVip: membershipLevel !== "FREE",
      membershipLevel,
      ownedEnterpriseCount: enterpriseCount,
      maxEnterpriseLimit: maxEnterpriseWorkspaces,
      workspaceLimits: {
        personalCount: personalWorkspace ? 1 : 0,
        personalLimit: 1,
        enterpriseCount: enterpriseCount,
        enterpriseLimit: maxEnterpriseWorkspaces,
      },
      quotas: {
        enterpriseSlots: {
          total: maxEnterpriseWorkspaces,
          used: enterpriseCount,
          available: availableEnterpriseSlots,
        },
        maxTeamSize,
        maxStorage,
        maxApiCalls,
        tokenBalance: {
          total: tokenLimit,
          used: monthUsageCount * 120, // 本月 Token 消耗
          available: Math.max(0, tokenLimit - (monthUsageCount * 120)),
          historyTotalUsed: totalUsageCount * 120, // 历史累计 Token 消耗
        }
      }
    };

    // 4. 管理员专属宏观指标与滚动审批任务拉取
    let systemStats = null;
    let pendingApplicationsCount = 0;

    if (isAdmin) {
      // 并行拉取全系统关键运维指标
      const [
        totalUsers,
        totalWorkspaces,
        totalComponents,
        systemMonthUsageCount,
        systemTotalUsageCount,
        pendingCount,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.workspace.count(),
        prisma.componenttask.count(),
        prisma.componentusage.count({
          where: { usedAt: { gte: startOfMonth } },
        }),
        prisma.componentusage.count(),
        prisma.upgradeapplication.count({
          where: { status: "PENDING" },
        }),
      ]);

      systemStats = {
        totalUsers,
        totalWorkspaces,
        totalComponents,
        monthTokens: systemMonthUsageCount * 120,
        totalTokens: systemTotalUsageCount * 120,
      };

      pendingApplicationsCount = pendingCount;
    }

    // 处理 Top 3 高频组件中文映射
    const componentNameMap: Record<string, string> = {
      C01: "标书智能解析与售后打单",
      C02: "需求定义与产品设计",
      C03: "合规与风控审计",
      C04: "标书智能解析",
      C05: "方案合规审查",
      C06: "竞品对比分析",
      C07: "汇报话术转换",
      C08: "异常场景补全",
      C09: "客诉归因分析",
      C10: "仿真数据生成",
    };

    const topComponents = topComponentsData.map((item) => ({
      componentId: item.componentId,
      name: componentNameMap[item.componentId] || `组件 ${item.componentId}`,
      callCount: item._count.id,
    }));

    // 5. 组装并返回 Bento Dashboard 的完整聚合数据，防前端多次加载引起的网络开销
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: dbUser.id,
          name: dbUser.name,
          avatar: dbUser.avatar,
          role: dbUser.role,
          membershipLevel,
          email: dbUser.email,
        },
        personalWorkspace,
        needsPersonalWorkspace,
        enterpriseWorkspaces,
        userQuota,
        systemStats,
        pendingApplicationsCount,
        topComponents,
        loginHistory,
      },
    });
  } catch (error) {
    console.error("Bento dashboard aggregation API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "获取 Dashboard 聚合数据失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}
