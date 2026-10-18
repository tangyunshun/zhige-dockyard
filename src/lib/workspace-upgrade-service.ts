/**
 * 个人空间升级为企业空间 —— 统一升级服务。
 *
 * 三种触发方式（线上自助 / 客户经理签约 / 平台手动）都收敛到本函数，保证：
 *  - 数据一致：type、套餐、订阅生命周期、配额、模型策略、算力赠送在一次事务内原子写入；
 *  - 权限正确：调用方各自在校验通过后传入 ownerId / actorId；
 *  - 幂等：① 若已是同一企业套餐且未过期，直接返回已升级态、不重复处理；
 *          ② 算力赠送基于 grantPoints 的 idempotencyKey(PLATFORM_TRIAL:<workspaceId>)，重复调用不重复入账。
 *
 * 模型策略沿用全站「三段式」（平台免费默认 + 空间 allowed − 空间 disabled），
 * 企业空间额外把平台 PAID 默认部署授权进白名单，使其可用付费模型。
 */

import { prisma } from "@/lib/prisma";
import { getWorkspacePlanByKey } from "@/lib/workspace-plan-service";
import { grantNewSpaceTrialQuota } from "@/lib/new-space-trial-quota";
import { storageMbToBytes } from "@/constants/workspace-plans";
import { mergeLimits } from "@/lib/limit-utils";

export type UpgradeSource = "SELF_SERVICE_PURCHASE" | "SALES_SIGNUP" | "ADMIN_MANUAL";

export interface UpgradePersonalToEnterpriseInput {
  /** 待升级的个人空间 ID */
  workspaceId: string;
  /** 目标企业套餐键（如 PRO / ENTERPRISE），缺省自动选取可在线购买的最低档企业套餐 */
  targetPlanKey?: string;
  billingCycle?: "MONTH" | "YEAR";
  source: UpgradeSource;
  /** 操作人（超管 / 客户经理），缺省取空间所有者；用于操作日志与账单 */
  actorId?: string | null;
  /** 强制重跑（即便已是企业且同套餐），默认 false */
  force?: boolean;
}

export interface UpgradePersonalToEnterpriseResult {
  workspaceId: string;
  /** true 表示已是目标企业套餐且未过期，本次为幂等空跑 */
  alreadyEnterprise: boolean;
  plan: string;
  quotaCreated: boolean;
  modelPolicyInitialized: boolean;
  trialGranted: number | null;
  billingRecordId: string | null;
}

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export async function upgradePersonalToEnterprise(
  input: UpgradePersonalToEnterpriseInput
): Promise<UpgradePersonalToEnterpriseResult> {
  // 1. 读取空间并做基础校验
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      id: true,
      name: true,
      type: true,
      ownerId: true,
      plan: true,
      planExpiresAt: true,
      workspacequotaId: true,
    },
  });
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  // 幂等：已是企业且与目标套餐一致、未过期 → 直接返回，不重复处理
  if (
    !input.force &&
    workspace.type === "ENTERPRISE" &&
    workspace.plan === (input.targetPlanKey || workspace.plan) &&
    workspace.planExpiresAt &&
    new Date(workspace.planExpiresAt) > new Date()
  ) {
    return {
      workspaceId: workspace.id,
      alreadyEnterprise: true,
      plan: workspace.plan,
      quotaCreated: false,
      modelPolicyInitialized: false,
      trialGranted: null,
      billingRecordId: null,
    };
  }

  // 2. 解析目标套餐（缺省选最低档可购买企业套餐）
  const targetConfig = input.targetPlanKey
    ? await getWorkspacePlanByKey(input.targetPlanKey)
    : await resolveDefaultEnterprisePlan();
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }

  const cycle: "MONTH" | "YEAR" = input.billingCycle === "YEAR" ? "YEAR" : "MONTH";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (cycle === "YEAR" ? 365 : 30) * 86400000);
  const cycleAmount = cycle === "YEAR" ? targetConfig.priceYearly : targetConfig.priceMonthly;

  // 平台 PAID 默认部署：授权企业空间可使用付费模型（沿用三段式模型策略）
  const paidDefaults = await prisma.platformdefaultmodel.findMany({
    where: { kind: "PAID", enabled: true },
    select: { deploymentId: true },
  });
  const paidIds = paidDefaults.map((x) => x.deploymentId).filter(Boolean);

  const logId = genId("op");
  const bilId = genId("bil");

  let quotaCreated = false;
  let modelPolicyInitialized = false;

  // 3. 原子事务：type / 套餐 / 配额 / 模型策略 / 操作日志 / 账单
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        type: "ENTERPRISE",
        plan: targetConfig.key,
        planStartedAt: now,
        planBillingCycle: cycle,
        planExpiresAt: expiresAt,
        quota: {
          maxComponents: targetConfig.maxComponents,
          maxMembers: targetConfig.maxMembers,
          maxStorage: targetConfig.maxStorage,
          maxApiCalls: targetConfig.maxApiCalls,
          features: targetConfig.features,
        },
        updatedAt: now,
      },
    });

    // 配额：已有则更新硬限额；缺失则补齐（余额 0 起步，赠送由下方统一处理）
    let wsq = input.workspacequotaId
      ? await tx.workspacequota.findUnique({ where: { id: input.workspacequotaId } })
      : null;
    if (!wsq) wsq = await tx.workspacequota.findUnique({ where: { workspaceId: input.workspaceId } });

    let baseLevel: { maxStorage: bigint; maxApiCalls: bigint; tokenLimit: bigint } | null = null;
    if (wsq?.membershipLevelId) {
      baseLevel = await tx.membershiplevel.findFirst({
        where: { OR: [{ id: wsq.membershipLevelId }, { name: wsq.membershipLevelId }] },
        select: { maxStorage: true, maxApiCalls: true, tokenLimit: true },
      });
    }
    const planStorageBytes = storageMbToBytes(targetConfig.maxStorage);
    const finalStorageLimit = baseLevel ? mergeLimits(planStorageBytes, baseLevel.maxStorage) : planStorageBytes;
    const finalApiCallsLimit = baseLevel
      ? mergeLimits(targetConfig.maxApiCalls, baseLevel.maxApiCalls)
      : targetConfig.maxApiCalls;

    if (wsq) {
      await tx.workspacequota.update({
        where: { id: wsq.id },
        data: {
          storageLimit: BigInt(finalStorageLimit),
          apiCallsLimit: BigInt(finalApiCallsLimit),
          enterpriseSlots: BigInt(targetConfig.maxMembers),
          updatedAt: now,
        },
      });
    } else {
      const owner = await tx.user.findUnique({
        where: { id: workspace.ownerId },
        select: { membershipLevel: true },
      });
      await tx.workspacequota.create({
        data: {
          id: genId("wsq"),
          workspaceId: input.workspaceId,
          membershipLevelId: owner?.membershipLevel || "FREE",
          tokenBalance: BigInt(0),
          storageLimit: BigInt(finalStorageLimit),
          apiCallsLimit: BigInt(finalApiCallsLimit),
          enterpriseSlots: BigInt(targetConfig.maxMembers),
          updatedAt: now,
        },
      });
      quotaCreated = true;
    }

    // 模型策略：仅当空间尚无策略时初始化（保留用户此前的自定义配置）
    const existingPolicy = await tx.workspace_model_policy.findUnique({
      where: { workspaceId: input.workspaceId },
    });
    if (!existingPolicy) {
      await tx.workspace_model_policy.create({
        data: {
          id: genId("wmp"),
          workspaceId: input.workspaceId,
          defaultDeploymentId: null,
          allowedDeploymentIds: paidIds,
          disabledDeploymentIds: [],
        },
      });
      modelPolicyInitialized = true;
    }

    await tx.operationlog.create({
      data: {
        id: logId,
        userId: input.actorId ?? workspace.ownerId,
        workspaceId: input.workspaceId,
        action: "UPGRADE_PERSONAL_TO_ENTERPRISE",
        resource: "Workspace",
        details: {
          fromType: "PERSONAL",
          toType: "ENTERPRISE",
          toPlan: targetConfig.key,
          source: input.source,
          billingCycle: cycle,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    await tx.billingrecord.create({
      data: {
        id: bilId,
        userId: workspace.ownerId,
        workspaceId: input.workspaceId,
        type: "PLAN_UPGRADE",
        title: `空间「${workspace.name}」升级为企业空间 · ${targetConfig.name}（${cycle === "YEAR" ? "年付" : "月付"}）`,
        amount: cycleAmount,
        currency: "CNY",
        status: "SUCCESS",
        channel: "SYSTEM",
        referenceId: logId,
        metadata: {
          upgradeType: "personal_to_enterprise",
          toPlan: targetConfig.key,
          source: input.source,
          billingCycle: cycle,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });

  // 4. 差异化算力赠送（幂等：PLATFORM_TRIAL:<workspaceId> 不重复入账）
  let trialGranted: number | null = null;
  if (targetConfig.trialGift?.enabled && targetConfig.trialGift.points > 0) {
    const g = await grantNewSpaceTrialQuota({
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
      operatorId: input.actorId ?? null,
      overrides: {
        enabled: true,
        points: targetConfig.trialGift.points,
        expireDays: targetConfig.trialGift.expireDays,
      },
    });
    trialGranted = g ? g.granted : null;
  }

  return {
    workspaceId: workspace.id,
    alreadyEnterprise: false,
    plan: targetConfig.key,
    quotaCreated,
    modelPolicyInitialized,
    trialGranted,
    billingRecordId: bilId,
  };
}

/** 选取可在线购买的最低档企业套餐作为默认目标 */
async function resolveDefaultEnterprisePlan() {
  const { getWorkspacePlans } = await import("@/lib/workspace-plan-service");
  const all = await getWorkspacePlans({ onlyActive: true });
  const candidates = all
    .filter((p) => p.purchasable)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return candidates[0] ?? null;
}
