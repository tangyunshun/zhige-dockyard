import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, requirePlatformPermission } from "@/lib/security";

/**
 * 管理员后台「待办」角标统计
 * 聚合当前需要管理员处理的事项数量，供左侧菜单「后台总览」红点角标使用：
 * - appeals：待审核的账号解封/禁用申诉工单
 * - rechargeOrders：待审批的线下充值工单（对公转账 / 合同结算）
 * - refundRequests：待审批的用户算力点退款申请（需 order:read 才计入）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformAuth(request);
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    // 细粒度权限：待办角标聚合了「待审核申诉」与「待审批充值工单」两类数据，
    // 因此要求具备其中任一相关权限即可（order:read ∨ user:read ∨ appeal:read），
    // 避免出现"仅靠登录态即可读取运营待办数据"的空档。
    const permCheck = await requirePlatformPermission(request, "order:read", "user:read", "appeal:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限查看后台待办" }, { status: 403 });
    }

    // 退款申请属于「财务与订单」域，只有具备 order:read 权限的管理员才应看到该类待办，
    // 避免仅持有 user:read / appeal:read 的人通过角标间接得知财务事项数量。
    const orderPerm = await requirePlatformPermission(request, "order:read");
    const canSeeRefund = orderPerm.authorized;

    const [appeals, rechargeOrders, refundRequests] = await Promise.all([
      prisma.accountappeal.count({ where: { status: "pending" } }),
      prisma.tokenrechargeorder.count({ where: { status: "PENDING" } }),
      canSeeRefund ? prisma.refundrequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    ]);

    return NextResponse.json({
      success: true,
      total: appeals + rechargeOrders + refundRequests,
      appeals,
      rechargeOrders,
      refundRequests,
    });
  } catch (error) {
    console.error("Get admin pending tasks error:", error);
    return NextResponse.json(
      { error: "获取待办统计失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
