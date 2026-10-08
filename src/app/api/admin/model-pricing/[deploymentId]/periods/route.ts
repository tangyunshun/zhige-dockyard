import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { PRICE_SOURCES, resolvePriceStatus, yuanPerMillionToMicros } from "@/lib/model-pricing";
import { rejectIfDeploymentEnabled } from "@/lib/model-deployment-guard";

interface PeriodListParams {
  deploymentId: string;
}

/** 时段价格字段校验（POST/PATCH 共用）；返回清洗后的数据与错误 */
function parsePeriodInput(body: Record<string, unknown>) {
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    errors.push("时段名称不能为空");
  } else if (body.name.trim().length > 50) {
    errors.push("时段名称不超过 50 字");
  } else {
    out.name = body.name.trim();
  }

  const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim().toUpperCase() : "CUSTOM";
  if (!["IDLE", "PEAK", "HOLIDAY", "CUSTOM"].includes(kind)) errors.push("时段类型非法");
  else out.kind = kind;

  out.enabled = body.enabled === true || body.enabled === "true";
  out.priority = Number.isInteger(Number(body.priority)) ? Number(body.priority) : 0;

  // 星期几（1-7 逗号分隔）
  if (body.weekdays !== undefined && body.weekdays !== null && body.weekdays !== "") {
    const list = String(body.weekdays)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const d of list) {
      const n = Number(d);
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        errors.push("星期几须为 1-7 的逗号分隔数字");
        break;
      }
    }
    out.weekdays = list.join(",");
  } else {
    out.weekdays = null;
  }

  // 时间 HH:mm
  const timeRe = /^([0-1]?\d|2[0-3]):[0-5]\d$/;
  for (const f of ["startTime", "endTime"] as const) {
    const v = body[f];
    if (v !== undefined && v !== null && v !== "") {
      if (typeof v !== "string" || !timeRe.test(v)) errors.push(f + " 须为 HH:mm 格式");
      else out[f] = v;
    } else {
      out[f] = null;
    }
  }
  if (out.startTime && !out.endTime) errors.push("设置了开始时间必须同时设置结束时间");
  if (!out.startTime && out.endTime) errors.push("设置了结束时间必须同时设置开始时间");

  // 日期区间
  for (const f of ["startDate", "endDate"] as const) {
    const v = body[f];
    if (v !== undefined && v !== null && v !== "") {
      const dt = new Date(String(v));
      if (isNaN(dt.getTime())) errors.push(f + " 日期格式非法");
      else out[f] = dt;
    } else {
      out[f] = null;
    }
  }

  // 价格字段（元/百万 → 微元/百万）
  const priceFields = [
    "costInput",
    "costOutput",
    "costCacheRead",
    "costCacheWrite",
    "priceInput",
    "priceOutput",
    "priceCacheRead",
    "priceCacheWrite",
  ] as const;
  const micros: Record<string, number | null> = {};
  for (const f of priceFields) {
    const v = body[f];
    if (v === undefined || v === null || v === "") {
      micros[f] = null;
    } else {
      const n = Number(v);
      if (isNaN(n) || n < 0) {
        errors.push(f + " 须为非负数字");
      } else {
        micros[f] = yuanPerMillionToMicros(n);
      }
    }
  }

  const priceSource =
    typeof body.priceSource === "string" && (PRICE_SOURCES as readonly string[]).includes(body.priceSource)
      ? body.priceSource
      : "UNVERIFIED";
  out.priceSource = priceSource;

  if (body.markupRateBps !== undefined && body.markupRateBps !== null && body.markupRateBps !== "") {
    const bp = Number(body.markupRateBps);
    if (!Number.isInteger(bp) || bp < 0) errors.push("加价率须为非负整数基点");
    else out.markupRateBps = bp;
  } else {
    out.markupRateBps = null;
  }

  if (errors.length > 0) return { ok: false as const, errors };
  return { ok: true as const, data: out, micros };
}

/** GET：列出某部署的全部时段价格（按优先级降序） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<PeriodListParams> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage", "billing:read");
    if (!auth.authorized) return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    const { deploymentId } = await params;
    const rows = await prisma.modelpricingperiod.findMany({
      where: { deploymentId },
      orderBy: [{ priority: "desc" }, { kind: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[model-pricing-period] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询时段价格失败" }, { status: 500 });
  }
}

/** POST：新增一条时段价格 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<PeriodListParams> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage", "billing:manage");
    if (!auth.authorized) return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    const { deploymentId } = await params;
    // 启用态冻结：新增时段价格等于改写计费规则，运行中的模型不允许
    const locked = await rejectIfDeploymentEnabled(deploymentId);
    if (locked) return locked;
    const deployment = await prisma.modeldeployment.findUnique({ where: { id: deploymentId }, select: { id: true } });
    if (!deployment) return NextResponse.json({ success: false, error: "模型部署不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parsePeriodInput(body);
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.errors.join("；") }, { status: 400 });

    const { micros, ...rest } = parsed.data as { micros: Record<string, number | null> } & Record<string, unknown>;
    const status = resolvePriceStatus({
      priceSource: rest.priceSource as never,
      costValues: [micros.costInput, micros.costOutput, micros.costCacheRead, micros.costCacheWrite],
      priceValues: [micros.priceInput, micros.priceOutput, micros.priceCacheRead, micros.priceCacheWrite],
    });
    const row = await prisma.modelpricingperiod.create({
      data: {
        id: randomUUID(),
        deploymentId,
        name: rest.name as string,
        kind: rest.kind as string,
        enabled: rest.enabled as boolean,
        priority: rest.priority as number,
        weekdays: rest.weekdays as string | null,
        startTime: rest.startTime as string | null,
        endTime: rest.endTime as string | null,
        startDate: rest.startDate as Date | null,
        endDate: rest.endDate as Date | null,
        costInputMicrosPerMillion: micros.costInput,
        costOutputMicrosPerMillion: micros.costOutput,
        costCacheReadMicrosPerMillion: micros.costCacheRead,
        costCacheWriteMicrosPerMillion: micros.costCacheWrite,
        priceInputMicrosPerMillion: micros.priceInput,
        priceOutputMicrosPerMillion: micros.priceOutput,
        priceCacheReadMicrosPerMillion: micros.priceCacheRead,
        priceCacheWriteMicrosPerMillion: micros.priceCacheWrite,
        priceSource: rest.priceSource as string,
        priceStatus: status,
        markupRateBps: rest.markupRateBps as number | null,
        priceVersion: 1,
      },
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    console.error("[model-pricing-period] 创建失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "创建时段价格失败" }, { status: 500 });
  }
}
