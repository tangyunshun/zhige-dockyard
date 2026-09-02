import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { storageMbToBytes, type WorkspacePlanKey } from "@/constants/workspace-plans";
import {
  getWorkspacePlans,
  getWorkspacePlanByKey,
} from "@/lib/workspace-plan-service";

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
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true, plan: true, quota: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "仅空间所有者可管理空间套餐" }, { status: 403 });
    }

    const currentConfig = await getWorkspacePlanByKey(workspace.plan);
    const currentPlan = currentConfig.key;

    // 可在线购买的全部套餐（前端需要展示完整阶梯：当前、低阶禁用、高阶可升级）
    const allPlans = await getWorkspacePlans({ onlyActive: true, onlyPurchasable: true });
    // 仅阶梯高于当前套餐的选项，用于判断是否可以在线升级
    const availablePlans = allPlans.filter(
      (p) => p.sortOrder > currentConfig.sortOrder
    );

    return NextResponse.json({
      success: true,
      data: {
        workspace: { id: workspace.id, name: workspace.name },
        currentPlan: currentConfig,
        allPlans,
        availablePlans,
        /** 当前套餐已是最高可购买档时，前端改为引导线下定制 */
        canUpgrade: availablePlans.length > 0,
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

    // 1. 更新空间套餐与配额快照
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
    const existingWsq = workspace.workspacequotaId
      ? await prisma.workspacequota.findUnique({ where: { id: workspace.workspacequotaId } })
      : null;

    const newLevelLimit = BigInt(targetConfig.tokenLimit);
    const currentBal = existingWsq ? existingWsq.tokenBalance : BigInt(0);
    const finalTokenBalance = currentBal > newLevelLimit ? currentBal : newLevelLimit;

    const quotaUpdateData = {
      storageLimit: BigInt(storageMbToBytes(targetConfig.maxStorage)),
      apiCallsLimit: BigInt(targetConfig.maxApiCalls),
      // 升级后按新套餐刷新月度算力保底，且不覆盖更高的历史余量
      tokenBalance: finalTokenBalance,
      updatedAt: new Date(),
    };

    if (workspace.workspacequotaId) {
      await prisma.workspacequota.update({
        where: { id: workspace.workspacequotaId },
        data: quotaUpdateData,
      });
    } else {
      // 历史空间可能缺失配额记录，此处补齐
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { membershipLevel: true },
      });
      await prisma.workspacequota.create({
        data: {
          id: generateId("wsq"),
          workspaceId,
          membershipLevelId: user?.membershipLevel || "FREE",
          ...quotaUpdateData,
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
        title: `空间「${workspace.name}」套餐升级至${targetConfig.name}`,
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
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `空间套餐已升级为${targetConfig.name}`,
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
