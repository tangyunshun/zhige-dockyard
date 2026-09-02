export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/billing-records
 * 超级管理员拉取全平台交易账单与算力充值订单记录
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser = roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN" || roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json({ error: "越权警告：仅系统超级管理员可查看交易账单" }, { status: 403 });
    }

    const model = (prisma as any).billing_record || (prisma as any).billingrecord;
    let records: any[] = [];
    if (model && typeof model.findMany === "function") {
      records = await model.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }).catch((dbErr: any) => {
        console.warn("查询 billing_record 订单表异常，返回空数组:", dbErr);
        return [];
      });
    }

    return NextResponse.json({ records: records || [] });
  } catch (error: any) {
    console.error("获取全平台交易订单失败:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误" }, { status: 500 });
  }
}
