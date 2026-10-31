export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/payments/orders —— 当前用户「在线充值订单」列表（仅 TOKEN_RECHARGE）
 *
 * 支撑「算力充值」页的充值记录列表：支持状态/支付通道/时间范围/关键字筛选与分页，
 * 并附带各状态计数汇总，便于前端展示待支付/已支付/已取消/已超时数量与「继续支付」「取消支付」操作。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(sp.get("limit") || "10", 10)), 100);
    const status = sp.get("status"); // ALL | PENDING | SUCCESS | CANCELLED | EXPIRED
    const channel = sp.get("channel"); // ALL | WECHAT_PAY | ALIPAY
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");
    const keyword = (sp.get("keyword") || "").trim();

    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (!billingModel) return NextResponse.json({ error: "账单表不可用" }, { status: 500 });

    const baseWhere: any = { userId: auth.user.id, type: "TOKEN_RECHARGE" };

    const where: any = { ...baseWhere };
    if (status && status !== "ALL") where.status = status;
    if (channel && channel !== "ALL") where.channel = channel;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.createdAt.lte = e;
      }
    }
    if (keyword) {
      where.OR = [
        { id: { contains: keyword, mode: "insensitive" } },
        { title: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      billingModel.count({ where }),
      billingModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // 状态汇总（基于全量本人充值订单，不受当前筛选影响）
    const all = await billingModel.findMany({
      where: baseWhere,
      select: { status: true },
    });
    const summary: Record<string, number> = {
      PENDING: 0,
      SUCCESS: 0,
      CANCELLED: 0,
      EXPIRED: 0,
      total: all.length,
    };
    for (const r of all) summary[r.status] = (summary[r.status] || 0) + 1;

    const list = rows.map((o: any) => {
      const meta = (o.metadata || {}) as Record<string, unknown>;
      return {
        orderNo: o.id,
        title: o.title,
        type: o.type,
        amountCents: Number(o.amount ?? 0),
        points: Number(meta.points ?? 0),
        packName: typeof meta.packName === "string" ? meta.packName : null,
        workspaceId: o.workspaceId,
        workspaceName: typeof meta.workspaceName === "string" ? meta.workspaceName : null,
        channel: o.channel,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        codeUrl: typeof meta.codeUrl === "string" ? meta.codeUrl : null,
        discountPercent: Number(meta.discountPercent ?? 0),
        paymentMode: typeof meta.paymentMode === "string" ? meta.paymentMode : "MOCK",
      };
    });

    return NextResponse.json({
      success: true,
      orders: list,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary,
    });
  } catch (error) {
    console.error("[payments/orders] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ error: "查询充值订单失败" }, { status: 500 });
  }
}
