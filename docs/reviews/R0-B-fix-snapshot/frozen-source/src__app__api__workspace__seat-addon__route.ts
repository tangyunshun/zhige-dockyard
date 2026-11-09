import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { createCharge, resolvePaymentMode } from "@/lib/payment-gateway";
import { newOrderExpiry } from "@/lib/order-expiry";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/workspace/seat-addon
 *
 * 席位增购（按剩余计费时长折算价格）：
 *   增购金额 = 增购席位数 × 单席位月单价 × (剩余天数 / 计费周期天数)
 * 单席位月单价 = 套餐月付价 ÷ 套餐自带席位数。
 * 新席位有效期至当前套餐到期日（随套餐一并清零）。
 *
 * 安全与支付：仅空间所有者（OWNER）可发起；企业/团队空间且套餐已订阅（非免费版）方可增购。
 * 本接口**只创建 PENDING 订单并返回收银台地址**，绝不立即加席位——
 * 席位增加发生在支付确认（PAYMENT_MODE=mock 走 /api/payments/mock/confirm，
 * 真实网关模式走网关回调）之后，杜绝“选完支付方式就生效”的模拟支付。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      seats?: number;
      paymentMethod?: string;
    };
    const workspaceId = body.workspaceId;
    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);
    const seats = Math.floor(Number(body.seats));
    const channel = body.paymentMethod === "ALIPAY" ? "ALIPAY" : "WECHAT_PAY";
    if (!workspaceId) return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    if (!Number.isFinite(seats) || seats <= 0) {
      return NextResponse.json({ error: "增购席位数必须为正整数" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        type: true,
        plan: true,
        planBillingCycle: true,
        planExpiresAt: true,
      },
    });
    if (!workspace) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    if (workspace.ownerId !== auth.user.id) {
      return NextResponse.json({ error: "仅空间所有者可增购席位" }, { status: 403 });
    }
    if (workspace.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "席位增购仅面向企业 / 团队空间" }, { status: 400 });
    }
    if (!workspace.plan || workspace.plan === "STANDARD") {
      return NextResponse.json({ error: "免费版不支持席位增购，请先升级套餐" }, { status: 400 });
    }
    if (!workspace.planExpiresAt) {
      return NextResponse.json({ error: "当前套餐未设置到期时间，无法折算增购价格" }, { status: 400 });
    }

    const planRow = await prisma.workspaceplan.findUnique({ where: { key: workspace.plan } });
    if (!planRow) return NextResponse.json({ error: "套餐配置不存在" }, { status: 404 });

    const planMaxMembers = Number(planRow.maxMembers || 0);
    const seatUnitMonthly = planMaxMembers > 0 ? Number(planRow.priceMonthly) / planMaxMembers : 0;
    if (seatUnitMonthly <= 0) {
      return NextResponse.json({ error: "当前套餐不支持席位增购" }, { status: 400 });
    }

    const now = Date.now();
    const remainingMs = workspace.planExpiresAt.getTime() - now;
    if (remainingMs <= 0) {
      return NextResponse.json({ error: "套餐已到期，请先续费后再增购席位" }, { status: 400 });
    }
    const remainingDays = Math.max(1, Math.ceil(remainingMs / DAY_MS));
    const daysInCycle = workspace.planBillingCycle === "YEAR" ? 365 : 30;
    const proratedPerSeat = (seatUnitMonthly * remainingDays) / daysInCycle;
    const amountCents = Math.round(seats * proratedPerSeat); // 单位：分

    const orderNo = `SA_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const expiresAtIso = workspace.planExpiresAt.toISOString();
    const mode = resolvePaymentMode();

    // 仅创建 PENDING 订单，绝不立即加席位；席位增加发生在支付确认之后
    await prisma.billingrecord.create({
      data: {
        id: orderNo,
        userId: auth.user.id,
        workspaceId,
        type: "SEAT_ADDON",
        title: `空间「${workspace.name}」增购 ${seats} 个席位（至 ${expiresAtIso.slice(0, 10)}）`,
        amount: amountCents,
        currency: "CNY",
        status: "PENDING",
        expiresAt: newOrderExpiry(),
        channel,
        referenceId: workspaceId,
        metadata: {
          seats,
          billingCycle: workspace.planBillingCycle,
          remainingDays,
          seatUnitMonthly,
          planKey: workspace.plan,
          expiresAt: expiresAtIso,
          workspaceName: workspace.name,
          createdVia: "seat-addon",
        },
        updatedAt: new Date(),
      },
    });

    // 产出收银台地址（mock 模式为本地模拟页；real 模式为网关支付链接，由回调入账）
    const charge = await createCharge({
      expiresAt: newOrderExpiry(),
      orderNo,
      amountCents,
      subject: "知阁·舟坊 - 席位增购",
      channel,
    });

    return NextResponse.json({
      success: true,
      orderNo,
      amountCents,
      seats,
      paymentMode: charge.mode,
      payUrl: charge.payUrl,
      notice:
        charge.mode === "MOCK"
          ? "当前为【模拟支付】，不会产生真实扣款；支付确认后席位才会生效。"
          : "已使用真实支付渠道下单，请完成支付。",
    });
  } catch (error) {
    console.error("[seat-addon] 创建订单失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "席位增购下单失败" }, { status: 500 });
  }
}
