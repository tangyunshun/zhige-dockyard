import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, writeAuditLog } from "@/lib/security";
import {
  loadPricingConfig,
  savePricingConfig,
  isPricingConfigPersisted,
  validatePricingConfig,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-config";

/**
 * AI 计价配置（厂商价格表 + 加价系数）
 * GET  —— 读取当前生效配置（平台管理员）
 * PUT  —— 保存配置（平台管理员），保存后立即生效，无需发版
 */

import { prisma } from "@/lib/prisma";

import { getWorkspacePlans } from "@/lib/workspace-plan-service";
import { getAllTokenPacks } from "@/lib/token-pack-service";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth(request, "system:read");
  if (!auth.authorized) return auth.errorResponse!;

  try {
    const config = await loadPricingConfig(true);
    const persisted = await isPricingConfigPersisted();

    // 1. 动态联查个人会员体系（兼容 membershiplevel / membershipLevel 大小写模型）
    const membershipModel = (prisma as any).membershiplevel || (prisma as any).membershipLevel;
    const rawMembership = membershipModel
      ? await membershipModel.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        }).catch((err: any) => {
          console.warn("[pricing] 查询 membershiplevel 失败:", err?.message);
          return [];
        })
      : [];

    const safeMembershipLevels = (rawMembership || []).map((lvl: any) => {
      const rawMonthly = Number(lvl.priceMonthly || 0);
      const rawYearly = Number(lvl.priceYearly || 0);
      return {
        id: lvl.id || lvl.name,
        name: lvl.name,
        nameZh: lvl.nameZh || lvl.name,
        priceMonthly: rawMonthly > 100 ? Math.round(rawMonthly / 100) : rawMonthly,
        priceYearly: rawYearly > 100 ? Math.round(rawYearly / 100) : rawYearly,
        tokenLimit: Number(lvl.tokenLimit || 0),
        features: Array.isArray(lvl.features) ? lvl.features : [],
      };
    });

    // 2. 动态联查工作空间套餐（复用系统统一数据服务，天然带容错与实体映射）
    const rawPlans = await getWorkspacePlans({ onlyActive: true }).catch((err) => {
      console.warn("[pricing] 查询 workspaceplan 失败:", err?.message);
      return [];
    });
    const safeWorkspacePlans = (rawPlans || []).map((wp: any) => ({
      id: wp.key,
      key: wp.key,
      name: wp.name,
      priceMonthly: Number(wp.priceMonthly || 0),
      tokenLimit: Number(wp.tokenLimit || 0),
    }));

    // 3. 动态联查算力加油包（复用系统统一数据服务）
    const rawPacks = await getAllTokenPacks(prisma as any, true).catch((err) => {
      console.warn("[pricing] 查询 tokenpack 失败:", err?.message);
      return [];
    });
    const safeTokenPacks = (rawPacks || []).map((tp: any) => ({
      id: tp.id,
      name: tp.name,
      points: Number(tp.points || 0),
      price: Number(tp.price || 0),
    }));

    return NextResponse.json({
      success: true,
      config,
      defaults: DEFAULT_PRICING_CONFIG,
      persisted, // true 表示已真正写入数据库 systemconfig 表并持久化生效
      membershipLevels: safeMembershipLevels,
      workspacePlans: safeWorkspacePlans,
      tokenPacks: safeTokenPacks,
    });
  } catch (error) {
    console.error("读取计价配置失败:", error);
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "读取计价配置失败" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requirePlatformAuth(request, "system:update");
  if (!auth.authorized) return auth.errorResponse!;

  try {
    const body = await request.json().catch(() => null);
    if (!body?.config) {
      return NextResponse.json(
        { success: false, error: "请求体缺少 config" },
        { status: 400 }
      );
    }

    // 落库前强制业务校验：结构 / 代号格式 / 重复 / 值域，避免脏配置写入后影响全站计费
    const validation = validatePricingConfig(body.config);
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: validation.errors[0] || "计价配置校验未通过",
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const saved = await savePricingConfig(body.config);

    await writeAuditLog(
      auth.user!.id,
      "system:pricing_config_updated",
      { markup: saved.markup, providerIds: saved.providers.map((p) => p.id) },
      null,
      null,
      request
    );

    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存计价配置失败";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
