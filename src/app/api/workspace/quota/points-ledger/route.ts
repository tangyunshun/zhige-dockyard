export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { getBalanceSummary } from "@/lib/credit-service";

/**
 * GET /api/workspace/quota/points-ledger
 *
 * 空间算力点流水总账（唯一数据源：pointledger 表）
 *
 * 查询参数：
 *   workspaceId  必填
 *   type         all | recharge | consume | gift | expire（默认 all）
 *   page/pageSize 服务端分页（默认 1 / 20）
 *   startDate / endDate  时间范围过滤（ISO 字符串）
 *   operatorId   操作人过滤（企业空间分成员查看）
 *   componentId  组件过滤
 *
 * 数据范围：本空间全部流水 + 当前用户钱包中无空间归属的流水（充值/退款/到期）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId 参数" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({
        error: "越权警告：您不属于该工作空间，无权查看算力点明细",
      }, { status: 403 });
    }

    const typeFilter = (searchParams.get("type") || "all").toLowerCase();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 1), 100);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const operatorId = searchParams.get("operatorId");
    const componentId = searchParams.get("componentId");

    // 基础范围：空间内全部流水 + 用户钱包无空间归属的流水
    const baseWhere: any = {
      OR: [
        { workspaceId },
        { scope: "WALLET", userId: auth.user.id, workspaceId: null },
      ],
    };

    const createdAtFilter: any = {};
    if (startDate) createdAtFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      createdAtFilter.lte = end;
    }

    const typeCondition: any =
      typeFilter === "recharge"
        ? { type: { in: ["RECHARGE", "OFFLINE_RECHARGE"] } }
        : typeFilter === "consume"
        ? { type: "CONSUME" }
        : typeFilter === "gift"
        ? { type: "GIFT_REGISTER" }
        : typeFilter === "expire"
        ? { type: "GIFT_EXPIRE" }
        : {};

    const listWhere: any = {
      AND: [
        baseWhere,
        Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {},
        operatorId ? { operatorId } : {},
        componentId ? { componentId } : {},
        typeCondition,
      ].filter((c) => Object.keys(c).length > 0),
    };

    // 汇总（不分页、不受 type 过滤影响，保证统计卡口径稳定）
    const statsWhere: any = {
      AND: [
        baseWhere,
        Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {},
      ].filter((c) => Object.keys(c).length > 0),
    };

    const [total, grouped, rows] = await Promise.all([
      prisma.pointledger.count({ where: listWhere }).catch(() => 0),
      prisma.pointledger
        .groupBy({
          by: ["direction", "type"],
          where: statsWhere,
          _sum: { points: true },
        })
        .catch(() => []),
      prisma.pointledger
        .findMany({
          where: listWhere,
          // 避免 MySQL sort buffer 溢出：小结果集内存排序
          take: pageSize * page,
        })
        .catch(() => []),
    ]);

    const sumBy = (direction: string, types: string[]) =>
      (grouped as any[])
        .filter((g) => g.direction === direction && types.includes(g.type))
        .reduce((s, g) => s + Number(g._sum?.points || 0), 0);

    const totalRecharged = sumBy("IN", ["RECHARGE", "OFFLINE_RECHARGE"]);
    const totalGift = sumBy("IN", ["GIFT_REGISTER", "MEMBERSHIP_GRANT", "REFUND", "MANUAL_ADJUST"]);
    const totalConsumed = sumBy("OUT", ["CONSUME"]);
    const totalExpired = sumBy("OUT", ["GIFT_EXPIRE"]);

    // 操作人姓名与组件名（统一字典，避免前端硬编码）
    const userIds = Array.from(new Set(rows.map((r: any) => r.userId).filter(Boolean) as string[]));
    const compIds = Array.from(new Set(rows.map((r: any) => r.componentId).filter(Boolean) as string[]));

    const allUsers = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        }).catch(() => [] as any[])
      : ([] as any[]);
    const allComps = compIds.length
      ? await prisma.componentcatalog
          .findMany({
            where: { id: { in: compIds } },
            select: { id: true, name: true },
          })
          .catch(() => [] as any[])
      : ([] as any[]);

    const userNameMap = new Map<string, string>();
    (allUsers as any[]).forEach((u) => userNameMap.set(u.id, u.name || u.email || "未知用户"));
    const compNameMap = new Map<string, string>();
    (allComps as any[]).forEach((c) => compNameMap.set(c.id, c.name));

    const records = rows
      .map((r) => ({
        id: r.id,
        direction: r.direction as "IN" | "OUT",
        type: r.type,
        scope: r.scope,
        title: r.title,
        // 带符号：入账为正，出账为负（与前端既有展示口径一致）
        points: r.direction === "IN" ? Number(r.points) : -Number(r.points),
        amountCents: Number(r.amountCents || 0),
        status: "SUCCESS",
        operator: userNameMap.get(r.userId || "") || "系统",
        operatorId: r.userId,
        componentId: r.componentId,
        componentName: r.componentName || (r.componentId ? compNameMap.get(r.componentId) || null : null),
        workspaceId: r.workspaceId,
        workspaceType: r.workspaceType,
        balanceAfter: Number(r.balanceAfter || 0),
        orderNo: r.orderNo,
        paymentMethod: r.paymentMethod,
        createdAt: r.createdAt.toISOString(),
      }))
      // 内存排序（规避 MySQL ORDER BY 排序内存溢出）
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice((page - 1) * pageSize, page * pageSize);

    const summary = await getBalanceSummary(auth.user.id, workspaceId);

    return NextResponse.json(
      {
        success: true,
        data: {
          balance: summary.available ?? 0,
          walletBalance: summary.walletBalance,
          workspaceBalance: summary.workspaceBalance,
          unlimited: summary.unlimited,
          expiringPoints: summary.expiringPoints,
          expiringAt: summary.expiringAt,
          totalRecharged,
          totalGift,
          totalConsumed,
          totalExpired,
          records,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.max(Math.ceil(total / pageSize), 1),
          },
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("获取算力点流水失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
