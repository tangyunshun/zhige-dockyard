import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import {
  getWorkspacePlans,
  getWorkspacePlanByKey,
} from "@/lib/workspace-plan-service";
import { resolveEffectiveWorkspacePlan } from "@/lib/user-entitlement";

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

    // 套餐仅面向企业/团队空间（ENTERPRISE）：个人空间不参与套餐，任何兜底都不得解析到个人空间
    const ENTERPRISE_ONLY = { type: "ENTERPRISE" as const };

    // 若未传 workspaceId，自动兜底定位用户所属的企业空间（个人空间一律跳过）
    if (!targetWorkspaceId) {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastWorkspaceId: true },
      });
      if (userRecord?.lastWorkspaceId) {
        // lastWorkspaceId 可能指向个人空间，必须校验为企业空间才可作为套餐载体
        const lastWs = await prisma.workspace.findFirst({
          where: { id: userRecord.lastWorkspaceId, ...ENTERPRISE_ONLY },
          select: { id: true },
        });
        if (lastWs) {
          targetWorkspaceId = lastWs.id;
        }
      }
      if (!targetWorkspaceId) {
        const ownedWs = await prisma.workspace.findFirst({
          where: { ownerId: userId, ...ENTERPRISE_ONLY },
          select: { id: true },
        });
        if (ownedWs) {
          targetWorkspaceId = ownedWs.id;
        } else {
          const memberWs = await prisma.workspacemember.findFirst({
            where: { userId, workspace: ENTERPRISE_ONLY },
            select: { workspaceId: true },
          });
          targetWorkspaceId = memberWs?.workspaceId || null;
        }
      }
    }

    // 无企业空间时的兜底响应：超管/管理员 → 只读最高套餐视图（不落库）；普通用户 → 空态 404
    const buildNoEnterpriseView = async () => {
      if (isAdminRole(authResult.user!.role)) {
        const allPlans = await getWorkspacePlans({ onlyActive: true });
        const topPlan = allPlans
          .filter((p) => p.purchasable)
          .sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0))[0];
        const currentConfig = await getWorkspacePlanByKey(topPlan?.key || "FLAGSHIP");
        return NextResponse.json({
          success: true,
          data: {
            workspace: {
              id: "admin-default",
              name: "平台管理默认空间",
              ownerId: userId,
              planStartedAt: null,
              planExpiresAt: null,
              planBillingCycle: null,
            },
            currentPlan: currentConfig,
            allPlans,
            availablePlans: [],
            canUpgrade: false,
            /** 标记为超管默认视图：前端用于隐藏"增购席位"等需要真实空间的操作 */
            isDefaultAdminWorkspace: true,
            realtimeUsage: {
              members: { used: 0, limit: currentConfig.maxMembers ?? -1 },
              components: { used: 0, limit: currentConfig.maxComponents ?? -1 },
              storage: { usedBytes: 0, usedMB: 0, limitMB: currentConfig.maxStorage ?? 0 },
              apiCalls: { used: 0, limit: currentConfig.maxApiCalls ?? 0 },
            },
          },
        });
      }
      return NextResponse.json(
        { error: "暂无可开通套餐的企业空间 / 团队空间" },
        { status: 404 },
      );
    };

    if (!targetWorkspaceId) {
      return buildNoEnterpriseView();
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        type: true,
        plan: true,
        quota: true,
        workspacequotaId: true,
        planStartedAt: true,
        planExpiresAt: true,
        planBillingCycle: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 显式传入的 workspaceId 同样必须是企业/团队空间：个人空间不参与套餐
    if (workspace.type !== "ENTERPRISE") {
      return buildNoEnterpriseView();
    }

    const isOwner = workspace.ownerId === userId;
    const memberRecord = await prisma.workspacemember.findFirst({
      where: { userId, workspaceId: targetWorkspaceId },
      select: { role: true },
    });

    if (!isOwner && !memberRecord) {
      return NextResponse.json({ error: "无权访问此工作空间套餐信息" }, { status: 403 });
    }

    const currentConfig = await getWorkspacePlanByKey(
      resolveEffectiveWorkspacePlan(authResult.user!.role, workspace.plan),
    );

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

    // 席位 / 组件的真实准入上限由账号会员等级决定（成员加入、组件装配的强制点均读会员等级），
    // 套餐的 maxMembers / maxComponents 仅作标注值，不作为强制依据；此处取会员等级为展示口径，
    // 取不到时再回退套餐值，保证前端进度条展示的就是实际会生效的天花板。
    let levelTeamSize: number | null = null;
    let levelMaxComponents: number | null = null;
    if (quotaRecord?.membershipLevelId) {
      const levelRow = await prisma.membershiplevel
        .findFirst({
          where: {
            OR: [
              { id: quotaRecord.membershipLevelId },
              { name: quotaRecord.membershipLevelId },
            ],
          },
          select: { maxTeamSize: true, maxComponents: true },
        })
        .catch(() => null);
      if (levelRow) {
        levelTeamSize = Number(levelRow.maxTeamSize);
        levelMaxComponents = Number(levelRow.maxComponents);
      }
    }

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

    // 全部套餐（含线下定制版 CUSTOM，前端完整展示阶梯：当前、低阶禁用、高阶可升级、定制咨询）
    const allPlans = await getWorkspacePlans({ onlyActive: true });
    // 仅阶梯高于当前套餐且支持在线购买的选项，用于判断是否可以在线升级（CUSTOM 为线下定制，不参与在线购买）
    const availablePlans = allPlans.filter(
      (p) => p.sortOrder > currentConfig.sortOrder && p.purchasable
    );

    return NextResponse.json({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          ownerId: workspace.ownerId,
          planStartedAt: workspace.planStartedAt,
          planExpiresAt: workspace.planExpiresAt,
          planBillingCycle: workspace.planBillingCycle,
        },
        currentPlan: currentConfig,
        allPlans,
        availablePlans,
        /** 当前套餐已是最高可购买档时，前端改为引导线下定制 */
        canUpgrade: availablePlans.length > 0,
        /** 空间运行时真实用量与配额（100% 来自数据库实时统计） */
        realtimeUsage: {
          members: {
            used: memberCount,
            limit: levelTeamSize ?? currentConfig.maxMembers,
          },
          components: {
            used: componentCount,
            limit: levelMaxComponents ?? currentConfig.maxComponents,
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
 * [R0-A] POST /api/workspace/upgrade-plan
 * 空间套餐在线购买入口暂未开放：阻断直接开通套餐、改变配额或生成成功账单，避免绕过付款。
 * GET（只读展示）保持不变；本批仅拦截写入，不新建支付体系。
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // [R0-A] 空间套餐在线购买入口暂未开放：拒绝直接开通套餐、变更配额或生成成功账单。
    // 保留身份/归属校验，但未确认收款的升级一律拒绝，不修改 workspace.plan、配额、有效期，
    // 不创建成功账单或无法履约的待支付订单。
    return NextResponse.json(
      {
        error: "WORKSPACE_PLAN_CHECKOUT_UNAVAILABLE",
        message: "该套餐的在线购买流程尚未开放，本次未扣款、未变更套餐。",
        success: false,
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("Upgrade workspace plan error:", error);
    return NextResponse.json(
      { error: "升级空间套餐失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
