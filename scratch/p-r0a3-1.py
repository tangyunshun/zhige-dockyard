# -*- coding: utf-8 -*-
# R0-A3 修复批次 1：workspace-upgrade-service.ts 核心改造
# C1: verifiedPlanConfig 贯穿写入（不再二次读取）
# C2: retain/delete 先核验再写入（配置快照已由 route 验证）
import io

P = "src/lib/workspace-upgrade-service.ts"
s = io.open(P, encoding="utf-8").read()

# ── 1. UpgradePersonalToEnterpriseInput 加 verifiedPlanConfig ──
old = """  /** 强制重跑（即便已是企业且同套餐），默认 false */
  force?: boolean;
  /** 指定工作空间配额记录 ID；缺省按 workspaceId 反查 */
  workspacequotaId?: string;
}"""
new = """  /** 强制重跑（即便已是企业且同套餐），默认 false */
  force?: boolean;
  /** 指定工作空间配额记录 ID；缺省按 workspaceId 反查 */
  workspacequotaId?: string;
  /** KN-C1：已核验的套餐配置快照（R0-A3）——自助免支付来源时由 route 层严格读取后传入；
   *  传入后 resolveTargetConfig 跳过二次 DB 读取，直接以该快照贯穿全部写入，杜绝两次读取间配置漂移。 */
  verifiedPlanConfig?: WorkspacePlanConfig;
}"""
assert old in s, "input type"
s = s.replace(old, new, 1)

# ── 2. resolveTargetConfig 调用改为：有快照直接用，无快照走原逻辑 ──
old = """  const targetConfig = await resolveTargetConfig(input);
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }"""
new = """  // KN-C1（R0-A3）：route 层已通过 getWorkspacePlanStrict 严格读取并核验的配置快照
  // 直接贯穿写入，不再二次 DB 读取，杜绝「核验 STANDARD → 写入时变 PRO」的时序漂移。
  const targetConfig = input.verifiedPlanConfig || (await resolveTargetConfig(input));
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }"""
assert old in s, "resolveTargetConfig"
s = s.replace(old, new, 1)

# ── 3. provisionEnterpriseUpgrade input 加 verifiedPlanConfig ──
old = """export async function provisionEnterpriseUpgrade(input: {
  personalWorkspaceId: string;
  userId: string;
  option: "retain" | "upgrade" | "delete";
  targetPlanKey?: string;
  billingCycle?: "MONTH" | "YEAR";
  source?: UpgradeSource;
}): Promise<{ newWorkspaceId: string; message: string; giftMigrated: number }> {"""
new = """export async function provisionEnterpriseUpgrade(input: {
  personalWorkspaceId: string;
  userId: string;
  option: "retain" | "upgrade" | "delete";
  targetPlanKey?: string;
  billingCycle?: "MONTH" | "YEAR";
  source?: UpgradeSource;
  /** KN-C1（R0-A3）：已核验的套餐配置快照，由 route 层传入后贯穿全部写入 */
  verifiedPlanConfig?: WorkspacePlanConfig;
}): Promise<{ newWorkspaceId: string; message: string; giftMigrated: number }> {"""
assert old in s, "provision input"
s = s.replace(old, new, 1)

# ── 4. provisionEnterpriseUpgrade 内部三个调用点透传 verifiedPlanConfig ──
# 4a. upgrade 路径
old = """    await upgradePersonalToEnterprise({
      workspaceId: personalWorkspaceId,
      targetPlanKey: input.targetPlanKey,
      billingCycle: input.billingCycle,
      source,
      actorId: userId,
    });
    await prisma.workspace.update({
      where: { id: personalWorkspaceId },
      data: { name: enterpriseName, updatedAt: now },
    });"""
new = """    await upgradePersonalToEnterprise({
      workspaceId: personalWorkspaceId,
      targetPlanKey: input.targetPlanKey,
      billingCycle: input.billingCycle,
      source,
      actorId: userId,
      verifiedPlanConfig: input.verifiedPlanConfig,
    });
    await prisma.workspace.update({
      where: { id: personalWorkspaceId },
      data: { name: enterpriseName, updatedAt: now },
    });"""
assert old in s, "upgrade path"
s = s.replace(old, new, 1)

# 4b. retain/delete 路径（在建空间和成员之前透传）
old = """    await upgradePersonalToEnterprise({
      workspaceId: newWorkspaceId,
      targetPlanKey: input.targetPlanKey,
      billingCycle: input.billingCycle,
      source,
      actorId: userId,
    });"""
new = """    await upgradePersonalToEnterprise({
      workspaceId: newWorkspaceId,
      targetPlanKey: input.targetPlanKey,
      billingCycle: input.billingCycle,
      source,
      actorId: userId,
      verifiedPlanConfig: input.verifiedPlanConfig,
    });"""
assert old in s, "retain/delete path"
s = s.replace(old, new, 1)

# ── 5. fulfillEnterpriseUpgradeFromOrder 也不传 verifiedPlanConfig（走正常 DB 读取，支付已确认） ──
# 该函数从订单 metadata 读取，属于支付后履约，不需要快照（已有 SUCCESS 账单作为授权依据）

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("workspace-upgrade-service C1+C2 OK")
