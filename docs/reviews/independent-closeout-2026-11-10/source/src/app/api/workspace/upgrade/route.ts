import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { createCharge, resolvePaymentMode, PaymentConfigError } from "@/lib/payment-gateway";
import { DEFAULT_WORKSPACE_PLAN } from "@/constants/workspace-plans";
import { getWorkspacePlanStrict } from "@/lib/workspace-plan-service";
import { newOrderExpiry } from "@/lib/order-expiry";
import {
  provisionEnterpriseUpgrade,
} from "@/lib/workspace-upgrade-service";

// 获取企业空间配额
async function getEnterpriseQuota(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membershipLevel: true, role: true },
  });

  if (!user) {
    return {
      hasEnterprise: false,
      enterpriseCount: 0,
      maxEnterprise: 1,
      isMember: false,
    };
  }

  const enterpriseWorkspaces = await prisma.workspace.findMany({
    where: {
      ownerId: userId,
      type: "ENTERPRISE",
    },
  });

  const level = await prisma.membershiplevel.findUnique({
    where: { id: user.membershipLevel || "FREE" },
  });
  // 管理员不受等级 0 配额限制，至少保留 1 个企业空间名额（与 dashboard 中枢口径一致）
  // 统一用 isAdminRole：库中实际存在 superadmin（连写）等变体，内联等值比较会漏判
  const isAdminLike = isAdminRole(user.role);
  const levelMax = level ? Number(level.maxEnterpriseWorkspaces) : 1;
  const maxEnterprise = isAdminLike ? Math.max(levelMax, 1) : levelMax;
  const isMember = user.membershipLevel !== "FREE" || isAdminLike;

  return {
    hasEnterprise: enterpriseWorkspaces.length > 0,
    enterpriseCount: enterpriseWorkspaces.length,
    maxEnterprise,
    isMember,
  };
}

// GET: 获取工作空间信息和配额
export async function GET(request: NextRequest) {
  try {
    // [U05/原9] 一律完整 validateUser：x-user-id 验签身份不等于有效会话
    const upgradeAuth = await validateUser(request.headers.get("authorization"), request);
    if (!upgradeAuth.valid || !upgradeAuth.user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    const userId = upgradeAuth.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取个人空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "只能升级个人空间" }, { status: 400 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 获取配额信息
    const quota = await getEnterpriseQuota(userId);

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
      },
      quota,
    });
  } catch (error) {
    console.error("Get upgrade info error:", error);
    return NextResponse.json(
      {
        error: "获取信息失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

// POST: 创建企业空间升级订单（先下单后开通）
// 本接口只做「校验 + 创建 PENDING 订单 + 返回收银台地址」，绝不立即开通企业空间；
// 真正建空间发生在支付确认之后（MOCK 走 /api/payments/mock/confirm，REAL 走网关回调）。
// 免费套餐（金额为 0）无需支付，直接开通。
export async function POST(request: NextRequest) {
  try {
    // [U05/原9] 一律完整 validateUser：x-user-id 验签身份不等于有效会话
    const upgradeAuth2 = await validateUser(request.headers.get("authorization"), request);
    if (!upgradeAuth2.valid || !upgradeAuth2.user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    const userId = upgradeAuth2.user!.id;
    const body = await request.json();
    const { workspaceId, targetPlan, billingCycle, option } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }
    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);
    if (!["retain", "delete", "upgrade"].includes(option)) {
      return NextResponse.json({ error: "无效的升级选项" }, { status: 400 });
    }
    // [R0-A4 D1] 自助 delete 迁移方式暂不可用（任何订单/支付/空间/成员/赠送/资产迁移之前拒绝）
    if (option === "delete") {
      return NextResponse.json(
        { error: "MIGRATION_OPTION_UNAVAILABLE", message: "迁移方式暂不可用，请选择保留或原地升级" },
        { status: 400 },
      );
    }

    const personalWorkspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, description: true, type: true, ownerId: true },
    });
    if (!personalWorkspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }
    if (personalWorkspace.type !== "PERSONAL") {
      return NextResponse.json(
        { error: "只能升级个人空间，当前空间类型为企业空间" },
        { status: 400 },
      );
    }
    if (personalWorkspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    const quota = await getEnterpriseQuota(userId);
    if (quota.enterpriseCount >= quota.maxEnterprise) {
      return NextResponse.json(
        {
          error: quota.isMember
            ? `会员用户当前最多可拥有 ${quota.maxEnterprise} 个企业空间`
            : `当前会员等级最多可拥有 ${quota.maxEnterprise} 个企业空间，可升级会员套餐后再试`,
        },
        { status: 403 },
      );
    }

    // 解析套餐：严格读取并核验真实目标记录（先核验原始行，不回退代码常量、不清洗价格）。
    // 规范目标 normalize 后贯穿「查询 → 资格判定 → 开通服务 → 订单 metadata → 最终 workspace.plan」。
    const cycle: "MONTH" | "YEAR" = billingCycle === "YEAR" ? "YEAR" : "MONTH";
    const targetPlanRaw = typeof targetPlan === "string" ? targetPlan.trim() : "";
    const normalizedKey = (targetPlanRaw || DEFAULT_WORKSPACE_PLAN).toUpperCase();
    const planResult = await getWorkspacePlanStrict(targetPlanRaw);
    if (!planResult.ok) {
      return NextResponse.json(
        { error: planResult.code, message: planResult.message },
        { status: planResult.httpStatus },
      );
    }
    const planConfig = planResult.config;

    const monthly = planConfig.priceMonthly;
    const yearly = planConfig.priceYearly;
    const cycleAmount = cycle === "YEAR" ? yearly : monthly;

    // [R0-A2] 免费资格 = 既有免费基础身份 + 真实月年价格均为合法 0。
    // 仅 DEFAULT_WORKSPACE_PLAN 且月年都 0 才免支付直接开通；混合价（月0年正价/年0月正价）不得按本周期 0 免费；
    // 非基础档（含零价 PRO/ENTERPRISE）一律走「先下单后支付」，不得免支付开通。
    const isBaseFree = normalizedKey === DEFAULT_WORKSPACE_PLAN;

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

    if (isBaseFree && monthly === 0 && yearly === 0) {
      const prov = await provisionEnterpriseUpgrade({
        personalWorkspaceId: workspaceId,
        userId,
        option,
        targetPlanKey: normalizedKey,
        billingCycle: cycle,
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: planConfig,
      });
      return NextResponse.json({
        success: true,
        message: prov.message,
        workspaceId: prov.newWorkspaceId,
        giftMigrated: prov.giftMigrated,
        free: true,
      });
    }

    // 合法正价：仅创建 PENDING 订单，开通发生在支付确认之后。
    // 当前周期金额 <= 0（混合价 / 零价非基础档）：不创建 0 元订单、免支付开通，明确拒绝。
    if (cycleAmount <= 0) {
      return NextResponse.json(
        {
          error: "PLAN_CYCLE_PRICE_INVALID",
          message: "该套餐当前计费周期价格无效或不可免费开通，请确认套餐与计费周期",
        },
        { status: 400 },
      );
    }

    // 付费套餐：仅创建 PENDING 订单，开通发生在支付确认之后
    const orderNo = `UP_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const title = `个人空间升级为企业空间 · ${planConfig.name}（${cycle === "YEAR" ? "年付" : "月付"}）`;
    const channel = "WECHAT_PAY";

    // [R0-E] 统一模式裁决前置：生产显式 mock 必须在「创建本次 PENDING 订单、调用渠道、任何企业空间写入」之前拒绝。
    // 复用 resolvePaymentMode 的 PaymentConfigError，统一返回 503 + 稳定 code，零新订单/零开通。
    // 合法免费开通（金额均为 0 的基础档）不经过此路径，按既有规则直接开通，不受影响。
    try {
      resolvePaymentMode();
    } catch (e) {
      if (e instanceof PaymentConfigError) {
        return NextResponse.json(
          { success: false, code: e.code, error: e.message },
          { status: 503 },
        );
      }
      throw e;
    }

    await prisma.billingrecord.create({
      data: {
        id: orderNo,
        userId,
        workspaceId,
        type: "PLAN_UPGRADE",
        title,
        amount: cycleAmount,
        currency: "CNY",
        status: "PENDING",
        expiresAt: newOrderExpiry(),
        channel,
        referenceId: workspaceId,
        metadata: {
          workspaceId,
          option,
          targetPlan: normalizedKey,
          billingCycle: cycle,
          source: "SELF_SERVICE_PURCHASE",
          workspaceName: personalWorkspace.name,
          planName: planConfig.name,
        },
        updatedAt: new Date(),
      },
    });

    const charge = await createCharge({
      expiresAt: newOrderExpiry(),
      orderNo,
      amountCents: cycleAmount,
      subject: "知阁·舟坊 - 升级企业空间",
      channel,
    });
    return NextResponse.json({
      success: true,
      orderNo,
      amountCents: cycleAmount,
      paymentMode: charge.mode,
      payUrl: charge.payUrl,
      planName: planConfig.name,
      notice:
        charge.mode === "MOCK"
          ? "当前为【模拟支付】，不会产生真实扣款；支付确认后企业空间才会开通。"
          : "已使用真实支付渠道下单，请完成支付。",
    });
  } catch (error) {
    console.error("Upgrade workspace order error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    // [R0-A5 E2] 服务层核验失败返回稳定错误码 + 中文 message + 适当 4xx/503，不一律 500 塞机器码
    const PLAN_ERROR_MAP: Record<string, { status: number; message: string }> = {
      PLAN_CONFIG_CHANGED: { status: 409, message: "套餐配置已更新，请刷新页面后重新确认升级内容" },
      PLAN_INACTIVE: { status: 400, message: "目标套餐已停用，请刷新页面后重新选择" },
      PLAN_NOT_PURCHASABLE_ONLINE: { status: 400, message: "该套餐为线下定制方案，请联系专属架构师" },
      PLAN_PRICE_INVALID: { status: 400, message: "目标套餐价格配置无效，暂不可升级" },
      PLAN_CONFIG_UNAVAILABLE: { status: 503, message: "套餐配置暂时无法读取，请稍后重试" },
      TARGET_PLAN_NOT_FOUND: { status: 400, message: "目标企业套餐不存在" },
      MISSING_TARGET_PLAN: { status: 400, message: "请选择要升级的企业套餐" },
      MIGRATION_OPTION_UNAVAILABLE: { status: 400, message: "迁移方式暂不可用，请选择保留或原地升级" },
      WORKSPACE_NOT_FOUND: { status: 404, message: "工作空间不存在" },
      NOT_PERSONAL_WORKSPACE: { status: 400, message: "只能升级个人空间，当前空间类型为企业空间" },
      NO_PERMISSION: { status: 403, message: "无权限操作此空间" },
    };
    const mapped = PLAN_ERROR_MAP[msg];
    if (mapped) {
      return NextResponse.json({ error: msg, message: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json(
      { error: "创建升级订单失败", details: msg },
      { status: 500 },
    );
  }
}
