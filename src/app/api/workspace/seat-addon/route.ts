import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/workspace/seat-addon
 *
 * 席位增购（按剩余计费时长折算价格）：
 *   增购金额 = 增购席位数 × 单席位月单价 × (剩余天数 / 计费周期天数)
 * 单席位月单价 = 套餐月付价 ÷ 套餐自带席位数。
 * 支付成功后，空间席位上限立即增加，新席位有效期至当前套餐到期日（随套餐一并清零）。
 *
 * 安全：仅空间所有者（OWNER）可发起；企业/旗舰套餐按月/年订阅且未到期方可增购。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      seats?: number;
    };
    const workspaceId = body.workspaceId;
    const seats = Math.floor(Number(body.seats));
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
        plan: true,
        planBillingCycle: true,
        planExpiresAt: true,
        extraSeats: true,
      },
    });
    if (!workspace) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    if (workspace.ownerId !== auth.user.id) {
      return NextResponse.json({ error: "仅空间所有者可增购席位" }, { status: 403 });
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
    const amount = Math.round(seats * proratedPerSeat); // 单位：分

    // 订单与席位增加在同一事务内完成（模拟支付：即时成功）
    const billing = await prisma.$transaction(async (tx) => {
      const record = await tx.billingrecord.create({
        data: {
          userId: auth.user!.id,
          workspaceId,
          type: "SEAT_ADDON",
          title: `空间「${workspace.name}」增购 ${seats} 个席位（至 ${workspace.planExpiresAt.toISOString().slice(0, 10)}）`,
          amount,
          currency: "CNY",
          status: "SUCCESS",
          channel: "SYSTEM",
          metadata: {
            seats,
            billingCycle: workspace.planBillingCycle,
            remainingDays,
            seatUnitMonthly,
            planKey: workspace.plan,
            expiresAt: workspace.planExpiresAt.toISOString(),
          },
        },
      });
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { extraSeats: { increment: seats } },
      });
      return record;
    });

    const updated = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { extraSeats: true },
    });

    return NextResponse.json({
      success: true,
      amount,
      seats,
      extraSeats: updated?.extraSeats ?? seats,
      expiresAt: workspace.planExpiresAt,
      billingId: billing.id,
      message: `已增购 ${seats} 个席位，金额 ¥${(amount / 100).toFixed(2)}（按剩余 ${remainingDays} 天折算），有效期至套餐到期日。`,
    });
  } catch (error) {
    console.error("[seat-addon] 增购失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "席位增购失败" }, { status: 500 });
  }
}
