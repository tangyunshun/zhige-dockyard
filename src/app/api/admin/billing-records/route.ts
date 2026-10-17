export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/**
 * GET /api/admin/billing-records
 * 超级管理员拉取全平台交易账单与算力充值订单记录
 *
 * 支持服务端筛选 + 分页（查询参数）：
 *  - page / pageSize：分页
 *  - status / type / channel：筛选（ALL 或缺失不过滤）
 *  - keyword：模糊匹配订单号 / 标题 / 用户ID / 用户名 / 邮箱 / 空间名
 * 统计指标随当前筛选口径计算，分页 total 为筛选后总数，杜绝"列表最多 100 条但与全库统计矛盾"。
 */
export async function GET(request: NextRequest) {
  try {
    // 严格校验订单流水查看权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "order:read", "order:detail");
    if (!authCheck.authorized) {
      // requirePlatformPermission 契约：失败时返回 errorResponse（不再有 error/status 字段）
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));
    const status = sp.get("status");
    const type = sp.get("type");
    const channel = sp.get("channel");
    const keyword = (sp.get("keyword") || "").trim();

    const model = (prisma as any).billing_record || (prisma as any).billingrecord;
    let records: any[] = [];
    let total = 0;
    const stats = {
      totalRevenue: 0,
      totalOrders: 0,
      tokenRechargeCount: 0,
      planUpgradeCount: 0,
      availableTypes: [] as string[],
      availableChannels: [] as string[],
    };

    if (model && typeof model.findMany === "function") {
      // 组装筛选条件（与前端口径保持一致）
      const and: any[] = [];
      if (status && status !== "ALL") and.push({ status });
      if (type && type !== "ALL") and.push({ type });
      if (channel && channel !== "ALL") {
        const cc = channel.toUpperCase();
        if (cc === "ONLINE_PAY") {
          and.push({
            OR: [
              { channel: { contains: "ONLINE", mode: "insensitive" } },
              { channel: null },
              { channel: "" },
            ],
          });
        } else if (cc === "WECHAT") {
          and.push({
            OR: [
              { channel: { contains: "WECHAT", mode: "insensitive" } },
              { channel: { contains: "WX", mode: "insensitive" } },
            ],
          });
        } else if (cc === "ALIPAY") {
          and.push({
            OR: [
              { channel: { contains: "ALIPAY", mode: "insensitive" } },
              { channel: { contains: "ALI", mode: "insensitive" } },
            ],
          });
        } else if (cc === "STRIPE") {
          and.push({ channel: { contains: "STRIPE", mode: "insensitive" } });
        } else if (cc === "OTHER") {
          and.push({
            NOT: [
              { channel: { contains: "WECHAT", mode: "insensitive" } },
              { channel: { contains: "ALIPAY", mode: "insensitive" } },
              { channel: { contains: "STRIPE", mode: "insensitive" } },
              { channel: { contains: "ONLINE", mode: "insensitive" } },
            ],
          });
        }
      }
      if (keyword) {
        // 关联用户名 / 邮箱 / 空间名：先查关联表拿到 ID，再并入 OR，避免依赖关系过滤器
        const [matchedUsers, matchedWorkspaces] = await Promise.all([
          prisma.user
            .findMany({
              where: {
                OR: [
                  { name: { contains: keyword, mode: "insensitive" } },
                  { email: { contains: keyword, mode: "insensitive" } },
                ],
              },
              select: { id: true },
            })
            .catch(() => []),
          prisma.workspace
            .findMany({
              where: { name: { contains: keyword, mode: "insensitive" } },
              select: { id: true },
            })
            .catch(() => []),
        ]);
        const uids = (matchedUsers as any[]).map((u) => u.id);
        const wids = (matchedWorkspaces as any[]).map((w) => w.id);
        and.push({
          OR: [
            { id: { contains: keyword, mode: "insensitive" } },
            { title: { contains: keyword, mode: "insensitive" } },
            { userId: { contains: keyword, mode: "insensitive" } },
            ...(uids.length ? [{ userId: { in: uids } }] : []),
            ...(wids.length ? [{ workspaceId: { in: wids } }] : []),
          ],
        });
      }

      const baseWhere = and.length ? { AND: and } : {};
      const whereSuccess = and.length ? { AND: [...and, { status: "SUCCESS" }] } : { status: "SUCCESS" };
      const whereToken = and.length ? { AND: [...and, { type: "TOKEN_RECHARGE" }] } : { type: "TOKEN_RECHARGE" };
      const wherePlan = and.length ? { AND: [...and, { type: "PLAN_UPGRADE" }] } : { type: "PLAN_UPGRADE" };

      const [pageRecords, filteredCount, rechargeCount, upgradeCount, aggRevenue, distinctTypes, distinctChannels] =
        await Promise.all([
          model
            .findMany({ where: baseWhere, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })
            .catch(() => []),
          model.count({ where: baseWhere }).catch(() => 0),
          model.count({ where: whereToken }).catch(() => 0),
          model.count({ where: wherePlan }).catch(() => 0),
          model.aggregate({ _sum: { amount: true }, where: whereSuccess }).catch(() => ({ _sum: { amount: 0 } })),
          model.findMany({ select: { type: true }, distinct: ["type"] }).catch(() => []),
          model.findMany({ select: { channel: true }, distinct: ["channel"] }).catch(() => []),
        ]);

      records = pageRecords;
      total = filteredCount;
      stats.totalRevenue = Number(aggRevenue?._sum?.amount || 0);
      stats.totalOrders = filteredCount;
      stats.tokenRechargeCount = rechargeCount;
      stats.planUpgradeCount = upgradeCount;
      stats.availableTypes = Array.from(new Set(distinctTypes.map((t: any) => t.type).filter(Boolean)));
      stats.availableChannels = Array.from(new Set(distinctChannels.map((c: any) => c.channel).filter(Boolean)));
    }

    let enrichedRecords = records;
    if (records.length > 0) {
      const userIds = Array.from(new Set(records.map((r: any) => r.userId).filter(Boolean)));
      const workspaceIds = Array.from(new Set(records.map((r: any) => r.workspaceId).filter(Boolean)));

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
                select: { id: true, name: true, type: true, logo: true, plan: true },
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
        workspace: r.workspaceId ? workspaceMap.get(r.workspaceId) || null : null,
      }));
    }

    return NextResponse.json({
      records: enrichedRecords || [],
      stats,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error: any) {
    console.error("获取全平台交易订单失败:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误" }, { status: 500 });
  }
}
