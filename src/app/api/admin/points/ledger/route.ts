export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/points/ledger
 * 平台级算力点流水查询（全空间），支持筛选与分页，用于后台算力财务对账与审计。
 */
function isPlatformAdmin(role?: string | null): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "PLATFORM_ADMIN";
}

const TYPE_META: Record<string, { label: string }> = {
  GIFT_REGISTER: { label: "注册赠送" },
  GIFT_EXPIRE: { label: "到期清零" },
  RECHARGE: { label: "在线充值" },
  OFFLINE_RECHARGE: { label: "线下入账" },
  MEMBERSHIP_GRANT: { label: "会员额度" },
  CONSUME: { label: "组件消耗" },
  REFUND: { label: "退回" },
  MANUAL_ADJUST: { label: "人工调整" },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdmin(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可查看算力流水" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(parseInt(sp.get("page") || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") || "20", 10) || 20, 1), 200);
    const typeFilter = (sp.get("type") || "all").toLowerCase();
    const workspaceId = sp.get("workspaceId");
    const operatorId = sp.get("operatorId");
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");

    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (operatorId) where.operatorId = operatorId;
    if (typeFilter !== "all") {
      const map: Record<string, string[]> = {
        recharge: ["RECHARGE", "OFFLINE_RECHARGE"],
        consume: ["CONSUME"],
        gift: ["GIFT_REGISTER", "MEMBERSHIP_GRANT"],
        expire: ["GIFT_EXPIRE"],
        refund: ["REFUND"],
        adjust: ["MANUAL_ADJUST"],
      };
      where.type = { in: map[typeFilter] || [typeFilter.toUpperCase()] };
    }
    if (startDate || endDate) {
      const range: any = {};
      if (startDate) range.gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        range.lte = e;
      }
      where.createdAt = range;
    }

    const [total, rows] = await Promise.all([
      prisma.pointledger.count({ where }).catch(() => 0),
      prisma.pointledger
        .findMany({ where, take: pageSize * page, orderBy: { createdAt: "desc" } })
        .catch(() => []),
    ]);

    // 操作人是 operatorId，不是 userId（userId 是流水归属人/受益人）
    const operatorIds = Array.from(
      new Set(rows.map((r) => r.operatorId).filter(Boolean) as string[]),
    );
    const users = operatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const normalizeOperatorName = (raw?: string | null) => {
      if (!raw) return "系统管理员";
      const lower = raw.trim().toLowerCase();
      if (lower === "superadmin" || lower === "super_admin" || lower === "admin") return "系统管理员";
      return raw;
    };

    const userNameMap = new Map<string, string>();
    (users as any[]).forEach((u) =>
      userNameMap.set(u.id, normalizeOperatorName(u.name || u.email || "系统管理员"))
    );

    const records = rows
      .map((r) => ({
        id: r.id,
        direction: r.direction,
        type: r.type,
        typeLabel: TYPE_META[r.type]?.label || r.type,
        scope: r.scope,
        title: r.title,
        points: r.direction === "IN" ? Number(r.points) : -Number(r.points),
        amountCents: Number(r.amountCents || 0),
        operator: normalizeOperatorName(userNameMap.get(r.operatorId || "")),
        componentName: r.componentName || null,
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName || null,
        workspaceType: r.workspaceType || null,
        balanceAfter: Number(r.balanceAfter || 0),
        orderNo: r.orderNo,
        paymentMethod: r.paymentMethod,
        createdAt: r.createdAt.toISOString(),
      }))
      .slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      data: {
        records,
        pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) },
      },
    });
  } catch (error) {
    console.error("获取平台算力流水失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
