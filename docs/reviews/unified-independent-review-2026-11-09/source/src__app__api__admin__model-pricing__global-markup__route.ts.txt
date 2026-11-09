import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { MAX_MARKUP_BPS } from "@/lib/model-pricing";

/**
 * 全局加价率一键同步（面向未来 10% / 30% 调整）。
 *
 * 单一真源：billing.markupCoefficientBps（基点）。本接口把同一个加价率
 * 应用到「主表全部行 + 全部时段行」的 markupRateBps，并回写 systemconfig，
 * 同时每行 priceVersion 递增、写 operationlog（旧→新）。
 *
 * 注意：这是显式的全局批量改价动作，覆盖 per-deployment 启用态冻结
 * （rejectIfDeploymentEnabled 针对单模型手动改价；全局同步为负责人拍板的批量操作）。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { percent?: unknown; scope?: unknown };
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0) {
      return NextResponse.json({ success: false, error: "加价率百分比必须为非负数字" }, { status: 400 });
    }
    const bps = Math.round(pct * 100);
    if (bps > MAX_MARKUP_BPS) {
      return NextResponse.json(
        { success: false, error: `加价率超出上限（≤ ${(MAX_MARKUP_BPS / 100).toFixed(0)}%）` },
        { status: 400 },
      );
    }
    // scope: "default" = 仅更新全局默认（不打扰已独立设置的模型）；"all" = 强制全量覆盖（写入所有行）
    const scope: "default" | "all" = body.scope === "default" ? "default" : "all";

    const adminId = auth.user?.id ?? null;

    // 旧值（用于审计与回显）
    const oldCfg = await prisma.systemconfig.findUnique({ where: { key: "billing.markupCoefficientBps" } });
    const oldBps = oldCfg?.value != null ? Number(oldCfg.value) : null;

    const now = new Date();
    let modelCount = 0;
    let periodCount = 0;
    if (scope === "all") {
      // 强制全量覆盖：把同一加价率写入全部主表行 + 全部时段行
      const batch = await prisma.$transaction([
        prisma.modelpricing.updateMany({
          data: { markupRateBps: bps, priceVersion: { increment: 1 }, effectiveFrom: now },
        }),
        prisma.modelpricingperiod.updateMany({
          data: { markupRateBps: bps, priceVersion: { increment: 1 }, effectiveFrom: now },
        }),
      ]);
    }
    // 两种 scope 都回写全局默认（单一真源），模型 markupRateBps 留空即继承此值
    await prisma.systemconfig.upsert({
      where: { key: "billing.markupCoefficientBps" },
      create: { key: "billing.markupCoefficientBps", value: String(bps) },
      update: { value: String(bps) },
    });

    // 回写单一真源
    await prisma.systemconfig.upsert({
      where: { key: "billing.markupCoefficientBps" },
      create: { key: "billing.markupCoefficientBps", value: String(bps) },
      update: { value: String(bps) },
    });

    // 已独立设置加价率的模型数（markupRateBps 非空）；「设为默认」时不改动这些行
    const overriddenModelRows = await prisma.modelpricing.count({ where: { markupRateBps: { not: null } } });

    try {
      if (adminId) {
        await prisma.operationlog.create({
          data: {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            userId: adminId,
            workspaceId: null,
            action: "GLOBAL_MARKUP_SYNC",
            resource: "MODEL_PRICING",
            details: {
              task: "PRICING-FIX-R3",
              scope,
              oldBps,
              newBps: bps,
              percent: pct,
              modelRows: modelCount,
              periodRows: periodCount,
              overriddenModelRows,
              syncedAt: now.toISOString(),
            } as object,
          },
        });
      }
    } catch (logErr) {
      console.error("[global-markup] 审计日志写入失败:", (logErr as Error)?.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        oldBps,
        newBps: bps,
        percent: pct,
        scope,
        modelRows: modelCount,
        periodRows: periodCount,
        overriddenModelRows,
        markupCoefficientBps: bps,
      },
    });
  } catch (error) {
    console.error("[global-markup] 同步失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "全局加价率同步失败" }, { status: 500 });
  }
}

/** GET：返回当前生效的全局加价率（供后台入口回显） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage", "billing:read");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const cfg = await prisma.systemconfig.findUnique({ where: { key: "billing.markupCoefficientBps" } });
    const raw = cfg?.value != null ? Number(cfg.value) : null;
    // 口径矫正：旧版曾将乘数 k 以 *10000 存储（如 20000），正确基点口径应为 *100（2000 bps = 20%）。
    // 读取时若检测到旧版超大值（> 10000 bps），自动折算回正确基点，避免顶部误显 200%。
    const bps = raw != null && raw > 10000 ? Math.round(raw / 10) : raw;
    const [modelRows, periodRows, overriddenModelRows] = await Promise.all([
      prisma.modelpricing.count(),
      prisma.modelpricingperiod.count(),
      prisma.modelpricing.count({ where: { markupRateBps: { not: null } } }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        markupCoefficientBps: bps,
        percent: bps != null ? bps / 100 : null,
        modelRows,
        periodRows,
        overriddenModelRows,
      },
    });
  } catch (error) {
    console.error("[global-markup] 读取失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "读取全局加价率失败" }, { status: 500 });
  }
}
