export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { UNLIMITED_BALANCE } from "@/lib/credit-service";

/**
 * GET /api/user/points
 *
 * 用户级「我的算力」汇总：钱包余额（跨空间通用）+ 我所属各空间的算力池 +
 * 即将过期提醒 + 累计统计 + 跨空间流水（钱包流水 + 我所属空间流水）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const typeFilter = (searchParams.get("type") || "all").toLowerCase();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 1), 100);

    // 我加入的空间
    const members = await prisma.workspacemember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const wsIds = members.map((m) => m.workspaceId);

    // 钱包余额
    const wallet = await prisma.userwallet.findUnique({ where: { userId } });
    const walletBalance = wallet ? Number(wallet.balance) : 0;

    // 各空间池余额
    const quotas = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: wsIds } },
      select: { workspaceId: true, tokenBalance: true },
    });
    const quotaMap = new Map<string, number>(
      quotas.map((q) => [q.workspaceId, Number(q.tokenBalance)]),
    );

    // 即将过期提醒（7 天内）
    const grants = await prisma.pointgrant.findMany({
      where: {
        status: "ACTIVE",
        remaining: { gt: 0 },
        OR: [{ scope: "WALLET", userId }, { workspaceId: { in: wsIds } }],
      },
    });
    const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    let expiringPoints = 0;
    let expiringAt: string | null = null;
    grants.forEach((g) => {
      if (g.expiresAt && g.expiresAt.getTime() <= soon) {
        expiringPoints += Number(g.remaining);
        if (!expiringAt || g.expiresAt.toISOString() < expiringAt) {
          expiringAt = g.expiresAt.toISOString();
        }
      }
    });

    // 各空间维度汇总
    const wss = await prisma.workspace.findMany({
      where: { id: { in: wsIds } },
      select: { id: true, name: true, type: true },
    });
    const workspaces = wss.map((w) => {
      const bal = quotaMap.get(w.id) ?? 0;
      return {
        id: w.id,
        name: w.name,
        type: w.type,
        balance: bal,
        unlimited: bal === UNLIMITED_BALANCE,
      };
    });

    // 流水范围：我的钱包流水 + 我所属空间的流水
    const ledgerWhere: any = {
      OR: [{ scope: "WALLET", userId }, ...(wsIds.length ? [{ workspaceId: { in: wsIds } }] : [])],
    };

    const typeCondition: any =
      typeFilter === "recharge"
        ? { type: { in: ["RECHARGE", "OFFLINE_RECHARGE"] } }
        : typeFilter === "consume"
        ? { type: "CONSUME" }
        : typeFilter === "gift"
        ? { type: { in: ["GIFT_REGISTER", "MEMBERSHIP_GRANT"] } }
        : typeFilter === "expire"
        ? { type: "GIFT_EXPIRE" }
        : {};

    const listWhere = Object.keys(typeCondition).length
      ? { AND: [ledgerWhere, typeCondition] }
      : ledgerWhere;

    const [total, grouped, rows] = await Promise.all([
      prisma.pointledger.count({ where: listWhere }).catch(() => 0),
      prisma.pointledger
        .groupBy({ by: ["direction", "type"], where: ledgerWhere, _sum: { points: true } })
        .catch(() => []),
      prisma.pointledger
        .findMany({ where: listWhere, take: pageSize * page, orderBy: { createdAt: "desc" } })
        .catch(() => []),
    ]);

    const sumBy = (direction: string, types: string[]) =>
      (grouped as any[])
        .filter((g) => g.direction === direction && types.includes(g.type))
        .reduce((s, g) => s + Number(g._sum?.points || 0), 0);

    const stats = {
      totalRecharged: sumBy("IN", ["RECHARGE", "OFFLINE_RECHARGE"]),
      totalGift: sumBy("IN", ["GIFT_REGISTER", "MEMBERSHIP_GRANT", "REFUND", "MANUAL_ADJUST"]),
      totalConsumed: sumBy("OUT", ["CONSUME"]),
      totalExpired: sumBy("OUT", ["GIFT_EXPIRE"]),
      walletBalance,
    };

    const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean) as string[]));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userNameMap = new Map<string, string>();
    (users as any[]).forEach((u) => userNameMap.set(u.id, u.name || u.email || "未知用户"));

    const records = rows
      .map((r) => ({
        id: r.id,
        direction: r.direction,
        type: r.type,
        scope: r.scope,
        title: r.title,
        points: r.direction === "IN" ? Number(r.points) : -Number(r.points),
        amountCents: Number(r.amountCents || 0),
        operator: userNameMap.get(r.userId || "") || "系统",
        componentName: r.componentName || null,
        workspaceId: r.workspaceId,
        balanceAfter: Number(r.balanceAfter || 0),
        orderNo: r.orderNo,
        paymentMethod: r.paymentMethod,
        createdAt: r.createdAt.toISOString(),
      }))
      .slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      data: {
        walletBalance,
        expiringPoints,
        expiringAt,
        workspaces,
        stats,
        records,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1),
        },
      },
    });
  } catch (error) {
    console.error("获取我的算力失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
