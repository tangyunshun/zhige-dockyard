import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/billing/records
 * 查询当前用户的账单与交易流水（数据来自数据库 billing_record 表）
 * 可选 query：
 * - workspaceId: 仅返回某个空间的账单
 * - limit:       返回条数，默认 50
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
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

    const records = await prisma.billingrecord.findMany({
      where: {
        userId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 金额单位统一为「分」，同时给出元，便于前端展示
    const data = records.map((r) => ({
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
      metadata: r.metadata,
      date: r.createdAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get billing records error:", error);
    return NextResponse.json(
      { error: "获取账单记录失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
