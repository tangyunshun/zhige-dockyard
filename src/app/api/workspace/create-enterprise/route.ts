import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { TEAM_SIZE_OPTIONS } from "@/lib/membership";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { storageMbToBytes } from "@/constants/workspace-plans";
import { getWorkspacePlanByKey } from "@/lib/workspace-plan-service";
import { mergeLimits } from "@/lib/limit-utils";
import { inheritFreeDefaultModelsForNewWorkspace } from "@/lib/platform-default-models";
import { grantNewSpaceTrialQuota } from "@/lib/new-space-trial-quota";

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 获取请求体
    const body = await request.json();
    const { 
      name, 
      description,
      teamSize,
      industry,
      contactEmail,
      contactPhone,
      logo,
      plan = "STANDARD",
      visibility = "PRIVATE",
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "请输入工作空间名称" }, { status: 400 });
    }

    if (!contactEmail || !contactEmail.trim()) {
      return NextResponse.json({ error: "请输入联系邮箱" }, { status: 400 });
    }

    // 检查用户的会员等级（配额一律以数据库 membershiplevel 为准，杜绝硬编码）
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    const userMembershipLevel = dbUser?.membershipLevel || 'FREE';

    let ml = await prisma.membershiplevel.findUnique({
      where: { id: userMembershipLevel },
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";
    // 企业空间上限取自数据库真实配额，-1 表示无限制
    const maxEnterpriseAllowed = ml ? Number(ml.maxEnterpriseWorkspaces) : 1;

    // 检查企业空间数量限制
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    if (maxEnterpriseAllowed !== -1 && enterpriseWorkspaces.length >= maxEnterpriseAllowed) {
      return NextResponse.json(
        { 
          error: `${ml?.nameZh || "当前会员等级"}最多可创建${maxEnterpriseAllowed}个企业空间，已达到上限`,
          currentLevel: mlId,
          maxEnterprise: maxEnterpriseAllowed,
        },
        { status: 403 }
      );
    }

    // 检查团队规模是否超出会员等级限制（一律以数据库 membershiplevel.maxTeamSize 为准）
    if (teamSize && ml) {
      const maxTeamSize = Number(ml.maxTeamSize); // -1 表示无限制
      const sizeRange = String(teamSize).split("-");
      const maxInRange = parseInt(sizeRange[sizeRange.length - 1] || "0", 10) || 0;
      if (maxTeamSize !== -1 && maxInRange > maxTeamSize) {
        const availableTeamSizes = TEAM_SIZE_OPTIONS.filter((option) => {
          const parts = option.value.split("-");
          const m = parseInt(parts[parts.length - 1] || "0", 10) || 0;
          return maxTeamSize === -1 || m <= maxTeamSize;
        }).map((option) => option.value);

        return NextResponse.json(
          {
            error: `${ml.nameZh}最大团队规模为${maxTeamSize}人，请选择较小的团队规模（可用选项：${availableTeamSizes.join(",") || "无"}）`,
            currentLevel: ml.nameZh,
            maxTeamSize,
          },
          { status: 403 }
        );
      }
    }

    // 获取计划配置（取自共享套餐模块，与空间套餐升级保持同一数据源）
    const planUpper = (plan || "STANDARD").toString().toUpperCase();
    const planConfig = await getWorkspacePlanByKey(planUpper);

    // 套餐可用性校验：已停用 / 仅限线下定制（不可在线售卖）的套餐不得用于创建空间，
    // 与升级链路 getWorkspacePlans({onlyActive, onlyPurchasable}) 保持同一口径，防止绕过
    const planRow = await prisma.workspaceplan
      .findUnique({
        where: { key: planUpper },
        select: { name: true, isActive: true, purchasable: true },
      })
      .catch(() => null);
    if (planRow && (!planRow.isActive || !planRow.purchasable)) {
      return NextResponse.json(
        {
          message: planRow.isActive
            ? `套餐「${planRow.name}」为线下定制套餐，不可在线创建空间，请更换套餐`
            : `套餐「${planRow.name}」已停用，不可用于创建空间，请更换套餐`,
        },
        { status: 400 },
      );
    }

    const quotaConfig = {
      maxMembers: planConfig.maxMembers,
      maxComponents: planConfig.maxComponents,
      maxStorage: planConfig.maxStorage,
      maxApiCalls: planConfig.maxApiCalls,
      features: planConfig.features,
    };

    // 余额制：新空间初始算力 0 起步，不预置任何会员免费额度
    // （算力仅来自注册福利 / 充值 / 购买算力加油包，杜绝“按会员等级白送”）
    const initialTokenBalance = 0;

    const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const workspaceId = generateId("ws");

    // 创建工作空间
    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: name.trim(),
        description: description?.trim() || null,
        type: "ENTERPRISE",
        ownerId: userId,
        teamSize: teamSize || null,
        industry: industry || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        logo: logo || null,
        plan: planUpper,
        visibility: visibility.toUpperCase(),
        status: "ACTIVE",
        quota: quotaConfig,
        updatedAt: new Date(),
        workspacemember: {
          create: {
            id: generateId("wsm"),
            userId,
            role: "OWNER",
          },
        },
        workspacequota: {
          create: {
            id: generateId("wsq"),
            workspaceId: workspaceId,
            membershipLevelId: mlId,
            tokenBalance: BigInt(initialTokenBalance), // 当月会员等级算力额度即时到账
            // 存储/调用上限 = max(空间扩容包额度, 账号会员等级基础保底)
            storageLimit: BigInt(
              mergeLimits(storageMbToBytes(planConfig.maxStorage), ml?.maxStorage)
            ),
            apiCallsLimit: BigInt(
              mergeLimits(planConfig.maxApiCalls, ml?.maxApiCalls)
            ),
            updatedAt: new Date(),
          }
        }
      },
      include: {
        workspacemember: true,
        workspacequota: true,
      },
    });

    // 物理载入并初始化默认组件
    await ensureDefaultComponents(workspace.id, userId);

    // 平台默认模型池：企业空间同样自动继承「默认免费模型」，保证开箱即用
    await inheritFreeDefaultModelsForNewWorkspace(workspace.id).catch((e) =>
      console.warn("[创建企业空间] 继承平台默认免费模型非致命提示:", e),
    );

    // 新空间体验额度：按企业套餐差异化赠送（plan.trialGift），独立于充值额度、优先消耗
    await grantNewSpaceTrialQuota({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      operatorId: userId,
      overrides: {
        enabled: planConfig.trialGift.enabled,
        points: planConfig.trialGift.points,
        expireDays: planConfig.trialGift.expireDays,
      },
    }).catch((e) => console.warn("[创建企业空间] 赠送体验额度非致命提示:", e));

    // 记录操作日志
    await prisma.operationlog.create({
      data: {
        id: generateId("op"),
        userId,
        workspaceId: workspace.id,
        action: "CREATE_ENTERPRISE_WORKSPACE",
        resource: "Workspace",
        details: {
          workspaceName: name,
          workspaceType: "ENTERPRISE",
          workspacePlan: plan,
          workspaceVisibility: visibility,
        },
      },
    });

    // 对含有 BigInt 字段的复杂对象进行安全转换，防止 JSON.stringify 崩溃
    const serializedWorkspace = JSON.parse(
      JSON.stringify(workspace, (key, value) => 
        typeof value === "bigint" ? Number(value) : value
      )
    );

    // P3：创建工作空间改变了中枢列表/配额等只读缓存内容，立即失效
    const { clearServerCache } = await import("@/lib/serverCache");
    clearServerCache();

    return NextResponse.json({
      success: true,
      message: "企业空间创建成功",
      workspace: serializedWorkspace,
    });
  } catch (error) {
    console.error("Create enterprise workspace error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      type: typeof error,
    });
    return NextResponse.json(
      { 
        error: "创建工作空间失败", 
        details: errorMessage,
        type: typeof error,
      },
      { status: 500 }
    );
  }
}

// 套餐配置已统一迁移至 @/constants/workspace-plans，由套餐升级接口共用，此处不再重复定义
