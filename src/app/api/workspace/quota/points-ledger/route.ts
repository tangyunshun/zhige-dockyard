export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { pointsToCents } from "@/lib/point-rate";

/**
 * GET /api/workspace/quota/points-ledger?workspaceId=xxx&type=all|recharge|consume&limit=200
 *
 * 空间算力点流水总账：合并「充值（billing_record）」与「消耗（componenttask）」两类明细，
 * 为「算力点」页提供唯一数据源。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId 参数" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({
        error: "越权警告：您不属于该工作空间，无权查看算力点明细",
      }, { status: 403 });
    }

    const typeFilter = (searchParams.get("type") || "all").toLowerCase();
    const limitParam = searchParams.get("limit");
    const take = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 200, 1), 500) : 200;

    // 账单模型兼容取用（历史代码存在两种命名写法）
    const billingModel = (prisma as any).billingrecord || (prisma as any).billing_record;

    // 1. 并行拉取：充值账单 / 消耗任务 / 当前余额
    const [billingRows, taskRows, quota] = await Promise.all([
      // 注意：此处不使用数据库 orderBy。MySQL 排序缓冲区(sort_buffer_size)过小时，
      // ORDER BY createdAt 会抛出 1038 "Out of sort memory"，导致接口整体失败。
      // 结果集本身很小，改由服务端内存排序，既规避该错误又保证顺序正确。
      billingModel && typeof billingModel.findMany === "function"
        ? billingModel
            .findMany({
              where: { workspaceId },
              take: 500,
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.componenttask.findMany({
        where: { tenantId: workspaceId, status: { not: "ARCHIVED" } },
        take: 500,
      }).catch(() => []),
      prisma.workspacequota
        .findUnique({ where: { workspaceId } })
        .catch(() => null),
    ]);

    // 2. 反查操作人姓名与组件中文名（统一字典，避免前端硬编码）
    const userIds = new Set<string>();
    const compIds = new Set<string>();
    (billingRows || []).forEach((r: any) => r?.userId && userIds.add(r.userId));
    (taskRows || []).forEach((t: any) => {
      t?.userId && userIds.add(t.userId);
      t?.type && compIds.add(t.type);
    });

    const [users, comps] = await Promise.all([
      userIds.size > 0
        ? prisma.user
            .findMany({
              where: { id: { in: Array.from(userIds) } },
              select: { id: true, name: true, email: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      compIds.size > 0
        ? prisma.componentcatalog
            .findMany({
              where: { id: { in: Array.from(compIds) } },
              select: { id: true, name: true, estimatedTokens: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const userNameMap = new Map<string, string>();
    (users as any[]).forEach((u) => {
      userNameMap.set(u.id, u.name || u.email || "未知用户");
    });
    const compMetaMap = new Map<string, { name: string; tokens: number }>();
    (comps as any[]).forEach((c) =>
      compMetaMap.set(c.id, { name: c.name, tokens: Number(c.estimatedTokens || 0) })
    );

    type LedgerRecord = {
      id: string;
      direction: "IN" | "OUT";
      title: string;
      points: number; // 带符号：充值为正，消耗为负
      amountCents: number;
      status: string;
      operator: string;
      componentName: string | null;
      estimated?: boolean; // true = 按组件标准成本回退估算（历史任务未记录实际消耗）
      paymentMethod?: string | null; // 充值时记录支付方式（WECHAT_PAY/ALIPAY/SYSTEM 等）
      createdAt: string;
    };

    const records: LedgerRecord[] = [];

    // 3. 充值 / 交易流水
    (billingRows || []).forEach((r: any) => {
      const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as any;
      const amountCents = Number(r.amount || 0);
      // 点数优先取账单 metadata；缺失时按统一规则（1 点 = 1 分）由金额反推
      const pts =
        typeof meta.points === "number" && meta.points > 0
          ? meta.points
          : amountCents;
      records.push({
        id: String(r.id),
        direction: "IN",
        title: r.title || "算力充值",
        points: Number(pts),
        amountCents: Number.isFinite(amountCents) ? amountCents : pointsToCents(pts),
        status: r.status || "SUCCESS",
        operator: userNameMap.get(r.userId) || "未知用户",
        componentName: null,
        estimated: false,
        paymentMethod: r.channel || r.paymentMethod || null,
        createdAt: new Date(r.createdAt).toISOString(),
      });
    });

    // 4. 任务消耗流水
    //    严禁计入未真正执行提交的占位任务：只有包含真实 tokenCost 扣费，或状态为 SUCCESS 真实完成的任务，才作为消耗算力流水入账。
    (taskRows || []).forEach((t: any) => {
      const cfg = (t.config && typeof t.config === "object" ? t.config : {}) as any;
      const rawCost = Number(cfg?.tokenCost ?? 0);
      const hasCost = Number.isFinite(rawCost) && rawCost > 0;
      const isRealSuccess = t.status === "SUCCESS";

      // 强校验：既没有明确扣费 tokenCost 记录，又非 SUCCESS 真正执行完成的任务，严禁计入消耗账单！
      if (!hasCost && !isRealSuccess) {
        return;
      }

      const compMeta = compMetaMap.get(t.type);
      const fallbackCost = compMeta && compMeta.tokens > 0 ? compMeta.tokens : 5;
      const cost = hasCost ? rawCost : fallbackCost;

      records.push({
        id: String(t.id),
        direction: "OUT",
        title: t.name || "组件任务执行",
        points: -Math.round(cost),
        amountCents: pointsToCents(cost),
        status: t.status || "SUCCESS",
        operator: userNameMap.get(t.userId) || "未知用户",
        componentName: compMeta?.name || t.type || null,
        estimated: !hasCost,
        paymentMethod: "SYSTEM",
        createdAt: new Date(t.createdAt).toISOString(),
      });
    });

    // 5. 汇总与排序
    records.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    const totalRecharged = records
      .filter((r) => r.direction === "IN")
      .reduce((s, r) => s + Math.abs(r.points), 0);
    const totalConsumed = records
      .filter((r) => r.direction === "OUT")
      .reduce((s, r) => s + Math.abs(r.points), 0);

    const filtered =
      typeFilter === "recharge"
        ? records.filter((r) => r.direction === "IN")
        : typeFilter === "consume"
        ? records.filter((r) => r.direction === "OUT")
        : records;

    return NextResponse.json(
      {
        success: true,
        data: {
          balance: quota ? Number(quota.tokenBalance || 0) : 0,
          totalRecharged,
          totalConsumed,
          records: filtered.slice(0, take),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("获取算力点流水失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
