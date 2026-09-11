import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth } from "@/lib/security";

/**
 * 管理员后台「待办」角标统计
 * 聚合当前需要管理员处理的事项数量，供左侧菜单「后台总览」红点角标使用：
 * - appeals：待审核的账号解封/禁用申诉工单
 * - rechargeOrders：待审批的线下充值工单（对公转账 / 合同结算）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformAuth(request);
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const [appeals, rechargeOrders] = await Promise.all([
      prisma.accountappeal.count({ where: { status: "pending" } }),
      prisma.tokenrechargeorder.count({ where: { status: "PENDING" } }),
    ]);

    return NextResponse.json({
      success: true,
      total: appeals + rechargeOrders,
      appeals,
      rechargeOrders,
    });
  } catch (error) {
    console.error("Get admin pending tasks error:", error);
    return NextResponse.json(
      { error: "获取待办统计失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
