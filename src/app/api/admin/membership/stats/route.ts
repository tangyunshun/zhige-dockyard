import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

/**
 * GET /api/admin/membership/stats
 * 获取会员管理全景商业化统计与健康态势数据
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    if (!isAdminRole(authResult.user.role)) {
      return NextResponse.json(
        { success: false, error: "权限不足，仅管理员可查看全盘统计" },
        { status: 403 }
      );
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 并行聚合各项真实数据
    const [
      totalUsers,
      paidUsers,
      totalOrders,
      paidOrdersCount,
      pendingOrdersCount,
      allPaidOrders,
      monthPaidOrders,
      todayPaidOrders,
      activeLevels,
      totalLevels,
      activeTokenPacks,
      totalTokenPacks,
      expiringMembersCount,
      recentOrders,
      recentLogs,
    ] = await Promise.all([
      // 1. 用户总数
      prisma.user.count(),

      // 2. 付费会员总数（排除 FREE / free / default 等同义免费档位）
      prisma.user.count({
        where: {
          AND: [
            { membershipLevel: { not: "FREE" } },
            { membershipLevel: { not: "free" } },
            { membershipLevel: { not: "default" } },
          ],
        },
      }),

      // 3. 订单总数
      prisma.membershiporder.count(),

      // 4. 已支付订单数
      prisma.membershiporder.count({
        where: {
          status: { in: ["PAID", "COMPLETED", "paid", "completed"] },
        },
      }),

      // 5. 待支付/待处理订单数
      prisma.membershiporder.count({
        where: {
          status: { in: ["PENDING", "pending", "WAIT_BUYER_PAY"] },
        },
      }),

      // 6. 真实历史累计已支付总金额
      prisma.membershiporder.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ["PAID", "COMPLETED", "paid", "completed"] },
        },
      }),

      // 7. 本月已支付金额
      prisma.membershiporder.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ["PAID", "COMPLETED", "paid", "completed"] },
          createdAt: { gte: startOfMonth },
        },
      }),

      // 8. 今日已支付金额
      prisma.membershiporder.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ["PAID", "COMPLETED", "paid", "completed"] },
          createdAt: { gte: startOfToday },
        },
      }),

      // 9. 活跃在售会员等级
      prisma.membershiplevel.count({ where: { isActive: true } }),

      // 10. 全部会员等级
      prisma.membershiplevel.count(),

      // 11. 活跃已上架 Token 加油包
      prisma.tokenpack.count({ where: { isActive: true } }),

      // 12. 全部 Token 加油包
      prisma.tokenpack.count(),

      // 13. 即将到期会员数 (未来 7 天内到期且状态有效)
      // 说明：user 模型暂未提供 membershipExpiresAt 字段，无法精确判定"即将到期"，
      // 待 schema 补齐该字段后启用真实逻辑；此处暂时返回 0 以保持接口结构稳定
      Promise.resolve(0).catch(() => 0),

      // 14. 最近 5 笔订单流水
      prisma.membershiporder.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          membershiplevel: {
            select: { id: true, nameZh: true, color: true, icon: true },
          },
        },
      }),

      // 15. 最近 5 条会员变更日志
      prisma.membershipchangelog.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          user_membershipchangelog_userIdTouser: {
            select: { id: true, name: true, email: true },
          },
          user_membershipchangelog_operatorIdTouser: {
            select: { id: true, name: true },
          },
          membershiplevel: {
            select: { id: true, nameZh: true, color: true, icon: true },
          },
        },
      }),
    ]);

    const totalRevenue = Number(allPaidOrders._sum.amount || 0);
    const monthRevenue = Number(monthPaidOrders._sum.amount || 0);
    const todayRevenue = Number(todayPaidOrders._sum.amount || 0);

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          paidUsers,
          freeUsers: Math.max(0, totalUsers - paidUsers),
          paidRatio: totalUsers > 0 ? Number(((paidUsers / totalUsers) * 100).toFixed(1)) : 0,
          totalOrders,
          paidOrdersCount,
          pendingOrdersCount,
          totalRevenue,
          monthRevenue,
          todayRevenue,
          activeLevels,
          totalLevels,
          activeTokenPacks,
          totalTokenPacks,
          expiringMembersCount,
        },
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          amount: Number(o.amount),
          status: o.status,
          paymentMethod: o.paymentMethod || "在线支付",
          createdAt: o.createdAt.toISOString(),
          user: o.user,
          level: o.membershiplevel,
        })),
        recentLogs: recentLogs.map((l) => ({
          id: l.id,
          changeType: l.changeType,
          reason: l.reason,
          createdAt: l.createdAt.toISOString(),
          user: l.user_membershipchangelog_userIdTouser,
          operator: l.user_membershipchangelog_operatorIdTouser,
          level: l.membershiplevel,
        })),
      },
    });
  } catch (error: any) {
    console.error("获取会员管理全局统计失败:", error);
    return NextResponse.json(
      { success: false, error: "系统繁忙，获取会员全景统计失败" },
      { status: 500 }
    );
  }
}
