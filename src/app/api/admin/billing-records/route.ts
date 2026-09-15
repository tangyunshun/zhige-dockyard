export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

/**
 * GET /api/admin/billing-records
 * 超级管理员拉取全平台交易账单与算力充值订单记录
 */
export async function GET(request: NextRequest) {
  try {
    // 严格校验订单流水查看权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "order:read");
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const model = (prisma as any).billing_record || (prisma as any).billingrecord;
    let records: any[] = [];
    let stats = {
      totalRevenue: 0,
      totalOrders: 0,
      tokenRechargeCount: 0,
      planUpgradeCount: 0,
      availableTypes: [] as string[],
      availableChannels: [] as string[],
    };

    if (model && typeof model.findMany === "function") {
      const [fetchedRecords, totalCount, rechargeCount, upgradeCount, aggRevenue, distinctTypes, distinctChannels] = await Promise.all([
        model.findMany({ orderBy: { createdAt: "desc" }, take: 100 }).catch(() => []),
        model.count().catch(() => 0),
        model.count({ where: { type: "TOKEN_RECHARGE" } }).catch(() => 0),
        model.count({ where: { type: "PLAN_UPGRADE" } }).catch(() => 0),
        model.aggregate({ _sum: { amount: true }, where: { status: "SUCCESS" } }).catch(() => ({ _sum: { amount: 0 } })),
        model.findMany({ select: { type: true }, distinct: ["type"] }).catch(() => []),
        model.findMany({ select: { channel: true }, distinct: ["channel"] }).catch(() => []),
      ]);

      records = fetchedRecords;
      stats = {
        totalRevenue: Number(aggRevenue?._sum?.amount || 0),
        totalOrders: totalCount,
        tokenRechargeCount: rechargeCount,
        planUpgradeCount: upgradeCount,
        availableTypes: Array.from(new Set(distinctTypes.map((t: any) => t.type).filter(Boolean))),
        availableChannels: Array.from(new Set(distinctChannels.map((c: any) => c.channel).filter(Boolean))),
      };
    }

    let enrichedRecords = records;
    if (records.length > 0) {
      const userIds = Array.from(
        new Set(records.map((r: any) => r.userId).filter(Boolean))
      );
      const workspaceIds = Array.from(
        new Set(records.map((r: any) => r.workspaceId).filter(Boolean))
      );

      const [users, workspaces] = await Promise.all([
        userIds.length > 0
          ? prisma.user
              .findMany({
                where: { id: { in: userIds } },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  membershipLevel: true,
                  phone: true,
                  createdAt: true,
                },
              })
              .catch((err) => {
                console.warn("查询关联用户信息异常:", err);
                return [];
              })
          : Promise.resolve([]),
        workspaceIds.length > 0
          ? prisma.workspace
              .findMany({
                where: { id: { in: workspaceIds } },
                select: {
                  id: true,
                  name: true,
                  type: true,
                  logo: true,
                  plan: true,
                },
              })
              .catch((err) => {
                console.warn("查询关联空间信息异常:", err);
                return [];
              })
          : Promise.resolve([]),
      ]);

      const userMap = new Map((users as any[]).map((u) => [u.id, u]));
      const workspaceMap = new Map((workspaces as any[]).map((w) => [w.id, w]));

      enrichedRecords = records.map((r: any) => ({
        ...r,
        user: userMap.get(r.userId) || null,
        workspace: r.workspaceId
          ? workspaceMap.get(r.workspaceId) || null
          : null,
      }));
    }

    return NextResponse.json({ records: enrichedRecords || [], stats });
  } catch (error: any) {
    console.error("获取全平台交易订单失败:", error);
    return NextResponse.json(
      { error: error?.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}
