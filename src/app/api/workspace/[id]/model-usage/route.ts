import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET：本空间「按模型」的调用统计 / 调用明细（空间「模型」Tab 数据源）
 *
 * 数据源：tokensettlement.pricingSnapshot（任务发生时绑定的价格快照，含 providerId + modelId）。
 *  - 平台系统模型：providerId = modeldeployment.providerId，modelId = modeldeployment.modelId
 *  - BYO 自带模型：providerId = `BYO:${workspaceId}`，modelId = workspace_byo_model.label
 *
 * 用法：
 *  - 不带 key：返回按模型聚合的统计列表（调用次数、状态分布、Token 四项、点数四项、成本/售价、首末次调用、计价口径）
 *  - 带 key=`providerId::modelId`：返回该模型最近的调用明细（任务级）
 * 鉴权：空间成员（所有者或任意角色成员）可读；不含任何密钥/敏感信息。
 */

const MAX_SCAN_ROWS = 5000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const MAX_DETAILS = 50;

interface SnapshotMeta {
  billingMode?: string;
  priceStatus?: string;
  pricingMode?: string;
  markupRateBps?: number | null;
}

function readSnapshotMeta(snap: Record<string, unknown>): SnapshotMeta {
  return {
    billingMode: typeof snap.billingMode === "string" ? snap.billingMode : undefined,
    priceStatus: typeof snap.priceStatus === "string" ? snap.priceStatus : undefined,
    pricingMode: typeof snap.pricingMode === "string" ? snap.pricingMode : undefined,
    markupRateBps: typeof snap.markupRateBps === "number" ? snap.markupRateBps : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, ownerId: true } });
    if (!ws) {
      return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });
    }
    const member = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId },
      select: { id: true, role: true },
    });
    if (ws.ownerId !== userId && !member) {
      return NextResponse.json({ success: false, error: "无权访问该工作空间" }, { status: 403 });
    }
    // 可见性隔离：空间所有者 / 空间管理员 / 平台管理员可查看全部成员调用；
    // 普通协同成员仅能查看自己的调用记录（BYO 私有模型调用因此不会泄露给其他成员）。
    const isPlatformAdmin = auth.user.role === "SUPER_ADMIN" || auth.user.role === "ADMIN";
    const canViewAll = ws.ownerId === userId || isPlatformAdmin || member?.role === "ADMIN";

    const searchParams = new URL(request.url).searchParams;
    const daysParam = Number(searchParams.get("days"));
    const days = Number.isFinite(daysParam) && daysParam > 0
      ? Math.min(Math.floor(daysParam), MAX_DAYS)
      : DEFAULT_DAYS;
    const since = new Date(Date.now() - days * 86400000);
    const key = (searchParams.get("key") || "").trim();

    const rows = await prisma.tokensettlement.findMany({
      where: { workspaceId, createdAt: { gte: since }, ...(canViewAll ? {} : { userId }) },
      select: {
        taskId: true,
        status: true,
        errorCode: true,
        holdPoints: true,
        actualPricePoints: true,
        releasedPoints: true,
        supplementPoints: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        costMicros: true,
        userPriceMicros: true,
        pricingSnapshot: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_SCAN_ROWS,
    });

    const rowMeta = rows.map((r) => {
      const snap = (r.pricingSnapshot ?? {}) as Record<string, unknown>;
      return {
        row: r,
        providerId: typeof snap.providerId === "string" ? snap.providerId : "",
        modelId: typeof snap.modelId === "string" ? snap.modelId : "",
        meta: readSnapshotMeta(snap),
      };
    });

    /* ---------- 明细模式：单个模型的最近调用 ---------- */
    if (key) {
      const idx = key.indexOf("::");
      const providerId = idx >= 0 ? key.slice(0, idx) : "";
      const modelId = idx >= 0 ? key.slice(idx + 2) : key;
      const details = rowMeta
        .filter((m) => m.providerId === providerId && m.modelId === modelId)
        .slice(0, MAX_DETAILS)
        .map((m) => ({
          taskId: m.row.taskId,
          status: m.row.status,
          errorCode: m.row.errorCode ?? null,
          createdAt: m.row.createdAt.toISOString(),
          holdPoints: Number(m.row.holdPoints || 0),
          actualPricePoints: Number(m.row.actualPricePoints || 0),
          releasedPoints: Number(m.row.releasedPoints || 0),
          supplementPoints: Number(m.row.supplementPoints || 0),
          inputTokens: Number(m.row.inputTokens || 0),
          outputTokens: Number(m.row.outputTokens || 0),
          cacheReadTokens: Number(m.row.cacheReadTokens || 0),
          cacheWriteTokens: Number(m.row.cacheWriteTokens || 0),
          costMicros: m.row.costMicros != null ? Number(m.row.costMicros) : null,
          userPriceMicros: m.row.userPriceMicros != null ? Number(m.row.userPriceMicros) : null,
          ...m.meta,
        }));
      return NextResponse.json({ success: true, data: { key, days, items: details } });
    }

    /* ---------- 聚合模式：按模型汇总 ---------- */
    interface Agg {
      key: string;
      providerId: string;
      modelId: string;
      source: "PLATFORM" | "BYO";
      totalCalls: number;
      settledCalls: number;
      holdCalls: number;
      releasedCalls: number;
      reviewCalls: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      holdPoints: number;
      actualPricePoints: number;
      releasedPoints: number;
      supplementPoints: number;
      costMicros: number;
      userPriceMicros: number;
      firstCalledAt: string;
      lastCalledAt: string;
      billingMode?: string;
      priceStatus?: string;
      pricingMode?: string;
      markupRateBps: number | null;
    }
    const aggMap = new Map<string, Agg>();

    for (const m of rowMeta) {
      if (!m.modelId) continue; // 无模型信息的流水无法归属，跳过（不得臆造）
      const key = `${m.providerId}::${m.modelId}`;
      const source: "PLATFORM" | "BYO" = m.providerId.startsWith("BYO:") ? "BYO" : "PLATFORM";
      const createdAtIso = m.row.createdAt.toISOString();

      let agg = aggMap.get(key);
      if (!agg) {
        agg = {
          key,
          providerId: m.providerId,
          modelId: m.modelId,
          source,
          totalCalls: 0,
          settledCalls: 0,
          holdCalls: 0,
          releasedCalls: 0,
          reviewCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          holdPoints: 0,
          actualPricePoints: 0,
          releasedPoints: 0,
          supplementPoints: 0,
          costMicros: 0,
          userPriceMicros: 0,
          firstCalledAt: createdAtIso,
          lastCalledAt: createdAtIso,
          markupRateBps: null,
        };
        aggMap.set(key, agg);
      }
      const r = m.row;
      agg.totalCalls += 1;
      if (r.status === "SETTLED") agg.settledCalls += 1;
      else if (r.status === "HOLD") agg.holdCalls += 1;
      else if (r.status === "RELEASED") agg.releasedCalls += 1;
      else if (r.status === "REQUIRES_REVIEW") agg.reviewCalls += 1;
      agg.inputTokens += Number(r.inputTokens || 0);
      agg.outputTokens += Number(r.outputTokens || 0);
      agg.cacheReadTokens += Number(r.cacheReadTokens || 0);
      agg.cacheWriteTokens += Number(r.cacheWriteTokens || 0);
      agg.holdPoints += Number(r.holdPoints || 0);
      agg.actualPricePoints += Number(r.actualPricePoints || 0);
      agg.releasedPoints += Number(r.releasedPoints || 0);
      agg.supplementPoints += Number(r.supplementPoints || 0);
      if (r.costMicros != null) agg.costMicros += Number(r.costMicros);
      if (r.userPriceMicros != null) agg.userPriceMicros += Number(r.userPriceMicros);
      if (createdAtIso < agg.firstCalledAt) agg.firstCalledAt = createdAtIso;
      if (createdAtIso > agg.lastCalledAt) agg.lastCalledAt = createdAtIso;
      // 计价口径取最近一次快照（rows 按 createdAt desc，首条即最新）
      if (agg.billingMode === undefined) {
        agg.billingMode = m.meta.billingMode;
        agg.priceStatus = m.meta.priceStatus;
        agg.pricingMode = m.meta.pricingMode;
        agg.markupRateBps = m.meta.markupRateBps ?? null;
      }
    }

    const items = Array.from(aggMap.values()).sort((a, b) => b.totalCalls - a.totalCalls);

    return NextResponse.json({
      success: true,
      data: {
        days,
        since: since.toISOString(),
        scanLimit: MAX_SCAN_ROWS,
        scannedRows: rows.length,
        items,
      },
    });
  } catch (error) {
    console.error("[workspace model-usage] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型调用统计失败" }, { status: 500 });
  }
}
