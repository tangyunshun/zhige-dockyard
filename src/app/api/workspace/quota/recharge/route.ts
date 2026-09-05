export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { checkAndResetQuotaCycle } from "@/lib/quota-cycle";
import { pointsToCents, discountedCents, formatDiscountLabel } from "@/lib/point-rate";
import { grantPoints, getBalanceSummary } from "@/lib/credit-service";

/**
 * POST /api/workspace/quota/recharge
 * 在线申购 / 充值算力加油包，真实向空间算力池累加算力点数。
 *
 * 计价规则（以数据库为唯一资费来源）：
 * 1. 优先按 body.packId（或 points 匹配到的在售加油包）取数据库包价作为原价；
 * 2. 再按购买人当前会员等级 membershiplevel.tokenPackDiscount 百分比计算会员价；
 * 3. 匹配不到在售加油包时（任意额度补点），按标准单价 10 点 = 0.1 元 折算，不叠加折扣。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, points, packName, packId, paymentMethod } = body;

    if (!workspaceId || !points || typeof points !== "number" || points <= 0) {
      return NextResponse.json({ error: "参数无效：充值点数必须大于 0" }, { status: 400 });
    }

    // 1. 校验空间成员资格
    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    // 2. 校验管理员/所有者权限
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const requesterMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });

    const isOwner = ws?.ownerId === auth.user.id || requesterMember?.role === "OWNER";
    const isAdmin = requesterMember?.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间管理员或所有者可充值算力包" }, { status: 403 });
    }

    // 3. 执行前先触发自然月重置预检
    await checkAndResetQuotaCycle(prisma, workspaceId, auth.user.id);

    // 4. 解析在售加油包与当前会员折扣（价格一律以数据库为准，杜绝前端/硬编码定价）
    const buyer = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { membershipLevel: true, email: true },
    });
    const buyerEmail = buyer?.email || null;
    const membershipLevel = await prisma.membershiplevel.findUnique({
      where: { id: buyer?.membershipLevel || "FREE" },
      select: { id: true, nameZh: true, tokenPackDiscount: true },
    });
    const discountPercent = membershipLevel?.tokenPackDiscount || 0;
    const discountLabel = formatDiscountLabel(discountPercent);

    const matchedPack =
      typeof packId === "string" && packId
        ? await prisma.tokenpack.findUnique({ where: { id: packId } })
        : await prisma.tokenpack.findFirst({
            where: { points: Number(points), isActive: true },
          });

    const usePack = !!matchedPack && matchedPack.isActive && Number(matchedPack.points) > 0;
    const effectivePoints = usePack ? Number(matchedPack!.points) : Number(points);

    // 权威结算金额（单位：分）
    const originalAmountCents = usePack ? Math.round(Number(matchedPack!.price) * 100) : pointsToCents(effectivePoints);
    const amountCents = usePack
      ? discountedCents(matchedPack!.price, discountPercent)
      : originalAmountCents;

    // 5. 订单号与包名：先生成，供算力流水与财务账单共用
    const rechargeOrderNo = `TR_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const finalPackName = packName || matchedPack?.name || "算力加油包";

    // 6. 入账归属：企业空间默认进入企业共享池（成员共用），个人空间充值进入用户钱包（跨空间通用）
    const scope: "WALLET" | "WORKSPACE" =
      ws?.type === "ENTERPRISE" && body.scope !== "WALLET" ? "WORKSPACE" : "WALLET";

    const grantResult = await grantPoints({
      scope,
      userId: auth.user.id,
      workspaceId,
      points: effectivePoints,
      sourceType: "RECHARGE",
      type: "RECHARGE",
      title: `充值 ${effectivePoints.toLocaleString()} 算力点（${finalPackName}）`,
      amountCents,
      paymentMethod: paymentMethod || "ONLINE_PAY",
      orderNo: rechargeOrderNo,
      sourceId: rechargeOrderNo,
      workspaceType: ws?.type || null,
      workspaceName: ws?.name || null,
      userEmail: buyerEmail,
      remark: discountLabel
        ? `会员${discountLabel}优惠，实付 ¥${(amountCents / 100).toFixed(2)}`
        : null,
      idempotencyKey: rechargeOrderNo,
    });

    // 7. 写入交易流转账单明细 (billing_record)，形成订单与财务合规全闭环
    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (billingModel && typeof billingModel.create === "function") {
      await billingModel.create({
        data: {
          id: rechargeOrderNo,
          userId: auth.user.id,
          workspaceId,
          type: "TOKEN_RECHARGE",
          title: `充值 ${effectivePoints.toLocaleString()} 算力点（${finalPackName}）`,
          amount: amountCents,
          currency: "CNY",
          status: "SUCCESS",
          channel: paymentMethod || "ONLINE_PAY",
          referenceId: workspaceId,
          metadata: {
            points: effectivePoints,
            packId: usePack ? matchedPack!.id : null,
            packName: finalPackName,
            originalAmountCents,
            discountPercent: discountPercent || 0,
            discountLabel,
            rechargedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      }).catch((e: any) => console.warn("写入算力充值账单记录警告:", e));
    }

    // balanceAfter 即入账账户（钱包或企业共享池）变动后的余额
    const newBalanceNum = grantResult.balanceAfter;
    const summary = await getBalanceSummary(auth.user.id, workspaceId);

    return NextResponse.json({
      success: true,
      message: discountLabel
        ? `恭喜！成功为您充值 ${effectivePoints.toLocaleString()} 算力点（${finalPackName}，会员${discountLabel}实付 ¥${(amountCents / 100).toFixed(2)}）`
        : `恭喜！成功为您充值 ${effectivePoints.toLocaleString()} 算力点（${finalPackName}）`,
      rechargedPoints: effectivePoints,
      tokenBalance: newBalanceNum,
      amountCents,
      discountPercent,
      scope,
      balance: summary,
    });
  } catch (error) {
    console.error("充值算力包失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
