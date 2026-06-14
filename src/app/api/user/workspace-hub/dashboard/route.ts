import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 工作空间主控制台 Bento Dashboard 聚合数据 API 接口
 * 聚合拉取用户个人信息、工作空间列表、成员数/组件数、配额使用以及管理员专属待办与全站宏观监控指标
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 验证用户身份
    let userId = request.headers.get("x-user-id");
    let userRole = "user";
    
    const authHeader = request.headers.get("authorization");
    if (!userId) {
      if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer ") {
        const authResult = await validateUser(authHeader);
        if (authResult.valid) {
          userId = authResult.user!.id;
          userRole = authResult.user!.role || "user";
        }
      }
      
      // 双保险兜底逻辑：尝试从 Cookie 中直接读取未加密的 userId
      if (!userId) {
        const cookieUserId = request.cookies.get("userId")?.value;
        if (cookieUserId) {
          userId = cookieUserId;
          // 读取数据库获取角色
          const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          userRole = u?.role || "user";
        } else {
          return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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

    const maxEnterpriseWorkspaces = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
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

    // 并行运行基础用户数据查询
    const [workspaceMembers, ownedWorkspaces, monthUsageCount, totalUsageCount, topComponentsData] = await Promise.all([
      workspaceMembersPromise,
      ownedWorkspacesPromise,
      monthUsagePromise,
      totalUsagePromise,
      topComponentsPromise,
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

    // 如果没有个人工作空间，为其自动静默创建（兜底）
    const hasPersonalWorkspace = Array.from(workspaceMap.values()).some(
      (ws) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );

    if (!hasPersonalWorkspace) {
      const workspaceName = `个人空间 - ${dbUser.name || "极客"}`;
      const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date();

      const newWorkspace = await prisma.workspace.create({
        data: {
          id: workspaceId,
          name: workspaceName,
          type: "PERSONAL",
          ownerId: userId,
          description: `${dbUser.name || "极客"}的个人工作空间`,
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.workspacemember.create({
        data: {
          id: `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          userId,
          workspaceId: newWorkspace.id,
          role: "OWNER",
          updatedAt: now,
        },
      });

      await prisma.workspacequota.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: newWorkspace.id,
          membershipLevelId: membershipLevel,
          tokenBalance: BigInt(tokenLimit),
          updatedAt: now,
        },
      });

      workspaceMap.set(newWorkspace.id, {
        id: newWorkspace.id,
        name: newWorkspace.name,
        type: "PERSONAL",
        ownerId: userId,
        description: newWorkspace.description,
        createdAt: newWorkspace.createdAt,
        updatedAt: newWorkspace.updatedAt,
        role: "OWNER",
      });

      // 异步顺便更新用户 lastWorkspaceId 属性
      await prisma.user.update({
        where: { id: userId },
        data: { lastWorkspaceId: newWorkspace.id },
      }).catch(err => console.error("Update lastWorkspaceId failed:", err));
    }

    // 联合计算每个工作空间的成员数与组件数
    const workspacesWithCounts = await Promise.all(
      Array.from(workspaceMap.values()).map(async (ws) => {
        const [componentCount, memberCount] = await Promise.all([
          prisma.componenttask.count({
            where: { tenantId: ws.id },
          }),
          prisma.workspacemember.count({
            where: { workspaceId: ws.id },
          }),
        ]);

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
    const availableEnterpriseSlots = maxEnterpriseWorkspaces === -1 ? -1 : Math.max(0, maxEnterpriseWorkspaces - enterpriseCount);

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
        },
        personalWorkspace,
        enterpriseWorkspaces,
        userQuota,
        systemStats,
        pendingApplicationsCount,
        topComponents,
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
