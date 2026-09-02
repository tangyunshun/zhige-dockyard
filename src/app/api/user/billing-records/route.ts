export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/user/billing-records
 * 拉取当前登录用户的个人充值账单与交易历史
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const model = (prisma as any).billing_record || (prisma as any).billingrecord;
    let records: any[] = [];
    if (model && typeof model.findMany === "function") {
      records = await model.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch((e: any) => []);
    }

    return NextResponse.json({ records: records || [] });
  } catch (error) {
    console.error("获取个人账单历史失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
