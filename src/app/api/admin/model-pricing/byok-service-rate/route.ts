import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { BILLING_CONFIG_KEYS } from "@/lib/billing/billing-config";

export const dynamic = "force-dynamic";

/** BYO 服务费率配置键（基点，1bp=0.01%） */
const KEY = BILLING_CONFIG_KEYS.byokServiceRateBps;
/** 服务费合理上限：100% = 10000 bps（前端按百分比输入，0~100） */
const MAX_PERCENT = 100;

/**
 * 读取当前 BYO（自带模型）平台服务费率（单一真源：systemconfig.billing.byokServiceRateBps）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage", "billing:read");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const cfg = await prisma.systemconfig.findUnique({ where: { key: KEY } });
    const raw = cfg?.value != null ? Number(cfg.value) : null;
    const bps = raw != null && Number.isFinite(raw) ? Math.round(raw) : null;
    return NextResponse.json({
      success: true,
      data: {
        byokServiceRateBps: bps,
        percent: bps != null ? bps / 100 : null,
      },
    });
  } catch (error) {
    console.error("[byok-service-rate] 读取失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "读取 BYO 服务费率失败" }, { status: 500 });
  }
}

/**
 * 设置 BYO 平台服务费率（百分比 → 基点存储）。单一真源，对所有自带模型统一生效。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { percent?: unknown };
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > MAX_PERCENT) {
      return NextResponse.json(
        { success: false, error: `服务费率百分比必须为 0~${MAX_PERCENT} 之间的数字` },
        { status: 400 },
      );
    }
    const bps = Math.round(pct * 100);

    const adminId = auth.user?.id ?? null;
    const oldCfg = await prisma.systemconfig.findUnique({ where: { key: KEY } });
    const oldBps = oldCfg?.value != null ? Number(oldCfg.value) : null;

    await prisma.systemconfig.upsert({
      where: { key: KEY },
      create: { key: KEY, value: String(bps) },
      update: { value: String(bps) },
    });

    try {
      if (adminId) {
        await prisma.operationlog.create({
          data: {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            userId: adminId,
            workspaceId: null,
            action: "BYOK_SERVICE_RATE_UPDATE",
            resource: "BILLING_CONFIG",
            details: {
              key: KEY,
              oldBps,
              newBps: bps,
              percent: pct,
              updatedAt: new Date().toISOString(),
            } as object,
          },
        });
      }
    } catch (logErr) {
      console.error("[byok-service-rate] 审计日志写入失败:", (logErr as Error)?.message);
    }

    return NextResponse.json({
      success: true,
      data: { byokServiceRateBps: bps, percent: bps / 100 },
    });
  } catch (error) {
    console.error("[byok-service-rate] 保存失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "保存 BYO 服务费率失败" }, { status: 500 });
  }
}
