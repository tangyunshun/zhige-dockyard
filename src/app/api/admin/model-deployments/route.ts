import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { ALLOWED_MODEL_CAPABILITIES } from "@/lib/component-contract/capabilities";
import { MODEL_INPUT_LIMITS, validateModelNumericFields } from "@/lib/model-endpoint";

/** GET：列出模型部署（可按 providerId 过滤） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");
    const rows = await prisma.modeldeployment.findMany({
      where: providerId ? { providerId } : undefined,
      orderBy: [{ providerId: "asc" }, { modelId: "asc" }],
    });
    // 价格唯一真源为 modelpricing：列表一并返回，前端不再读取 deployment 旧价格字段
    const pricings = await prisma.modelpricing.findMany({
      where: { deploymentId: { in: rows.map((r) => r.id) } },
    });
    const priceMap = new Map(pricings.map((p) => [p.deploymentId, p]));
    // 时段价格（在主流价之上叠加的覆盖价）：按优先级降序返回，供详情弹窗展示真实生效价
    const periods = await prisma.modelpricingperiod.findMany({
      where: { deploymentId: { in: rows.map((r) => r.id) } },
      orderBy: [{ priority: "desc" }],
    });
    const periodMap = new Map<string, typeof periods>();
    periods.forEach((p) => {
      const list = periodMap.get(p.deploymentId) || [];
      list.push(p);
      periodMap.set(p.deploymentId, list);
    });
    // 全局默认加价率（模型未独立设置 markupRateBps 时继承此值派生售价）
    const markupCfg = await prisma.systemconfig.findUnique({
      where: { key: "billing.markupCoefficientBps" },
    });
    const rawBps = markupCfg?.value != null ? Number(markupCfg.value) : null;
    // 口径矫正：旧版曾以乘数 *10000 存储，正确基点为 *100；检测到超大值自动折算
    const globalMarkupBps = rawBps != null && rawBps > 10000 ? Math.round(rawBps / 10) : rawBps;
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        // 显式下发健康字段（即使客户端未感知该列也保证有确定值，前端据此渲染）
        health: r.health || "unknown",
        lastTestedAt: r.lastTestedAt ? r.lastTestedAt.toISOString() : null,
        pricing: priceMap.get(r.id) ?? null,
        periods: periodMap.get(r.id) ?? [],
      })),
      globalMarkupBps,
    });
  } catch (error) {
    console.error("[model-deployment] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型部署失败" }, { status: 500 });
  }
}

/** POST：新增模型部署 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    if (!providerId) return NextResponse.json({ success: false, error: "所属供应商不能为空" }, { status: 400 });
    if (!modelId) return NextResponse.json({ success: false, error: "模型标识不能为空" }, { status: 400 });

    // providerId 必须指向已存在的供应商名称
    const provider = await prisma.modelprovider.findUnique({ where: { name: providerId } });
    if (!provider) {
      return NextResponse.json({ success: false, error: "供应商不存在，请先在供应商管理中创建" }, { status: 400 });
    }

    const upstreamModel =
      typeof body.upstreamModel === "string" && body.upstreamModel.trim() ? body.upstreamModel.trim() : modelId;

    // 录入规范：模型标识 / 供应商侧模型名 / 展示名长度上限（库列为 varchar，超长会落库失败）
    if (modelId.length > MODEL_INPUT_LIMITS.label) {
      return NextResponse.json({ success: false, error: `模型标识过长（最长 ${MODEL_INPUT_LIMITS.label} 个字符）` }, { status: 400 });
    }
    if (upstreamModel.length > MODEL_INPUT_LIMITS.label) {
      return NextResponse.json({ success: false, error: `供应商侧模型名过长（最长 ${MODEL_INPUT_LIMITS.label} 个字符）` }, { status: 400 });
    }
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length > MODEL_INPUT_LIMITS.label) {
      return NextResponse.json({ success: false, error: `展示名过长（最长 ${MODEL_INPUT_LIMITS.label} 个字符）` }, { status: 400 });
    }
    const contextLimit = Number.isFinite(Number(body.contextLimit)) ? Number(body.contextLimit) : 32000;
    const numErr = validateModelNumericFields({ contextLimit });
    if (numErr) return NextResponse.json({ success: false, error: numErr }, { status: 400 });

    // 数据库驱动的模型能力声明（仅接受抽象能力白名单；contextLimit 不得作为能力替代表达）
    let capabilities: string[] = [];
    if (Array.isArray(body.capabilities)) {
      capabilities = Array.from(
        new Set(
          body.capabilities
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim().toUpperCase())
            .filter((v) => v.length > 0),
        ),
      );
      const invalid = capabilities.filter((v) => !(ALLOWED_MODEL_CAPABILITIES as ReadonlySet<string>).has(v));
      if (invalid.length > 0) {
        return NextResponse.json({ success: false, error: `不支持的模型能力: ${invalid.join(", ")}` }, { status: 400 });
      }
    }

    const row = await prisma.modeldeployment.create({
      data: {
        id: randomUUID(),
        providerId,
        modelId,
        upstreamModel,
        displayName,
        contextLimit,
        capabilities,
        enabled: body.enabled !== false,
      },
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ success: false, error: "该供应商下已存在同名模型标识" }, { status: 409 });
    }
    console.error("[model-deployment] 创建失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "创建模型部署失败" }, { status: 500 });
  }
}
