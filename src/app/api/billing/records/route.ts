import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/billing/records
 * 查询当前用户的账单与交易流水（数据来自数据库 billingrecord 表）
 * 排除 type="INVOICE_APPLY"（发票申请专单），支持全量分页与时间、类型、状态筛选，
 * 并统计每笔订单已开票次数（同一笔数据最多支持开票 2 次）。
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get("workspaceId");
    const type = searchParams.get("type"); // 全部 / 会员 / 空间 / 算力充值
    const status = searchParams.get("status"); // SUCCESS / PENDING / FAILED
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitParam = Number(searchParams.get("limit") || searchParams.get("pageSize"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
      type: { not: "INVOICE_APPLY" },
      ...(workspaceId ? { workspaceId } : {}),
    };

    if (type && type !== "ALL") {
      where.type = type;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [total, records, allInvoices] = await Promise.all([
      prisma.billingrecord.count({ where }),
      prisma.billingrecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      // 预拉取当前用户的发票申请记录，统计各订单已开票次数
      prisma.billingrecord.findMany({
        where: { userId, type: "INVOICE_APPLY" },
        select: { id: true, metadata: true },
      }),
    ]);

    // 统计各 orderNo 开票次数
    const invoiceCountMap = new Map<string, number>();
    allInvoices.forEach((inv) => {
      const md = (inv.metadata as any) || {};
      const orderNo = md.orderNo;
      if (orderNo) {
        invoiceCountMap.set(orderNo, (invoiceCountMap.get(orderNo) || 0) + 1);
      }
    });

    const data = records.map((r) => {
      const invoicedCount = invoiceCountMap.get(r.id) || (r.referenceId ? invoiceCountMap.get(r.referenceId) || 0 : 0);
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        amount: r.amount,
        amountYuan: r.amount / 100,
        currency: r.currency,
        status: r.status,
        channel: r.channel,
        workspaceId: r.workspaceId,
        referenceId: r.referenceId,
        invoiceUrl: r.invoiceUrl,
        invoicedCount,
        maxInvoices: 2,
        canInvoice: invoicedCount < 2,
        metadata: r.metadata,
        date: r.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Get billing records error:", error);
    return NextResponse.json(
      { error: "获取账单记录失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
