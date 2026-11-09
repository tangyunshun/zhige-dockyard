# -*- coding: utf-8 -*-
# R0-A3 修复批次 2：route.ts
# C1: 传 verifiedPlanConfig 给 provisionEnterpriseUpgrade
# C3: 基础档月0年正/月正年0 混合价阻断（双向双周期）
import io

P = "src/app/api/workspace/upgrade/route.ts"
s = io.open(P, encoding="utf-8").read()

# ── 1. C3：基础档混合价阻断（在 free 路径判断之前） ──
old = """    const isBaseFree = normalizedKey === DEFAULT_WORKSPACE_PLAN;
    if (isBaseFree && monthly === 0 && yearly === 0) {"""
new = """    const isBaseFree = normalizedKey === DEFAULT_WORKSPACE_PLAN;

    // [R0-A3 C3] 基础档混合价（月0年正 / 月正年0）属于待确认配置，两个方向、两个周期均拒绝。
    // 保留合法免费基础档（月年均 0）与合法正价 PENDING 流程，不修改真实价格或赠送规则。
    if (isBaseFree && ((monthly === 0 && yearly > 0) || (monthly > 0 && yearly === 0))) {
      return NextResponse.json(
        {
          error: "PLAN_MIXED_PRICING",
          message: "该套餐存在混合定价配置（某一周期为 0 另一周期为正价），暂不可升级，请确认套餐配置",
        },
        { status: 400 },
      );
    }

    if (isBaseFree && monthly === 0 && yearly === 0) {"""
assert old in s, "C3 mixed pricing"
s = s.replace(old, new, 1)

# ── 2. C1：免费路径传 verifiedPlanConfig 给 provisionEnterpriseUpgrade ──
old = """      const prov = await provisionEnterpriseUpgrade({
        personalWorkspaceId: workspaceId,
        userId,
        option,
        targetPlanKey: normalizedKey,
        billingCycle: cycle,
        source: "SELF_SERVICE_PURCHASE",
      });"""
new = """      const prov = await provisionEnterpriseUpgrade({
        personalWorkspaceId: workspaceId,
        userId,
        option,
        targetPlanKey: normalizedKey,
        billingCycle: cycle,
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: planConfig,
      });"""
assert old in s, "C1 pass config"
s = s.replace(old, new, 1)

# ── 3. C5：getWorkspacePlanStrict 注释中"安全整数"改用 Number.isSafeInteger ──
# 这在 workspace-plan-service.ts 中修复，此处不需要改

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("route.ts C1+C3 OK")
