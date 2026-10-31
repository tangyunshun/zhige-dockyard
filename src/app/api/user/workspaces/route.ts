import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { getLogicalWorkspaceRolesBatch } from "@/lib/security";
import { clearServerCache } from "@/lib/serverCache";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET - 获取用户的工作空间列表及全域空间资产概览
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const auth = await validateUser(authHeader, req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    // 并行查询用户基础会员信息、钱包余额、已批准申诉与关联工作空间列表
    const [dbUser, walletRecord, approvedAppeals, workspaces, myMemberRecords] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true, membershipLevel: true },
      }),
      prisma.userwallet.findUnique({
        where: { userId },
        select: { balance: true },
      }).catch(() => null),
      prisma.accountappeal.findMany({
        where: {
          userId,
          businessType: "空间解封申诉",
          status: "approved",
        },
        select: { appealEvidence: true },
      }).catch(() => []),
      prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { workspacemember: { some: { userId } } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          description: true,
          logo: true,
          plan: true,
          planExpiresAt: true,
          planBillingCycle: true,
          extraSeats: true,
          status: true,
          quota: true,
          industry: true,
          teamSize: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [
          { type: "asc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.workspacemember.findMany({
        where: { userId },
        select: {
          workspaceId: true,
          role: true,
          tokenBalance: true,
          monthlyTokenLimit: true,
          monthlyTokenUsed: true,
          joinedAt: true,
        },
      }),
    ]);

    const membershipLevel = dbUser?.membershipLevel || "FREE";
    const isAdmin = isAdminRole(dbUser?.role);
    const levelData = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel },
      select: { nameZh: true, maxEnterpriseWorkspaces: true, maxTeamSize: true, maxStorage: true },
    }).catch(() => null);

    const levelMaxEnterprise = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
    const maxEnterpriseWorkspaces = isAdmin ? Math.max(levelMaxEnterprise, 1) : levelMaxEnterprise;

    const approvedWsIdSet = new Set<string>();
    approvedAppeals.forEach((app) => {
      try {
        if (app.appealEvidence) {
          const parsed = JSON.parse(app.appealEvidence);
          if (parsed.workspaceId) approvedWsIdSet.add(parsed.workspaceId);
        }
      } catch {}
    });

    // 过滤掉非本人所有的他人 PERSONAL 空间，确保个人空间私密性
    const validWorkspaces = workspaces.filter(
      (ws) => ws.type !== "PERSONAL" || ws.ownerId === userId
    );
    const wsIds = validWorkspaces.map((w) => w.id);

    // 确保全新空间默认组件自愈一致（与空间中枢同源）
    await Promise.all(
      wsIds.map((wsId) => ensureDefaultComponents(wsId, userId).catch(() => {}))
    );

    // 批量拉取逻辑角色、空间配额、成员数、已发布组件目录、真实装配记录、任务数、文档数与用户岗位
    const [
      logicalRoleMap,
      quotas,
      members,
      publishedCatalogRows,
      usages,
      taskCounts,
      docCounts,
      myPosts,
    ] = await Promise.all([
      wsIds.length > 0 ? getLogicalWorkspaceRolesBatch(userId, wsIds) : Promise.resolve(new Map()),
      wsIds.length > 0
        ? prisma.workspacequota.findMany({ where: { workspaceId: { in: wsIds } } })
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.workspacemember.findMany({
            where: { workspaceId: { in: wsIds } },
            select: { workspaceId: true, userId: true },
          })
        : Promise.resolve([]),
      prisma.componentcatalog.findMany({
        where: { isPublished: true },
        select: { id: true },
      }),
      wsIds.length > 0
        ? prisma.componentusage.findMany({
            where: { workspaceId: { in: wsIds } },
            select: { workspaceId: true, componentId: true, metadata: true },
          })
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.componenttask.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: wsIds } },
            _count: { id: true },
          }).catch(() => [])
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.document.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: wsIds } },
            _count: { id: true },
          }).catch(() => [])
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.postmember.findMany({
            where: { userId, workspaceId: { in: wsIds } },
            include: { post: { select: { name: true, color: true } } },
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const quotaMap = new Map(quotas.map((q) => [q.workspaceId, q]));
    const myMemberMap = new Map(myMemberRecords.map((m) => [m.workspaceId, m]));

    const memberCountMap = new Map<string, number>();
    members.forEach((m) => {
      memberCountMap.set(m.workspaceId, (memberCountMap.get(m.workspaceId) || 0) + 1);
    });

    // 与空间中枢 /api/studio?action=bound 100% 同源：仅统计已发布且 metadata.enabled === true 的去重组件
    const publishedComponentIdSet = new Set(publishedCatalogRows.map((c) => c.id));
    const boundComponentSets = new Map<string, Set<string>>();
    usages.forEach((u) => {
      if (!u.workspaceId || !u.metadata) return;
      if (!publishedComponentIdSet.has(u.componentId)) return;
      let enabled = true;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean") {
          enabled = meta.enabled;
        } else {
          enabled = false;
        }
      } catch {
        enabled = true;
      }
      if (enabled) {
        const set = boundComponentSets.get(u.workspaceId) || new Set<string>();
        set.add(u.componentId);
        boundComponentSets.set(u.workspaceId, set);
      }
    });

    const taskCountMap = new Map<string, number>();
    (taskCounts as any[]).forEach((t) => {
      if (t.workspaceId) taskCountMap.set(t.workspaceId, t._count?.id || 0);
    });

    const docCountMap = new Map<string, number>();
    (docCounts as any[]).forEach((d) => {
      if (d.workspaceId) docCountMap.set(d.workspaceId, d._count?.id || 0);
    });

    const myPostsMap = new Map<string, Array<{ name: string; color: string }>>();
    (myPosts as any[]).forEach((pm) => {
      if (!pm.workspaceId || !pm.post) return;
      const arr = myPostsMap.get(pm.workspaceId) || [];
      arr.push({ name: pm.post.name, color: pm.post.color || "#3182ce" });
      myPostsMap.set(pm.workspaceId, arr);
    });

    let personalTokens = 0;
    let ownedEnterpriseTokens = 0;
    let memberAllocatedTokens = 0;

    // 组装纯净的业务对象，杜绝任何未转换的 BigInt 进入响应序列化
    const enrichedWorkspaces = validWorkspaces.map((ws) => {
      const q = quotaMap.get(ws.id);
      const myMember = myMemberMap.get(ws.id);
      const isOwner = ws.ownerId === userId;
      const role = isOwner
        ? "OWNER"
        : (logicalRoleMap.get(ws.id) || myMember?.role || "MEMBER");

      // 解析空间管控与自动解封状态（与空间中枢一致）
      let status = ws.status || "ACTIVE";
      const rawQuotaJson = (ws.quota as any) || {};
      let disabledUntil = rawQuotaJson.disabledUntil || null;
      let disabledReason = rawQuotaJson.disabledReason || null;
      let disabledDuration = rawQuotaJson.disabledDuration || null;
      let appealStatus = rawQuotaJson.appealStatus || "none";
      const appealCount = Number(rawQuotaJson.appealCount || 0);

      if (status === "DISABLED" && disabledUntil) {
        const expireTime = new Date(disabledUntil).getTime();
        if (!isNaN(expireTime) && Date.now() > expireTime) {
          status = "ACTIVE";
          disabledUntil = null;
          disabledReason = null;
          disabledDuration = null;
        }
      }
      if ((status === "DISABLED" || appealStatus === "pending") && approvedWsIdSet.has(ws.id)) {
        status = "ACTIVE";
        disabledUntil = null;
        disabledReason = null;
        disabledDuration = null;
        appealStatus = "approved";
      }

      const tokenBalance = q?.tokenBalance ? Number(q.tokenBalance) : 0;
      const storageUsed = q?.storageUsed ? Number(q.storageUsed) : 0;
      const storageLimit = q?.storageLimit ? Number(q.storageLimit) : 1073741824;
      const apiCallsUsed = q?.apiCallsUsed ? Number(q.apiCallsUsed) : 0;
      const apiCallsLimit = q?.apiCallsLimit ? Number(q.apiCallsLimit) : 1000;
      const memberCount = memberCountMap.get(ws.id) || 1;
      const componentCount = boundComponentSets.get(ws.id)?.size || 0;
      const taskCount = taskCountMap.get(ws.id) || 0;
      const documentCount = docCountMap.get(ws.id) || 0;

      // 协同成员个人在该企业空间的可用算力
      const memberTokenBalance = myMember?.tokenBalance ? Number(myMember.tokenBalance) : 0;
      const monthlyTokenLimit = myMember?.monthlyTokenLimit ? Number(myMember.monthlyTokenLimit) : null;
      const monthlyTokenUsed = myMember?.monthlyTokenUsed ? Number(myMember.monthlyTokenUsed) : 0;
      const memberMonthlyRemaining =
        monthlyTokenLimit !== null && monthlyTokenLimit > monthlyTokenUsed
          ? monthlyTokenLimit - monthlyTokenUsed
          : 0;
      const memberAvailableTokens = memberTokenBalance > 0 ? memberTokenBalance : memberMonthlyRemaining;

      if (ws.type === "PERSONAL" && isOwner) {
        personalTokens += tokenBalance;
      } else if (ws.type === "ENTERPRISE") {
        if (isOwner) {
          ownedEnterpriseTokens += tokenBalance;
        } else {
          memberAllocatedTokens += memberAvailableTokens;
        }
      }

      return {
        id: ws.id,
        name: ws.name,
        type: ws.type,
        ownerId: ws.ownerId,
        description: ws.description,
        logo: ws.logo,
        plan: ws.plan || "STANDARD",
        planExpiresAt: ws.planExpiresAt,
        planBillingCycle: ws.planBillingCycle,
        extraSeats: ws.extraSeats || 0,
        status,
        industry: ws.industry,
        teamSize: ws.teamSize,
        lastActiveAt: ws.lastActiveAt,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        joinedAt: myMember?.joinedAt || ws.createdAt,
        memberCount,
        componentCount,
        taskCount,
        documentCount,
        tokenBalance,
        memberAvailableTokens,
        monthlyTokenLimit,
        monthlyTokenUsed,
        storageUsed,
        storageLimit,
        apiCallsUsed,
        apiCallsLimit,
        isOwner,
        role,
        posts: myPostsMap.get(ws.id) || [],
        disabledUntil,
        disabledReason,
        disabledDuration,
        appealStatus,
        appealCount,
      };
    });

    const ownedEnterpriseCount = enrichedWorkspaces.filter(
      (w) => w.type === "ENTERPRISE" && w.isOwner
    ).length;
    const joinedEnterpriseCount = enrichedWorkspaces.filter(
      (w) => w.type === "ENTERPRISE" && !w.isOwner
    ).length;
    const walletBalance = walletRecord?.balance ? Number(walletRecord.balance) : 0;
    const totalAvailableTokens = personalTokens + ownedEnterpriseTokens + memberAllocatedTokens;

    const summary = {
      membershipLevel,
      membershipNameZh: levelData?.nameZh || (membershipLevel === "FREE" ? "免费体验版" : membershipLevel),
      maxEnterpriseWorkspaces,
      ownedEnterpriseCount,
      joinedEnterpriseCount,
      maxCollaborateWorkspaces: 5,
      walletBalance,
      personalTokens,
      ownedEnterpriseTokens,
      memberAllocatedTokens,
      totalAvailableTokens,
    };

    // 使用安全 replacer 进行深度 BigInt 兜底
    const safeData = JSON.parse(
      JSON.stringify(
        {
          success: true,
          data: enrichedWorkspaces,
          summary,
        },
        (key, value) => (typeof value === "bigint" ? Number(value) : value)
      )
    );

    return NextResponse.json(safeData);
  } catch (error) {
    console.warn("Get user workspaces error:", error);
    return NextResponse.json(
      { error: "获取用户工作空间列表失败" },
      { status: 500 }
    );
  }
}

// PUT - 更新用户工作空间
export async function PUT(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");
    const { name, description } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权限更新该工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      const rolesMap = await getLogicalWorkspaceRolesBatch(userId, [workspaceId]);
      const logicalRole = rolesMap.get(workspaceId);
      if (logicalRole !== "ADMIN") {
        return NextResponse.json(
          { error: "仅空间所有者或管理员有权更新工作空间信息" },
          { status: 403 }
        );
      }
    }

    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);

    // 更新工作空间
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name ? String(name).trim() : workspace.name,
        description: description !== undefined ? String(description).trim() : workspace.description,
        updatedAt: new Date(),
      },
    });

    clearServerCache();

    return NextResponse.json({
      success: true,
      data: updatedWorkspace,
      message: "工作空间已更新",
    });
  } catch (error: any) {
    console.error("Update workspace error:", error);
    return NextResponse.json(
      { error: error?.message || "更新工作空间失败" },
      { status: 500 }
    );
  }
}

// DELETE - 删除用户工作空间（级联清理关联数据，避免外键约束报错）
export async function DELETE(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "无权删除该工作空间" },
        { status: 403 }
      );
    }

    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);

    // 删除空间属高危操作：与空间中枢 /api/workspace/delete 同级要求二次身份验证，
    // 堵住"绕过中枢 check-delete + step-up 门禁直接裸删"的旁路
    const body = await req.json().catch(() => ({}));
    const { requireStepUp } = await import("@/lib/step-up");
    const stepUp = await requireStepUp(req, "delete_workspace", userId, { verifyToken: body?.verifyToken });
    if (!stepUp.ok) {
      return NextResponse.json(
        {
          error: stepUp.error,
          message:
            stepUp.error === "SEC_AUTH_REQUIRED"
              ? "删除工作空间属于高危操作，需要进行二次身份验证"
              : "验证令牌无效或已过期，请重新验证",
        },
        { status: stepUp.status },
      );
    }

    // 级联清理关联数据（componentusage / conversation 仅建立普通索引，不会随 workspace 级联删除）
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.workspacepost.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });

    clearServerCache();

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error: any) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: error?.message || "删除工作空间失败" },
      { status: 500 }
    );
  }
}
