export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { pointsToCents, discountedCents, formatDiscountLabel } from "@/lib/point-rate";
import { createCharge, resolvePaymentMode, isRealGatewayConfigured } from "@/lib/payment-gateway";

/**
 * POST /api/payments/create —— 创建算力充值订单（**不立即入账**）
 *
 * 与旧接口 /api/workspace/quota/recharge 的本质区别：
 *  旧接口「选完支付方式直接加算力点」，没有任何真实收款动作；
 *  本接口先落 PENDING 订单，返回收银台地址，必须等支付确认回调后才由
 *  /api/payments/mock/confirm（模拟模式）或真实网关回调（真实模式）执行入账。
 *
 * body: { workspaceId, points, packId?, paymentMethod?: "WECHAT_PAY" | "ALIPAY" }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      points?: number;
      packId?: string;
      paymentMethod?: string;
    };
    const { workspaceId, points, packId } = body;
    const channel = body.paymentMethod === "ALIPAY" ? "ALIPAY" : "WECHAT_PAY";

    if (!workspaceId) return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });
    if (!points || typeof points !== "number" || points <= 0) {
      return NextResponse.json({ error: "参数无效：充值点数必须大于 0" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const member = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });
    const isOwner = ws?.ownerId === auth.user.id || member?.role === "OWNER";
    const isAdmin = member?.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间管理员或所有者可充值算力包" }, { status: 403 });
    }

    // 会员折扣与包价：一律以数据库为唯一资费来源
    const buyer = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { membershipLevel: true, email: true },
    });
    const level = await prisma.membershiplevel.findUnique({
      where: { id: buyer?.membershipLevel || "FREE" },
      select: { id: true, tokenPackDiscount: true },
    });
    const discountPercent = level?.tokenPackDiscount || 0;
    const discountLabel = formatDiscountLabel(discountPercent);

    const matchedPack = typeof packId === "string" && packId
      ? await prisma.tokenpack.findUnique({ where: { id: packId } })
      : await prisma.tokenpack.findFirst({ where: { points: Number(points), isActive: true } });

    const usePack = !!matchedPack && matchedPack.isActive && Number(matchedPack.points) > 0;
    const effectivePoints = usePack ? Number(matchedPack!.points) : Number(points);
    const originalAmountCents = usePack
      ? Math.round(Number(matchedPack!.price) * 100)
      : pointsToCents(effectivePoints);
    const amountCents = usePack ? discountedCents(matchedPack!.price, discountPercent) : originalAmountCents;

    const orderNo = `TR_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const packName = matchedPack?.name || "算力加油包";
    const mode = resolvePaymentMode();

    // 落 PENDING 订单（billing_record），尚未支付成功，绝不加点数
    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (!billingModel) {
      return NextResponse.json({ error: "账单表不可用，无法创建订单" }, { status: 500 });
    }
    await billingModel.create({
      data: {
        id: orderNo,
        userId: auth.user.id,
        workspaceId,
        type: "TOKEN_RECHARGE",
        title: `充值 ${effectivePoints.toLocaleString()} 算力点（${packName}）`,
        amount: amountCents,
        currency: "CNY",
        status: "PENDING",
        channel,
        referenceId: workspaceId,
        metadata: {
          points: effectivePoints,
          packId: usePack ? matchedPack!.id : null,
          packName,
          originalAmountCents,
          discountPercent,
          discountLabel,
          paymentMode: mode,
          workspaceType: ws?.type ?? null,
          workspaceName: ws?.name ?? null,
          userEmail: buyer?.email ?? null,
          createdVia: "payments/create",
        },
        updatedAt: new Date(),
      },
    });

    const charge = createCharge({
      orderNo,
      amountCents,
      subject: `知阁·舟坊 - ${packName}`,
      channel,
    });

    return NextResponse.json({
      success: true,
      orderNo,
      amountCents,
      points: effectivePoints,
      discountPercent,
      // 前端必须据此展示「模拟支付」或「真实支付」提示，不得隐瞒
      paymentMode: charge.mode,
      realGatewayReady: mode === "REAL" && isRealGatewayConfigured(channel),
      payUrl: charge.payUrl,
      // 模拟模式下的二次提醒文案由前端渲染，这里给出权威依据
      notice:
        charge.mode === "MOCK"
          ? "当前为【模拟支付】，不会产生真实扣款，也不代表已开通在线收款。"
          : "已使用真实支付渠道下单。",
    });
  } catch (error) {
    console.error("[payments/create] 创建订单失败:", (error as Error)?.message);
    return NextResponse.json({ error: (error as Error)?.message || "创建充值订单失败" }, { status: 500 });
  }
}
