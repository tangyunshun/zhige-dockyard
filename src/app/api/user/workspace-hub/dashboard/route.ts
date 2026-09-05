import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { getMembershipTokenLimit } from "@/lib/quota-token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    // 配额一律从 membershiplevel 表读取（不再硬编码）
    const maxEnterpriseWorkspaces = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
    const maxTeamSize = levelData ? Number(levelData.maxTeamSize) : 5;
    const maxStorage = levelData ? Number(levelData.maxStorage) : 1073741824;
    const maxApiCalls = levelData ? Number(levelData.maxApiCalls) : 1000;
    const tokenLimit = Number(await getMembershipTokenLimit(membershipLevel));

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

    // 本月组件真实任务执行扣费消耗（从 componenttask 统计真实发生的算力扣费）
    const monthTasksPromise = prisma.componenttask.findMany({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
        status: { in: ["SUCCESS", "RUNNING"] },
      },
      select: { config: true },
    });

    // 历史累计组件真实任务执行扣费消耗
    const totalTasksPromise = prisma.componenttask.findMany({
      where: {
        userId,
        status: { in: ["SUCCESS", "RUNNING"] },
      },
      select: { config: true },
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
    const [workspaceMembers, ownedWorkspaces, monthTasksRows, totalTasksRows, loginHistory] = await Promise.all([
      workspaceMembersPromise,
      ownedWorkspacesPromise,
      monthTasksPromise,
      totalTasksPromise,
      loginHistoryPromise,
    ]);

    // Token 消耗真实统计：遍历真实执行的任务 config.tokenCost
    const sumTaskCost = (tasks: { config: any }[]) => {
      let sum = 0;
      tasks.forEach((t) => {
        const cfg = (t.config && typeof t.config === "object" ? t.config : {}) as any;
        const cost = Number(cfg?.tokenCost ?? 0);
        if (Number.isFinite(cost) && cost > 0) {
          sum += cost;
        }
      });
      return sum;
    };
    const monthTokenUsed = sumTaskCost(monthTasksRows);
    const totalTokenUsed = sumTaskCost(totalTasksRows);

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
      const existing = workspaceMap.get(ws.id);
      workspaceMap.set(ws.id, {
        id: ws.id,
        name: ws.name,
        type: ws.type,
        ownerId: ws.ownerId,
        description: ws.description,
        logo: ws.logo,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt || existing?.updatedAt,
        role: existing?.role || "OWNER",
      });
    });

    // 如果没有个人空间，不再自动创建（符合 GET 无副作用原则），而是向前端返回需要创建的标记
    const hasPersonalWorkspace = Array.from(workspaceMap.values()).some(
      (ws) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );
    const needsPersonalWorkspace = !hasPersonalWorkspace;

    // 联合计算每个工作空间的成员数与组件数
    // 组件数统计口径与空间内 /api/studio?action=bound 完全一致：
    // 仅统计"真实装配记录"（componentusage.metadata 含 enabled 标记），纯使用日志不计入；
    // 且仅统计已发布组件（isPublished = true），系统内部引擎（如 AI_ENGINE）不计入，
    // 保证中枢计数与空间内组件大厅可见组件数严格一致。
    const publishedCatalogRows = await prisma.componentcatalog.findMany({
      where: { isPublished: true },
      select: { id: true },
    });
    const publishedComponentIdSet = new Set(publishedCatalogRows.map(c => c.id));

    // 批量拉取所有关联空间的真实配额数据，供空间卡片与全局算力资产统筹
    const workspaceIdList = Array.from(workspaceMap.keys());
    const quotaRecords = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: workspaceIdList } },
    });
    const quotaByWsId = new Map(quotaRecords.map(q => [q.workspaceId, q]));

    const workspacesWithCounts = await Promise.all(
      Array.from(workspaceMap.values()).map(async (ws) => {
        // 自动完成兜底自愈初始化（仅全新空间初始化默认组件，不覆盖用户装配/解除结果）
        await ensureDefaultComponents(ws.id, userId);

        const [usages, memberCount] = await Promise.all([
          prisma.componentusage.findMany({
            where: { workspaceId: ws.id },
            select: { componentId: true, metadata: true },
          }),
          prisma.workspacemember.count({
            where: { workspaceId: ws.id },
          }),
        ]);

        const boundIdSet = new Set<string>();
        usages.forEach(u => {
          if (!u.metadata) return;
          if (!publishedComponentIdSet.has(u.componentId)) return; // 未发布组件不计入
          try {
            const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
            if (meta && typeof meta.enabled === "boolean" && meta.enabled === true) {
              boundIdSet.add(u.componentId);
            }
          } catch {
            // metadata 解析失败：保守视为装配记录
            boundIdSet.add(u.componentId);
          }
        });

        const componentCount = boundIdSet.size;
        const wsQuota = quotaByWsId.get(ws.id);
        const serializedQuota = wsQuota ? {
          id: wsQuota.id,
          workspaceId: wsQuota.workspaceId,
          membershipLevelId: wsQuota.membershipLevelId,
          tokenBalance: Number(wsQuota.tokenBalance),
          storageUsed: Number(wsQuota.storageUsed || 0),
          storageLimit: Number(wsQuota.storageLimit || 0),
          apiCallsUsed: Number(wsQuota.apiCallsUsed || 0),
          apiCallsLimit: Number(wsQuota.apiCallsLimit || 0),
        } : null;

        return {
          ...ws,
          componentCount,
          memberCount,
          quota: serializedQuota,
          workspacequota: serializedQuota,
        };
      })
    );

    // 过滤个人工作空间与企业工作空间（个人空间仅返回本人 OWNER 的，避免展示他人空间）
    const personalWorkspace = workspacesWithCounts.find(
      ws => ws.type === "PERSONAL" && (ws.role === "OWNER" || ws.isOwner || ws.ownerId === userId)
    ) || null;
    const enterpriseWorkspaces = workspacesWithCounts.filter(ws => ws.type === "ENTERPRISE");

    // 会员特权与额度信息构建
    // 企业空间总数（含加入的）与"自己创建"数（创建配额口径，与前端列表/资源监控保持一致）
    const enterpriseCount = enterpriseWorkspaces.length;
    const ownedEnterpriseCount = enterpriseWorkspaces.filter(
      ws => ws.role === "OWNER" || ws.isOwner || ws.ownerId === userId
    ).length;
    const availableEnterpriseSlots = Math.max(0, maxEnterpriseWorkspaces - ownedEnterpriseCount);

    // 企业空间协同成员去重统计（跨空间不重复计数）
    let uniqueEnterpriseMemberCount = 0;
    const enterpriseWsIds = enterpriseWorkspaces.map(ws => ws.id);
    if (enterpriseWsIds.length > 0) {
      const entMembers = await prisma.workspacemember.findMany({
        where: { workspaceId: { in: enterpriseWsIds } },
        select: { userId: true },
      });
      uniqueEnterpriseMemberCount = new Set(entMembers.map(m => m.userId)).size;
    }

    // 存储用量真实统计：聚合用户所有空间的 workspacequota 记录
    const storageQuotas = quotaRecords;
    const storageUsed = storageQuotas.reduce((s, q) => s + Number(q.storageUsed), 0);
    const storageLimitAgg = storageQuotas.reduce((s, q) => s + Number(q.storageLimit), 0);

    // 真实算力点：区分用户在不同空间角色的归属与流通规则
    // 1. 个人空间算力（新用户赠送 100 点，老用户为其实际配额）
    let personalTokens = 0;
    if (personalWorkspace) {
      const pQuota = quotaByWsId.get(personalWorkspace.id);
      if (pQuota) {
        personalTokens = Number(pQuota.tokenBalance);
      }
    }
    // 仅在纯免费个人新用户（无任何企业空间且个人算力 <= 0）时兜底 100 初始点
    if (personalTokens <= 0 && membershipLevel === "FREE" && enterpriseCount === 0) {
      personalTokens = 100;
    }

    // 2. 企业空间所有者（Owner）算力池：
    // 用户作为企业空间所有者，企业空间配额池属于其本人资产，个人空间和企业空间均可调度使用，
    // 并且所有者可分配给协同成员使用。
    let ownedEnterpriseTokens = 0;
    enterpriseWorkspaces.forEach((ws) => {
      const isOwner = ws.role === "OWNER" || ws.isOwner || ws.ownerId === userId;
      if (isOwner) {
        const eq = quotaByWsId.get(ws.id);
        if (eq) {
          ownedEnterpriseTokens += Number(eq.tokenBalance);
        }
      }
    });

    // 3. 企业空间普通协同成员（Member）被分配的月度可用额度：
    // 若用户作为普通成员加入企业空间，其在该空间可调度的额度为 Owner 分配的 monthlyTokenLimit - monthlyTokenUsed
    let memberAllocatedTokens = 0;
    workspaceMembers.forEach((wm) => {
      if (wm.workspace && wm.workspace.type === "ENTERPRISE" && wm.workspace.ownerId !== userId) {
        const limit = wm.monthlyTokenLimit ? Number(wm.monthlyTokenLimit) : 0;
        const used = Number(wm.monthlyTokenUsed || 0);
        if (limit > 0 && limit > used) {
          memberAllocatedTokens += (limit - used);
        }
      }
    });

    // 全场景综合可用算力余额：
    // - 新用户（未充值、无企业空间）：personalTokens = 100，owned = 0，member = 0 => 100 点
    // - 老用户（拥有企业空间 Owner 资产）：个人空间 + 企业空间共享池（如 test-01: 10000 + 11490 = 21490 点）
    // - 协同成员用户：个人空间 + 被分配的企业额度
    const userAvailableTokens = personalTokens + ownedEnterpriseTokens + memberAllocatedTokens;

    const calculatedTotalTokens = tokenLimit === -1 ? -1 : Math.max(tokenLimit, userAvailableTokens + monthTokenUsed);

    const userQuota = {
      isVip: membershipLevel !== "FREE",
      membershipLevel,
      ownedEnterpriseCount,
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
          used: ownedEnterpriseCount,
          available: availableEnterpriseSlots,
        },
        maxTeamSize,
        maxStorage,
        storageUsed,
        storageLimit: storageLimitAgg > 0 ? storageLimitAgg : maxStorage,
        maxApiCalls,
        // 无限额度（tokenLimit = -1）：available 同样标记为 -1，避免被 Math.max(0, ...) 折叠成「0」
        tokenBalance: {
          total: calculatedTotalTokens,
          used: monthTokenUsed, // 本月真实任务消耗（新用户为 0）
          available: tokenLimit === -1 ? -1 : userAvailableTokens,
          historyTotalUsed: totalTokenUsed, // 历史累计任务消耗
          personalTokens,
          ownedEnterpriseTokens,
          memberAllocatedTokens,
        }
      }
    };

    // 4. 管理员专属宏观指标与滚动审批任务拉取
    let systemStats = null;
    let pendingApplicationsCount = 0;

    if (isAdmin) {
      // 并行拉取全系统关键运维指标（Token 消耗按组件目录 estimatedTokens 基准真实统计）
      const usageTokenMap = new Map(
        (await prisma.componentcatalog.findMany({ select: { id: true, estimatedTokens: true } }))
          .map((c) => [c.id, Number(c.estimatedTokens)])
      );
      const calcUsageTokens = (rows: { componentId: string }[]) =>
        rows.reduce((sum, r) => sum + (usageTokenMap.get(r.componentId) ?? 0), 0);

      const [
        totalUsers,
        totalWorkspaces,
        totalComponents,
        systemMonthUsageRows,
        systemTotalUsageRows,
        pendingCount,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.workspace.count(),
        prisma.componentcatalog.count(),
        prisma.componentusage.findMany({
          where: { usedAt: { gte: startOfMonth } },
          select: { componentId: true },
        }),
        prisma.componentusage.findMany({
          select: { componentId: true },
        }),
        prisma.upgradeapplication.count({
          where: { status: "PENDING" },
        }),
      ]);

      systemStats = {
        totalUsers,
        totalWorkspaces,
        totalComponents,
        monthTokens: calcUsageTokens(systemMonthUsageRows),
        totalTokens: calcUsageTokens(systemTotalUsageRows),
      };

      pendingApplicationsCount = pendingCount;
    }

    // 精确高频推荐组件算法：全空间覆盖 + (频次降序 + 最近使用时间降序) 双因子确定性稳定排序
    const userWorkspaceIdList = Array.from(workspaceMap.keys());
    const days30Ago = new Date();
    days30Ago.setDate(days30Ago.getDate() - 30);

    let topCompGroupBy = await (prisma.componentusage.groupBy as any)({
      by: ["componentId"],
      where: {
        usedAt: { gte: days30Ago },
        OR: [
          { userId },
          ...(userWorkspaceIdList.length > 0 ? [{ workspaceId: { in: userWorkspaceIdList } }] : []),
        ],
      },
      _count: { id: true },
      _max: { usedAt: true },
      orderBy: [
        { _count: { id: "desc" } },
        { _max: { usedAt: "desc" } },
      ],
      take: 10,
    });

    let isFallbackRecommend = topCompGroupBy.length === 0;
    if (isFallbackRecommend) {
      // 阶段 1：查询全网 30 天热门组件
      topCompGroupBy = await (prisma.componentusage.groupBy as any)({
        by: ["componentId"],
        where: { usedAt: { gte: days30Ago } },
        _count: { id: true },
        _max: { usedAt: true },
        orderBy: [
          { _count: { id: "desc" } },
          { _max: { usedAt: "desc" } },
        ],
        take: 10,
      });

      // 阶段 2：若全网 30 天内亦无记录，按历史全网最热组件排序
      if (topCompGroupBy.length === 0) {
        topCompGroupBy = await (prisma.componentusage.groupBy as any)({
          by: ["componentId"],
          _count: { id: true },
          _max: { usedAt: true },
          orderBy: [
            { _count: { id: "desc" } },
            { _max: { usedAt: "desc" } },
          ],
          take: 10,
        });
      }

      // 阶段 3：兜底保障：若库中暂无使用记录，自动从已发布目录提取前 3 个精选组件
      if (topCompGroupBy.length === 0) {
        const defaultComps = await prisma.componentcatalog.findMany({
          where: { isPublished: true },
          take: 3,
          select: { id: true },
        });
        topCompGroupBy = defaultComps.map((c) => ({
          componentId: c.id,
          _count: { id: 1 },
          _max: { usedAt: new Date() },
        }));
      }
    }

    const candidateIds = topCompGroupBy.map((item: any) => item.componentId);
    const catalogComps = await prisma.componentcatalog.findMany({
      where: { id: { in: candidateIds }, isPublished: true },
      select: { id: true, name: true },
    });
    const publishedIdSet = new Set(catalogComps.map((c) => c.id));
    const catalogNameMap = new Map(catalogComps.map((c) => [c.id, c.name]));

    // 过滤在线组件，并按 (1. 调用频次降序, 2. 最近使用时间降序) 进行确定性多维度稳定排序
    const sortedTopCompList = topCompGroupBy
      .filter((item: any) => publishedIdSet.has(item.componentId))
      .map((item: any) => ({
        componentId: item.componentId,
        callCount: Number(item._count?.id || 0),
        lastUsedAt: item._max?.usedAt ? new Date(item._max.usedAt).getTime() : 0,
      }))
      .sort((a: any, b: any) => {
        if (b.callCount !== a.callCount) {
          return b.callCount - a.callCount; // 第一关键字：过去30天调用频次降序
        }
        return b.lastUsedAt - a.lastUsedAt; // 第二关键字：最近一次使用时间戳降序
      })
      .slice(0, 3);

    const sortedIds = sortedTopCompList.map((item: any) => item.componentId);

    // 全网装载数：统计每个组件被多少不同空间使用（componentusage 去重 workspaceId）
    let globalWorkspaceCountMap = new Map<string, number>();
    if (sortedIds.length > 0) {
      const usageWorkspaces = await prisma.componentusage.findMany({
        where: { componentId: { in: sortedIds }, workspaceId: { not: null } },
        select: { componentId: true, workspaceId: true },
      });
      const seen = new Set<string>();
      usageWorkspaces.forEach((u) => {
        const key = `${u.componentId}|${u.workspaceId}`;
        if (!seen.has(key)) {
          seen.add(key);
          globalWorkspaceCountMap.set(u.componentId, (globalWorkspaceCountMap.get(u.componentId) || 0) + 1);
        }
      });
    }

    const topComponents = sortedTopCompList.map((item: any) => ({
      componentId: item.componentId,
      name: catalogNameMap.get(item.componentId) || `组件 ${item.componentId}`,
      callCount: item.callCount,
      lastUsedAt: item.lastUsedAt,
      globalWorkspaceCount: globalWorkspaceCountMap.get(item.componentId) || 0,
      isFallback: isFallbackRecommend,
    }));

    // 待处理事项：查询发给当前用户邮箱且尚未处理的邀请（来自数据库），供顶部"待处理事项"区块展示
    let pendingItems: any[] = [];
    if (dbUser.email) {
      const pendingInvitations = await prisma.workspaceinvitation.findMany({
        where: { email: dbUser.email, status: "PENDING" },
        select: { id: true, workspaceId: true, code: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (pendingInvitations.length > 0) {
        const invWsIds = pendingInvitations.map(i => i.workspaceId);
        const invWs = await prisma.workspace.findMany({
          where: { id: { in: invWsIds } },
          select: { id: true, name: true },
        });
        const invWsNameMap = new Map(invWs.map(w => [w.id, w.name]));
        pendingItems = pendingInvitations.map(inv => ({
          id: `inv-${inv.id}`,
          type: "INVITATION",
          title: "您收到新的工作空间邀请",
          description: `「${invWsNameMap.get(inv.workspaceId) || "未知空间"}」邀请您加入协作，点击接受即可进入空间`,
          createdAt: inv.createdAt.toISOString(),
          workspaceName: invWsNameMap.get(inv.workspaceId) || "",
          invitationCode: inv.code,
        }));
      }
    }

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
        uniqueEnterpriseMemberCount,
        pendingItems,
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
