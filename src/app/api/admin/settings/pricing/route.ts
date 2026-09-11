import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, writeAuditLog } from "@/lib/security";
import {
  loadPricingConfig,
  savePricingConfig,
  isPricingConfigPersisted,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-config";

/**
 * AI 计价配置（厂商价格表 + 加价系数）
 * GET  —— 读取当前生效配置（平台管理员）
 * PUT  —— 保存配置（平台管理员），保存后立即生效，无需发版
 */

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth(request, "system:read");
  if (!auth.authorized) return auth.errorResponse!;

  try {
    const [config, persisted] = await Promise.all([
      loadPricingConfig(),
      isPricingConfigPersisted(),
    ]);
    return NextResponse.json({
      success: true,
      config,
      defaults: DEFAULT_PRICING_CONFIG,
      persisted, // false 表示当前使用内置默认值（配置表尚未迁移或未保存）
    });
  } catch (error) {
    console.error("读取计价配置失败:", error);
    return NextResponse.json(
      { success: false, error: "读取计价配置失败" },
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
