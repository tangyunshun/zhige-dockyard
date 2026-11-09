# -*- coding: utf-8 -*-
# R0-A4 D1：阻断危险的自助 delete 迁移方式（服务层 + route 层）
# R0-A4 D2：写前配置一致性核验（快照 vs 当前 DB 状态）
import io

# ── 1. workspace-upgrade-service.ts ──
P = "src/lib/workspace-upgrade-service.ts"
s = io.open(P, encoding="utf-8").read()

# 1a. provisionEnterpriseUpgrade 开头：阻断 delete 方式（D1）
old = """  const { personalWorkspaceId, userId, option } = input;
  const source = input.source || "SELF_SERVICE_PURCHASE";

  const personalWorkspace = await prisma.workspace.findUnique({
    where: { id: personalWorkspaceId },
    select: { id: true, name: true, description: true, type: true, ownerId: true },
  });
  if (!personalWorkspace) throw new Error("WORKSPACE_NOT_FOUND");
  if (personalWorkspace.type !== "PERSONAL") throw new Error("NOT_PERSONAL_WORKSPACE");
  if (personalWorkspace.ownerId !== userId) throw new Error("NO_PERMISSION");"""
new = """  const { personalWorkspaceId, userId, option } = input;
  const source = input.source || "SELF_SERVICE_PURCHASE";

  // [R0-A4 D1] 自助 delete 迁移方式暂不可用：资产已迁入的目标空间曾被 cleanupOrphan 删除，
  // 跨资产/账务的完整迁移恢复需后续独立批次；在任何写入之前明确拒绝。
  if (option === "delete" && source === "SELF_SERVICE_PURCHASE") {
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  const personalWorkspace = await prisma.workspace.findUnique({
    where: { id: personalWorkspaceId },
    select: { id: true, name: true, description: true, type: true, ownerId: true },
  });
  if (!personalWorkspace) throw new Error("WORKSPACE_NOT_FOUND");
  if (personalWorkspace.type !== "PERSONAL") throw new Error("NOT_PERSONAL_WORKSPACE");
  if (personalWorkspace.ownerId !== userId) throw new Error("NO_PERMISSION");"""
assert old in s, "D1 service block"
s = s.replace(old, new, 1)

# 1b. fulfillEnterpriseUpgradeFromOrder 同样阻断 delete 方式（历史订单防绕过）
old = """  return provisionEnterpriseUpgrade({
    personalWorkspaceId: meta.workspaceId,
    userId: order.userId,
    option: meta.option,
    targetPlanKey: meta.targetPlan,
    billingCycle: meta.billingCycle,
    source: meta.source || "SELF_SERVICE_PURCHASE",
  });"""
new = """  // [R0-A4 D1] 历史待支付订单的 option=delete 同样阻断（不执行危险迁移）
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
  });"""
assert old in s, "D1 fulfill block"
s = s.replace(old, new, 1)

# 1c. upgradePersonalToEnterprise 同样阻断 delete（服务层兜底）
old = """export async function upgradePersonalToEnterprise(
  input: UpgradePersonalToEnterpriseInput
): Promise<UpgradePersonalToEnterpriseResult> {
  // 1. 读取空间并做基础校验"""
new = """export async function upgradePersonalToEnterprise(
  input: UpgradePersonalToEnterpriseInput
): Promise<UpgradePersonalToEnterpriseResult> {
  // [R0-A4 D1] delete 迁移方式在服务层兜底阻断（自查清单安全红线）
  if (input.option === "delete" && input.source === "SELF_SERVICE_PURCHASE") {
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  // 1. 读取空间并做基础校验"""
assert old in s, "D1 upgrade block"
s = s.replace(old, new, 1)

# 1d. 管理员/签约路径的 delete 暂时也阻断（D1 第 3 点：不留下绕过通路）
# 但保留错误信息不同以区分来源
s = s.replace(
    '''  if (input.option === "delete" && input.source === "SELF_SERVICE_PURCHASE") {
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  // 1. 读取空间并做基础校验''',
    '''  if (input.option === "delete") {
    // [R0-A4 D1] 所有来源的 delete 迁移方式均阻断（包括管理员/签约），恢复需后续独立批次
    throw new Error("MIGRATION_OPTION_UNAVAILABLE");
  }

  // 1. 读取空间并做基础校验''',
    1,
)

# ── 2. D2：写前配置一致性核验 ──
# 在 upgradePersonalToEnterprise 中：verifiedPlanConfig 存在时，
# 在事务写入前重新读取当前 DB 配置并与快照比较
old = """  // KN-C1（R0-A3）：route 层已通过 getWorkspacePlanStrict 严格读取并核验的配置快照
  // 直接贯穿写入，不再二次 DB 读取，杜绝「核验 STANDARD → 写入时变 PRO」的时序漂移。
  const targetConfig = input.verifiedPlanConfig || (await resolveTargetConfig(input));
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }"""
new = """  // KN-C1（R0-A3）：route 层已通过 getWorkspacePlanStrict 严格读取并核验的配置快照
  // 直接贯穿写入，不再二次 DB 读取，杜绝「核验 STANDARD → 写入时变 PRO」的时序漂移。
  // [R0-A4 D2] 快照贯穿写入 + 写前一致性核验：在写入前重新读取当前配置，
  // 核验目标/启用/可购买/价格与快照一致；变化/停用/缺失时拒绝并要求重新确认。
  let targetConfig: WorkspacePlanConfig | null = null;
  if (input.verifiedPlanConfig) {
    // 有快照：重新读取当前 DB 状态做一致性核验
    const current = await getWorkspacePlanStrict(input.targetPlanKey);
    if (!current.ok) {
      throw new Error(current.code); // PLAN_INACTIVE / TARGET_PLAN_NOT_FOUND / PLAN_NOT_PURCHASABLE_ONLINE / PLAN_PRICE_INVALID
    }
    // 比较关键写入事实：目标 key、月年价格、可购买
    const snap = input.verifiedPlanConfig;
    const curr = current.config;
    if (
      curr.key !== snap.key ||
      curr.priceMonthly !== snap.priceMonthly ||
      curr.priceYearly !== snap.priceYearly ||
      curr.purchasable !== snap.purchasable
    ) {
      throw new Error("PLAN_CONFIG_CHANGED");
    }
    targetConfig = curr;
  } else {
    targetConfig = await resolveTargetConfig(input);
  }
  if (!targetConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
  if (input.source === "SELF_SERVICE_PURCHASE" && !targetConfig.purchasable) {
    throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
  }"""
assert old in s, "D2 config check"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("service D1+D2 OK")

# ── 3. route.ts：delete 方式在 route 层就拒绝（订单/支付创建之前） ──
p2 = "src/app/api/workspace/upgrade/route.ts"
s2 = io.open(p2, encoding="utf-8").read()
old2 = """    if (!["retain", "delete", "upgrade"].includes(option)) {
      return NextResponse.json({ error: "无效的升级选项" }, { status: 400 });
    }"""
new2 = """    if (!["retain", "delete", "upgrade"].includes(option)) {
      return NextResponse.json({ error: "无效的升级选项" }, { status: 400 });
    }
    // [R0-A4 D1] 自助 delete 迁移方式暂不可用（任何订单/支付/空间/成员/赠送/资产迁移之前拒绝）
    if (option === "delete") {
      return NextResponse.json(
        { error: "MIGRATION_OPTION_UNAVAILABLE", message: "迁移方式暂不可用，请选择保留或原地升级" },
        { status: 400 },
      );
    }"""
assert old2 in s2, "route delete block"
s2 = s2.replace(old2, new2, 1)
io.open(p2, "w", encoding="utf-8", newline="").write(s2)
print("route delete block OK")
