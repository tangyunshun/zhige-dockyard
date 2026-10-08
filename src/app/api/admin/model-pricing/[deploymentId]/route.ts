import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import {
  COST_FIELDS,
  PRICE_FIELDS,
  computeStatusFromData,
  validatePricingInput,
  type PriceSource,
} from "@/lib/model-pricing";
import { rejectIfDeploymentEnabled } from "@/lib/model-deployment-guard";

/** 只读 DTO：不返回任何密钥（价格表本身不含密钥） */
function toDto(row: {
  deploymentId: string;
  currency: string;
  priceSource: string;
  priceStatus: string;
  markupRateBps: number | null;
  priceVersion: number;
  effectiveFrom: Date | null;
  updatedBy: string | null;
  updatedAt: Date;
} & Record<string, unknown>) {
  const pick = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, (row[k] as number | null) ?? null]));
  return {
    deploymentId: row.deploymentId,
    currency: row.currency,
    priceSource: row.priceSource,
    priceStatus: row.priceStatus,
    markupRateBps: row.markupRateBps,
    priceVersion: row.priceVersion,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString() : null,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
    supplierCost: pick(COST_FIELDS),
    userPrice: pick(PRICE_FIELDS),
  };
}

/** GET：查询某模型部署的价格配置 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage", "billing:read");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { deploymentId } = await params;
    const deployment = await prisma.modeldeployment.findUnique({
      where: { id: deploymentId },
      select: { id: true, providerId: true, modelId: true, upstreamModel: true, enabled: true },
    });
    if (!deployment) {
      return NextResponse.json({ success: false, error: "模型部署不存在" }, { status: 404 });
    }
    const row = await prisma.modelpricing.findUnique({ where: { deploymentId } });
    return NextResponse.json({ success: true, data: { deployment, pricing: row ? toDto(row as never) : null } });
  } catch (error) {
    console.error("[model-pricing] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型价格失败" }, { status: 500 });
  }
}

/**
 * PATCH：更新（或首次创建）模型价格。
 *  - 权限强校验；非负、整数微元、精度与上限校验；
 *  - 供应商成本与用户售价分开写入，互不覆盖；
 *  - 每次改价 priceVersion + 1，并写入管理员操作日志（记录前后值，不含任何密钥）；
 *  - **不会**用观测的综合成本覆盖输入/输出单价（只能通过显式字段写入）。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { deploymentId } = await params;
    // 启用态冻结：正在运行的模型不允许改写定价（绕页面调 API 同样拦截）
    const locked = await rejectIfDeploymentEnabled(deploymentId);
    if (locked) return locked;
    const deployment = await prisma.modeldeployment.findUnique({
      where: { id: deploymentId },
      select: { id: true, providerId: true, modelId: true },
    });
    if (!deployment) {
      return NextResponse.json({ success: false, error: "模型部署不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const validation = validatePricingInput(body);
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const data = validation.data;

    const before = await prisma.modelpricing.findUnique({ where: { deploymentId } });
    const nextSource = ((data.priceSource as PriceSource) ?? (before?.priceSource as PriceSource) ?? "UNVERIFIED") as PriceSource;
    // 合并现有值后计算状态（未提交的字段保持原值）
    // 注意：validatePricingInput 会为所有价格字段返回 null（未提交也是 null），
    // 因此这里必须按「请求体是否显式提交该字段」来合并，否则会把既有值误清空、漏判模式冲突。
    const submitted = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
    const merged: Record<string, unknown> = {};
    for (const f of [...COST_FIELDS, ...PRICE_FIELDS]) {
      merged[f] = submitted(f)
        ? ((data[f] as number | null) ?? null)
        : (((before as never as Record<string, unknown>)?.[f] as number | null) ?? null);
    }
    // 定价模式互斥（合并既有值后再校验，避免"分两次提交"绕过）
    const mergedPricing = {
      currency: (data.currency as string) ?? before?.currency ?? "CNY",
      costInputMicrosPerMillion: (merged.costInputMicrosPerMillion as number | null) ?? null,
      costOutputMicrosPerMillion: (merged.costOutputMicrosPerMillion as number | null) ?? null,
      costCacheReadMicrosPerMillion: (merged.costCacheReadMicrosPerMillion as number | null) ?? null,
      costCacheWriteMicrosPerMillion: (merged.costCacheWriteMicrosPerMillion as number | null) ?? null,
      priceInputMicrosPerMillion: (merged.priceInputMicrosPerMillion as number | null) ?? null,
      priceOutputMicrosPerMillion: (merged.priceOutputMicrosPerMillion as number | null) ?? null,
      priceCacheReadMicrosPerMillion: (merged.priceCacheReadMicrosPerMillion as number | null) ?? null,
      priceCacheWriteMicrosPerMillion: (merged.priceCacheWriteMicrosPerMillion as number | null) ?? null,
      priceSource: nextSource,
      priceStatus: "UNCONFIGURED" as const,
      markupRateBps: (data.markupRateBps as number | null) ?? before?.markupRateBps ?? null,
      priceVersion: (before?.priceVersion ?? 0) + 1,
      effectiveFrom: null,
    };
    const directBoth =
      mergedPricing.priceInputMicrosPerMillion !== null && mergedPricing.priceOutputMicrosPerMillion !== null;
    if (directBoth && mergedPricing.markupRateBps !== null) {
      return NextResponse.json(
        {
          success: false,
          error: "定价模式互斥：已配置直接售价时不得再配置加价率（请先清空其中一种）",
        },
        { status: 400 },
      );
    }

    const priceStatus = computeStatusFromData({ ...merged, priceSource: nextSource }, nextSource);

    const adminId = auth.user?.id ?? null;
    // 只写入「显式提交」的字段，避免未提交字段被写成 null 而清空既有价格
    const payload: Record<string, unknown> = {
      priceSource: nextSource,
      priceStatus,
      priceVersion: (before?.priceVersion ?? 0) + 1,
      updatedBy: adminId,
    };
    for (const f of [...COST_FIELDS, ...PRICE_FIELDS]) {
      if (submitted(f)) payload[f] = data[f];
    }
    if (submitted("currency") && data.currency !== undefined) payload.currency = data.currency;
    if (submitted("markupRateBps")) payload.markupRateBps = data.markupRateBps ?? null;
    if (data.effectiveFrom !== undefined) payload.effectiveFrom = data.effectiveFrom;

    const row = before
      ? await prisma.modelpricing.update({ where: { deploymentId }, data: payload })
      : await prisma.modelpricing.create({ data: { id: randomUUID(), deploymentId, ...payload } });

    // 管理员操作日志（前后值，不含任何密钥）
    try {
      if (adminId) {
        await prisma.operationlog.create({
          data: {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            userId: adminId,
            workspaceId: null,
            action: "UPDATE_MODEL_PRICING",
            resource: "MODEL_PRICING",
            details: {
              deploymentId,
              providerId: deployment.providerId,
              modelId: deployment.modelId,
              priceVersion: row.priceVersion,
              priceStatus,
              priceSource: nextSource,
              before: before ? toDto(before as never) : null,
              after: toDto(row as never),
            },
          },
        });
      }
    } catch (logErr) {
      console.error("[model-pricing] 审计日志写入失败:", (logErr as Error)?.message);
    }

    return NextResponse.json({ success: true, data: toDto(row as never) });
  } catch (error) {
    console.error("[model-pricing] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "更新模型价格失败" }, { status: 500 });
  }
}
