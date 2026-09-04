import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { storageMbToBytes, type WorkspacePlanKey } from "@/constants/workspace-plans";
import {
  getWorkspacePlans,
  getWorkspacePlanByKey,
} from "@/lib/workspace-plan-service";
import { mergeLimits } from "@/lib/limit-utils";

const generateId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

/**
 * GET /api/workspace/upgrade-plan?workspaceId=xxx
 * 查询空间当前套餐与可升级的套餐列表
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    let targetWorkspaceId = request.nextUrl.searchParams.get("workspaceId");

    // 若未传 workspaceId，自动兜底定位用户当前活跃或归属的工作空间
    if (!targetWorkspaceId) {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastWorkspaceId: true },
      });
      if (userRecord?.lastWorkspaceId) {
        targetWorkspaceId = userRecord.lastWorkspaceId;
      } else {
        const ownedWs = await prisma.workspace.findFirst({
          where: { ownerId: userId },
          select: { id: true },
        });
        if (ownedWs) {
          targetWorkspaceId = ownedWs.id;
        } else {
          const memberWs = await prisma.workspacemember.findFirst({
            where: { userId },
            select: { workspaceId: true },
          });
          targetWorkspaceId = memberWs?.workspaceId || null;
        }
      }
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({ error: "暂无可管理的工作空间" }, { status: 404 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        plan: true,
        quota: true,
        workspacequotaId: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const isOwner = workspace.ownerId === userId;
    const memberRecord = await prisma.workspacemember.findFirst({
      where: { userId, workspaceId: targetWorkspaceId },
      select: { role: true },
    });

    if (!isOwner && !memberRecord) {
      return NextResponse.json({ error: "无权访问此工作空间套餐信息" }, { status: 403 });
    }

    const currentConfig = await getWorkspacePlanByKey(workspace.plan);

    // 从数据库实时统计各项运行时数据，确保数据 100% 来源真实库表
    // 1. 真实已加入成员数 (workspacemember)
    const memberCount = await prisma.workspacemember.count({
      where: { workspaceId: targetWorkspaceId },
    });

    // 2. 真实已装配组件数 (componentusage)
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId: targetWorkspaceId },
      select: { componentId: true, metadata: true },
    });
    const boundIdSet = new Set<string>();
    usages.forEach((u) => {
      if (!u.metadata) return;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean") {
          if (meta.enabled) boundIdSet.add(u.componentId);
        } else {
          boundIdSet.add(u.componentId);
        }
      } catch {
        boundIdSet.add(u.componentId);
      }
    });
    if (boundIdSet.size === 0) {
      usages.forEach((u) => boundIdSet.add(u.componentId));
    }
    const componentCount = boundIdSet.size;

    // 3. 真实存储配额与使用量 (workspacequota)
    const quotaRecord = workspace.workspacequotaId
      ? await prisma.workspacequota.findUnique({ where: { id: workspace.workspacequotaId } })
      : await prisma.workspacequota.findUnique({ where: { workspaceId: targetWorkspaceId } });

    const storageUsedBytes = Number(quotaRecord?.storageUsed ?? 0);
    const storageUsedMB = Math.round((storageUsedBytes / (1024 * 1024)) * 100) / 100;
    const storageLimitMB =
      quotaRecord && Number(quotaRecord.storageLimit) > 0
        ? Math.round(Number(quotaRecord.storageLimit) / (1024 * 1024))
        : currentConfig.maxStorage;

    // 4. 真实 API 调用量 (apiusage 30 天统计 与 workspacequota 记录)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentApiCalls = await prisma.apiusage.count({
      where: {
        workspaceId: targetWorkspaceId,
        timestamp: { gte: thirtyDaysAgo },
      },
    }).catch(() => 0);
    const apiCallsUsed = Math.max(Number(quotaRecord?.apiCallsUsed ?? 0), recentApiCalls);
    const apiCallsLimit =
      quotaRecord && Number(quotaRecord.apiCallsLimit) > 0
        ? Number(quotaRecord.apiCallsLimit)
        : currentConfig.maxApiCalls;

    // 可在线购买的全部套餐（前端需要展示完整阶梯：当前、低阶禁用、高阶可升级）
    const allPlans = await getWorkspacePlans({ onlyActive: true, onlyPurchasable: true });
    // 仅阶梯高于当前套餐的选项，用于判断是否可以在线升级
    const availablePlans = allPlans.filter(
      (p) => p.sortOrder > currentConfig.sortOrder
    );

    return NextResponse.json({
      success: true,
      data: {
        workspace: { id: workspace.id, name: workspace.name, ownerId: workspace.ownerId },
        currentPlan: currentConfig,
        allPlans,
        availablePlans,
        /** 当前套餐已是最高可购买档时，前端改为引导线下定制 */
        canUpgrade: availablePlans.length > 0,
        /** 空间运行时真实用量与配额（100% 来自数据库实时统计） */
        realtimeUsage: {
          members: {
            used: memberCount,
            limit: currentConfig.maxMembers,
          },
          components: {
            used: componentCount,
            limit: currentConfig.maxComponents,
          },
          storage: {
            usedBytes: storageUsedBytes,
            usedMB: storageUsedMB,
            limitMB: storageLimitMB,
          },
          apiCalls: {
            used: apiCallsUsed,
            limit: apiCallsLimit,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get workspace plan error:", error);
    return NextResponse.json(
      { error: "获取空间套餐失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace/upgrade-plan
 * 升级空间套餐：同步更新 workspace.plan、workspace.quota 与 workspacequota 限额
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, targetPlan } = body as {
      workspaceId?: string;
      targetPlan?: string;
    };

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }
    if (!targetPlan) {
      return NextResponse.json({ error: "缺少目标套餐" }, { status: 400 });
    }

    const targetConfig = await getWorkspacePlanByKey(targetPlan);
    if (!targetConfig.purchasable) {
      return NextResponse.json(
        { error: "该套餐为线下定制方案，请联系专属架构师" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        plan: true,
        workspacequotaId: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "仅空间所有者可升级空间套餐" }, { status: 403 });
    }

    const currentConfig = await getWorkspacePlanByKey(workspace.plan);
    const currentPlan = currentConfig.key;
    if (currentPlan === targetConfig.key) {
      return NextResponse.json({ error: "当前已是该套餐" }, { status: 400 });
    }
    if (currentConfig.sortOrder >= targetConfig.sortOrder) {
      return NextResponse.json(
        { error: "不支持降级，如需调整请联系专属架构师" },
        { status: 400 }
      );
    }

    // 1. 更新空间套餐与配额快照（团队资源扩容包语义：一次购买、长期生效）
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: targetConfig.key,
        quota: {
          maxComponents: targetConfig.maxComponents,
          maxMembers: targetConfig.maxMembers,
          maxStorage: targetConfig.maxStorage,
          maxApiCalls: targetConfig.maxApiCalls,
          features: targetConfig.features,
        },
        updatedAt: new Date(),
      },
    });

    // 2. 同步 workspacequota 的硬性限额（存储单位由 MB 转换为字节）
    //    扩容包不附赠月算力：tokenBalance 保持不变，算力统一由「会员等级(月度保底) + 算力加油包(即时充值)」提供。
    //    存储/调用上限 = max(扩容包额度, 该空间绑定的会员等级基础保底)，两类权益叠加且互不缩水。
    const existingWsq = workspace.workspacequotaId
      ? await prisma.workspacequota.findUnique({ where: { id: workspace.workspacequotaId } })
      : null;

    let baseLevel:
      | { maxStorage: bigint; maxApiCalls: bigint; tokenLimit: bigint }
      | null = null;
    if (existingWsq?.membershipLevelId) {
      baseLevel = await prisma.membershiplevel.findFirst({
        where: {
          OR: [
            { id: existingWsq.membershipLevelId },
            { name: existingWsq.membershipLevelId },
          ],
        },
        select: { maxStorage: true, maxApiCalls: true, tokenLimit: true },
      });
    }

    const planStorageBytes = storageMbToBytes(targetConfig.maxStorage);
    const finalStorageLimit = baseLevel
      ? mergeLimits(planStorageBytes, baseLevel.maxStorage)
      : planStorageBytes;
    const finalApiCallsLimit = baseLevel
      ? mergeLimits(targetConfig.maxApiCalls, baseLevel.maxApiCalls)
      : targetConfig.maxApiCalls;

    if (workspace.workspacequotaId) {
      await prisma.workspacequota.update({
        where: { id: workspace.workspacequotaId },
        data: {
          storageLimit: BigInt(finalStorageLimit),
          apiCallsLimit: BigInt(finalApiCallsLimit),
          updatedAt: new Date(),
        },
      });
    } else {
      // 历史空间可能缺失配额记录，此处补齐：初始算力按该空间绑定的会员等级当月额度发放
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { membershipLevel: true },
      });
      const levelKey = user?.membershipLevel || "FREE";
      const memberLevel = await prisma.membershiplevel.findFirst({
        where: {
          OR: [{ id: levelKey }, { name: levelKey }],
        },
        select: { tokenLimit: true },
      });
      const baseTokens = Number(memberLevel?.tokenLimit ?? 0);
      await prisma.workspacequota.create({
        data: {
          id: generateId("wsq"),
          workspaceId,
          membershipLevelId: user?.membershipLevel || "FREE",
          tokenBalance: BigInt(baseTokens > 0 ? baseTokens : 0),
          storageLimit: BigInt(finalStorageLimit),
          apiCallsLimit: BigInt(finalApiCallsLimit),
          updatedAt: new Date(),
        },
      });
    }

    // 3. 记录操作日志，便于审计与运营追溯
    const logId = generateId("op");
    await prisma.operationlog.create({
      data: {
        id: logId,
        userId,
        workspaceId,
        action: "UPGRADE_WORKSPACE_PLAN",
        resource: "Workspace",
        details: {
          workspaceName: workspace.name,
          fromPlan: currentPlan,
          toPlan: targetConfig.key,
          planName: targetConfig.name,
        },
      },
    });

    // 4. 写入账单流水，使计费中心可查询到真实交易记录（金额单位：分）
    // 注：当前为系统内即时开通，未接入支付网关，故直接记为 SUCCESS；
    // 接入真实支付后应改为 PENDING，并由支付回调改为 SUCCESS。
    await prisma.billingrecord.create({
      data: {
        id: generateId("bil"),
        userId,
        workspaceId,
        type: "PLAN_UPGRADE",
        title: `空间「${workspace.name}」扩容至${targetConfig.name}（团队资源扩容包·一次性）`,
        amount: targetConfig.priceMonthly,
        currency: "CNY",
        status: "SUCCESS",
        channel: "SYSTEM",
        referenceId: logId,
        metadata: {
          workspaceName: workspace.name,
          fromPlan: currentPlan,
          toPlan: targetConfig.key,
          planName: targetConfig.name,
          billingModel: "ONE_TIME", // 一次性扩容（原订阅制月付/年付已下线）
          originalPriceYearly: targetConfig.priceYearly,
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `已为空间「${workspace.name}」开通${targetConfig.name}团队资源扩容包（一次性买断，长期生效）`,
      data: {
        plan: targetConfig,
        previousPlan: currentConfig,
      },
    });
  } catch (error) {
    console.error("Upgrade workspace plan error:", error);
    return NextResponse.json(
      { error: "升级空间套餐失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
