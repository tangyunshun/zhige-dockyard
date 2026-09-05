export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/points/summary
 * 平台级算力点总账与对账：发放/消耗/充值 GMV/赠送到期，以及"流水与账户余额"一致性校验。
 */
function isPlatformAdmin(role?: string | null): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "PLATFORM_ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdmin(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可查看算力总账" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const timeFilter: any = {};
    if (startDate) timeFilter.gte = new Date(startDate);
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      timeFilter.lte = e;
    }
    const whereTime = Object.keys(timeFilter).length ? { createdAt: timeFilter } : {};

    const [grouped, gmvRows, walletRows, quotaRows] = await Promise.all([
      prisma.pointledger
        .groupBy({ by: ["direction", "type"], where: whereTime, _sum: { points: true } })
        .catch(() => []),
      prisma.pointledger.findMany({
        where: {
          direction: "IN",
          type: { in: ["RECHARGE", "OFFLINE_RECHARGE"] },
          ...whereTime,
        },
        select: { amountCents: true },
      }),
      prisma.userwallet.findMany({ select: { balance: true } }),
      prisma.workspacequota.findMany({ select: { tokenBalance: true } }),
    ]);

    const sumBy = (direction: string, types: string[]) =>
      (grouped as any[])
        .filter((g) => g.direction === direction && types.includes(g.type))
        .reduce((s, g) => s + Number(g._sum?.points || 0), 0);

    const totalIssued = sumBy("IN", ["GIFT_REGISTER", "RECHARGE", "OFFLINE_RECHARGE", "MEMBERSHIP_GRANT", "REFUND", "MANUAL_ADJUST"]);
    const totalRecharged = sumBy("IN", ["RECHARGE", "OFFLINE_RECHARGE"]);
    const totalGift = sumBy("IN", ["GIFT_REGISTER", "MEMBERSHIP_GRANT"]);
    const totalConsumed = sumBy("OUT", ["CONSUME"]);
    const totalExpired = sumBy("OUT", ["GIFT_EXPIRE"]);
    const totalRefund = sumBy("IN", ["REFUND"]);
    const totalAdjust = sumBy("IN", ["MANUAL_ADJUST"]);

    const rechargeGmvCents = (gmvRows as any[]).reduce(
      (s, r) => s + Number(r.amountCents || 0),
      0,
    );

    // 对账：理论余额 = 入账 - 出账；实际余额 = 各钱包余额 + 各空间池余额（剔除无限额度 -1）
    const theoretical = totalIssued - (totalConsumed + totalExpired);
    const actual =
      (walletRows as any[]).reduce((s, w) => s + Number(w.balance || 0), 0) +
      (quotaRows as any[]).reduce(
        (s, q) => s + (Number(q.tokenBalance) === -1 ? 0 : Number(q.tokenBalance || 0)),
        0,
      );
    const reconcileDiff = actual - theoretical;

    return NextResponse.json({
      success: true,
      data: {
        totalIssued,
        totalRecharged,
        totalGift,
        totalConsumed,
        totalExpired,
        totalRefund,
        totalAdjust,
        rechargeGmvCents,
        walletCount: (walletRows as any[]).length,
        workspaceCount: (quotaRows as any[]).length,
        reconcile: {
          theoretical,
          actual,
          diff: reconcileDiff,
          balanced: reconcileDiff === 0,
        },
        range: { startDate: startDate || null, endDate: endDate || null },
      },
    });
  } catch (error) {
    console.error("获取算力总账失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
