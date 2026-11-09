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
import { generateEnterpriseWorkspaceName } from "@/lib/workspace-naming";
import { getWorkspacePlanByKey, getWorkspacePlanStrict } from "@/lib/workspace-plan-service";
import { grantNewSpaceTrialQuota } from "@/lib/new-space-trial-quota";
import { migratePersonalGiftToEnterprisePool } from "@/lib/personal-gift-migration";
import { storageMbToBytes, type WorkspacePlanConfig } from "@/constants/workspace-plans";
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
  /** 指定工作空间配额记录 ID；缺省按 workspaceId 反查 */
  workspacequotaId?: string;
  /** KN-C1：已核验的套餐配置快照（R0-A3）——自助免支付来源时由 route 层严格读取后传入；
   *  传入后 resolveTargetConfig 跳过二次 DB 读取，直接以该快照贯穿全部写入，杜绝两次读取间配置漂移。 */
  verifiedPlanConfig?: WorkspacePlanConfig;
  /** [R0-A4 D1] 升级方式（retain/upgrade/delete），delete 已在服务层阻断 */
  option?: "retain" | "upgrade" | "delete";
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
  // [R0-A4 D1] delete 迁移方式在服务层兜底阻断（自查清单安全红线）
  if (input.option === "delete") {
    // [R0-A4 D1] 所有来源的 delete 迁移方式均阻断（包括管理员/签约），恢复需后续独立批次
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

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

  // 2. 解析目标套餐并贯穿已核验授权事实（避免「核验 STANDARD、实际开通 PRO」的漂移）。
  // 自助免支付来源必须显式携带目标，且以严格读取（不回退常量）在写边界重新核验；
  // 管理员 / 线下授予可沿用宽松读取与最低档回退（既有职责保留）。
  // KN-C1（R0-A3）：route 层已通过 getWorkspacePlanStrict 严格读取并核验的配置快照
  // 直接贯穿写入，不再二次 DB 读取，杜绝「核验 STANDARD → 写入时变 PRO」的时序漂移。
  // [R0-A4 D2] 快照贯穿写入 + 写前一致性核验。
  // [R0-A5 E1] 一致性核验扩展到全部实际写入事实：价格/资格之外还包括
  // 空间资源（maxComponents/maxMembers/maxStorage/maxApiCalls）、功能权益（features）、
  // 差异化赠送（trialGift.enabled/points/expireDays）与套餐名（账单标题）。
  let targetConfig: WorkspacePlanConfig | null = null;
  if (input.verifiedPlanConfig) {
    // 有快照：重新读取当前 DB 状态做一致性核验
    targetConfig = await verifyPlanSnapshotConsistency(input.targetPlanKey, input.verifiedPlanConfig);
  } else {
    targetConfig = await resolveTargetConfig(input);
  }
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }

  return applyEnterpriseUpgrade(
    {
      workspaceId: input.workspaceId,
      workspacequotaId: input.workspacequotaId,
      billingCycle: input.billingCycle,
      source: input.source,
      actorId: input.actorId,
    },
    { id: workspace.id, name: workspace.name, ownerId: workspace.ownerId },
    targetConfig,
  );
}

/**
 * [R0-A5 E1] 快照一致性核验：重新严格读取当前 DB 配置，与 route 层已确认的快照比较
 * 「本次升级写入实际会使用」的全部规范事实，任一变化即拒绝（PLAN_CONFIG_CHANGED），
 * 要求用户重新确认；通过后返回当前配置（内容与快照一致）供后续写入使用。
 *
 * 比较范围与 upgradePersonalToEnterprise 的实际写入一一对应（最小比较，可审查）：
 *  - 套餐身份/账单命名：key（workspace.plan、订单 metadata）、name（账单标题）
 *  - 价格/资格：priceMonthly、priceYearly（账单 amount）、purchasable（自助购买资格）
 *  - 空间资源：maxComponents/maxMembers/maxStorage/maxApiCalls（workspace.quota 与 workspacequota）
 *  - 功能权益：features（workspace.quota.features，按集合比较，顺序无关）
 *  - 差异化赠送：trialGift.enabled/points/expireDays（grantNewSpaceTrialQuota overrides）
 * 不比较 sortOrder、description、poolLowThreshold、并发/单文件/BYO 等本链路未写入的字段，
 * 也不引入报价有效期/通用版本框架。
 */
async function verifyPlanSnapshotConsistency(
  targetPlanKey: string | undefined,
  snap: WorkspacePlanConfig,
): Promise<WorkspacePlanConfig> {
  const current = await getWorkspacePlanStrict(targetPlanKey);
  if (!current.ok) {
    // PLAN_INACTIVE / TARGET_PLAN_NOT_FOUND / PLAN_NOT_PURCHASABLE_ONLINE / PLAN_PRICE_INVALID / PLAN_CONFIG_UNAVAILABLE
    throw new Error(current.code);
  }
  const curr = current.config;
  // trialGift 在 DB 可为 NULL（dbToConfig 会回退常量），统一成可比较的规范串
  const giftOf = (g: { enabled: boolean; points: number; expireDays: number } | null | undefined) =>
    g ? `${g.enabled ? 1 : 0}:${g.points}:${g.expireDays}` : "0:0:0";
  const changed =
    curr.key !== snap.key ||
    curr.name !== snap.name ||
    curr.priceMonthly !== snap.priceMonthly ||
    curr.priceYearly !== snap.priceYearly ||
    curr.purchasable !== snap.purchasable ||
    curr.maxComponents !== snap.maxComponents ||
    curr.maxMembers !== snap.maxMembers ||
    curr.maxStorage !== snap.maxStorage ||
    curr.maxApiCalls !== snap.maxApiCalls ||
    [...curr.features].sort().join("\u0001") !== [...snap.features].sort().join("\u0001") ||
    giftOf(curr.trialGift) !== giftOf(snap.trialGift);
  if (changed) {
    throw new Error("PLAN_CONFIG_CHANGED");
  }
  return curr;
}

/**
 * [R0-A5 E2] 企业开通的实际写入（私有）：套餐/配额/模型策略/操作日志/账单（原子事务）+ 差异化赠送。
 * 只做写入，不做配置核验——核验统一由公开入口（upgradePersonalToEnterprise /
 * provisionEnterpriseUpgrade）在任何业务写入之前完成后，把已核验配置传入本函数，
 * 避免「更深层另一次读取又造成先写后拒绝」的窗口。
 */
async function applyEnterpriseUpgrade(
  args: {
    workspaceId: string;
    workspacequotaId?: string;
    billingCycle?: "MONTH" | "YEAR";
    source?: UpgradeSource;
    actorId?: string | null;
  },
  workspace: { id: string; name: string; ownerId: string },
  targetConfig: WorkspacePlanConfig,
): Promise<UpgradePersonalToEnterpriseResult> {
  const cycle: "MONTH" | "YEAR" = args.billingCycle === "YEAR" ? "YEAR" : "MONTH";
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
      where: { id: args.workspaceId },
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
    let wsq = args.workspacequotaId
      ? await tx.workspacequota.findUnique({ where: { id: args.workspacequotaId } })
      : null;
    if (!wsq) wsq = await tx.workspacequota.findUnique({ where: { workspaceId: args.workspaceId } });

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
          workspaceId: args.workspaceId,
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
      where: { workspaceId: args.workspaceId },
    });
    if (!existingPolicy) {
      await tx.workspace_model_policy.create({
        data: {
          id: genId("wmp"),
          workspaceId: args.workspaceId,
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
        userId: args.actorId ?? workspace.ownerId,
        workspaceId: args.workspaceId,
        action: "UPGRADE_PERSONAL_TO_ENTERPRISE",
        resource: "Workspace",
        details: {
          fromType: "PERSONAL",
          toType: "ENTERPRISE",
          toPlan: targetConfig.key,
          source: args.source,
          billingCycle: cycle,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    await tx.billingrecord.create({
      data: {
        id: bilId,
        userId: workspace.ownerId,
        workspaceId: args.workspaceId,
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
          source: args.source,
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
      workspaceId: args.workspaceId,
      workspaceName: workspace.name,
      operatorId: args.actorId ?? null,
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

/**
 * 解析目标套餐配置；写边界重新核验，拒绝与已确认目标不一致。
 * - 自助免支付(SELF_SERVICE_PURCHASE)：必须显式传 targetPlanKey，且用严格读取（不回退常量）核验；
 *   缺失目标直接拒绝，不再自动挑更贵 / 排序更前的套餐。
 * - 管理员 / 线下授予(SALES_SIGNUP / ADMIN_MANUAL)：沿用宽松读取与最低档回退，保留既有职责。
 */
async function resolveTargetConfig(
  input: UpgradePersonalToEnterpriseInput,
): Promise<WorkspacePlanConfig | null> {
  if (input.targetPlanKey) {
    if (input.source === "SELF_SERVICE_PURCHASE") {
      const strict = await getWorkspacePlanStrict(input.targetPlanKey);
      return strict.ok ? strict.config : null;
    }
    return await getWorkspacePlanByKey(input.targetPlanKey);
  }
  if (input.source === "SELF_SERVICE_PURCHASE") {
    // 自助来源不允许无目标自动选档，交由调用方显式指定，杜绝漂移
    return null;
  }
  return await resolveDefaultEnterprisePlan();
}

/**
 * 实际开通企业空间（支付成功后的履约动作）。
 *
 * 与「先下单后开通」的支付链路配合：POST /api/workspace/upgrade 只创建 PENDING 订单，
 * 支付确认（MOCK 走 /api/payments/mock/confirm，REAL 走网关回调）之后再调用本函数真正建空间。
 * 内部逻辑与历史内联实现一致：新建空间 → 翻牌企业 → 迁移赠送额度 →（删除模式）清理原空间，
 * 并带孤儿空间补偿，杜绝「只建空间却未开通」的脏数据。
 */
/**
 * 个人空间升级为企业空间 —— 按升级方式分三种语义（与升级弹窗 / 升级页保持一致）：
 *  - retain ：方式1 并行创建 —— 新建一个空白企业空间，原个人空间原封不动保留；
 *  - upgrade：方式2 原地升级 —— 个人空间直接转成企业空间，数据原地不动，不新建、不迁移算力点；
 *  - delete ：方式3 迁移模式 —— 新建企业空间，把原个人空间的全部核心资产搬过去，原个人空间转为只读归档。
 */
export async function provisionEnterpriseUpgrade(input: {
  personalWorkspaceId: string;
  userId: string;
  option: "retain" | "upgrade" | "delete";
  targetPlanKey?: string;
  billingCycle?: "MONTH" | "YEAR";
  source?: UpgradeSource;
  /** KN-C1（R0-A3）：已核验的套餐配置快照，由 route 层传入后贯穿全部写入 */
  verifiedPlanConfig?: WorkspacePlanConfig;
}): Promise<{ newWorkspaceId: string; message: string; giftMigrated: number }> {
  const { personalWorkspaceId, userId, option } = input;
  const source = input.source || "SELF_SERVICE_PURCHASE";

  // [R0-A5 E3] delete 迁移方式对所有来源统一阻断（自助 / 管理员 / 签约 / 省略 source 的默认来源）：
  // 资产已迁入的目标空间曾因赠送迁移等后续故障触发 cleanupOrphan 删除，跨资产/账务的完整迁移
  // 恢复需后续独立批次；在任何业务写入之前明确拒绝，不把管理员权限视为可接受数据丢失的理由。
  if (option === "delete") {
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  const personalWorkspace = await prisma.workspace.findUnique({
    where: { id: personalWorkspaceId },
    select: { id: true, name: true, description: true, type: true, ownerId: true },
  });
  if (!personalWorkspace) throw new Error("WORKSPACE_NOT_FOUND");
  if (personalWorkspace.type !== "PERSONAL") throw new Error("NOT_PERSONAL_WORKSPACE");
  if (personalWorkspace.ownerId !== userId) throw new Error("NO_PERMISSION");

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const ownerName = owner?.name || null;
  const now = new Date();

  // ── [R0-A5 E2] 自助来源：最终配置核验前置到任何业务写入之前 ──
  // retain 不再「先建空间/成员 → 深层核验失败 → cleanupOrphan 删除」；改价/停用/资源或赠送变化
  // 在此处拒绝，零写入。核验通过的同一配置直接传入私有写函数 applyEnterpriseUpgrade，
  // 更深层不再二次读取造成「先写后拒绝」窗口。
  // 管理员 / 线下授予（无快照）沿用既有宽松解析职责，仍走 upgradePersonalToEnterprise 的写边界解析。
  let selfServiceConfig: WorkspacePlanConfig | null = null;
  if (input.verifiedPlanConfig) {
    selfServiceConfig = await verifyPlanSnapshotConsistency(input.targetPlanKey, input.verifiedPlanConfig);
    if (source === "SELF_SERVICE_PURCHASE" && !selfServiceConfig.purchasable) {
      throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
    }
  }

  // ── 方式2（upgrade）：原地升级，个人空间直接转为企业空间 ──
  // 不新建空间、不迁移算力点（原空间的注册赠送随空间一起转为企业空间内的额度），数据全部原地保留。
  if (option === "upgrade") {
    const enterpriseName = await generateEnterpriseWorkspaceName(userId, ownerName);
    if (selfServiceConfig) {
      // [R0-A5 E2] 已核验配置直接写入，不经 upgradePersonalToEnterprise 二次核验/读取
      await applyEnterpriseUpgrade(
        {
          workspaceId: personalWorkspaceId,
          billingCycle: input.billingCycle,
          source,
          actorId: userId,
        },
        { id: personalWorkspace.id, name: personalWorkspace.name, ownerId: personalWorkspace.ownerId },
        selfServiceConfig,
      );
    } else {
      await upgradePersonalToEnterprise({
        workspaceId: personalWorkspaceId,
        targetPlanKey: input.targetPlanKey,
        billingCycle: input.billingCycle,
        source,
        actorId: userId,
      });
    }
    await prisma.workspace.update({
      where: { id: personalWorkspaceId },
      data: { name: enterpriseName, updatedAt: now },
    });
    return {
      newWorkspaceId: personalWorkspaceId,
      message: "个人空间已升级为企业空间，原有数据全部保留",
      giftMigrated: 0,
    };
  }

  // ── 方式1（retain）：新建一个独立的企业空间（方式3 delete 已在入口统一拒绝） ──
  const newWorkspaceId = `ws-ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 补偿：若后续任意一步失败，清理已创建的孤儿企业空间，避免只建不开通
  const cleanupOrphan = async () => {
    try {
      await prisma.workspacemember.deleteMany({ where: { workspaceId: newWorkspaceId } });
      await prisma.workspace.deleteMany({ where: { id: newWorkspaceId } });
    } catch (cleanupErr) {
      console.error("[upgrade] 孤儿空间补偿删除失败:", cleanupErr);
    }
  };

  try {
    const enterpriseName = await generateEnterpriseWorkspaceName(userId, ownerName);
    await prisma.workspace.create({
      data: {
        id: newWorkspaceId,
        // retain 为空白壳（不抄个人空间描述）
        name: enterpriseName,
        description: null,
        type: "PERSONAL",
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.workspacemember.create({
      data: {
        id: `wsm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        workspaceId: newWorkspaceId,
        role: "OWNER",
        joinedAt: now,
      },
    });

    if (selfServiceConfig) {
      // [R0-A5 E2] 已核验配置直接写入（此时空间/成员已建，配置不可能再被深层核验拒绝）
      await applyEnterpriseUpgrade(
        {
          workspaceId: newWorkspaceId,
          billingCycle: input.billingCycle,
          source,
          actorId: userId,
        },
        { id: newWorkspaceId, name: enterpriseName, ownerId: userId },
        selfServiceConfig,
      );
    } else {
      // 统一升级服务：设置套餐 / 配额 / 模型策略 / 账单（原子事务）
      await upgradePersonalToEnterprise({
        workspaceId: newWorkspaceId,
        targetPlanKey: input.targetPlanKey,
        billingCycle: input.billingCycle,
        source,
        actorId: userId,
      });
    }

    return { newWorkspaceId, message: "已创建企业空间，个人空间已保留", giftMigrated: 0 };
  } catch (innerErr) {
    await cleanupOrphan();
    throw innerErr;
  }
}

/**
 * 方式3（迁移模式）：把原个人空间的「全部工作空间级资产」搬到新建的企业空间。
 * 在批量事务内原子执行——任一表更新失败则整体回滚，避免只搬一半导致数据撕裂。
 * 约定：
 *  - componenttask 以 tenantId 关联（非 workspaceId），单独按 tenantId 处理；
 *  - 空间级配置 workspacequota / workspace_model_policy 不搬——新企业空间已由
 *    upgradePersonalToEnterprise 重建专属配额与模型策略；
 *  - workspacemember 仅搬「非所有者」成员，所有者已随新企业空间创建。
 */
async function movePersonalAssetsToEnterprise(
  fromId: string,
  toId: string,
  ownerId: string,
) {
  await prisma.$transaction([
    prisma.asset.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.conversation.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.document.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.integration.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.project.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.operationlog.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspacepost.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.postmember.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspacekickhistory.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspaceinvitation.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspace_byo_model.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.user_byo_model_assignment.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.modelapplication.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspace_member_model_preference.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.quotaapply.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.componentusage.updateMany({ where: { workspaceId: fromId }, data: { workspaceId: toId } }),
    prisma.workspacemember.updateMany(
      { where: { workspaceId: fromId, userId: { not: ownerId } }, data: { workspaceId: toId } },
    ),
    prisma.componenttask.updateMany({ where: { tenantId: fromId }, data: { tenantId: toId } }),
  ]);
}

/**
 * 支付成功后按订单履约开通企业空间（幂等：已 SUCCESS 直接返回，不重复建空间）。
 * 由 /api/payments/mock/confirm（MOCK）或真实网关回调调用。
 */
export async function fulfillEnterpriseUpgradeFromOrder(orderNo: string): Promise<{
  newWorkspaceId: string;
  message: string;
  giftMigrated: number;
}> {
  const order = await prisma.billingrecord.findUnique({ where: { id: orderNo } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.type !== "PLAN_UPGRADE") throw new Error("ORDER_TYPE_MISMATCH");
  const meta = (order.metadata || {}) as Record<string, any>;
  if (order.status === "SUCCESS") {
    return {
      newWorkspaceId: meta.newWorkspaceId || "",
      message: "企业空间已开通",
      giftMigrated: 0,
    };
  }
  if (order.status !== "PENDING") throw new Error(`ORDER_STATE_${order.status}`);

  // [R0-A4 D1] 历史待支付订单的 option=delete 同样阻断（不执行危险迁移）
  if (meta.option === "delete") {
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  return provisionEnterpriseUpgrade({
    personalWorkspaceId: meta.workspaceId,
    userId: order.userId,
    option: meta.option,
    targetPlanKey: meta.targetPlan,
    billingCycle: meta.billingCycle,
    source: meta.source || "SELF_SERVICE_PURCHASE",
  });
}
