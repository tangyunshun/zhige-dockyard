import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { createCharge, resolvePaymentMode } from "@/lib/payment-gateway";
import { getWorkspacePlanByKey } from "@/lib/workspace-plan-service";
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
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
      }
      userId = authResult.user!.id;
    }
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
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
      }
      userId = authResult.user!.id;
    }
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

    // 解析套餐价格与可购买性（与统一升级服务保持一致口径）
    const cycle: "MONTH" | "YEAR" = billingCycle === "YEAR" ? "YEAR" : "MONTH";
    const planConfig = targetPlan ? await getWorkspacePlanByKey(targetPlan) : null;
    if (!planConfig) throw new Error("TARGET_PLAN_NOT_FOUND");
    if (!planConfig.purchasable) throw new Error("PLAN_NOT_PURCHASABLE_ONLINE");
    const cycleAmount = cycle === "YEAR" ? planConfig.priceYearly : planConfig.priceMonthly;

    // 免费套餐：无需支付，直接开通企业空间
    if (cycleAmount <= 0) {
      const prov = await provisionEnterpriseUpgrade({
        personalWorkspaceId: workspaceId,
        userId,
        option,
        targetPlanKey: targetPlan,
        billingCycle: cycle,
        source: "SELF_SERVICE_PURCHASE",
      });
      return NextResponse.json({
        success: true,
        message: prov.message,
        workspaceId: prov.newWorkspaceId,
        giftMigrated: prov.giftMigrated,
        free: true,
      });
    }

    // 付费套餐：仅创建 PENDING 订单，开通发生在支付确认之后
    const orderNo = `UP_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const title = `个人空间升级为企业空间 · ${planConfig.name}（${cycle === "YEAR" ? "年付" : "月付"}）`;
    const channel = "WECHAT_PAY";
    const mode = resolvePaymentMode();

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
          targetPlan,
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
        mode === "MOCK"
          ? "当前为【模拟支付】，不会产生真实扣款；支付确认后企业空间才会开通。"
          : "已使用真实支付渠道下单，请完成支付。",
    });
  } catch (error) {
    console.error("Upgrade workspace order error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "PLAN_NOT_PURCHASABLE_ONLINE") {
      return NextResponse.json({ error: "该套餐为线下定制方案，请联系专属架构师" }, { status: 400 });
    }
    if (msg === "TARGET_PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "目标企业套餐不存在" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "创建升级订单失败", details: msg },
      { status: 500 },
    );
  }
}
